"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_debugadapter_1 = require("vscode-debugadapter");
const path_1 = require("path");
const Connection_1 = require("./Connection");
const path = require("path");
class ProphetDebugSession extends vscode_debugadapter_1.LoggingDebugSession {
    /**
     * Creates a new debug adapter that is used for one debug session.
     * We configure the default implementation of a debug adapter here.
     */
    constructor() {
        super("prophet.txt");
        // maps from sourceFile to array of Breakpoints
        this._breakPoints = new Map();
        this.threadsArray = new Array();
        this.isAwaitingThreads = false;
        this._variableHandles = new vscode_debugadapter_1.Handles();
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(false);
    }
    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    initializeRequest(response, args) {
        // This debug adapter implements the configurationDoneRequest.
        response.body.supportsConfigurationDoneRequest = true;
        // make VS Code to use 'evaluate' when hovering over source
        response.body.supportsEvaluateForHovers = false;
        response.body.supportsFunctionBreakpoints = false;
        response.body.supportsConditionalBreakpoints = false;
        response.body.supportsHitConditionalBreakpoints = false;
        response.body.supportsSetVariable = true;
        response.body.supportsGotoTargetsRequest = false;
        response.body.supportsRestartRequest = false;
        response.body.supportsRestartFrame = false;
        response.body.supportsExceptionInfoRequest = false;
        response.body.supportsExceptionOptions = false;
        response.body.supportsStepBack = false;
        response.body.exceptionBreakpointFilters = [];
        this.sendResponse(response);
    }
    launchRequest(response, args) {
        if (args.trace) {
            vscode_debugadapter_1.Logger.setup(vscode_debugadapter_1.Logger.LogLevel.Verbose, /*logToFile=*/ false);
        }
        this.config = args;
        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        if (!this.connection) {
            this.connection = new Connection_1.default(args);
            this.connection
                .estabilish()
                .then(() => {
                return this.connection
                    .removeBreakpoints()
                    .then(() => {
                    this.sendResponse(response);
                    this.sendEvent(new vscode_debugadapter_1.InitializedEvent());
                    this.log('successfully connected\nconsole can be used to evaluate variables\nwaiting for breakpoint hit...');
                });
            }).catch(err => {
                this.sendEvent(new vscode_debugadapter_1.TerminatedEvent());
                this.catchLog(err);
            });
        }
    }
    configurationDoneRequest(response, args) {
        if (this.connection) {
            this.startAwaitThreads();
        }
        this.sendResponse(response);
    }
    disconnectRequest(response, args) {
        if (this.connection) {
            this.stopAwaitThreads();
            this.connection
                .destroy()
                .then(() => {
                super.disconnectRequest(response, args);
                this.log('successfully disconected');
            }).catch(err => {
                this.log(err);
                super.disconnectRequest(response, args);
            });
        }
    }
    ;
    setBreakPointsRequest(response, args) {
        var path = args.source.path;
        var clientLines = args.lines;
        var scriptPath = this.convertClientPathToDebugger(path);
        var breakpoints = new Array();
        if (!this._breakPoints.has(path)) {
            this._breakPoints.set(path, []);
        }
        if (!scriptPath.includes('/cartridge/controller') &&
            !scriptPath.includes('/cartridge/scripts/') &&
            !scriptPath.includes('modules/')) {
            response.body = {
                breakpoints: []
            };
            response.success = false;
            response.message = "Unable to set breakpoint to non backend file";
            this.logError(response.message);
            return this.sendResponse(response);
        }
        const scriptBrks = this._breakPoints.get(path);
        // remove if unexist
        const removeOld = scriptBrks.map(brkId => {
            return this.connection
                .removeBreakpoints(brkId).catch(this.catchLog.bind(this));
        });
        Promise.all(removeOld).then(() => {
            if (clientLines.length) {
                this.connection
                    .createBreakpoints(clientLines.map(clientLine => ({
                    file: scriptPath,
                    line: this.convertClientLineToDebugger(clientLine)
                })))
                    .then(brks => {
                    // send back the actual breakpoint positions
                    this._breakPoints.set(path, brks.map(brk => brk.id));
                    response.body = {
                        breakpoints: brks.filter(brk => brk.file === scriptPath)
                            .map(brk => new vscode_debugadapter_1.Breakpoint(true, this.convertDebuggerLineToClient(brk.line), undefined, new vscode_debugadapter_1.Source(brk.id + " - " + path_1.basename(scriptPath), this.convertDebuggerPathToClient(scriptPath))
                        //args.source.
                        ))
                    };
                    this.sendResponse(response);
                }).catch((err) => {
                    this.catchLog(err);
                    response.body = {
                        breakpoints: []
                    };
                    this.sendResponse(response);
                });
            }
            else {
                this._breakPoints.set(path, []);
                response.body = {
                    breakpoints: []
                };
                this.sendResponse(response);
            }
        });
    }
    threadsRequest(response) {
        if (this.connection) {
            this.connection.getThreads().then(threads => {
                response.body = {
                    threads: threads
                        .filter(thread => thread.status === 'halted')
                        .map(thread => new vscode_debugadapter_1.Thread(thread.id, "thread " + thread.id))
                };
                this.sendResponse(response);
            })
                .catch(this.catchLog.bind(this));
            ;
        }
        else {
            // return the default thread
            response.body = {
                threads: []
            };
            this.sendResponse(response);
        }
    }
    stackTraceRequest(response, args) {
        this.connection.getStackTrace(args.threadId)
            .then(stack => {
            response.body = {
                stackFrames: stack.map(frame => {
                    return new vscode_debugadapter_1.StackFrame((args.threadId * 100000) + frame.index, frame.location.function_name, new vscode_debugadapter_1.Source(path_1.basename(frame.location.script_path), this.convertDebuggerPathToClient(frame.location.script_path)), this.convertDebuggerLineToClient(frame.location.line_number), 0);
                }),
                totalFrames: stack.length
            };
            this.sendResponse(response);
        })
            .catch(this.catchLog.bind(this));
        ;
    }
    scopesRequest(response, args) {
        const frameReference = args.frameId;
        const scopes = new Array();
        scopes.push(new vscode_debugadapter_1.Scope("Local", this._variableHandles.create("" + frameReference), false));
        // scopes.push(new Scope("Local", this._variableHandles.create("local_" + frameReference), false));
        // scopes.push(new Scope("Closure", this._variableHandles.create("closure_" + frameReference), false));
        // scopes.push(new Scope("Global", this._variableHandles.create("global_" + frameReference), true));
        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }
    variablesRequest(response, args) {
        const variables = [];
        const id = this._variableHandles.get(args.variablesReference);
        if (id) {
            const vals = id.split('_');
            const frameReferenceStr = vals[0];
            const path = vals[1] || '';
            const frameReference = parseInt(frameReferenceStr);
            const threadID = parseInt((frameReference / 100000) + '');
            const frameID = frameReference - (threadID * 100000);
            this.connection.getMembers(threadID, frameID, path)
                .then(members => {
                response.body = {
                    variables: members.map(member => {
                        var variablesReference = 0;
                        if (member.type.includes('dw.') || member.type.includes('Object')) {
                            const encPath = frameReferenceStr + '_' + (path ? path + '.' : '') + member.name;
                            variablesReference = this._variableHandles.create(encPath);
                        }
                        return {
                            name: member.name,
                            type: member.type,
                            value: member.value,
                            variablesReference: variablesReference
                        };
                    })
                };
                this.sendResponse(response);
            })
                .catch(this.catchLog.bind(this));
        }
        else {
            response.body = {
                variables: variables
            };
            this.sendResponse(response);
        }
    }
    continueRequest(response, args) {
        this.connection
            .resume(args.threadId)
            .then(() => {
            this.sendResponse(response);
            this.connection
                .getStackTrace(args.threadId)
                .then(() => this.sendEvent(new vscode_debugadapter_1.StoppedEvent('step', args.threadId)))
                .catch(() => {
                this.log(`thread "${args.threadId}" finished`, 200);
            });
        });
    }
    stepInRequest(response, args) {
        this.connection
            .stepInto(args.threadId)
            .then(() => {
            this.sendResponse(response);
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent('step', args.threadId));
        })
            .catch(this.catchLog.bind(this));
    }
    stepOutRequest(response, args) {
        this.connection
            .stepOut(args.threadId)
            .then(() => {
            this.sendResponse(response);
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent('step', args.threadId));
        })
            .catch(this.catchLog.bind(this));
        ;
    }
    nextRequest(response, args) {
        this.connection
            .stepOver(args.threadId)
            .then(() => {
            this.sendResponse(response);
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent('step', args.threadId));
        })
            .catch(this.catchLog.bind(this));
        ;
    }
    evaluateRequest(response, args) {
        const frameReference = args.frameId || 0;
        const threadID = parseInt((frameReference / 100000) + '');
        const frameID = frameReference - (threadID * 100000);
        if (this.connection && args.frameId && threadID) {
            this.connection.evaluate(threadID, args.expression, frameID)
                .then(res => {
                response.body = {
                    result: args.context === 'watch' ? '' + res : '-> ' + res,
                    variablesReference: 0
                };
                this.sendResponse(response);
            });
        }
        else {
            response.body = {
                result: `evaluate: undefined thread`,
                variablesReference: 0
            };
            this.sendResponse(response);
        }
    }
    setVariableRequest(response, args) {
        const id = this._variableHandles.get(args.variablesReference);
        const vals = id.split('_');
        const frameReferenceStr = vals[0];
        var path = vals[1] || '';
        const frameReference = parseInt(frameReferenceStr);
        path = path.replace(/\.\[/, '[').replace(/\]\./, ']');
        const threadID = parseInt((frameReference / 100000) + '');
        const frameID = frameReference - (threadID * 100000);
        if (this.connection && threadID) {
            this.connection.evaluate(threadID, (path ? path + '.' : '') + args.name + '=' + args.value, frameID)
                .then(res => {
                response.body = {
                    value: res,
                    variablesReference: 0
                };
                response.success = res.indexOf('DEBUGGER EXPR') === -1 && res.indexOf('is not defined.') === -1;
                if (!response.success) {
                    response.message = res;
                }
                this.sendResponse(response);
            });
        }
        else {
            response.success = false;
            this.sendResponse(response);
        }
    }
    //---- some helpers
    convertClientPathToDebugger(clientPath) {
        if (this.config.cartridgeroot === 'auto') {
            const sepPath = clientPath.split(path.sep);
            const cartPos = sepPath.indexOf('cartridge');
            this.config.cartridgeroot = path.parse(clientPath).root + sepPath.splice(0, cartPos - 1).join(path.sep) + path.sep;
        }
        const relPath = path.relative(this.config.cartridgeroot, clientPath);
        const sepPath = relPath.split(path.sep);
        return '/' + sepPath.join('/');
    }
    convertDebuggerPathToClient(debuggerPath) {
        return path.join(this.config.cartridgeroot, debuggerPath.split('/').join(path.sep));
    }
    startAwaitThreads() {
        if (!this.isAwaitingThreads) {
            this.threadsTimer = setInterval(this.connection.resetThreads.bind(this.connection), 30000);
            this.awaitThreadsTimer = setInterval(this.awaitThreads.bind(this), 10000);
            this.isAwaitingThreads = true;
        }
    }
    stopAwaitThreads() {
        if (this.isAwaitingThreads) {
            clearInterval(this.awaitThreadsTimer);
            clearInterval(this.threadsTimer);
            this.isAwaitingThreads = false;
        }
    }
    awaitThreads() {
        if (this.isAwaitingThreads) {
            this.connection.getThreads()
                .then(activeThreads => {
                if (activeThreads.length) {
                    activeThreads.forEach(activeThread => {
                        if (this.threadsArray.indexOf(activeThread.id) === -1) {
                            this.sendEvent(new vscode_debugadapter_1.ThreadEvent('started', activeThread.id));
                            this.sendEvent(new vscode_debugadapter_1.StoppedEvent('breakpoint', activeThread.id));
                            this.threadsArray.push(activeThread.id);
                        }
                    });
                }
                this.threadsArray.forEach((threadID, index) => {
                    if (!activeThreads.some(activeThread => activeThread.id === threadID)) {
                        this.sendEvent(new vscode_debugadapter_1.ThreadEvent('exited', threadID));
                        this.threadsArray.splice(index, 1);
                    }
                });
            })
                .catch(this.catchLog.bind(this));
        }
    }
    catchLog(err) {
        const e = new vscode_debugadapter_1.OutputEvent(`${err}\n ${err.stack}`);
        //(<DebugProtocol.OutputEvent>e).body.variablesReference = this._variableHandles.create("args");
        this.sendEvent(e); // print current line on debug console	
    }
    logError(err) {
        const e = new vscode_debugadapter_1.OutputEvent(err, 'stderr');
        this.sendEvent(e); // print current line on debug console
    }
    log(msg, line) {
        const e = new vscode_debugadapter_1.OutputEvent(`${msg}\n`);
        //(<DebugProtocol.OutputEvent>e).body.variablesReference = this._variableHandles.create("args");
        this.sendEvent(e); // print current line on debug console
    }
}
vscode_debugadapter_1.DebugSession.run(ProphetDebugSession);
//# sourceMappingURL=mockDebug.js.map