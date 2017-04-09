
import {
	Logger,
	DebugSession, LoggingDebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent, Event, ThreadEvent,
	Thread, StackFrame, Scope, Source, Handles, Breakpoint
} from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';
import {readFileSync} from 'fs';
import {basename} from 'path';

import Connection from './Connection';

import path = require('path');




/**
 * This interface should always match the schema found in the mock-debug extension manifest.
 */
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	hostname : string
	username : string
	password : string
	codeversion : string
	cartridgeroot : string
	workspaceroot: string
	/** enable logging the Debug Adapter Protocol */
	trace?: boolean;
}

class ProphetDebugSession extends LoggingDebugSession {

	// maps from sourceFile to array of Breakpoints
	private _breakPoints = new Map<string, DebugProtocol.Breakpoint[]>();
	private connection : Connection | null;
	private config: LaunchRequestArguments

	private _variableHandles = new Handles<string>();



	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor() {
		super("prophet.txt");

		this.setDebuggerLinesStartAt1(true);
		this.setDebuggerColumnsStartAt1(false);
	}

	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {


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

	protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {

		if (args.trace) {
			Logger.setup(Logger.LogLevel.Verbose, /*logToFile=*/false);
		}

		this.config = args;
		// since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
		// we request them early by sending an 'initializeRequest' to the frontend.
		// The frontend will end the configuration sequence by calling 'configurationDone' request.

		if (!this.connection) {
			this.connection =  new Connection(args);

			this.connection
				.estabilish()
				.then(() => {
					return this.connection
						.removeBreakpoints()
						.then(() => {
							this.sendResponse(response);
							this.sendEvent(new InitializedEvent());
						});
				}).catch(err => {
					this.sendEvent(new TerminatedEvent());
					this.log(err, 88888);
				})
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
	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
		if (this.connection) {
			this.connection.startAwaitThreads();

			this.connection.on('new.thread', thread => {
				this.sendEvent(new ThreadEvent('started', thread.id));
				this.sendEvent(new StoppedEvent('breakpoint', thread.id));
			});
		}

		this.sendResponse(response);
	}
    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {

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
		
	};

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {

		var path = args.source.path;
		var clientLines = args.lines;
		var scriptPath = this.convertClientPathToDebugger(path);

		var breakpoints = new Array<Breakpoint>();

		this.connection
			.createBreakpoints(clientLines.map(line => ({
				file: scriptPath,
				line: this.convertClientLineToDebugger(line)
			})))
			.then(brks => {
				// send back the actual breakpoint positions
				response.body = {
					breakpoints: 
						brks.filter(brk => brk.file === scriptPath)
						.map(brk => new Breakpoint(true, this.convertDebuggerLineToClient(brk.line)))
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

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {

		if (this.connection) {
			this.connection.getThreads().then(threads => {
				response.body = {
					threads: threads
					.filter(thread => thread.status === 'halted')
					.map(thread => new Thread(thread.id, "thread " + thread.id))
				}
				this.sendResponse(response);
			});
		} else {
			// return the default thread
			response.body = {
				threads: [
					//new Thread(MockDebugSession.THREAD_ID, "thread 1")
				]
			};
			this.sendResponse(response);
		}
	}
	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {

		this.connection.getStackTrace(args.threadId)
			.then(stack => {

				response.body = {
					stackFrames: stack.map(frame => {
						return new StackFrame(
							(args.threadId * 100000) + frame.index,
							frame.location.function_name,
							new Source(
								basename(frame.location.script_path),
								this.convertDebuggerPathToClient(frame.location.script_path)
							),
							this.convertDebuggerLineToClient(frame.location.line_number),
							0
						)
					}),
					totalFrames: stack.length
				};
				this.sendResponse(response);
			});
	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {

		const frameReference = args.frameId;
		const scopes = new Array<Scope>();

		scopes.push(new Scope("Local", this._variableHandles.create("" + frameReference), false));

		// scopes.push(new Scope("Local", this._variableHandles.create("local_" + frameReference), false));
		// scopes.push(new Scope("Closure", this._variableHandles.create("closure_" + frameReference), false));
		// scopes.push(new Scope("Global", this._variableHandles.create("global_" + frameReference), true));

		response.body = {
			scopes: scopes
		};
		this.sendResponse(response);
	}

	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {

		const variables = [];
		const id = this._variableHandles.get(args.variablesReference);
		if (id) {
			const vals = id.split('_');
			const frameReferenceStr = vals[0];
			const path = vals[1] || '';
			const frameReference = parseInt(frameReferenceStr);

			const threadID = parseInt((frameReference / 100000) + '');
			const frameID = frameReference - (threadID * 100000)

			this.connection.getMembers(threadID, frameID, path)
				.then(members => {

					response.body = {
						variables: members.map(member => {
							var variablesReference = 0;

							if (member.type.includes('dw.') || member.type.includes('Object')) {
								const encPath = frameReferenceStr + '_' + (path ? path + '.' : '') + member.name;
								variablesReference = this._variableHandles.create(encPath)
							}

							return {
								name: member.name,
								type: member.type,
								value: member.value,
								variablesReference: variablesReference
							}
						})
					};
					this.sendResponse(response);
				})
		} else {
			response.body = {
				variables: variables
			};
			this.sendResponse(response);
		}
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		this.connection
			.resume(args.threadId)
			.then(() => {
				this.sendResponse(response);
				this.sendEvent(new StoppedEvent('step', args.threadId));
			});
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
		this.connection
			.stepInto(args.threadId)
			.then(() => {
				this.sendResponse(response);
				this.sendEvent(new StoppedEvent('step', args.threadId));
			});
	}
	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
		this.connection
			.stepOut(args.threadId)
			.then(() => {
				this.sendResponse(response);
				this.sendEvent(new StoppedEvent('step', args.threadId));
			});
	}


	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		this.connection
			.stepOver(args.threadId)
			.then(() => {
				this.sendResponse(response);
				this.sendEvent(new StoppedEvent('step', args.threadId));
			});
	}

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {

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
	private fireStepEvent(response: DebugProtocol.Response, ln: number): boolean {

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
	private fireEventsForLine(response: DebugProtocol.Response, ln: number): boolean {

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
    protected convertClientPathToDebugger(clientPath: string): string {


		//	this.config.workspaceroot,
			
		if (this.config.cartridgeroot === 'auto') {
			const sepPath = clientPath.split(path.sep);

			const cartPos = sepPath.indexOf('cartridge');

			this.config.cartridgeroot = path.parse(clientPath).root + sepPath.splice(0, cartPos - 1).join(path.sep) + path.sep
		}

		const relPath = path.relative(this.config.cartridgeroot, clientPath);
		const sepPath = relPath.split(path.sep);

		return '/' + sepPath.join('/');
	}
    protected convertDebuggerPathToClient(debuggerPath: string): string {
		return path.join(this.config.cartridgeroot, debuggerPath.split('/').join(path.sep));
	}

	private log(msg: string, line: number) {
		const e = new OutputEvent(`${msg}: ${line}\n`);
		//(<DebugProtocol.OutputEvent>e).body.variablesReference = this._variableHandles.create("args");
		this.sendEvent(e);	// print current line on debug console
	}
}

DebugSession.run(ProphetDebugSession);
