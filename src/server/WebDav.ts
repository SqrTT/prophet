
import { relative, sep, resolve, join } from 'path';
import { Observable } from 'rxjs';
import { createReadStream, unlink, ReadStream } from 'fs';
import { finished } from 'stream';
import { workspace, CancellationTokenSource, RelativePattern } from 'vscode';

class WebDavError extends Error {
	statusCode: number
}

function request$(options) {
	//fixme: refactor to use https module
	return Observable.fromPromise(import('request')).flatMap(request => {
		return new Observable<string>(observer => {
			const req = request(options, (err, res, body) => {
				if (err) {
					observer.error(err);
				} else if (res.statusCode >= 400) {
					const err = new WebDavError([res.statusMessage, body, JSON.stringify(res)].join('\n'));
					err.statusCode = res.statusCode;

					observer.error(err);
				} else {
					observer.next(body);
					observer.complete();
				}
			});

			return () => {
				req.destroy();
			};
		});
	})
}

export interface DavOptions {
	cartridge: string[]
	configFilename?: string,
	hostname: string,
	username: string,
	password: string,
	version: string,
	root: string,
	debug?: boolean,
	cartrigeResolution: 'ask' | 'leave' | 'remove'
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
	config: DavOptions;
	log: (...string) => any;
	folder: string = 'Cartridges';
	constructor(config, log = (() => { })) {
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
			baseUrl: `https://${this.config.hostname}/on/demandware.servlet/webdav/Sites/${this.folder}/${this.config.version}`,
			uri: '/',
			auth: {
				user: this.config.username,
				password: this.config.password
			},
			strictSSL: false
		};
	}
	makeRequest(options): Observable<string> {
		this.log('request', options, this.getOptions());
		return request$(Object.assign(this.getOptions(), options));
	}
	postBody(uriPath: string, bodyOfFile: string): Observable<string> {
		this.log('postBody', uriPath);

		return request$(Object.assign(this.getOptions(), {
			uri: '/' + uriPath,
			method: 'PUT',
			form: bodyOfFile
		})).do(body => {
			this.log('postBody-response', uriPath, body);
		});
	}
	post(filePath: string, root: string = this.config.root): Observable<string> {
		const uriPath = relative(root, filePath);

		this.log('post', uriPath);

		return request$(Object.assign(this.getOptions(), {
			uri: '/' + uriPath,
			method: 'PUT',
			body: createReadStream(filePath)
		})).do(body => {
			this.log('post-response', uriPath, body);
		});
	}
	postStream(filePath: string, stream: ReadStream, root: string = this.config.root): Observable<string> {
		const uriPath = relative(root, filePath);

		this.log('post', uriPath);

		return request$(Object.assign(this.getOptions(), {
			uri: '/' + uriPath,
			method: 'PUT',
			body: stream
		})).do(body => {
			this.log('post-response-stream', uriPath, body);
		});
	}
	mkdir(filePath: string, root: string = this.config.root): Observable<string> {
		const uriPath = relative(root, filePath);
		this.log('mkdir', uriPath);

		return request$(Object.assign(this.getOptions(), {
			uri: '/' + uriPath,
			method: 'MKCOL'
		})).do(body => {
			this.log('mkcol-response', uriPath, body);
		});
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
		}).do(data => {
			this.log('unzip-response', data);
		});
	}
	get(filePath: string, root = this.config.root): Observable<string> {
		const uriPath = relative(root, filePath);

		this.log('get', uriPath);
		return this.makeRequest({
			uri: '/' + uriPath,
			method: 'GET'
		}).do(data => {
			this.log('get-response', data);
		});
	}
	getActiveCodeVersion(): Observable<string> {
		return this.makeRequest({
			uri: '/../.version',
			method: 'GET'
		}).do(data => {
			this.log('get-response', data);
		}).map(fileContent => {
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
		});
	}
	postAndUnzip(filePath: string) {
		return this.post(filePath).flatMap(() => this.unzip(filePath));
	}
	cleanUpCodeVersion(notify: (...string) => void, ask: (sb: string[], listc: string[]) => Promise<string[]>, list: string[]) {

		return this.dirList('/', '/').flatMap((res: string) => {
			const matches = getMatches(res, /<displayname>(.+?)<\/displayname>/g);
			const filteredPath = matches.filter(match => match && match !== this.config.version);

			return Observable.fromPromise(ask(filteredPath, list))
				.flatMap((cartridgesToRemove) => {
					if (cartridgesToRemove.length) {
						const delete$ = cartridgesToRemove.map(path => this.delete('/' + path, '/').do(() => { notify(`Deleted ${path}`) }));

						return Observable.forkJoin(...delete$);
					} else {
						return Observable.of(['']);
					}
				})
		});
	}
	delete(filePath: string, optionalRoot: string = this.config.root): Observable<string> {
		const uriPath = relative(optionalRoot, filePath);

		this.log('delete', uriPath);
		return request$(Object.assign(this.getOptions(), {
			uri: '/' + uriPath,
			method: 'DELETE'
		})).do(body => {
			this.log('delete-response', uriPath, body);
		}).catch(err => {
			// it's ok to ignore 404 error if the file is not found
			if (err && err.statusCode === 404) {
				return Observable.of(err);
			} else {
				return Observable.throw(err);
			}
		});
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
	deleteLocalFile(fileName): Observable<undefined> {
		return Observable.create(observer => {
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
	zipFiles(pathToCartridgesDir, { ignoreList = [] as Array<string> }) {
		return Observable.fromPromise(import('yazl'))
			.flatMap(yazl => {
				return this.getFileList(pathToCartridgesDir, { ignoreList })
					.reduce((zipFile, files) => {
						if (files.length === 1) {
							zipFile.addEmptyDirectory(files[0]);
						} else if (files.length === 2) {
							zipFile.addFile(files[0], files[1]);
						} else {
							throw new Error('Unexpected argument');
						}
						return zipFile;
					}, new yazl.ZipFile())
					.flatMap(zipFile => {
						return new Observable<ReadStream>(observer => {
							zipFile.once('error', err => observer.error(err));

							observer.next(zipFile.outputStream);

							finished(zipFile.outputStream, (err) => {
								if (err) {
									observer.error(err);
								} else {
									observer.complete();
								}
							});

							zipFile.end();

							return () => {
								zipFile.outputStream.destroy();
							}
						});
					});
			});
	}
	uploadCartridge(
		pathToCartridgesDir,
		notify = (arg: string) => { },
		{ ignoreList = [] as Array<string> }
	) {

		const processingFolder = pathToCartridgesDir.split(sep).pop();
		const cartridgesZipFileName = join(pathToCartridgesDir, processingFolder + '_cartridge.zip');


		return this.delete(cartridgesZipFileName, pathToCartridgesDir)
			.do(() => {
				notify(`[${processingFolder}] Deleting remote zip (if any)`);
			})
			.flatMap(() => {
				notify(`[${processingFolder}] Zipping`);
				return this.zipFiles(pathToCartridgesDir, { ignoreList })
			})
			.flatMap((stream) => {
				notify(`[${processingFolder}] Sending zip to remote`);
				return this.postStream(cartridgesZipFileName, stream, pathToCartridgesDir)
			})
			.flatMap(() => {
				notify(`[${processingFolder}] Unzipping remote zip`);
				return this.unzip(cartridgesZipFileName, pathToCartridgesDir)
			})
			.flatMap(() => {
				notify(`[${processingFolder}] Deleting remote zip...`);
				return this.delete(cartridgesZipFileName, pathToCartridgesDir)
			})
			.filter(() => false);
	}
}

export function readConfigFile(configFilename: string) {
	return new Observable<DavOptions>(observer => {
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
				const conf = JSON.parse(Buffer.concat(chunks).toString());
				conf.configFilename = configFilename;
				observer.next(conf);
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
	});
}
