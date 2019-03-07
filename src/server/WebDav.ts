
import { relative, sep, resolve, join } from 'path';
import { Observable } from 'rxjs';
import { createReadStream, unlink, createWriteStream } from 'fs';

function request$(options) {
	//fixme: refactor to use https module
	return Observable.fromPromise(import('request')).flatMap(request => {
		return new Observable<string>(observer => {
			const req = request(options, (err, res, body) => {
				if (err) {
					observer.error(err);
				} else if (res.statusCode >= 400) {
					observer.error(new Error(res.statusMessage));
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
	debug?: boolean
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

		return request$(Object.assign(this.getOptions(), {
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
			if (err && err.message.trim() === 'Not Found') {
				return Observable.of(err);
			} else {
				return Observable.throw(err);
			}
		});
	}
	getFileList(pathToCartridgesDir: string, options): Observable<string[]> {
		const { isCartridge = false } = options;
		const { isDirectory = false } = options;
		const { ignoreList = ['node_modules', '\\.git', '\\.zip$'] } = options;
		const processingFolder = pathToCartridgesDir.split(sep).pop();

		return Observable.fromPromise(import('walk'))
			.flatMap(walk => {
				return new Observable<string[]>(observer => {
					let walker = walk.walk(pathToCartridgesDir, {
						filters: [/node_modules/, /\.git/],
						followLinks: true
					});

					/**
					 * When we have an empty Directory(eg, newly created cartridge), walking on "file" doesn't work.
					 * So, we walk on "directories" and call function "addEmptyDirectory" to add
					 * EMPTY DIRS to ZIP
					 */
					if (isDirectory) {
						walker.on('directories', function (root, stats, next) {

							stats.forEach(function (stat) {
								const toFile = relative(isCartridge ?
									pathToCartridgesDir.replace(processingFolder || '', '') :
									pathToCartridgesDir, resolve(root, stat.name));

								if (ignoreList.some(ignore => toFile.match(ignore))) {
									next()
								} else {
									observer.next([toFile])
								}
							});
							next();
						});
					} else {
						walker.on('file', (root, fileStat, next) => {
							const file = resolve(root, fileStat.name);
							if (ignoreList.some(ignore => file.match(ignore))) {
								next()
							} else {
								const toFile = relative(isCartridge ?
									pathToCartridgesDir.replace(new RegExp(processingFolder + '$'), '') :
									pathToCartridgesDir, resolve(root, fileStat.name));

								//this.log('adding to zip:', file);

								observer.next([file, toFile])
								next();
							}
						});
					}

					walker.on('end', () => {
						observer.complete();
					});

					walker.on('nodeError', (__, { error }) => {
						observer.error(error);
					});
					walker.on('directoryError', (__, { error }) => {
						observer.error(error);
					});

					return () => {
						walker.removeAllListeners();
						walker.pause();
					}
				});
			}
			);
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
	zipFiles(pathToCartridgesDir, cartridgesPackagePath, options) {

		return Observable.fromPromise(import('yazl'))
			.flatMap(yazl => {
				return this.getFileList(pathToCartridgesDir, options)
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

						zipFile.end();
						return new Observable(observer => {
							const inputStream = createWriteStream(cartridgesPackagePath);
							const outputStream = zipFile.outputStream;

							zipFile.outputStream
								.pipe(inputStream)
								.once('close', () => { observer.next(); observer.complete() })
								.once('error', err => observer.error(err));

							return () => {
								inputStream.close();
								outputStream.unpipe(inputStream);
								inputStream.end();
							}
						});
					});
			});
	}
	uploadCartridge(
		pathToCartridgesDir,
		notify = (string) => { },
		options: ({ ignoreList?: string[], isCartridge?: boolean }) = {}
	) {

		const processingFolder = pathToCartridgesDir.split(sep).pop();
		const cartridgesZipFileName = join(pathToCartridgesDir, processingFolder + '_cartridge.zip');


		return this.deleteLocalFile(cartridgesZipFileName)
			.do(() => {
				notify(`[${processingFolder}] Deleting local zip`);
			})
			.flatMap(() => {
				notify(`[${processingFolder}] Zipping`);
				return this.zipFiles(pathToCartridgesDir, cartridgesZipFileName, options)
			})
			.flatMap(() => {
				notify(`[${processingFolder}] Deleting remote zip`);
				return this.delete(cartridgesZipFileName, pathToCartridgesDir)
			})
			.flatMap(() => {
				notify(`[${processingFolder}] Sending zip to remote`);
				return this.post(cartridgesZipFileName, pathToCartridgesDir)
			})
			.flatMap(() => {
				notify(`[${processingFolder}] Deleting local zip...`);
				return this.deleteLocalFile(cartridgesZipFileName);
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
