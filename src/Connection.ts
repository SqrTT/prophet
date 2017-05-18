
import request = require('request');

const justResolve = (resolve) => {resolve()};

interface IThread {
	id: number;
	status : 'halted' | 'running' | 'done';
	call_stack: any[];
}

interface IStackFrameLocation {
	function_name: string;
	line_number: number;
	script_path: string;
}

interface IStackFrame {
	index: number;
	location:IStackFrameLocation
}

interface IMember {
	name : string;
	parent: string;
	type : string;
	value: string;
}

export default class Connection {
	protected options : any;
	protected estabilished : boolean;

	constructor (params = {}) {
		this.options = Object.assign({}, {
			hostname: 'some.demandware.net',
			password: 'password',
			username: 'username',
			clientId: 'prophet'
		}, params);
		this.estabilished = false;
	}
	getOptions () {
		return {
			baseUrl: 'https://' + this.options.hostname + '/s/-/dw/debugger/v1_0/',
			uri: '/',
			auth: {
				user: this.options.username,
				password: this.options.password
			},
			headers: {
				'x-dw-client-id': this.options.clientId,
				'Content-Type' : 'application/json'
			},
			strictSSL: false
		};
	}
	makeRequest<T> (options, cb : (resolve, reject, body) => void) : Promise<T> {
		return new Promise((resolve, reject) => {
			if (!this.estabilished) {
				reject(Error('Connection is not estabilished'));
				return;
			}
			console.log('request', options);

			request(Object.assign(this.getOptions(), options), (err, res, body) => {
				console.log('response', body);
				if (err) {
					return reject(err);
				}

				if (res.statusCode >= 400) {
					return reject(new Error(res.statusMessage));
				}
				cb(resolve, reject, body);
			});
		});
	}
	estabilish () {
		return new Promise((resolve, reject) => {
			request(Object.assign(this.getOptions(), {
				uri: '/client',
				method: 'POST'
			}), (err, res) => {
				if (err) {
					return reject(err);
				}
				if (res.statusCode >= 400) {
					return reject(new Error(res.statusMessage));
				}
				this.estabilished = true
				resolve();
			});
		});
	}
	getStackTrace(threadID) : Promise<IStackFrame[]> {
		return this.makeRequest({
			uri: '/threads/' + threadID,
			method: 'get',
			json: true
		}, (resolve, reject, body) => {
			if (body.call_stack) {
				resolve(body.call_stack);
			} else {
				resolve([]);
			}
		});
	}
	getMembers(threadID, frame_index, path?) : Promise<IMember[]>{
		return this.makeRequest({
			uri: `/threads/${threadID}/frames/${frame_index}/members` + (path ? '?object_path=' + path : ''),
			method: 'get',
			json: true
		}, (resolve, reject, body) => {
			if (body.object_members) {
				resolve(body.object_members);
			} else {
				resolve([]);
			}
		});
	}
	disconnect () {
		this.estabilished = false;
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

	createBreakpoints(breakpoints) : Promise<{id, file, line}[]> {
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
	getBreakpoints(id?) : Promise<{id, file, line}[]> {
		return this.makeRequest({
			uri: '/breakpoints' + ( id ? '/' + id : ''),
			method: 'get',
			json: true
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
			uri: '/breakpoints' + ( id ? '/' + id : ''),
			method: 'DELETE'
		}, justResolve);
	}
	resetThreads () {
		return this.makeRequest({
			uri: '/threads/reset',
			method: 'POST'
		}, justResolve)
	}
	getThreads () : Promise<any[]> {
		return this.makeRequest({
			uri: '/threads',
			method: 'GET',
			json: true
		}, (resolve, reject, body) => {
			if (body.script_threads) {
				resolve(body.script_threads);
			} else {
				resolve([]);
			}
		})
	}
	stepInto(threadID) {
		//threads/{thread_id}/into
		return this.makeRequest({
			uri: '/threads/' + threadID + '/into',
			method: 'POST'
		}, justResolve);
	}
	stepOut(threadID) {
		//threads/{thread_id}/out
		return this.makeRequest({
			uri: '/threads/' + threadID + '/out',
			method: 'POST'
		}, justResolve);
	}
	stepOver(threadID) {
		//threads/{thread_id}/over
		return this.makeRequest({
			uri: '/threads/' + threadID + '/over',
			method: 'POST'
		}, justResolve);
	}
	resume (threadID) {
		//threads/{thread_id}/resume
		return this.makeRequest({
			uri: '/threads/' + threadID+ '/resume',
			method: 'POST'
		}, justResolve);
	}
	stop (threadID) {
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
			method: 'GET',
			json: true
		}, (resolve, reject, body) => {
			resolve(body.result);
		});
	}
}