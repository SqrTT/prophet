

import request = require('request');
import extend = require('extend');
import * as EventEmmiter from 'events';


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

export default class Connection extends EventEmmiter {
    protected options : any;
    protected estabilished : boolean;
    protected timer : null | number;
    protected isAwaitingThreads : boolean;
    protected awaitThreadsTimer : number | null;
    protected threadsMap : Map<number, IThread>


    constructor (params = {}) {
        super();
        this.threadsMap = new Map<number, IThread>();

        this.options = extend({}, {
            hostname: 'some.demandware.net',
            password: 'password',
            username: 'username',
            clientId: 'prophet'
        }, params);
        this.estabilished = false;
        this.timer = null;
        this.isAwaitingThreads = false;
        
    }
    startAwaitThreads() {
        if (!this.isAwaitingThreads) {
            this.timer = setInterval(this.resetThreads.bind(this), 30000);
            this.awaitThreadsTimer = setInterval(this.awaitThreads.bind(this), 10000);
            this.isAwaitingThreads = true;
        }
    }
    stopAwaitThreads() {
        if (this.isAwaitingThreads) {
            clearInterval(this.awaitThreadsTimer);
            clearInterval(this.timer);
            this.isAwaitingThreads = false;
        }
    }
    awaitThreads() {
        if (this.isAwaitingThreads) {
            this.getThreads()
                .then(activeThreads => {
                    if (activeThreads.length) {
                        activeThreads.forEach(activeThread => {
                            if (!this.threadsMap.has(activeThread.id)) {
                                this.emit('new.thread', activeThread);
                                this.threadsMap.set(activeThread.id, activeThread)
                            }
                            // todo release threads
                        });
                    }
                })
                .catch(err => {
                    this.emit('error', err);
                });
        }
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
    makeRequest (options, cb, wasRetry = false) {
        return new Promise((resolve, reject) => {
            if (!this.estabilished) {
                reject(Error('Connection is not estabilished'));
                return;
            }
            console.log('request', options);

            request(extend(this.getOptions(), options), (err, res, body) => {
                console.log('response', body);
                if (err) {
                    return reject(err);
                }

                if (res.statusCode >= 400) {
                    if (wasRetry) {
                        return reject(new Error(res.statusMessage));
                    } else {
                        return this.estabilish().then(() => {
                            this.makeRequest(options, cb, true);
                        });
                    }
                }
                cb(resolve, reject, body);
            });
        });
    }
    estabilish () {
        return new Promise((resolve, reject) => {
            request(extend(this.getOptions(), {
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
    destroy () {
        clearTimeout(this.timer);
        this.estabilished = false;
        this.stopAwaitThreads();

        return new Promise((resolve, reject) => {
            request(extend(this.getOptions(), {
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

    /**
     * @params breakpoints[]
     *
     **/
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
    getBreakpoints(id) {
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
        }, (resolve) => {
            resolve();
        });
    }
    resetThreads () {
        return this.makeRequest({
            uri: '/threads/reset',
            method: 'POST'
        }, (resolve) => {
            resolve();
        })
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
    getEval(threadID, expr = 'this', frameNo = 0) {
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