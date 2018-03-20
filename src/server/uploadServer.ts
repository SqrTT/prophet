import { Observable } from 'rxjs';

import { OutputChannel, workspace, window, ProgressLocation, FileSystemWatcher, Uri, Progress, RelativePattern } from 'vscode';
import { default as WebDav, DavOptions } from './WebDav';
import { getDirectories, stat } from '../lib/FileHelper';
import { join, sep, dirname } from 'path';


const CONCURENT_CARTRIDGES_UPLOADS: number = 4;
const CONCURENT_FILE_UPLOADS: number = 5;

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

function fileWatcher(config, cartRoot: string, outputChannel: OutputChannel): Observable<[string, string]> {
	return Observable.create(observer => {
		const watchers: FileSystemWatcher[] = [];
		let cartridges: Promise<string[]>;

		if (config.cartridge && config.cartridge.length) {
			cartridges = Promise.resolve(config.cartridge);
		} else {
			cartridges = getDirectories(cartRoot);
		}

		cartridges.then(cartridges => {
			// Unfortunately workspace.createFileSystemWatcher() does
			// only support single paths and no excludes
			// it is however very CPU friendly compared to fs.watch()
			var excludeGlobPattern = [
				'node_modules' + sep,
				'.git' + sep
			];
			// ... we create an array of watchers
			cartridges.forEach(cartridge => {
				watchers.push(
					workspace.createFileSystemWatcher(new RelativePattern(join(cartRoot, cartridge), '**/*'))
				);
			});

			// manually check for the excludes in the callback
			var callback = method => ((uri: Uri) => {
				if (!excludeGlobPattern.some(pattern => uri.fsPath.includes(pattern))) {
					observer.next([method, uri.fsPath])
				}
			});
			// add the listerners to all watchers
			watchers.forEach(watcher => {
				watcher.onDidChange(callback('upload'));
				watcher.onDidCreate(callback('upload'));
				watcher.onDidDelete(callback('delete'));
			})
		})

		return () => {
			// and dispose them all in the end
			watchers.forEach(watcher => watcher.dispose());
		};
	});
}

const uploadCartridges = (
	webdav: WebDav,
	outputChannel: OutputChannel,
	config: ({ cartridge, ignoreList?: string[] }),
	cartRoot: string,
	ask: (sb: string[], listc: string[]) => Promise<string[]>,
	progress: Progress<{ message?: string }>['report'] | undefined
) => {
	let cartridges: string[] = config.cartridge;
	var count = 0;

	const notify = (...msgs: string[]) => {
		outputChannel.appendLine(msgs.join(' '));
	};

	const toUpload = cartridges.map(cartridge => webdav
		.uploadCartridge(join(cartRoot, cartridge), notify, { isCartridge: true, ignoreList: config.ignoreList }).do(
			(data) => { },
			(error) => { },
			() => {
				count++;
				if (progress) {
					progress({ message: `Uploading cartridges: ${count} of ${cartridges.length}` })
				}
			}
		)
	);

	notify('Cleanup code version...');
	return webdav.cleanUpCodeVersion(notify, ask, config.cartridge)
		.flatMap(() => Observable.merge(...toUpload, CONCURENT_CARTRIDGES_UPLOADS).concat(Observable.of('')));
};

function uploadWithProgress(
	webdav: WebDav,
	outputChannel: OutputChannel,
	config: ({ cartridge, version, cleanOnStart: boolean, ignoreList?: string[]}), 
	rootDir: string,
	ask: (sb: string[], listc: string[]) => Promise<string[]>
) {
	var resolve;
	var progress: Progress<{ message?: string }>['report'] | undefined;
	window.withProgress({
		location: ProgressLocation.Window,
		title: 'Uploading cartridges'
	}, (prg) => { progress = prg.report; return new Promise((res) => { resolve = res; }) });

	return webdav.dirList(rootDir)
		.do(() => {
			outputChannel.appendLine(`Connection validated successfully`);
		}, (err) => {
			outputChannel.appendLine(`Unable validate connection!`);

			if (err instanceof Error) {
				if (err.message === 'Not Found') {
					outputChannel.appendLine(`Please check existence of code version: "${config.version}"`);
				} else if (err.message === 'Unauthorized') {
					outputChannel.appendLine(`Please check your credentials (login, password, etc)`);
				} else {
					outputChannel.appendLine(`Validation error: ${err.message}`);
				}
			}
		}).flatMap(() => {
			return webdav.getActiveCodeVersion();
		}).do((version) => {
			if (version !== webdav.config.version) {
				outputChannel.show();
				outputChannel.appendLine(`\nWarn: Current code version is "${version}" while uploading is processed into "${webdav.config.version}"\n`);
			}
			outputChannel.appendLine(`Current active version is: ${version}`);
		}).flatMap(() => {
			if (config.cleanOnStart) {
				outputChannel.appendLine(`Start uploading cartridges`);
				return uploadCartridges(webdav, outputChannel, config, rootDir, ask, progress);
			} else {
				outputChannel.appendLine(`Upload cartridges on start is disabled via config`);
				return Observable.of('');
			}
		}).do(() => {
			if (config.cleanOnStart) {
				outputChannel.appendLine(`Cartridges uploaded successfully`);
				config.cleanOnStart = false;
			}
			if (resolve) {
				resolve();
				resolve = null;
			}
		}, () => {// error case
			if (resolve) {
				resolve();
				resolve = null;
			}
		},
			() => {
				if (resolve) {
					resolve();
					resolve = null;
				}
			})

}

function uploadAndWatch(
	webdav: WebDav, 
	outputChannel: OutputChannel,
	config: ({ cartridge, version, cleanOnStart: boolean, ignoreList?: string[]}),
	ask: (sb: string[], listc: string[]) => Promise<string[]>,
	rootDir: string
) {
	return uploadWithProgress(webdav, outputChannel, config, rootDir, ask)
		.flatMap(() => {
			outputChannel.appendLine(`Watching files`);
			return fileWatcher(config, rootDir, outputChannel)
				.delay(300)// delay uploading file (allow finish writting for large files)
				.mergeMap(([action, fileName]) => {
					const date = new Date().toTimeString().split(' ').shift();

					const rootDir = dirname(config.cartridge.find(cartridge => fileName.startsWith(cartridge)) || '');

					if (action === 'upload') {
						return Observable.fromPromise(stat(fileName))
							.flatMap(stats => {
								if (stats.isDirectory()) {
									outputChannel.appendLine(`[C ${date}] ${fileName}`);
									return webdav.mkdir(fileName, rootDir);
								} else {
									outputChannel.appendLine(`[U ${date}] ${fileName}`);
									return webdav.post(fileName, rootDir);
								}
							});
					} else if (action === 'delete') {
						outputChannel.appendLine(`[D ${date}] ${fileName}`);
						return webdav.delete(fileName, rootDir);
					} else {
						return Observable.throw(Error('Unknown action'))
					}

				}, CONCURENT_FILE_UPLOADS);
		});
}

export function init(dwConfig: DavOptions, outputChannel: OutputChannel, config: {ignoreList? : string[], cleanOnStart: boolean}, ask: (sb: string[], listc: string[]) => Promise<string[]>) {
	return getWebDavClient(dwConfig, outputChannel, '')
		.flatMap(webdav => {
			let retryCounter = 0;

			return uploadAndWatch(webdav, outputChannel, Object.assign(config, dwConfig), ask, '')
				.retryWhen(function (errors) {
					// retry for some errors, end the stream with an error for others
					return errors.do(function (e) {
						if (e instanceof Error && e.message === 'Unauthorized') {
							throw e;
						} else if (retryCounter < 3) {
							outputChannel.appendLine(`Error: ${e}`);
							outputChannel.appendLine(`Trying to re-upload`);
							retryCounter++;
						} else {
							throw e;
						}
					});
				}).do(() => {
					retryCounter = 0;
				});
		});
}
