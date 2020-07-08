
import { relative, sep, resolve, join } from 'path';
import { Observable, of, from, forkJoin, throwError } from 'rxjs';
import { tap, map, flatMap, catchError, reduce, filter } from 'rxjs/operators';
import { createReadStream, unlink, ReadStream } from 'fs';
import { finished } from 'stream';
import { workspace, CancellationTokenSource, RelativePattern, window } from 'vscode';
import { request } from 'https';

import * as yazl from 'yazl';

class WebDavError extends Error {
	statusCode: number;
	constructor(...args: any[]) {
		super(...args)
		this.statusCode = 401;
	}
}

function request$(options: {
	hostname: string;
	//uriBase: string;
	stream?: ReadStream;
	form?: object | string;
	baseUrl: string;
	uri: string;
	method: string;
	username: string;
	password: string;
}) {
	return new Observable<string>(observer => {

		const req = request(options.baseUrl + options.uri, {
			auth: [options.username, options.password].join(':'),
			method: options.method,
			timeout: 20000
		}, response => {
			const dt: string[] = [];
			response.on('data', data => {
				dt.push(data && data.toString());
			});

			response.once('error', err => {
				observer.error(err);
				req.destroy();
			});
			response.once('abort', err => {
				observer.error(err);
				req.destroy();
			});
			response.once('end', () => {
				if (response.statusCode && response.statusCode >= 400) {
					const err = new WebDavError([
						response.statusCode,
						dt.join(''),
						JSON.stringify({ options })].join('\n')
					);
					err.statusCode = response.statusCode;

					observer.error(err);
				} else {
					observer.next(dt.join(''));
					observer.complete();
				}
			});

		});

		req.once('error', (err) => {
			observer.error(err);
			req.destroy();
		});
		req.once('timeout', function (err) {
			observer.error(err);
			req.destroy();
		});
		req.once('uncaughtException', function (err) {
			observer.error(err);
			req.destroy();
		});

		const stream = options.stream;
		if (stream) {
			stream.once('error', (err) => {
				observer.error(err);
				if (req) {
					req.destroy();
				}
			});
			stream.pipe(req);

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

		return () => {
			req.destroy();
		};
	});
}

export interface DavOptions {
	cartridge: string[]
	configFilename?: string,
	hostname: string,
	username: string,
	password: string,
	version: string,
	'code-version'?: string;
	root: string,
	debug?: boolean,
	cartridgeResolution?: 'ask' | 'leave' | 'remove',
	cartridgesPath?: string
}

interface WebDavOptions {
	hostname: string,
	username: string,
	password: string,
	version: string,
	root: string
}

function getMatches(string: string, regex: RegExp, index = 1) {
	var matches: string[] = [];
	var match: RegExpExecArray | null;
	while (match = regex.exec(string)) {
		matches.push(match[index]);
	}
	return matches;
}

export default class WebDav {
	static WebDavError = WebDavError;
	config: WebDavOptions;
	log: (...str: string[]) => any;
	folder: string = 'Cartridges';
	public baseUrl: string = '';
	constructor(config: WebDavOptions, log = (() => { })) {
		this.config = Object.assign({}, {
			hostname: 'some.demandware.net',
			username: 'username',
			password: 'password',
			version: 'version1',
			root: '.'
		}, config);
		this.log = log;
	}
	dirList(filePath = '.', root = this.config.root): Observable<string> {
		const uriPath = relative(root, filePath);

		return request$(
			Object.assign(this.getOptions(), {
				uri: '/' + uriPath,
				headers: {
					Depth: 1
				},
				method: 'PROPFIND'
			})
		);
	}
	getOptions() {
		return {
			hostname: this.config.hostname,
			uriBase: `/on/demandware.servlet/webdav/Sites/${this.folder}/${this.config.version}`,
			baseUrl: this.baseUrl || `https://${this.config.hostname}/on/demandware.servlet/webdav/Sites/${this.folder}/${this.config.version}`,
			uri: '/',
			username: this.config.username,
			password: this.config.password
		};
	}
	makeRequest(options): Observable<string> {
		return request$(Object.assign(this.getOptions(), options));
	}
	postBody(uriPath: string, bodyOfFile: string): Observable<string> {
		this.log('postBody', uriPath);

		return request$(Object.assign(this.getOptions(), {
			uri: '/' + uriPath,
			method: 'PUT',
			form: bodyOfFile
		})).pipe(tap(body => {
			this.log('postBody-response', uriPath, body);
		}));
	}
	post(filePath: string, root: string = this.config.root): Observable<string> {
		const uriPath = relative(root, filePath);

		this.log('post', uriPath);

		return request$(Object.assign(this.getOptions(), {
			uri: '/' + uriPath,
			method: 'PUT',
			stream: createReadStream(filePath)
		})).pipe(tap(body => {
			this.log('post-response', uriPath, body);
		}));
	}
	postStream(filePath: string, stream: ReadStream, root: string = this.config.root): Observable<string> {
		const uriPath = relative(root, filePath);

		this.log('post-stream', uriPath);

		return request$(Object.assign(this.getOptions(), {
			uri: '/' + uriPath,
			method: 'PUT',
			stream: stream
		})).pipe(tap(body => {
			this.log('post-stream-response', uriPath, body);
		}));
	}
	mkdir(filePath: string, root: string = this.config.root): Observable<string> {
		const uriPath = relative(root, filePath);
		this.log('mkdir', uriPath);

		return request$(Object.assign(this.getOptions(), {
			uri: '/' + uriPath,
			method: 'MKCOL'
		})).pipe(tap(body => {
			this.log('mkdir-response', uriPath, body);
		}));
	}
	unzip(filePath: string, root = this.config.root): Observable<string> {
		const uriPath = relative(root, filePath);

		this.log('unzip', uriPath);
		return this.makeRequest({
			uri: '/' + uriPath,
			method: 'POST',
			form: {
				method: 'UNZIP'
			}
		}).pipe(tap(data => {
			this.log('unzip-response', data);
		}));
	}
	get(filePath: string, root = this.config.root): Observable<string> {
		const uriPath = relative(root, filePath);

		this.log('get', uriPath);
		return this.makeRequest({
			uri: '/' + uriPath,
			method: 'GET'
		}).pipe(tap(data => {
			this.log('get-response', data);
		}));
	}
	getBinary(filePath: string, root = this.config.root): Observable<string> {
		const uriPath = relative(root, filePath);

		this.log('getBinary', uriPath);
		return this.makeRequest({
			uri: '/' + uriPath,
			method: 'GET',
			encoding: 'binary'
		}).pipe(tap(data => {
			this.log('getBinary-response', data);
		}));
	}
	getActiveCodeVersion(): Observable<string> {
		return this.makeRequest({
			uri: '/../.version',
			method: 'GET'
		}).pipe(tap(data => {
			this.log('get-response', data);
		})).pipe(map(fileContent => {
			// parse .version file to find active version
			// sample
			/*
			###########################################
			# Generated file, do not edit.
			# Copyright (c) 2016 by Demandware, Inc.
			###########################################
			fileVersion=1
			maxVersions=0
			version1/1473910765602/1481569878000
			remote/1473910759457/1456936758000
			# end of file marker
			*/
			let lines = fileContent.split('\n');
			let activeVersion = '';
			for (let line of lines) {
				// get first non-commented line with slash
				if (line[0] === '#') {
					continue;
				}
				let slashIndex = line.indexOf('/');
				if (slashIndex < 0) {
					continue;
				}
				if (!activeVersion) {
					activeVersion = line.substring(0, slashIndex);
					continue;
				}
			}
			return activeVersion;
		}));
	}
	postAndUnzip(filePath: string) {
		return this.post(filePath).pipe(flatMap(() => this.unzip(filePath)));
	}
	cleanUpCodeVersion(notify: (...str: string[]) => void, ask: (sb: string[], listc: string[]) => Promise<string[]>, list: string[]) {
		return this.dirList('/', '/').pipe(flatMap((res: string) => {
			const matches = getMatches(res, /<displayname>(.+?)<\/displayname>/g);
			const filteredPath = matches.filter(match => match && match !== this.config.version);

			return from(ask(filteredPath, list)).pipe(
				flatMap((cartridgesToRemove) => {
					if (cartridgesToRemove.length) {
						const delete$ = cartridgesToRemove.map(path => this.delete('/' + path, '/').pipe(tap(() => { notify(`Deleted ${path}`) })));

						return forkJoin(...delete$);
					} else {
						return from(Promise.resolve(['']));
					}
				}))
		}));
	}
	delete(filePath: string, optionalRoot: string = this.config.root): Observable<string> {
		const uriPath = relative(optionalRoot, filePath);

		this.log('delete', uriPath);
		return request$(Object.assign(this.getOptions(), {
			uri: '/' + uriPath,
			method: 'DELETE'
		})).pipe(tap(body => {
			this.log('delete-response', uriPath, body);
		})).pipe(catchError(err => {
			// it's ok to ignore 404 error if the file is not found
			if (err && err.statusCode === 404) {
				return of(err);
			} else {
				return throwError(err);
			}
		}));
	}
	getFileList(pathToCartridgesDir: string, { ignoreList = [] as Array<string> }): Observable<string[]> {
		const parentProcessingFolder = resolve(pathToCartridgesDir, '..');


		return new Observable<string[]>(observer => {
			const tokenSource = new CancellationTokenSource();

			workspace
				.findFiles(
					new RelativePattern(pathToCartridgesDir, '**/*.*'),
					undefined,
					undefined,
					tokenSource.token
				).then(function (files) {
					files.forEach(file => {
						if (!ignoreList.some(ignore => !!file.fsPath.match(ignore))) {
							observer.next([
								file.fsPath,
								file.fsPath.replace(parentProcessingFolder + sep, '')
							]);
						}
					});
					observer.complete();
				}, function (err) {
					observer.error(err);
					tokenSource.dispose();
				})
			return () => {
				tokenSource.dispose();
			}
		});
	}
	deleteLocalFile(fileName: string) {
		return new Observable<undefined>(observer => {
			let isCanceled = false;

			unlink(fileName, err => {
				if (!isCanceled) {
					observer.next();
					observer.complete();
				}
			});
			return () => { isCanceled = true }
		});
	}
	zipFiles(pathToCartridgesDir: string, { ignoreList = [] as Array<string> }) {
		return this.getFileList(pathToCartridgesDir, { ignoreList })
			.pipe(reduce((zipFile, files) => {
				if (files.length === 1) {
					zipFile.addEmptyDirectory(files[0]);
				} else if (files.length === 2) {
					zipFile.addFile(files[0], files[1]);
				} else {
					throw new Error('Unexpected argument');
				}
				return zipFile;
			}, new yazl.ZipFile()))
			.pipe(flatMap(
				zipFile => new Observable<ReadStream>(observer => {
					const zp = zipFile as any;
					if (typeof zp.once === 'function') {
						zp.once('error', (err: Error) => observer.error(err));
					}

					observer.next(zipFile.outputStream as any);

					finished(zipFile.outputStream, (err) => {
						if (err) {
							observer.error(err);
						} else {
							observer.complete();
						}
					});

					zipFile.end();

					return () => {
						zipFile.end();
					}
				})
			));

	}
	uploadCartridge(
		pathToCartridgesDir: string,
		notify = (arg: string) => { },
		{ ignoreList = [] as Array<string> }
	) {

		const processingFolder = pathToCartridgesDir.split(sep).pop() || '';
		const cartridgesZipFileName = join(pathToCartridgesDir, processingFolder + '_cartridge.zip');


		return this.delete(cartridgesZipFileName, pathToCartridgesDir)
			.pipe(tap(() => {
				notify(`[${processingFolder}] Deleting remote zip (if any)`);
			}))
			.pipe(flatMap(() => {
				notify(`[${processingFolder}] Zipping`);
				return this.zipFiles(pathToCartridgesDir, { ignoreList })
			}))
			.pipe(flatMap(stream => {
				notify(`[${processingFolder}] Sending zip to remote`);
				return this.postStream(cartridgesZipFileName, stream, pathToCartridgesDir)
			}))
			.pipe(flatMap(() => {
				notify(`[${processingFolder}] Remove remote cartridge before extract`);
				return this.delete(join(pathToCartridgesDir, processingFolder), pathToCartridgesDir);
			}))
			.pipe(flatMap(() => {
				notify(`[${processingFolder}] Unzipping remote zip`);
				return this.unzip(cartridgesZipFileName, pathToCartridgesDir)
			}))
			.pipe(flatMap(() => {
				notify(`[${processingFolder}] Deleting remote zip...`);
				return this.delete(cartridgesZipFileName, pathToCartridgesDir)
			}))
			.pipe(filter(() => false));
	}
}

export function readConfigFile(configFilename: string) {
	return (new Observable<{ fileContent: string, configFilename: string }>(observer => {
		const stream = createReadStream(configFilename);
		let chunks: Buffer[] = [];

		// Listen for data
		stream.on('data', chunk => {
			chunks.push(chunk);
		});

		stream.on('error', err => {
			observer.error(err);
		}); // Handle the error

		// File is done being read
		stream.on('close', () => {
			try {
				observer.next({
					fileContent: Buffer.concat(chunks).toString(),
					configFilename: configFilename
				});
				observer.complete();
				chunks = <any>null;
			} catch (err) {
				observer.error(err);
			}
		});

		return () => {
			chunks = <any>null;
			stream.close();
		};
	})).pipe(flatMap(({ fileContent, configFilename }) => {
		return new Observable<DavOptions>(observer => {
			if (configFilename.match(/\.js$/)) {
				const moduleIn = {
					exports: {}
				}

				try {
					const fn = new Function('module', 'exports', 'window', 'workspace', fileContent);

					fn(moduleIn, moduleIn.exports, window, workspace);

					if (moduleIn.exports) {
						Promise.resolve(moduleIn.exports as any).then((config: DavOptions) => {
							observer.next({ ...config, configFilename: configFilename });
							observer.complete();
						}).catch((error: Error) => {
							observer.error('dw.js error:' + error);
						})
					} else {
						observer.error('dw.js don\'t exports correct configs');
					}
				} catch (err) {
					observer.error(err);
				}
			} else {
				try {
					const conf = JSON.parse(fileContent);
					observer.next({ ...conf, configFilename });
					observer.complete();
				} catch (err) {
					observer.error(err);
				}
			}
		})
	}));
}
