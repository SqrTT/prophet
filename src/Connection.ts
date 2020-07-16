
import { request } from 'https';
import { OutgoingHttpHeaders } from 'http';

import { logger } from 'vscode-debugadapter';

const justResolve = (resolve, reject, body) => { resolve(body) };



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

		const req = request({
			hostname: options.hostname,
			path: options.baseUrl + options.uri,
			auth: [options.username, options.password].join(':'),
			method: options.method,
			rejectUnauthorized: false,
			servername: options.hostname,
			headers: options.headers,
			timeout: 20000
		}, response => {
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

		const handleError = (err) => {
			reject(err);
			req.destroy();
		}

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
	//protected logger : Logger;

	constructor(params) {
		this.options = Object.assign({}, {
			hostname: 'some.demandware.net',
			password: 'password',
			username: 'username',
			clientId: 'prophet'
		}, params);
		this.established = false;

		if (params.verbose) {
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
		return httpRequest({
			...this.getOptions(),
			uri: '/client',
			method: 'POST'
		}).then(body => {
			if (this.verbose) {
				logger.verbose('req: ' + JSON.stringify(Object.assign(this.getOptions())));
				logger.verbose('res: ' + JSON.stringify(body));
			}
			this.established = true
		})
	}
	getStackTrace(threadID: number): Promise<IStackFrame[]> {
		return this.makeRequest({
			uri: '/threads/' + threadID,
			method: 'get'
		}, (resolve, reject, body) => {
			if (body.call_stack) {
				resolve(body.call_stack);
			} else {
				resolve([]);
			}
		});
	}
	getMembers(threadID: number, frame_index: number, path?: string, start = 0, count = 100): Promise<IMember[]> {
		//get all variables

		return this.makeRequest({
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

		});
	}
	disconnect() {
		this.established = false;

		return httpRequest({
			...this.getOptions(),
			uri: '/client',
			method: 'DELETE'
		});
	}

	createBreakpoints(breakpoints): Promise<{ id: string, file: string, line: string }[]> {
		return this.makeRequest({
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
		});
	}
	getBreakpoints(id?: string): Promise<{ id: string, file: string, line: string }[]> {
		return this.makeRequest({
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
		});
	}
	removeBreakpoints(id?: number) {
		return this.makeRequest({
			uri: '/breakpoints' + (id ? '/' + id : ''),
			method: 'DELETE'
		}, justResolve);
	}
	resetThreads() {
		return this.makeRequest({
			uri: '/threads/reset',
			method: 'POST'
		}, justResolve)
	}
	getThreads(): Promise<IThread[]> {
		return this.makeRequest({
			uri: '/threads',
			method: 'GET'
		}, (resolve, reject, body) => {
			if (body.script_threads) {
				resolve(body.script_threads);
			} else {
				resolve([]);
			}
		})
	}
	getVariables(threadID: number, frame_index: number, start = 0, count = 100): Promise<IVariable[]> {
		//threads/{thread_id}/variables
		return this.makeRequest({
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

		});
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
