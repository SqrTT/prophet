import { Observable, Subscription, empty, of, from } from 'rxjs';

import { OutputChannel, workspace, window, ProgressLocation, FileSystemWatcher, Uri, Progress, RelativePattern } from 'vscode';
import { default as WebDav, DavOptions } from './WebDav';
import { getDirectories, stat } from '../lib/FileHelper';
import { join, sep, dirname } from 'path';
import { flatMap, delay, merge, concat, tap, retryWhen } from 'rxjs/operators';


const CONCURRENT_CARTRIDGES_UPLOADS: number = 4;
const CONCURRENT_FILE_UPLOADS: number = 5;

export function getWebDavClient(config: DavOptions, outputChannel: OutputChannel, rootDir: string): Observable<WebDav> {
	return Observable.create(observer => {
		const webdav = new WebDav({
			hostname: config.hostname,
			username: config.username,
			password: config.password,
			version: config['code-version'] || config.version,
			root: rootDir
		}, config.debug ?
			(...msgs) => { outputChannel.appendLine(`${msgs.join(' ')}`); } :
			() => {
				// DO NOTHING
			}
		);
		observer.next(webdav);
	});
}

function fileWatcher(config, cartRoot: string): Observable<['change' | 'delete' | 'create', string]> {
	return Observable.create(observer => {
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
				observer.next([method, uri.fsPath])
			});
			// add the listerners to all watchers
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

function cleanPath(rootPath, filePath) {
	return filePath.replace(rootPath, '');
}

const uploadCartridges = (
	webdav: WebDav,
	outputChannel: OutputChannel,
	config: ({ cartridge, ignoreList: Array<string> }),
	cartRoot: string,
	ask: (sb: string[], listc: string[]) => Promise<string[]>,
	progress: Progress<{ message?: string, increment?: number }>
) => {
	let cartridges: string[] = config.cartridge;
	var count = 0;

	const notify = (...msgs: string[]) => {
		outputChannel.appendLine(msgs.join(' '));
	};

	const toUpload = cartridges.map(cartridge => webdav
		.uploadCartridge(join(cartRoot, cartridge), notify, { ignoreList: config.ignoreList }).pipe(tap(
			(data) => { },
			(error) => { },
			() => {
				count++;
				progress.report({ message: `Uploading cartridges: ${count} of ${cartridges.length}`, increment: 100 / cartridges.length });
			}
		))
	);

	notify('Cleanup code version...');
	return webdav.cleanUpCodeVersion(notify, ask, config.cartridge)
		.pipe(
			flatMap(
				() => merge(...toUpload, CONCURRENT_CARTRIDGES_UPLOADS)
			)
		).pipe(concat(of('')));
};



function uploadWithProgress(
	webdav: WebDav,
	outputChannel: OutputChannel,
	config: ({ cartridge, version, cleanOnStart: boolean, ignoreList: Array<string> }),
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
	config: ({ cartridge, version, cleanOnStart: boolean, ignoreList: Array<string> }),
	ask: (sb: string[], listc: string[]) => Promise<string[]>,
	rootDir: string
) {
	return uploadWithProgress(webdav, outputChannel, config, rootDir, ask)
		.pipe(flatMap(() => {
			outputChannel.appendLine(`Watching files`);
			return fileWatcher(config, rootDir)
				.pipe(delay(400))// delay uploading file (allow finish writing for large files)
				.pipe(flatMap(([action, fileName]) => {
					const rootDir = dirname(config.cartridge.find(cartridge => fileName.startsWith(cartridge)) || '');

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

						return webdav.mkdir(fileData.fileName, fileData.rootDir)
							.pipe(flatMap(() => {
								return of(fileData)
							}));
					} else if (fileData.stats) {
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
							outputChannel.appendLine(`[U ${date}] ${cleanPath(rootDir, fileName)}`);
							return webdav.post(fileName, rootDir);
						}
					} else if (action === 'delete') {
						outputChannel.appendLine(`[D ${date}] ${cleanPath(rootDir, fileName)}`);
						return webdav.delete(fileName, rootDir);
					} else {
						return Observable.throw(Error('Unknown action'))
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
					}));
				})).pipe(tap(() => {
					retryCounter = 0;
				}));
		}));
}
