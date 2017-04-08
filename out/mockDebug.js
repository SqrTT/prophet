"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_debugadapter_1 = require("vscode-debugadapter");
const Connection_1 = require("./Connection");
const path = require("path");
function toScriptPath(filepath, workspacepath, root = 'auto') {
    const relPath = path.relative(workspacepath, filepath);
    const sepPath = relPath.split(path.sep);
    if (root === 'auto') {
        const cartPos = sepPath.indexOf('cartridges');
        if (cartPos >= 0) {
            sepPath.splice(0, cartPos + 1);
            return '/' + sepPath.join('/');
        }
        else {
            return '/' + sepPath.join('/');
        }
    }
    else {
        throw new Error('Not implemented yet');
    }
}
class ProphetDebugSession extends vscode_debugadapter_1.LoggingDebugSession {
    /**
     * Creates a new debug adapter that is used for one debug session.
     * We configure the default implementation of a debug adapter here.
     */
    constructor() {
        super("prophet.txt");
        // maps from sourceFile to array of Breakpoints
        this._breakPoints = new Map();
        // this debugger uses zero-based lines and columns
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }
    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    initializeRequest(response, args) {
        // This debug adapter implements the configurationDoneRequest.
        response.body.supportsConfigurationDoneRequest = false;
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
        var scriptPath = toScriptPath(path, this.config.workspaceroot, this.config.cartridgeroot);
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
        // return the default thread
        response.body = {
            threads: []
        };
        this.sendResponse(response);
    }
    /**
     * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
     */
    stackTraceRequest(response, args) {
        // const words = this._sourceLines[this._currentLine].trim().split(/\s+/);
        // const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
        // const maxLevels = typeof args.levels === 'number' ? args.levels : words.length-startFrame;
        // const endFrame = Math.min(startFrame + maxLevels, words.length);
        // const frames = new Array<StackFrame>();
        // // every word of the current line becomes a stack frame.
        // for (let i= startFrame; i < endFrame; i++) {
        // 	const name = words[i];	// use a word of the line as the stackframe name
        // 	frames.push(new StackFrame(i, `${name}(${i})`, new Source(basename(this._sourceFile),
        // 		this.convertDebuggerPathToClient(this._sourceFile)),
        // 		this.convertDebuggerLineToClient(this._currentLine), 0));
        // }
        // response.body = {
        // 	stackFrames: frames,
        // 	totalFrames: words.length
        // };
        this.sendResponse(response);
    }
    scopesRequest(response, args) {
        const frameReference = args.frameId;
        const scopes = new Array();
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
        // const id = this._variableHandles.get(args.variablesReference);
        // if (id != null) {
        // 	variables.push({
        // 		name: id + "_i",
        // 		type: "integer",
        // 		value: "123",
        // 		variablesReference: 0
        // 	});
        // 	variables.push({
        // 		name: id + "_f",
        // 		type: "float",
        // 		value: "3.14",
        // 		variablesReference: 0
        // 	});
        // 	variables.push({
        // 		name: id + "_s",
        // 		type: "string",
        // 		value: "hello world",
        // 		variablesReference: 0
        // 	});
        // 	variables.push({
        // 		name: id + "_o",
        // 		type: "object",
        // 		value: "Object",
        // 		variablesReference: this._variableHandles.create("object_")
        // 	});
        // }
        // response.body = {
        // 	variables: variables
        // };
        this.sendResponse(response);
    }
    continueRequest(response, args) {
        this.sendResponse(response);
        // no more lines: run to end
        //this.sendEvent(new TerminatedEvent());
    }
    nextRequest(response, args) {
        this.sendResponse(response);
        // no more lines: run to end
        //this.sendEvent(new TerminatedEvent());
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
    log(msg, line) {
        const e = new vscode_debugadapter_1.OutputEvent(`${msg}: ${line}\n`);
        //(<DebugProtocol.OutputEvent>e).body.variablesReference = this._variableHandles.create("args");
        this.sendEvent(e); // print current line on debug console
    }
}
vscode_debugadapter_1.DebugSession.run(ProphetDebugSession);
//# sourceMappingURL=mockDebug.js.map