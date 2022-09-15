
import { request, Agent } from 'https';
import { OutgoingHttpHeaders, request as requestOfHttp } from 'http';

import { logger } from 'vscode-debugadapter';

const justResolve = (resolve, reject, body) => { resolve(body) };

function retryPromise<T>(fn: () => Promise<T>, retriesLeft = 3, interval = 400, log = (msg: string) => { }): Promise<T> {
	return new Promise((resolve, reject) => {
		return fn()
			.then(resolve)
			.catch((error) => {
				if (retriesLeft === 1) {
					// reject('maximum retries exceeded');
					reject(error)
					return
				}

				setTimeout(() => {
					log('retriesLeft: ' + retriesLeft)
					// Passing on "reject" is the important part
					retryPromise(fn, retriesLeft - 1, interval, log).then(resolve, reject)
				}, interval)
			})
	})
}


function proxyAgent(destHostname : string) : Promise<Agent | null> {
	return new Promise((resolve, reject) => {
		const proxyURL = process.env.HTTPS_PROXY || process.env.https_proxy || null;
		if (!proxyURL) {
			resolve(null);
			return;
		}
		const proxyEndpoint = new URL(proxyURL);
		if (!/^http:$/.test(proxyEndpoint.protocol || '')) {
			resolve(null);
			return;
		}
		const path = `${destHostname}:443`;
		const req = ((proxyEndpoint, path) => {
			const requestOptionsForProxy = {
				method: 'CONNECT',
				host: proxyEndpoint.hostname,
				port: proxyEndpoint.port,
				path,
				timeout: 10000
			};
			if (0 < proxyEndpoint.username.length && 0 < proxyEndpoint.password.length) {
				requestOptionsForProxy['headers'] = {
					'Proxy-Authorization': `Basic ${Buffer.from(`${proxyEndpoint.username}:${proxyEndpoint.password}`).toString('base64')}`
				};
			}
			return requestOfHttp(requestOptionsForProxy);
		})(proxyEndpoint, path);
		const handleError = (err) => {
			reject(err);
			req.destroy();
		};
		req.once('connect', (response, socket) => {
			if (response.statusCode === 200) {
				resolve(new Agent({ socket }));
				return;
			}
			handleError(new Error(`An error occurred while connecting. statusCode=${response.statusCode}, statusMessage=${response.statusMessage}`));
		});
		req.once('error', handleError);
		req.once('timeout', handleError);
		req.end();
	});
}


function httpRequest(options: {
	hostname: string;
	form?: object | string;
	json?: object | string;
	baseUrl: string;
	uri: string;
	method: string;
	headers: OutgoingHttpHeaders | undefined,
	username: string;
	password: string;
}) {
	return new Promise<string>((resolve, reject) => {
		proxyAgent(options.hostname).then((agent) => {
			const handleError = (err) => {
				reject(err);
				req.destroy();
			}
			const requestOptions = {
				hostname: options.hostname,
				path: options.baseUrl + options.uri,
				auth: [options.username, options.password].join(':'),
				method: options.method,
				rejectUnauthorized: false,
				servername: options.hostname,
				headers: options.headers,
				timeout: 10000
			};
			if (agent) {
				requestOptions['agent'] = agent;
			}
			const req = request(requestOptions, response => {
				const dt: string[] = [];
				response.on('data', data => {
					dt.push(data && data.toString());
				});
	
				response.once('error', err => {
					reject(err);
					req.destroy();
				});
				response.once('abort', err => {
					reject(err);
					req.destroy();
				});
				response.once('end', () => {
					if (response.statusCode && response.statusCode >= 400) {
						reject(response.statusMessage || response.statusCode);
					} else {
						resolve(dt.join(''));
					}
				});
	
			});
	
			req.once('error', handleError);
			req.once('timeout', handleError);
			req.once('uncaughtException', handleError);
	
			if (options.json) {
				const postData = typeof options.form === 'string'
					? options.form
					: JSON.stringify(options.json)
	
				req.setHeader('Content-Type', 'application/json');
				req.setHeader('Content-Length', Buffer.byteLength(postData));
	
				req.end(postData);
			} else if (options.form) {
				const postData = typeof options.form === 'string'
					? options.form
					: Object.keys(options.form).map(key =>
						key + '=' + (options.form && options.form[key] ? encodeURIComponent(options.form[key]) : '')).join('&')
	
				req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
				req.setHeader('Content-Length', Buffer.byteLength(postData));
	
				req.end(postData);
			} else {
				req.end();
			}
		}).catch((err) => {
			reject(err);
		});
	});
}

export interface IThread {
	id: number;
	status: 'halted' | 'running' | 'done';
	call_stack: IStackFrame[];
}

interface IStackFrameLocation {
	function_name: string;
	line_number: number;
	script_path: string;
}

interface IStackFrame {
	index: number;
	location: IStackFrameLocation
}

interface IMember {
	name: string;
	parent: string;
	type: string;
	value: string;
}

export interface IVariable {
	name: string,
	parent: string,
	scope: string,
	type: string,
	value: string,
	frameID: number,
	threadID: number
}

export default class Connection {
	protected options: any;
	protected established: boolean;
	protected verbose = false;
	protected log: (msg: string) => void;
	//protected logger : Logger;

	constructor(params) {
		this.options = Object.assign({}, {
			hostname: 'some.demandware.net',
			password: 'password',
			username: 'username',
			clientId: 'prophet'
		}, params);
		this.established = false;

		this.log = () => { };

		if (params.verbose) {
			this.log = (msg) => { logger.verbose('log -> ' + msg); };
			this.verbose = true;
		}
	}
	getOptions() {
		return {
			baseUrl: 'https://' + this.options.hostname + '/s/-/dw/debugger/v2_0/',
			uri: '/',
			username: this.options.username,
			password: this.options.password,
			hostname: this.options.hostname,
			headers: {
				'x-dw-client-id': this.options.clientId,
				'Content-Type': 'application/json'
			}
		};
	}
	makeRequest<T>(options, cb: (resolve, reject, body) => void): Promise<T> {
		if (this.verbose) {
			logger.verbose('req -> ' + JSON.stringify(options));
		}
		if (!this.established) {
			return Promise.reject(Error('Connection is not established'));
		}

		return httpRequest({ ...this.getOptions(), ...options }).then(body => {
			if (this.verbose) {
				logger.verbose('req: ' + JSON.stringify(options));
				logger.verbose('res: ' + JSON.stringify(body));
			}

			return new Promise((resolve, reject) => {
				cb(resolve, reject, body && JSON.parse(body))
			})
		});
	}
	establish() {
		return retryPromise(() =>
			httpRequest({
				...this.getOptions(),
				uri: '/client',
				method: 'POST'
			}).then(body => {
				if (this.verbose) {
					logger.verbose('req: ' + JSON.stringify(Object.assign(this.getOptions())));
					logger.verbose('res: ' + JSON.stringify(body));
				}
				this.established = true
			}), 3, 500, this.log);
	}
	getStackTrace(threadID: number): Promise<IStackFrame[]> {
		return retryPromise(() => this.makeRequest({
			uri: '/threads/' + threadID,
			method: 'get'
		}, (resolve, reject, body) => {
			if (body.call_stack) {
				resolve(body.call_stack);
			} else {
				resolve([]);
			}
		}), 3, 500, this.log);
	}
	getMembers(threadID: number, frame_index: number, path?: string, start = 0, count = 100): Promise<IMember[]> {
		//get all variables

		return retryPromise(() => this.makeRequest({
			uri: `/threads/${threadID}/frames/${frame_index}/members` + (path ? '?object_path=' + escape(path) : '') + `${path ? '&' : '?'}start=${start}&count=${count}`,
			method: 'get'
		}, (resolve, reject, body) => {
			if (body.total > start + count) {
				this.getMembers(threadID, frame_index, path, start + count, count).then(mbrs => {
					resolve(body.object_members.concat(mbrs));
				});
			} else {
				if (body.object_members) {
					resolve(body.object_members);
				} else {
					resolve([]);
				}
			}

		}), 3, 500, this.log);
	}
	disconnect() {
		this.established = false;

		return retryPromise(() => httpRequest({
			...this.getOptions(),
			uri: '/client',
			method: 'DELETE'
		}), 3, 500, this.log);
	}

	createBreakpoints(breakpoints): Promise<{ id: string, file: string, line: string }[]> {
		return retryPromise(() => this.makeRequest({
			uri: '/breakpoints',
			method: 'POST',
			json: {
				breakpoints: breakpoints.map(breakpoint => ({
					line_number: breakpoint.line,
					script_path: breakpoint.file
				}))
			}
		}, (resolve, reject, body) => {
			resolve(body.breakpoints.map(breakpoint => ({
				id: breakpoint.id,
				file: breakpoint.script_path,
				line: breakpoint.line_number
			})));
		}));
	}
	getBreakpoints(id?: string): Promise<{ id: string, file: string, line: string }[]> {
		return retryPromise(() => this.makeRequest({
			uri: '/breakpoints' + (id ? '/' + id : ''),
			method: 'get'
		}, (resolve, reject, body) => {
			if (body.breakpoints) {

				resolve(body.breakpoints.map(breakpoint => ({
					id: breakpoint.id,
					file: breakpoint.script_path,
					line: breakpoint.line_number
				})));
			} else {
				resolve([]);
			}
		}), 3, 500, this.log);
	}
	removeBreakpoints(id?: number) {
		return retryPromise(() => this.makeRequest({
			uri: '/breakpoints' + (id ? '/' + id : ''),
			method: 'DELETE'
		}, justResolve), 3, 500, this.log);
	}
	resetThreads() {
		return retryPromise(() => this.makeRequest({
			uri: '/threads/reset',
			method: 'POST'
		}, justResolve), 3, 500, this.log);
	}
	getThreads(): Promise<IThread[]> {
		return retryPromise(() => this.makeRequest({
			uri: '/threads',
			method: 'GET'
		}, (resolve, reject, body) => {
			if (body.script_threads) {
				resolve(body.script_threads);
			} else {
				resolve([]);
			}
		}), 3, 500, this.log)
	}
	getVariables(threadID: number, frame_index: number, start = 0, count = 100): Promise<IVariable[]> {
		//threads/{thread_id}/variables
		return retryPromise(() => this.makeRequest({
			uri: `/threads/${threadID}/frames/${frame_index}/variables?start=${start}&count=${count}`,
			method: 'GET'
		}, (resolve, reject, body) => {

			if (body.object_members) {
				const members = body.object_members.map(member => {
					member.frameID = frame_index;
					member.threadID = threadID;
					return member;
				});
				if (body.total > start + count) {
					this.getVariables(threadID, frame_index, start + count, count).then(mbrs => {
						resolve(members.concat(mbrs));
					});
				} else {
					resolve(members);
				}
			} else {
				resolve([]);
			}
		}), 3, 500, this.log);
	}
	stepInto(threadID: number): Promise<IThread> {
		//threads/{thread_id}/into
		return this.makeRequest({
			uri: '/threads/' + threadID + '/into',
			method: 'POST'
		}, justResolve);
	}
	stepOut(threadID: number): Promise<IThread> {
		//threads/{thread_id}/out
		return this.makeRequest({
			uri: '/threads/' + threadID + '/out',
			method: 'POST'
		}, justResolve);
	}
	stepOver(threadID: number): Promise<IThread> {
		//threads/{thread_id}/over
		return this.makeRequest({
			uri: '/threads/' + threadID + '/over',
			method: 'POST'
		}, justResolve);
	}
	resume(threadID: number): Promise<IThread> {
		//threads/{thread_id}/resume
		return this.makeRequest({
			uri: '/threads/' + threadID + '/resume',
			method: 'POST'
		}, justResolve);
	}
	stop(threadID: number) {
		//threads/{thread_id}/stop
		return this.makeRequest({
			uri: '/threads/' + threadID + '/stop',
			method: 'POST'
		}, justResolve);
	}
	evaluate(threadID: number, expr = 'this', frameNo = 0): Promise<string> {
		return this.makeRequest({
			uri: '/threads/' + threadID + '/frames/' + frameNo +
				'/eval?expr=' + encodeURIComponent(expr),
			method: 'GET'
		}, (resolve, reject, body) => {
			resolve(body.result);
		});
	}
}
