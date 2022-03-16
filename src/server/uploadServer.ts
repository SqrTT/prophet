import { Observable, Subscription, empty, of, from, merge, throwError } from 'rxjs';

import { OutputChannel, workspace, window, ProgressLocation, FileSystemWatcher, Uri, Progress, RelativePattern } from 'vscode';
import { default as WebDav, DavOptions } from './WebDav';
import { getDirectories, stat } from '../lib/FileHelper';
import { join, sep, dirname } from 'path';
import { flatMap, delay, concat, tap, retryWhen } from 'rxjs/operators';


const CONCURRENT_CARTRIDGES_UPLOADS: number = 4;
const CONCURRENT_FILE_UPLOADS: number = 5;

export function getWebDavClient(config: DavOptions, outputChannel: OutputChannel, rootDir: string) {
	return new Observable<WebDav>(observer => {
		const webdav = new WebDav({
			hostname: config.hostname,
			username: config.username,
			password: config.password,
			version: config['code-version'] || config.version,
			root: rootDir,
			enableCertificate: config.enableCertificate,
			p12: config.p12,
			passphrase: config.passphrase
		}, config.debug ?
			(...msgs: string[]) => { outputChannel.appendLine(`${msgs.join(' ')}`); } :
			() => {
				// DO NOTHING
			}
		);
		observer.next(webdav);
	});
}

function fileWatcher(config: { cartridge?: string[] }, cartRoot: string): Observable<['change' | 'delete' | 'create', string]> {
	return new Observable<['change' | 'delete' | 'create', string]>((observer) => {
		const watchers: FileSystemWatcher[] = [];
		let cartridges: Promise<string[]>;

		if (config.cartridge && config.cartridge.length) {
			cartridges = Promise.resolve(config.cartridge);
		} else {
			cartridges = getDirectories(cartRoot);
		}

		cartridges.then(cartridges => {
			// ... we create an array of watchers
			cartridges.forEach(cartridge => {
				watchers.push(
					workspace.createFileSystemWatcher(new RelativePattern(join(cartRoot, cartridge) + sep, '**/*'))
				);
			});

			// manually check for the excludes in the callback
			var callback = (method: 'change' | 'delete' | 'create') => ((uri: Uri) => {
				if (uri.scheme === 'file') {
					observer.next([method, uri.fsPath])
				}
			});
			// add the listeners to all watchers
			watchers.forEach(watcher => {
				watcher.onDidChange(callback('change'));
				watcher.onDidCreate(callback('create'));
				watcher.onDidDelete(callback('delete'));
			})
		})

		return () => {
			// and dispose them all in the end
			watchers.forEach(watcher => watcher.dispose());
		};
	});
}

function cleanPath(rootPath: string, filePath: string) {
	return filePath.replace(rootPath, '');
}

const uploadCartridges = (
	webDav: WebDav,
	outputChannel: OutputChannel,
	config: ({ cartridge?: string[], ignoreList: Array<string> }),
	cartRoot: string,
	ask: (sb: string[], listc: string[]) => Promise<string[]>,
	progress: Progress<{ message?: string, increment?: number }>
) => {
	let cartridges: string[] = config.cartridge || [];
	var count = 0;

	const notify = (...msgs: string[]) => {
		outputChannel.appendLine(msgs.join(' '));
	};

	const toUpload = cartridges.map(cartridge => {
		let retryCounter = 0;
		return webDav.uploadCartridge(join(cartRoot, cartridge), notify, { ignoreList: config.ignoreList })
			.pipe(
				retryWhen(function (errors) {
					// retry for some errors, end the stream with an error for others
					return errors.pipe(
						tap(function (e) {
							if (e instanceof WebDav.WebDavError && e.statusCode === 401) {
								throw e;
							} else if (retryCounter < 3) {
								outputChannel.appendLine(`Error: ${e}`);
								outputChannel.appendLine(`Trying to re-upload cartridge`);
								retryCounter++;
							} else {
								throw e;
							}
						}), delay(2000 * (retryCounter + 1)));
				}),
				tap(
					(data) => { },
					(error) => { outputChannel.appendLine(`Error!?: ${error}`); },
					() => {
						retryCounter = 0;
						count++;
						progress.report({ message: `Uploading cartridges: ${count} of ${cartridges.length}`, increment: 100 / cartridges.length });
					}
				)
			);
	});

	notify('Cleanup code version...');
	return webDav.cleanUpCodeVersion(notify, ask, config.cartridge || [])
		.pipe(
			flatMap(() => merge(...toUpload, CONCURRENT_CARTRIDGES_UPLOADS))
		).pipe(concat(of('')));
};



function uploadWithProgress(
	webdav: WebDav,
	outputChannel: OutputChannel,
	config: ({ cartridge?: string[], version: string, cleanOnStart: boolean, ignoreList: Array<string> }),
	rootDir: string,
	ask: (sb: string[], listc: string[]) => Promise<string[]>
) {

	return webdav.dirList(rootDir).pipe(tap(() => {
		outputChannel.appendLine(`Connection validated successfully`);
	}, (err) => {
		outputChannel.appendLine(`Unable validate connection!`);

		if (err instanceof Error) {
			if (err instanceof WebDav.WebDavError && err.statusCode === 404) {
				outputChannel.appendLine(`Please check existence of code version: "${config.version}"`);
			} else if (err instanceof WebDav.WebDavError && err.statusCode === 401) {
				outputChannel.appendLine(`Please check your credentials (login, password, etc)`);
			} else {
				outputChannel.appendLine(`Validation error: ${err.message}`);
			}
		}
	}))
		.pipe(flatMap(() => {
			return webdav.getActiveCodeVersion();
		}))
		.pipe(tap((version) => {
			if (version !== webdav.config.version) {
				outputChannel.show();
				outputChannel.appendLine(`\nWarn: Current code version is "${version}" while uploading is processed into "${webdav.config.version}"\n`);
			}
			outputChannel.appendLine(`Current active version is: ${version}`);
		})).pipe(flatMap(() => {
			if (config.cleanOnStart) {
				outputChannel.appendLine(`Start uploading cartridges`);
				return new Observable(obs => {
					let subscription: Subscription | undefined;
					let res: Function | undefined;
					window.withProgress({
						location: ProgressLocation.Notification,
						title: 'Uploading cartridges',
						cancellable: true
					}, (progress, token) => {

						return new Promise((resolve, reject) => {
							res = resolve;
							token.onCancellationRequested(() => {
								if (subscription) {
									subscription.unsubscribe();
									obs.next('UPLOAD_UNCOMPLETED');
									obs.complete();
								}
							});
							subscription = uploadCartridges(webdav, outputChannel, config, rootDir, ask, progress)
								.subscribe((val) => {
									resolve();
									obs.next(val);
								}, err => {
									obs.error(err);
									reject(err)
								}, () => {
									resolve();
									obs.complete();
								});
						});
					});

					return () => {
						if (subscription) {
							subscription.unsubscribe();
						}
						if (res) {
							res();
						}
					}
				});
			} else {
				outputChannel.appendLine(`Upload cartridges on start is disabled via config`);
				return of('');
			}
		}))
		.pipe(tap(() => {
			if (config.cleanOnStart) {
				outputChannel.appendLine(`Cartridges uploaded successfully`);
				config.cleanOnStart = false;
			}
		}))
}

function uploadAndWatch(
	webdav: WebDav,
	outputChannel: OutputChannel,
	config: ({ cartridge?: string[], version: string, cleanOnStart: boolean, ignoreList: Array<string> }),
	ask: (sb: string[], listc: string[]) => Promise<string[]>,
	rootDir: string
) {
	const startTime = Date.now();
	return uploadWithProgress(webdav, outputChannel, config, rootDir, ask)
		.pipe(flatMap(() => {
			const diff = (Date.now() - startTime) / 1000; // sec
			const sec = Math.floor(diff % 60);
			const min = Math.floor(diff / 60);

			outputChannel.appendLine(`Upload time: ${min} min ${sec} sec`);
			outputChannel.appendLine(`Watching files`);
			return fileWatcher(config, rootDir)
				.pipe(delay(400))// delay uploading file (allow finish writing for large files)
				.pipe(flatMap(([action, fileName]) => {
					const rootDir = dirname((config.cartridge || []).find(cartridge => fileName.startsWith(cartridge)) || '');

					return from(stat(fileName).catch(err => {
						if (err.code === 'ENOENT') {
							return Promise.resolve();
						}
						return Promise.reject(err);
					})).pipe(flatMap(stats => {
						return of({ action, fileName, stats, rootDir });
					}));

				}))
				.pipe(flatMap(fileData => {
					const date = new Date().toTimeString().split(' ').shift();
					if (fileData.stats && fileData.stats.isDirectory() && fileData.action === 'create') {
						// folder creation is handles in serial manner before gets parallelized

						outputChannel.appendLine(`[C ${date}] ${cleanPath(fileData.rootDir, fileData.fileName)}`);
						let retryCounter = 0;

						return webdav.mkdir(fileData.fileName, fileData.rootDir)
						.pipe(
							retryWhen(function (errors) {
								// retry for some errors, end the stream with an error for others
								return errors.pipe(tap(function (e) {
									if (e instanceof WebDav.WebDavError && e.statusCode === 401) {
										throw e;
									} else if (retryCounter < 3) {
										outputChannel.appendLine(`Error: ${e}`);
										outputChannel.appendLine(`Trying to re-upload file`);
										retryCounter++;
									} else {
										throw e;
									}
								}), delay(2000 * (retryCounter + 1)));
							}),
							tap(() => {
								retryCounter = 0;
							}),
							flatMap(() => {
								return of(fileData)
							})
						);
					} else if (fileData.stats || fileData.action === 'delete') {
						return of(fileData);
					} else {
						if (!fileData.fileName.endsWith('.git')) { // don't bother user by git files
							outputChannel.appendLine(`[! ${date}] ${cleanPath(fileData.rootDir, fileData.fileName)} (removed before uploaded)`);
						}
						return empty();
					}
				}, 1))// make it serial
				.pipe(flatMap(({ action, fileName, stats, rootDir }) => {
					const date = new Date().toTimeString().split(' ').shift();

					if (action === 'change' || action === "create") {
						if (stats && stats.isDirectory()) {
							// skip directory changes handled on prev step
							return empty();
						} else {
							let retryCounter = 0;
							outputChannel.appendLine(`[U ${date}] ${cleanPath(rootDir, fileName)}`);
							return webdav.post(fileName, rootDir)
								.pipe(
									retryWhen(function (errors) {
										// retry for some errors, end the stream with an error for others
										return errors.pipe(tap(function (e) {
											if (e instanceof WebDav.WebDavError && e.statusCode === 401) {
												throw e;
											} else if (retryCounter < 3) {
												outputChannel.appendLine(`Error: ${e}`);
												outputChannel.appendLine(`Trying to re-upload file`);
												retryCounter++;
											} else {
												throw e;
											}
										}), delay(2000 * (retryCounter + 1)));
									})).pipe(tap(() => {
										retryCounter = 0;
									}));
						}
					} else if (action === 'delete') {
						let retryCounter = 0;
						outputChannel.appendLine(`[D ${date}] ${cleanPath(rootDir, fileName)}`);
						return webdav.delete(fileName, rootDir).pipe(retryWhen(function (errors) {
							// retry for some errors, end the stream with an error for others
							return errors.pipe(tap(function (e) {
								if (e instanceof WebDav.WebDavError && e.statusCode === 401) {
									throw e;
								} else if (retryCounter < 3) {
									outputChannel.appendLine(`Error: ${e}`);
									outputChannel.appendLine(`Trying to re-upload file`);
									retryCounter++;
								} else {
									throw e;
								}
							}), delay(2000 * (retryCounter + 1)));
						})).pipe(tap(() => {
							retryCounter = 0;
						}));
					} else {
						return throwError(new Error('Unknown action'))
					}

				}, CONCURRENT_FILE_UPLOADS));
		}));
}

export function init(dwConfig: DavOptions, outputChannel: OutputChannel, config: { cleanOnStart: boolean, ignoreList: Array<string> }, ask: (sb: string[], listc: string[]) => Promise<string[]>) {
	return getWebDavClient(dwConfig, outputChannel, '')
		.pipe(flatMap(webdav => {
			let retryCounter = 0;
			const intConf = Object.assign(config, dwConfig);

			return uploadAndWatch(webdav, outputChannel, intConf, ask, '')
				.pipe(retryWhen(function (errors) {
					// retry for some errors, end the stream with an error for others
					return errors.pipe(tap(function (e) {
						if (e instanceof WebDav.WebDavError && e.statusCode === 401) {
							throw e;
						} else if (retryCounter < 3) {
							intConf.cleanOnStart = true;
							outputChannel.appendLine(`Error: ${e}`);
							outputChannel.appendLine(`Trying to re-upload`);
							retryCounter++;
						} else {
							throw e;
						}
					}), delay(2000 * (retryCounter + 1)));
				})).pipe(tap(() => {
					retryCounter = 0;
				}));
		}));
}
