/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var vscode_debugadapter_1 = require("vscode-debugadapter");
var fs_1 = require("fs");
var path_1 = require("path");
var MockDebugSession = (function (_super) {
    __extends(MockDebugSession, _super);
    /**
     * Creates a new debug adapter that is used for one debug session.
     * We configure the default implementation of a debug adapter here.
     */
    function MockDebugSession() {
        var _this = _super.call(this, "mock-debug.txt") || this;
        // since we want to send breakpoint events, we will assign an id to every event
        // so that the frontend can match events with breakpoints.
        _this._breakpointId = 1000;
        // This is the next line that will be 'executed'
        _this.__currentLine = 0;
        // the contents (= lines) of the one and only file
        _this._sourceLines = new Array();
        // maps from sourceFile to array of Breakpoints
        _this._breakPoints = new Map();
        _this._variableHandles = new vscode_debugadapter_1.Handles();
        // this debugger uses zero-based lines and columns
        _this.setDebuggerLinesStartAt1(false);
        _this.setDebuggerColumnsStartAt1(false);
        return _this;
    }
    Object.defineProperty(MockDebugSession.prototype, "_currentLine", {
        get: function () {
            return this.__currentLine;
        },
        set: function (line) {
            this.__currentLine = line;
            this.log('line', line);
        },
        enumerable: true,
        configurable: true
    });
    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    MockDebugSession.prototype.initializeRequest = function (response, args) {
        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new vscode_debugadapter_1.InitializedEvent());
        // This debug adapter implements the configurationDoneRequest.
        response.body.supportsConfigurationDoneRequest = true;
        // make VS Code to use 'evaluate' when hovering over source
        response.body.supportsEvaluateForHovers = true;
        // make VS Code to show a 'step back' button
        response.body.supportsStepBack = true;
        this.sendResponse(response);
    };
    MockDebugSession.prototype.launchRequest = function (response, args) {
        if (args.trace) {
            vscode_debugadapter_1.Logger.setup(vscode_debugadapter_1.Logger.LogLevel.Verbose, /*logToFile=*/ false);
        }
        this._sourceFile = args.program;
        this._sourceLines = fs_1.readFileSync(this._sourceFile).toString().split('\n');
        if (args.stopOnEntry) {
            this._currentLine = 0;
            this.sendResponse(response);
            // we stop on the first line
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent("entry", MockDebugSession.THREAD_ID));
        }
        else {
            // we just start to run until we hit a breakpoint or an exception
            this.continueRequest(response, { threadId: MockDebugSession.THREAD_ID });
        }
    };
    MockDebugSession.prototype.setBreakPointsRequest = function (response, args) {
        var path = args.source.path;
        var clientLines = args.lines;
        // read file contents into array for direct access
        var lines = fs_1.readFileSync(path).toString().split('\n');
        var breakpoints = new Array();
        // verify breakpoint locations
        for (var i = 0; i < clientLines.length; i++) {
            var l = this.convertClientLineToDebugger(clientLines[i]);
            var verified = false;
            if (l < lines.length) {
                var line = lines[l].trim();
                // if a line is empty or starts with '+' we don't allow to set a breakpoint but move the breakpoint down
                if (line.length == 0 || line.indexOf("+") == 0)
                    l++;
                // if a line starts with '-' we don't allow to set a breakpoint but move the breakpoint up
                if (line.indexOf("-") == 0)
                    l--;
                // don't set 'verified' to true if the line contains the word 'lazy'
                // in this case the breakpoint will be verified 'lazy' after hitting it once.
                if (line.indexOf("lazy") < 0) {
                    verified = true; // this breakpoint has been validated
                }
            }
            var bp = new vscode_debugadapter_1.Breakpoint(verified, this.convertDebuggerLineToClient(l));
            bp.id = this._breakpointId++;
            breakpoints.push(bp);
        }
        this._breakPoints.set(path, breakpoints);
        // send back the actual breakpoint positions
        response.body = {
            breakpoints: breakpoints
        };
        this.sendResponse(response);
    };
    MockDebugSession.prototype.threadsRequest = function (response) {
        // return the default thread
        response.body = {
            threads: [
                new vscode_debugadapter_1.Thread(MockDebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
    };
    /**
     * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
     */
    MockDebugSession.prototype.stackTraceRequest = function (response, args) {
        var words = this._sourceLines[this._currentLine].trim().split(/\s+/);
        var startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
        var maxLevels = typeof args.levels === 'number' ? args.levels : words.length - startFrame;
        var endFrame = Math.min(startFrame + maxLevels, words.length);
        var frames = new Array();
        // every word of the current line becomes a stack frame.
        for (var i = startFrame; i < endFrame; i++) {
            var name_1 = words[i]; // use a word of the line as the stackframe name
            frames.push(new vscode_debugadapter_1.StackFrame(i, name_1 + "(" + i + ")", new vscode_debugadapter_1.Source(path_1.basename(this._sourceFile), this.convertDebuggerPathToClient(this._sourceFile)), this.convertDebuggerLineToClient(this._currentLine), 0));
        }
        response.body = {
            stackFrames: frames,
            totalFrames: words.length
        };
        this.sendResponse(response);
    };
    MockDebugSession.prototype.scopesRequest = function (response, args) {
        var frameReference = args.frameId;
        var scopes = new Array();
        scopes.push(new vscode_debugadapter_1.Scope("Local", this._variableHandles.create("local_" + frameReference), false));
        scopes.push(new vscode_debugadapter_1.Scope("Closure", this._variableHandles.create("closure_" + frameReference), false));
        scopes.push(new vscode_debugadapter_1.Scope("Global", this._variableHandles.create("global_" + frameReference), true));
        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    };
    MockDebugSession.prototype.variablesRequest = function (response, args) {
        var variables = [];
        var id = this._variableHandles.get(args.variablesReference);
        if (id != null) {
            variables.push({
                name: id + "_i",
                type: "integer",
                value: "123",
                variablesReference: 0
            });
            variables.push({
                name: id + "_f",
                type: "float",
                value: "3.14",
                variablesReference: 0
            });
            variables.push({
                name: id + "_s",
                type: "string",
                value: "hello world",
                variablesReference: 0
            });
            variables.push({
                name: id + "_o",
                type: "object",
                value: "Object",
                variablesReference: this._variableHandles.create("object_")
            });
        }
        response.body = {
            variables: variables
        };
        this.sendResponse(response);
    };
    MockDebugSession.prototype.continueRequest = function (response, args) {
        for (var ln = this._currentLine + 1; ln < this._sourceLines.length; ln++) {
            if (this.fireEventsForLine(response, ln)) {
                return;
            }
        }
        this.sendResponse(response);
        // no more lines: run to end
        this.sendEvent(new vscode_debugadapter_1.TerminatedEvent());
    };
    MockDebugSession.prototype.reverseContinueRequest = function (response, args) {
        for (var ln = this._currentLine - 1; ln >= 0; ln--) {
            if (this.fireEventsForLine(response, ln)) {
                return;
            }
        }
        this.sendResponse(response);
        // no more lines: stop at first line
        this._currentLine = 0;
        this.sendEvent(new vscode_debugadapter_1.StoppedEvent("entry", MockDebugSession.THREAD_ID));
    };
    MockDebugSession.prototype.nextRequest = function (response, args) {
        for (var ln = this._currentLine + 1; ln < this._sourceLines.length; ln++) {
            if (this.fireStepEvent(response, ln)) {
                return;
            }
        }
        this.sendResponse(response);
        // no more lines: run to end
        this.sendEvent(new vscode_debugadapter_1.TerminatedEvent());
    };
    MockDebugSession.prototype.stepBackRequest = function (response, args) {
        for (var ln = this._currentLine - 1; ln >= 0; ln--) {
            if (this.fireStepEvent(response, ln)) {
                return;
            }
        }
        this.sendResponse(response);
        // no more lines: stop at first line
        this._currentLine = 0;
        this.sendEvent(new vscode_debugadapter_1.StoppedEvent("entry", MockDebugSession.THREAD_ID));
    };
    MockDebugSession.prototype.evaluateRequest = function (response, args) {
        response.body = {
            result: "evaluate(context: '" + args.context + "', '" + args.expression + "')",
            variablesReference: 0
        };
        this.sendResponse(response);
    };
    //---- some helpers
    /**
     * Fire StoppedEvent if line is not empty.
     */
    MockDebugSession.prototype.fireStepEvent = function (response, ln) {
        if (this._sourceLines[ln].trim().length > 0) {
            this._currentLine = ln;
            this.sendResponse(response);
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent("step", MockDebugSession.THREAD_ID));
            return true;
        }
        return false;
    };
    /**
     * Fire StoppedEvent if line has a breakpoint or the word 'exception' is found.
     */
    MockDebugSession.prototype.fireEventsForLine = function (response, ln) {
        var _this = this;
        // find the breakpoints for the current source file
        var breakpoints = this._breakPoints.get(this._sourceFile);
        if (breakpoints) {
            var bps = breakpoints.filter(function (bp) { return bp.line === _this.convertDebuggerLineToClient(ln); });
            if (bps.length > 0) {
                this._currentLine = ln;
                // 'continue' request finished
                this.sendResponse(response);
                // send 'stopped' event
                this.sendEvent(new vscode_debugadapter_1.StoppedEvent("breakpoint", MockDebugSession.THREAD_ID));
                // the following shows the use of 'breakpoint' events to update properties of a breakpoint in the UI
                // if breakpoint is not yet verified, verify it now and send a 'breakpoint' update event
                if (!bps[0].verified) {
                    bps[0].verified = true;
                    this.sendEvent(new vscode_debugadapter_1.BreakpointEvent("update", bps[0]));
                }
                return true;
            }
        }
        // if word 'exception' found in source -> throw exception
        if (this._sourceLines[ln].indexOf("exception") >= 0) {
            this._currentLine = ln;
            this.sendResponse(response);
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent("exception", MockDebugSession.THREAD_ID));
            this.log('exception in line', ln);
            return true;
        }
        return false;
    };
    MockDebugSession.prototype.log = function (msg, line) {
        var e = new vscode_debugadapter_1.OutputEvent(msg + ": " + line + "\n");
        e.body.variablesReference = this._variableHandles.create("args");
        this.sendEvent(e); // print current line on debug console
    };
    return MockDebugSession;
}(vscode_debugadapter_1.LoggingDebugSession));
// we don't support multiple threads, so we can use a hardcoded ID for the default thread
MockDebugSession.THREAD_ID = 1;
vscode_debugadapter_1.DebugSession.run(MockDebugSession);
//# sourceMappingURL=mockDebug.js.map