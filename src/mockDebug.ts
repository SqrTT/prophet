
import {
	logger, Logger,
	DebugSession, LoggingDebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, OutputEvent, ThreadEvent,
	Thread, StackFrame, Scope, Source, Handles, Breakpoint
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';

import { basename, join } from 'path';
import Connection, { IVariable, IThread } from './Connection';
import * as process from 'process';

import path = require('path');

const VARIABLE_SEPARATOR = '%';

function isComplexType(type: string) {
	return !['string', 'boolean', 'number', 'undefined'].includes(type.toLowerCase());
}


/**
 * This interface should always match the schema found in the mock-debug extension manifest.
 */
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	hostname: string
	username: string
	password: string
	codeversion: string
	/** enable logging the Debug Adapter Protocol */
	trace?: boolean;
	__sessionId: string
	clientId: string;
}

class ProphetDebugSession extends LoggingDebugSession {

	cartridgesList: string[];
	// maps from sourceFile to array of Breakpoints
	private _breakPoints = new Map<string, Array<number>>();
	//private threadsArray = new Array<number>();
	private connection: Connection;
	private config: LaunchRequestArguments;
	private threadsTimer: NodeJS.Timer;
	private awaitThreadsTimer: NodeJS.Timer;
	private isAwaitingThreads = false;
	private _variableHandles = new Handles<IVariable[] | string>();
	private pendingThreads = new Map<number, 'step' | 'breakpoint' | 'exception' | 'pause' | 'entry'>();

	private currentThreads = new Map<number, IThread>();



	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor() {
		super(join(__dirname, '..', "prophet-debugger.log"));

		this.setDebuggerLinesStartAt1(true);
		this.setDebuggerColumnsStartAt1(false);

		process.once('uncaughtException', err => {
			this.logError(err);
			this.shutdown();
		})
	}

	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {

		// This debug adapter implements the configurationDoneRequest.
		if (response.body) {
			// This default debug adapter does not support conditional breakpoints.
			response.body.supportsConditionalBreakpoints = false;

			// This default debug adapter does not support hit conditional breakpoints.
			response.body.supportsHitConditionalBreakpoints = false;

			// This default debug adapter does not support function breakpoints.
			response.body.supportsFunctionBreakpoints = false;

			// This default debug adapter implements the 'configurationDone' request.
			response.body.supportsConfigurationDoneRequest = true;

			// This default debug adapter does not support hovers based on the 'evaluate' request.
			response.body.supportsEvaluateForHovers = false;

			// This default debug adapter does not support the 'stepBack' request.
			response.body.supportsStepBack = false;

			// This default debug adapter does not support the 'setVariable' request.
			response.body.supportsSetVariable = false;

			// This default debug adapter does not support the 'restartFrame' request.
			response.body.supportsRestartFrame = false;

			// This default debug adapter does not support the 'stepInTargets' request.
			response.body.supportsStepInTargetsRequest = false;

			// This default debug adapter does not support the 'gotoTargets' request.
			response.body.supportsGotoTargetsRequest = false;

			// This default debug adapter does not support the 'completions' request.
			response.body.supportsCompletionsRequest = false;

			// This default debug adapter does not support the 'restart' request.
			response.body.supportsRestartRequest = false;

			// This default debug adapter does not support the 'exceptionOptions' attribute on the 'setExceptionBreakpoints' request.
			response.body.supportsExceptionOptions = false;

			// This default debug adapter does not support the 'format' attribute on the 'variables', 'evaluate', and 'stackTrace' request.
			response.body.supportsValueFormattingOptions = true;

			// This debug adapter does not support the 'exceptionInfo' request.
			response.body.supportsExceptionInfoRequest = false;

			// This debug adapter does not support the 'TerminateDebuggee' attribute on the 'disconnect' request.
			response.body.supportTerminateDebuggee = false;

			// This debug adapter does not support delayed loading of stack frames.
			response.body.supportsDelayedStackTraceLoading = false;

			// This debug adapter does not support the 'loadedSources' request.
			response.body.supportsLoadedSourcesRequest = false;

			// This debug adapter does not support the 'logMessage' attribute of the SourceBreakpoint.
			response.body.supportsLogPoints = false;

			// This debug adapter does not support the 'terminateThreads' request.
			response.body.supportsTerminateThreadsRequest = false;

			// This debug adapter does not support the 'setExpression' request.
			response.body.supportsSetExpression = false;

			// This debug adapter does not support the 'terminate' request.
			response.body.supportsTerminateRequest = false;
			response.body.exceptionBreakpointFilters = [];
		}
		this.sendEvent({ event: 'prophet.getdebugger.config', type: "event", seq: 1 });

		this.once('prophet.debugger.config', (options) => {
			//this.log('gotData:' + JSON.stringify(options, null, '  '));

			this.config = options.config;
			this.config.codeversion = options.config.version;

			this.cartridgesList = options.cartridges;

			this.sendResponse(response);
		});

	}
	protected customRequest(command: string, response: DebugProtocol.Response, args: any): void {

		switch (command) {
			case 'DebuggerConfig':
				this.emit('prophet.debugger.config', args);
				response.success = true;
				this.sendResponse(response);
				break;
			default:
				super.customRequest(command, response, args);
				break;
		}
	}
	protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {

		if (args.trace) {
			logger.setup(Logger.LogLevel.Verbose, /*logToFile=*/ true);
		}

		// since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
		// we request them early by sending an 'initializeRequest' to the frontend.
		// The frontend will end the configuration sequence by calling 'configurationDone' request.

		if (!this.connection) {
			this.connection = new Connection(this.config);

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
			this.log('Disconnecting...');

			this.stopAwaitThreads();
			this.connection
				.disconnect()
				.then(() => {
					this.log('successfully disconnected');
					super.disconnectRequest(response, args);
				}).catch(err => {
					this.log(err);
					super.disconnectRequest(response, args);
				});
		}

	};

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {

		const path = args.source.path;

		if (!path) {
			response.body = {
				breakpoints: []
			};
			return this.sendResponse(response);
		}
		var clientLines = (args.breakpoints || []).map(breakpoint => breakpoint.line);
		var scriptPath = this.convertClientPathToDebugger(path);

		if (!this._breakPoints.has(path)) {
			this._breakPoints.set(path, []);
		}

		if (scriptPath.includes('/default/js/') || scriptPath.includes('/cartridge/js/')) {
			response.body = {
				breakpoints: []
			};
			response.success = false;
			response.message = "Unable to set breakpoint to non backend file";

			this.logError(response.message);

			return this.sendResponse(response);
		}

		const scriptBrks = this._breakPoints.get(path) || [];

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
			this.connection.getThreads()
				.then(threads => {
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
			.catch(this.catchLog.bind(this));

	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {

		const frameReference = args.frameId || 0;
		const threadID = parseInt((frameReference / 100000) + '');
		const frameID = frameReference - (threadID * 100000);
		const scopes = new Array<Scope>();



		// scopes.push(new Scope("Local", this._variableHandles.create("local_" + frameReference), false));
		// scopes.push(new Scope("Closure", this._variableHandles.create("closure_" + frameReference), false));
		// scopes.push(new Scope("Global", this._variableHandles.create("global_" + frameReference), true));

		this.connection.getVariables(threadID, frameID).then((vars) => {
			const scopesMap = new Map<string, IVariable[]>();

			vars.forEach(vr => {
				const scope = scopesMap.get(vr.scope) || [];
				scope.push(vr);
				scopesMap.set(vr.scope, scope);
			});

			['local', 'closure', 'global'].forEach((key) => {
				const sc = scopesMap.get(key);
				if (sc) {
					scopes.push(new Scope(key, this._variableHandles.create(sc), false));
				}
			});

			response.body = {
				scopes: scopes
			};
			this.sendResponse(response);

		}).catch(this.catchLog.bind(this));


	}

	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {

		//const variables = [];
		const variables = this._variableHandles.get(args.variablesReference);

		if (typeof variables === 'string') {
			const vals = variables.split(VARIABLE_SEPARATOR);
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
							var presentationHint;

							if (isComplexType(member.type) && member.value !== 'null') {
								const encPath = frameReferenceStr + VARIABLE_SEPARATOR + (path ? path + '.' : '') + member.name;
								variablesReference = this._variableHandles.create(encPath);

								if (['dw.', 'dw/'].some(ctype => member.type.includes(ctype))) {
									presentationHint = {
										kind: 'class'
									};
								} else if (member.type === 'Object' || member.type === 'object') {
									presentationHint = {
										kind: 'data'
									};
								}
							}

							if (member.type === 'Function') {
								presentationHint = {
									kind: 'method'
								};
							}

							return {
								name: member.name,
								type: member.type.replace(/\./g, '/'),
								value: member.value,
								presentationHint,
								variablesReference: variablesReference
							}
						})
					};
					this.sendResponse(response);
				})
				.catch(this.catchLog.bind(this));
		} else {
			response.body = {
				variables: variables.map(member => {
					var variablesReference = 0;
					var presentationHint;
					if (member.scope === 'local' && isComplexType(member.type) && member.value !== 'null') {
						const encPath = ((member.threadID * 100000) + member.frameID) + VARIABLE_SEPARATOR + member.name;
						variablesReference = this._variableHandles.create(encPath)

						if (['dw.', 'dw/'].some(ctype => member.type.includes(ctype))) {
							presentationHint = {
								kind: 'class'
							};
						} else if (member.type === 'Object' || member.type === 'object') {
							presentationHint = {
								kind: 'data'
							};
						}
					}

					if (member.type === 'Function') {
						presentationHint = {
							kind: 'method'
						};
					}

					return {
						name: member.name,
						type: member.type.replace(/\./g, '/'),
						value: member.value,
						presentationHint,
						variablesReference: variablesReference
					}
				})
			};
			this.sendResponse(response);
		}
	}
	private handleDebugStep(thread: IThread) {
		// FIXME: due to bug in sfcc "step" doesn't return actual status

		// if (thread && thread.status === 'halted') {
		// 	this.currentThreads.set(thread.id, thread);
		// 	this.sendEvent(
		// 		new StoppedEvent('step', thread.id)
		// 	);
		// } else {
		this.pendingThreads.set(thread.id, 'step');
		return this.awaitThreads();
		//}
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		response.body = { allThreadsContinued: false };
		this.connection
			.resume(args.threadId)
			.then(this.handleDebugStep.bind(this))
			.then(() => {

				this.sendResponse(response);
			})
			.catch((err) => {
				response.success = false;
				response.message = err;
				this.sendResponse(response);
				this.catchLog(err);
			});
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
		response.body = { allThreadsContinued: false };
		this.connection
			.stepInto(args.threadId)
			.then(this.handleDebugStep.bind(this))
			.then(() => {
				this.sendResponse(response);
			})
			.catch((err) => {
				response.success = false;
				response.message = err;
				this.sendResponse(response);
				this.catchLog(err);
			});
	}
	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
		response.body = { allThreadsContinued: false };
		this.connection
			.stepOut(args.threadId)
			.then(this.handleDebugStep.bind(this))
			.then(() => {
				this.sendResponse(response);
			})
			.catch((err) => {
				response.success = false;
				response.message = err;
				this.sendResponse(response);
				this.catchLog(err);
			});
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		response.body = { allThreadsContinued: false };
		this.connection
			.stepOver(args.threadId)
			.then(this.handleDebugStep.bind(this))
			.then(() => {
				this.sendResponse(response);
			})
			.catch((err) => {
				response.success = false;
				response.message = err;
				this.sendResponse(response);
				this.catchLog(err);
			});
	}

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {

		const frameReference = args.frameId || 0;
		const threadID = parseInt((frameReference / 100000) + '');
		const frameID = frameReference - (threadID * 100000);

		if (this.connection && args.frameId && threadID) {

			if (args.context === 'watch') {


				this.connection.getMembers(threadID, frameID, args.expression)
					.then(res => {
						if (res.length === 1) {

							const member = res[0];

							var variablesReference = 0;
							var presentationHint;

							if (
								isComplexType(member.type) &&
								member.value !== 'null' &&
								member.value !== 'unresolved'
							) {
								const encPath = frameReference +
									VARIABLE_SEPARATOR + (args.expression ? args.expression + '.' : '') + member.name;
								variablesReference = this._variableHandles.create(encPath);

								if (['dw.', 'dw/'].some(ctype => member.type.includes(ctype))) {
									presentationHint = {
										kind: 'class'
									};
								} else if (member.type === 'Object' || member.type === 'object') {
									presentationHint = {
										kind: 'data'
									};
								}
							}

							if (member.type === 'Function') {
								presentationHint = {
									kind: 'method'
								};
							}

							response.body = {

								result: member.value,
								type: member.type.replace(/\./g, '/'),
								presentationHint,

								variablesReference: variablesReference
							}
							this.sendResponse(response);
						} else if (res.length > 1) {
							const variablesReference = this._variableHandles.create(
								frameReference +
								VARIABLE_SEPARATOR + args.expression);

							response.body = {
								result: res.map(v => v.name).join(','),
								type: 'object',
								variablesReference: variablesReference
							}
							this.sendResponse(response);
						}

					})
					.catch(err => {
						response.success = false;
						response.message = String(err);
						this.sendResponse(response);
					});
			} else {
				this.connection.evaluate(threadID, args.expression, frameID)
					.then(res => {
						response.body = {
							result: args.context === 'watch' ? '' + res : '-> ' + res,
							variablesReference: 0
						};
						this.sendResponse(response);
					})
					.catch(err => {
						response.success = false;
						response.message = String(err);
						this.sendResponse(response);
					});
			}
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
	// protected setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments): void {
	// 	const id = this._variableHandles.get(args.variablesReference);
	// 	const vals = id.split(VARIABLE_SEPARATOR);
	// 	const frameReferenceStr = vals[0];
	// 	var path = vals[1] || '';
	// 	const frameReference = parseInt(frameReferenceStr);

	// 	path = path.replace(/\.\[/, '[').replace(/\]\./, ']');

	// 	const threadID = parseInt((frameReference / 100000) + '');
	// 	const frameID = frameReference - (threadID * 100000)

	// 	if (this.connection && threadID) {
	// 		this.connection.evaluate(threadID, (path ? path + '.' : '') +  args.name + '=' + args.value, frameID)
	// 			.then(res => {
	// 				response.body = {
	// 					value: res,
	// 					variablesReference: 0
	// 				};
	// 				response.success = res.indexOf('DEBUGGER EXPR') === -1 && res.indexOf('is not defined.') === -1;
	// 				if (!response.success) {
	// 					response.message = res;
	// 				}
	// 				this.sendResponse(response);
	// 			});
	// 	} else {
	// 		response.success = false;
	// 		this.sendResponse(response);
	// 	}

	// }
	//---- some helpers

	protected convertClientPathToDebugger(clientPath: string): string {

		const cartPath = this.cartridgesList.find(cartridge => {
			if (process.platform === 'win32') {// windows way
				return clientPath.toLocaleLowerCase().startsWith(cartridge.toLocaleLowerCase())
			} else {
				return clientPath.startsWith(cartridge)
			}
		});

		if (cartPath) {
			const cartridgeName = basename(cartPath);
			const cPath = clientPath.substr(cartPath.length - cartridgeName.length);
			const tmp = '/' + cPath.split(path.sep).join('/');
			return tmp;
		} else {
			this.logError(`Unable detect cartridge: "${clientPath}"`);
			return '/null';
		}

		// if (this.config.cartridgeroot === 'auto') {
		// 	var workingPath = clientPath;

		// 	while (
		// 		path.parse(workingPath).root !== workingPath &&
		// 		path.basename(workingPath) !== 'cartridge' &&
		// 		path.basename(workingPath) !== 'modules'
		// 	) {
		// 		workingPath = path.dirname(workingPath);
		// 	}

		// 	if (path.parse(workingPath).root === workingPath) {
		// 		this.logError('Unable detect "cartridgeroot"');
		// 	} else {
		// 		if (path.basename(workingPath) === 'modules') {
		// 			this.config.cartridgeroot = path.dirname(workingPath);
		// 		} else {
		// 			this.config.cartridgeroot = path.dirname(path.dirname(workingPath));
		// 		}
		// 	}
		// 	this.log(`"cartridgeroot" is set to "${this.config.cartridgeroot}"`);
		// }

		// const relPath = path.relative(this.config.cartridgeroot, clientPath);
		// const sepPath = relPath.split(path.sep);


	}
	protected convertDebuggerPathToClient(debuggerPath: string): string {
		debuggerPath = debuggerPath.substr(1);
		const debuggerSep = debuggerPath.split('/');
		const cartridgeName = debuggerSep.shift() || '';


		const cartPath = this.cartridgesList.find(cartridge => basename(cartridge) === cartridgeName);

		if (cartPath) {
			const tmp = path.join(cartPath, debuggerSep.join(path.sep));
			return tmp;

		} else {
			this.logError(`Unable match cartridge: "${debuggerPath}"`);
			return '/null';
		}

	}
	startAwaitThreads() {
		if (!this.isAwaitingThreads) {
			this.threadsTimer = setInterval(() => {
				this.connection.resetThreads().catch(err => {
					this.logError(err + ' Please restart debugger')
				})
			}, 30000);
			this.awaitThreadsTimer = setInterval(() => {
				this.awaitThreads()
			}, 5000);
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
				.then(remoteThreads => {

					remoteThreads.forEach(remoteThread => {

						if (!this.currentThreads.has(remoteThread.id) && remoteThread.status === 'halted') {
							this.sendEvent(new ThreadEvent('started', remoteThread.id));
							this.sendEvent(new StoppedEvent('breakpoint', remoteThread.id));
							this.currentThreads.set(remoteThread.id, remoteThread);
						} else if (this.pendingThreads.has(remoteThread.id) && remoteThread.status === 'halted') {
							this.sendEvent(
								new StoppedEvent(
									this.pendingThreads.get(remoteThread.id) || 'breakpoint', remoteThread.id
								)
							);
							this.currentThreads.set(remoteThread.id, remoteThread);
							this.pendingThreads.delete(remoteThread.id);
						}
					});
					this.currentThreads.forEach(currentThread => {
						if (!remoteThreads.some(activeThread => activeThread.id === currentThread.id)) {
							this.sendEvent(new ThreadEvent('exited', currentThread.id));
							this.currentThreads.delete(currentThread.id);
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
