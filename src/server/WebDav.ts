
import * as request from 'request';
import { relative, sep, resolve, join } from 'path';
import { Observable } from 'rxjs/Observable';
import { Subscription  } from 'rxjs/Subscription';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/filter';
import * as yazl from 'yazl';
import * as fs  from 'fs';
import * as walk from 'walk';
import * as rimraf from 'rimraf';

export interface DavOptions {
	hostname: string,
	username: string,
	password: string,
	version: string,
	root: string,
	debug?: boolean
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

		return Observable.create(observer => {
			let req = request(Object.assign(this.getOptions(), {
				uri: '/' + uriPath,
				headers: {
					Depth: 1
				},
				method: 'PROPFIND'
			}), (err, res, body) => {
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
				req = null;
			};
		});
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
	makeRequest(options) : Observable<string>{
		return Observable.create(observer => {
			this.log('request', options, this.getOptions());

			let req = request(
				Object.assign(this.getOptions(), options),
				(err, res, body) => {
					this.log('response', body);
					if (err) {
						observer.error(err);
					} else if (res.statusCode >= 400) {
						observer.error(new Error(res.statusMessage));
					} else {
						observer.next(body);
					}

					observer.complete();
				}
			);
			return () => {
				req.destroy();
				req = null;
			};
		});
	}
	postBody(uriPath : string, bodyOfFile: string) : Observable<string>{
		this.log('postBody', uriPath);

		return Observable.create(observer => {
			let req = request(Object.assign(this.getOptions(), {
				uri: '/' + uriPath,
				method: 'PUT',
				form: bodyOfFile
			}), (err, res, body) => {
				this.log('postBody-response', uriPath, body);
				if (err) {
					observer.error(err);
				} else if (res.statusCode >= 400) {
					observer.error(new Error(res.statusMessage));
				} else {
					observer.next(body);
				}

				observer.complete();
			});
			return () => {
				req.destroy()
				req = null;
			};
		});
	}
	post(filePath, root = this.config.root) : Observable<string>{
		const uriPath = relative(root, filePath);

		this.log('post', uriPath);
		return Observable.create(observer => {
			let req = request(Object.assign(this.getOptions(), {
				uri: '/' + uriPath,
				method: 'PUT'
			}), (err, res, body) => {
				this.log('post-response', uriPath, body);
				if (err) {
					observer.error(err);
				} else if (res.statusCode >= 400) {
					observer.error(new Error(res.statusMessage));
				} else {
					observer.next(body);
					observer.complete();
				}
			});

			let outputStream = fs.createReadStream(filePath);

			outputStream.once('error', error => {
				observer.error(error);
			});

			outputStream.pipe(req);

			return () => {
				if (outputStream) {
					outputStream.unpipe(req);
					outputStream.close();
					req.end();
				}
				req.destroy()
				req = null;
			};
		});
	}
	mkdir(filePath, root = this.config.root) : Observable<string>{
		const uriPath = relative(root, filePath);

		this.log('mkdir', uriPath);
		return Observable.create(observer => {
			let req = request(Object.assign(this.getOptions(), {
				uri: '/' + uriPath,
				method: 'MKCOL'
			}), (err, res, body) => {
				this.log('mkcol-response', uriPath, body);
				if (err) {
					observer.error(err);
				} else {
					// server reponse with not implemented (405) but it
					// still does what it should do
					observer.next(body);
				}

				observer.complete();
			});

			return () => {
				req.destroy()
				req = null;
			};

		});
	}
	unzip(filePath, root = this.config.root) : Observable<string>{
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
	get(filePath, root = this.config.root): Observable<string> {
		const uriPath = relative(root, filePath);

		this.log('get', uriPath);
		return this.makeRequest({
			uri: '/' + uriPath,
			method: 'GET'
		}).do(data => {
			this.log('get-response', data);
		});
	}
	getActiveCodeVersion() : Observable<string>{
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
	postAndUnzip(filePath : string) {
		return this.post(filePath).flatMap(() => this.unzip(filePath));
	}
	delete(filePath, optionalRoot) : Observable<string>{
		const uriPath = relative(optionalRoot || this.config.root, filePath);

		return Observable.create(observer => {
			this.log('delete', uriPath);
			let req = request(Object.assign(this.getOptions(), {
				uri: '/' + uriPath,
				method: 'DELETE'
			}), (err, res, body) => {
				this.log('delete-response', uriPath, body);
				if (err) {
					observer.error(err);
				} else if (res.statusCode >= 400 && res.statusCode !== 404) {
					// it's ok to ignore 404 error if the file is not found
					observer.error(new Error(res.statusMessage));
				} else {
					observer.next(body);
				}

				observer.complete();
			});

			return () => {
				req.destroy()
				req = null;
			};
		});
	}
	getFileList(pathToCartridgesDir, options) : Observable<string[]>{
		const { isCartridge = false } = options;
		const { isDirectory = false } = options;
		const { ignoreList = ['node_modules', '\\.git'] } = options;
		const processingFolder = pathToCartridgesDir.split(sep).pop();

		return Observable.create(observer => {

			let walker = walk.walk(pathToCartridgesDir, {
				filters: ignoreList,
				followLinks: true
			});

			function dispose() {
				if (walker) {
					walker.removeAllListeners();
					walker.pause();
					walker = null;
				}
			}

			/**
			 * When we have an empty Directory(eg, newly created cartridge), walking on "file" doesn't work.
			 * So, we walk on "directories" and call function "addEmptyDirectory" to add
			 * EMPTY DIRS to ZIP
			 */
			if (isDirectory) {
				walker.on('directories', function (root, stats, next) {
					stats.forEach(function (stat) {
						const toFile = relative(isCartridge ?
							pathToCartridgesDir.replace(processingFolder, '') :
							pathToCartridgesDir, resolve(root, stat.name));

						observer.next([toFile])
					});
					next();
				});
			} else {
				walker.on('file', (root, fileStat, next) => {
					const file = resolve(root, fileStat.name);
					const toFile = relative(isCartridge ?
						pathToCartridgesDir.replace(new RegExp(processingFolder+'$'), '') :
						pathToCartridgesDir, resolve(root, fileStat.name));

					//this.log('adding to zip:', file);

					observer.next([file, toFile])

					next();
				});
			}

			walker.on('end', () => {
				observer.complete();
			});

			walker.on('nodeError', (__, { error }) => {
				observer.error(error);
				dispose();
			});
			walker.on('directoryError', (__, { error }) => {
				observer.error(error);
				dispose();
			});

			return dispose;
		});
	}
	deleteLocalFile(fileName) : Observable<undefined>{
		return Observable.create(observer => {
			let isCanceled = false;

			rimraf(fileName, () => {
				if (!isCanceled) {
					observer.next();
					observer.complete();
				}
			});
			// setTimeout(() => {
			//         observer.next();
			//         observer.complete();
			// });


			return () => { isCanceled = true }
		});
	}
	zipFiles(pathToCartridgesDir, cartridgesPackagePath, options) : Observable<undefined> {

		return Observable.create(observer => {
			let zipFile = new yazl.ZipFile();
			var inputStream : fs.WriteStream, outputStream : fs.ReadStream;

			zipFile.on('error', (error) => {
				finishWork();
				observer.error(error);
			});

			let subscription : Subscription | null = this.getFileList(pathToCartridgesDir, options).subscribe(
				// next
				files => {
					if (files.length === 1) {
						zipFile.addEmptyDirectory(files[0]);
					} else if (files.length === 2) {
						zipFile.addFile(files[0], files[1]);
					} else {
						observer.error(new Error('Unexpected argument'));
					}
				},
				// error
				err => {
					observer.error(err);
				},
				// complite
				() => {
					zipFile.end();
					inputStream = fs.createWriteStream(cartridgesPackagePath);
					outputStream = zipFile.outputStream;

					zipFile.outputStream
						.pipe(inputStream)
						.once('close', () => { observer.next(); observer.complete() })
						.once('error', err => observer.error(err));
				}
			);

			function finishWork() {
				if (outputStream && inputStream) {
					//inputStream.close();
					outputStream.unpipe(inputStream);
					inputStream.end();
				}
				zipFile = null;
				if (subscription) {
					subscription.unsubscribe();
				}
				subscription = null;
			}

			return finishWork;
		});
	}
	uploadCartridge(
		pathToCartridgesDir,
		notify = (string) => { },
		options = {}
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

