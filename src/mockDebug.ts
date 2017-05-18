
import {
	logger, Logger,
	DebugSession, LoggingDebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent, Event, ThreadEvent,
	ContinuedEvent, Thread, StackFrame, Scope, Source, Handles, Breakpoint
} from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';
import {readFileSync} from 'fs';
import {basename} from 'path';

import Connection from './Connection';

import path = require('path');

function includes(str: string, pattern: string) {
	return str.indexOf(pattern) !== -1;
}



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
	private _breakPoints = new Map<string, Array<number>>();
	private threadsArray = new Array<number>();
	private connection : Connection;
	private config: LaunchRequestArguments
	private threadsTimer : number;
	private awaitThreadsTimer : number;
	private isAwaitingThreads = false;
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
		if (response.body) {
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
		}

		
		this.sendResponse(response);
	}

	protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {

		if (args.trace) {
			logger.setup(Logger.LogLevel.Verbose, /*logToFile=*/ false);
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
					this.connection && this.connection
						.removeBreakpoints()
						.then(() => {
							this.sendResponse(response);
							this.sendEvent(new InitializedEvent());
							this.log('successfully connected\nconsole can be used to evaluate variables\nwaiting for breakpoint hit...');
						});
				}).catch(err => {
					this.sendEvent(new TerminatedEvent());
					this.catchLog(err);
				})
		}
	}
	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
		if (this.connection) {
			this.startAwaitThreads();
		}

		this.sendResponse(response);
	}
	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {

		if (this.connection) {
			this.stopAwaitThreads();
			this.connection
				.disconnect()
				.then(() => {
					this.log('successfully disconected');
					super.disconnectRequest(response, args);
				}).catch(err => {
					this.log(err);
					super.disconnectRequest(response, args);
				});
		}
		
	};

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {

		const path = args.source.path;
		const connection = this.connection;

		if (!path) {
			response.body = {
				breakpoints: []
			};
			return this.sendResponse(response);
		}
		var clientLines = (args.breakpoints || []).map(breakpoint => breakpoint.line);
		var scriptPath = this.convertClientPathToDebugger(path);

		var breakpoints = new Array<Breakpoint>();

		if (!this._breakPoints.has(path)) {
			this._breakPoints.set(path, []);
		}

		if (
			!includes(scriptPath, '/cartridge/controller') &&
			!includes(scriptPath, '/cartridge/scripts/') &&
			!includes(scriptPath, '/cartridge/models/') &&
			!includes(scriptPath, 'modules/')
		) {
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
				.removeBreakpoints(brkId).catch(() => {
					this.log('unable unset breakpoint. ignoring...');
				});
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
							breakpoints: 
								brks.filter(brk => brk.file === scriptPath)
								.map(brk =>
									new Breakpoint(
										true,
										this.convertDebuggerLineToClient(brk.line),
										undefined,
										new Source(
											brk.id + " - " + basename(scriptPath),
											this.convertDebuggerPathToClient(scriptPath)
										)
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
			} else {
				this._breakPoints.set(path, []);
				response.body = {
					breakpoints: []
				};
				this.sendResponse(response);
			}

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
			})
			.catch(this.catchLog.bind(this));;
		} else {
			// return the default thread
			response.body = {
				threads: [
					//new Thread(MockDebugSession.THREAD_ID, "thread 1")
				]
			};
			response.success = false;
			response.message = 'Connection is not estabilished';
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
			})
			.catch(this.catchLog.bind(this));;
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

							if (includes(member.type, 'dw.') || includes(member.type, 'Object')) {
								const encPath = frameReferenceStr + '_' + (path ? path + '.' : '') + member.name;
								variablesReference = this._variableHandles.create(encPath)
							}

							return {
								name: member.name,
								type: member.type.replace(/\./g, '/'),
								value: member.value,
								variablesReference: variablesReference
							}
						})
					};
					this.sendResponse(response);
				})
				.catch(this.catchLog.bind(this));
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
				this.connection
					.getStackTrace(args.threadId)
					.then(() =>
						this.sendEvent(new StoppedEvent('breakpoint', args.threadId))
					)
					.catch(() => {
						this.log(`thread "${args.threadId}" finished`, 200);
					})
			});
		this.sendResponse(response);
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
		this.connection
			.stepInto(args.threadId)
			.then(() => {
				this.sendEvent(new StoppedEvent('step', args.threadId));
			})
			.catch(this.catchLog.bind(this));
			this.sendResponse(response);
	}
	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
		this.connection
			.stepOut(args.threadId)
			.then(() => {
				this.sendEvent(new StoppedEvent('step', args.threadId));
			})
			.catch(this.catchLog.bind(this));
		this.sendResponse(response);
	}


	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		this.connection
			.stepOver(args.threadId)
			.then(() => {
				this.sendEvent(new StoppedEvent('step', args.threadId));
			})
			.catch(this.catchLog.bind(this));
		this.sendResponse(response);
	}

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
		
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
		} else {
			response.body = {
				result: '',
				variablesReference: 0
			};
			// TODO: add aviability evaluate trought server's eval
			this.logError('Unable evaluate without stopped thread')
			this.sendResponse(response);
		}

	}
	protected setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments): void {
		const id = this._variableHandles.get(args.variablesReference);
		const vals = id.split('_');
		const frameReferenceStr = vals[0];
		var path = vals[1] || '';
		const frameReference = parseInt(frameReferenceStr);

		path = path.replace(/\.\[/, '[').replace(/\]\./, ']');

		const threadID = parseInt((frameReference / 100000) + '');
		const frameID = frameReference - (threadID * 100000)

		if (this.connection && threadID) {
			this.connection.evaluate(threadID, (path ? path + '.' : '') +  args.name + '=' + args.value, frameID)
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
		} else {
			response.success = false;
			this.sendResponse(response);
		}

	}
	//---- some helpers

	protected convertClientPathToDebugger(clientPath: string): string {
			
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
								this.sendEvent(new ThreadEvent('started', activeThread.id));
								this.sendEvent(new StoppedEvent('breakpoint', activeThread.id));
								this.threadsArray.push(activeThread.id)
							}
						});
					}
					this.threadsArray.forEach((threadID, index) => {
						if (!activeThreads.some(activeThread => activeThread.id === threadID)) {
							this.sendEvent(new ThreadEvent('exited', threadID));
							this.threadsArray.splice(index, 1);
						}
					});
				})
				.catch(this.catchLog.bind(this));
		}
	}
	private catchLog(err) {
		const e = new OutputEvent(`${err}\n ${err.stack}`);
		//(<DebugProtocol.OutputEvent>e).body.variablesReference = this._variableHandles.create("args");
		this.sendEvent(e);	// print current line on debug console	
	}
	private logError(err) {
		const e = new OutputEvent(err, 'stderr');
		this.sendEvent(e);	// print current line on debug console
	}

	private log(msg: string, line?: number) {
		const e = new OutputEvent(`${msg}\n`);
		this.sendEvent(e);	// print current line on debug console
	}
}

DebugSession.run(ProphetDebugSession);
