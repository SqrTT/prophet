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
        response.body.supportsConditionalBreakpoints = false;
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
                });
            }).catch(err => {
                this.sendEvent(new vscode_debugadapter_1.TerminatedEvent());
                this.log(err, 88888);
            });
        }
        // if (!args.trace) {
        // 	this._currentLine = 0;
        // 	this.sendResponse(response);
        // 	// we stop on the first line
        // 	this.sendEvent(new StoppedEvent("entry", MockDebugSession.THREAD_ID));
        // } else {
        // 	// we just start to run until we hit a breakpoint or an exception
        // 	//this.continueRequest(<DebugProtocol.ContinueResponse>response, { threadId: MockDebugSession.THREAD_ID });
        // }
    }
    configurationDoneRequest(response, args) {
        if (this.connection) {
            this.connection.startAwaitThreads();
            this.connection.on('new.thread', thread => {
                this.sendEvent(new vscode_debugadapter_1.ThreadEvent('started', thread.id));
                this.sendEvent(new vscode_debugadapter_1.StoppedEvent('breakpoint', thread.id));
            });
        }
        this.sendResponse(response);
    }
    disconnectRequest(response, args) {
        if (this.connection) {
            this.connection
                .destroy()
                .then(() => {
                super.disconnectRequest(response, args);
            }).catch(err => {
                this.log(err, 138);
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
        this.connection
            .createBreakpoints(clientLines.map(line => ({
            file: scriptPath,
            line: this.convertClientLineToDebugger(line)
        })))
            .then(brks => {
            // send back the actual breakpoint positions
            response.body = {
                breakpoints: brks.filter(brk => brk.file === scriptPath)
                    .map(brk => new vscode_debugadapter_1.Breakpoint(true, this.convertDebuggerLineToClient(brk.line)))
            };
            this.sendResponse(response);
        }).catch((err) => {
            this.log(err, 0);
            response.body = {
                breakpoints: []
            };
            this.sendResponse(response);
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
            });
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
        });
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
            });
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
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent('step', args.threadId));
        });
    }
    stepInRequest(response, args) {
        this.connection
            .stepInto(args.threadId)
            .then(() => {
            this.sendResponse(response);
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent('step', args.threadId));
        });
    }
    stepOutRequest(response, args) {
        this.connection
            .stepOut(args.threadId)
            .then(() => {
            this.sendResponse(response);
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent('step', args.threadId));
        });
    }
    nextRequest(response, args) {
        this.connection
            .stepOver(args.threadId)
            .then(() => {
            this.sendResponse(response);
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent('step', args.threadId));
        });
    }
    evaluateRequest(response, args) {
        response.body = {
            result: `evaluate(context: '${args.context}', '${args.expression}')`,
            variablesReference: 0
        };
        this.sendResponse(response);
    }
    //---- some helpers
    /**
     * Fire StoppedEvent if line is not empty.
     */
    fireStepEvent(response, ln) {
        // if (this._sourceLines[ln].trim().length > 0) {	// non-empty line
        // 	this._currentLine = ln;
        // 	this.sendResponse(response);
        // 	this.sendEvent(new StoppedEvent("step", MockDebugSession.THREAD_ID));
        // 	return true;
        // }
        return false;
    }
    /**
     * Fire StoppedEvent if line has a breakpoint or the word 'exception' is found.
     */
    fireEventsForLine(response, ln) {
        // // find the breakpoints for the current source file
        // const breakpoints = this._breakPoints.get(this._sourceFile);
        // if (breakpoints) {
        // 	const bps = breakpoints.filter(bp => bp.line === this.convertDebuggerLineToClient(ln));
        // 	if (bps.length > 0) {
        // 		this._currentLine = ln;
        // 		// 'continue' request finished
        // 		this.sendResponse(response);
        // 		// send 'stopped' event
        // 		this.sendEvent(new StoppedEvent("breakpoint", MockDebugSession.THREAD_ID));
        // 		// the following shows the use of 'breakpoint' events to update properties of a breakpoint in the UI
        // 		// if breakpoint is not yet verified, verify it now and send a 'breakpoint' update event
        // 		if (!bps[0].verified) {
        // 			bps[0].verified = true;
        // 			this.sendEvent(new BreakpointEvent("update", bps[0]));
        // 		}
        // 		return true;
        // 	}
        // }
        // // if word 'exception' found in source -> throw exception
        // if (this._sourceLines[ln].indexOf("exception") >= 0) {
        // 	this._currentLine = ln;
        // 	this.sendResponse(response);
        // 	this.sendEvent(new StoppedEvent("exception", MockDebugSession.THREAD_ID));
        // 	this.log('exception in line', ln);
        // 	return true;
        // }
        return false;
    }
    convertClientPathToDebugger(clientPath) {
        //	this.config.workspaceroot,
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
    log(msg, line) {
        const e = new vscode_debugadapter_1.OutputEvent(`${msg}: ${line}\n`);
        //(<DebugProtocol.OutputEvent>e).body.variablesReference = this._variableHandles.create("args");
        this.sendEvent(e); // print current line on debug console
    }
}
vscode_debugadapter_1.DebugSession.run(ProphetDebugSession);
//# sourceMappingURL=mockDebug.js.map