
import request = require('request');

import { logger } from 'vscode-debugadapter';

const justResolve = (resolve, reject, body) => { resolve(body) };

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
			auth: {
				user: this.options.username,
				password: this.options.password
			},
			headers: {
				'x-dw-client-id': this.options.clientId,
				'Content-Type': 'application/json'
			},
			strictSSL: false,
			timeout: 10000
		};
	}
	makeRequest<T>(options, cb: (resolve, reject, body) => void): Promise<T> {
		if (this.verbose) {
			logger.verbose('req -> ' + JSON.stringify(options));
		}
		return new Promise((resolve, reject) => {
			if (!this.established) {
				reject(Error('Connection is not established'));
				return;
			}
			if (typeof options.json === 'undefined') {
				options.json = true;
			}

			request(Object.assign(this.getOptions(), options), (err, res, body) => {
				if (err) {
					return reject(err);
				}
				if (this.verbose) {
					logger.verbose('req: ' + JSON.stringify(options));
					logger.verbose('res: ' + JSON.stringify(body));
				}

				if (res.statusCode >= 400) {
					if (res.body) {
						try {
							const content = JSON.parse(res.body);
							if (content) {
								return reject(new Error(JSON.stringify(content, null, '    ')));
							}
						} catch (e) {
							return reject(new Error(`establish error: ${res.statusCode} ${res.statusMessage} ${res.body} :  ${e}`));
						}
					}
					return reject(new Error(res.statusMessage));
				}
				cb(resolve, reject, body);
			});
		});
	}
	establish() {
		return new Promise((resolve, reject) => {
			request(Object.assign(this.getOptions(), {
				uri: '/client',
				method: 'POST'
			}), (err, res, body) => {
				if (err) {
					return reject(err);
				}
				if (this.verbose) {
					logger.verbose('req: ' + JSON.stringify(Object.assign(this.getOptions())));
					logger.verbose('res: ' + JSON.stringify(body));
				}
				if (res.statusCode >= 400) {
					if (res.body) {
						try {
							const content = JSON.parse(res.body);
							if (content) {
								return reject(new Error(JSON.stringify(content, null, '    ')));
							}
						} catch (e) {
							return reject(new Error('establish error: ' + e));
						}
					}
					return reject(new Error(res.statusMessage));
				}
				this.established = true
				resolve();
			});
		});
	}
	getStackTrace(threadID): Promise<IStackFrame[]> {
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
	getMembers(threadID, frame_index, path?, start = 0, count = 100): Promise<IMember[]> {
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
		return new Promise((resolve, reject) => {
			request(Object.assign(this.getOptions(), {
				uri: '/client',
				method: 'DELETE'
			}), (err, res) => {
				if (err) {
					return reject(err);
				}
				if (res.statusCode >= 400) {
					return reject(new Error(res.statusMessage));
				}
				resolve();
			});
		});
	}

	createBreakpoints(breakpoints): Promise<{ id, file, line }[]> {
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
	getBreakpoints(id?): Promise<{ id, file, line }[]> {
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
	removeBreakpoints(id?) {
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
	stepInto(threadID): Promise<IThread> {
		//threads/{thread_id}/into
		return this.makeRequest({
			uri: '/threads/' + threadID + '/into',
			method: 'POST'
		}, justResolve);
	}
	stepOut(threadID): Promise<IThread> {
		//threads/{thread_id}/out
		return this.makeRequest({
			uri: '/threads/' + threadID + '/out',
			method: 'POST'
		}, justResolve);
	}
	stepOver(threadID): Promise<IThread> {
		//threads/{thread_id}/over
		return this.makeRequest({
			uri: '/threads/' + threadID + '/over',
			method: 'POST'
		}, justResolve);
	}
	resume(threadID): Promise<IThread> {
		//threads/{thread_id}/resume
		return this.makeRequest({
			uri: '/threads/' + threadID + '/resume',
			method: 'POST'
		}, justResolve);
	}
	stop(threadID) {
		//threads/{thread_id}/stop
		return this.makeRequest({
			uri: '/threads/' + threadID + '/stop',
			method: 'POST'
		}, justResolve);
	}
	evaluate(threadID, expr = 'this', frameNo = 0): Promise<string> {
		return this.makeRequest({
			uri: '/threads/' + threadID + '/frames/' + frameNo +
				'/eval?expr=' + encodeURIComponent(expr),
			method: 'GET'
		}, (resolve, reject, body) => {
			resolve(body.result);
		});
	}
}
