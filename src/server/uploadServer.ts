import {Observable} from 'rxjs/Observable';
import {EventEmitter} from "events";
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/observable/merge';
import 'rxjs/add/operator/concat';
import 'rxjs/add/operator/retryWhen';


import {Disposable, window, OutputChannel, workspace} from 'vscode';
import WebDav from './WebDav';
import {dirname, join} from 'path';
import {readFile, readdirSync, statSync} from 'fs';
import * as chokidar from 'chokidar';

function tryParse(str: string) {
	try {
		return JSON.parse(str);
	} catch (e) {
		return null;
	}
}

function getDirectories(srcPath) {
	return readdirSync(srcPath).filter(file => statSync(join(srcPath, file)).isDirectory())
};


function fileWatcher(config, cartRoot : string) {
	return Observable.create(observer => {
		const cartridges = config.cartridge || getDirectories(cartRoot);

		const watcher = chokidar.watch(null, {
			ignored: [
				'**/node_modules/**',
				'**/.git/**',
				`**/cartridge/js/**`,
				`**/cartridge/client/**`
			],
			persistent: true,
			ignoreInitial: true,
			followSymlinks: false
		});

		watcher.on('change', path => observer.next(['upload', path]));
		watcher.on('add', path => observer.next(['upload', path]));
		watcher.on('unlink', path => observer.next(['delete', path]));
		watcher.on('error', err => observer.error(err));

		cartridges.forEach(cartridge => {
			if (workspace.rootPath) {
				watcher.add(join(cartRoot, cartridge) + '/**/*.*');
			}
		});

		return () => {
			watcher.close();
		}
	});
}

const uploadCartridges = (webdav : WebDav, outputChannel : OutputChannel, config : any, cartRoot: string) => {

	const cartridges = (config.cartridge && config.cartridge.length) || getDirectories(cartRoot);
	const toUpload = cartridges
		.map(str => str.trim())
		.filter(Boolean)
		.map(cartridge => {
			const notify = (...msgs) => {
				outputChannel.appendLine(msgs.join(' '));
			};
			const dirToUpload = join(cartRoot, cartridge);
			return webdav
				.uploadCartridges(dirToUpload, notify, {isCartridge: true});
		});
	return Observable.merge(...toUpload, 2).concat(Promise.resolve(1));
}


function uploadAndWatch(webdav : WebDav, outputChannel : OutputChannel, config : any, rootDir: string) {
	return Observable.create(observer => {
		const subscription = webdav.dirList(rootDir)
			.do(() => {
				outputChannel.appendLine(`Connection validated successfully`);
			}, (err) => {
				outputChannel.appendLine(`Unable validate connection!`);

				if (err instanceof Error) {
					if (err.message === 'Not Found') {
						outputChannel.appendLine(`Please check existence of code version: "${config.version}"`);
					} else if (err.message === 'Unauthorized') {
						outputChannel.appendLine(`Please check your credentials (login, password, etc)`);
					}else {
						outputChannel.appendLine(`Validation error: ${err.message}`);
					}
				}
			}).flatMap(() => {
				return webdav.getActiveCodeVersion();
			}).do((version) => {
				if (version !== config.version) {
					outputChannel.show();
					outputChannel.appendLine(`\nWarn: Current code version is "${version}" while uploading is processed into "${config.version}"\n`);
				}
				outputChannel.appendLine(`Current active version is: ${version}`);
			}).flatMap(() => {
				outputChannel.appendLine(`Start uploading cartridges`);
				return uploadCartridges(webdav, outputChannel, config, rootDir);
			}).do(() => {
				outputChannel.appendLine(`Cartridges uploaded successfully`);
			}).flatMap(() => {
				outputChannel.appendLine(`Watching files`);
				return fileWatcher(config, rootDir)
					.mergeMap(([action, fileName]) => {
						if (action === 'upload') {
							outputChannel.appendLine(`Uploading file: "${fileName}"`);

							return webdav.post(fileName, rootDir);
						} else if (action === 'delete') {
							outputChannel.appendLine(`Deleting file: "${fileName}"`);

							return webdav.delete(fileName, rootDir);
						} else {
							throw Error('Unknown action');
						}
					}, 5)
			}).subscribe(
				() => {},
				err => {
					outputChannel.appendLine(`"${err}"`);
					observer.error(err);
				},
				() => observer.complete()
			)
		return () => subscription.unsubscribe();
	});
}
export async function init(configFilename: string, uploaderBus: EventEmitter) {
	const outputChannel = window.createOutputChannel('Prophet Uploader');
	let webdav : WebDav;
	let currentOperation;
	outputChannel.append(`Starting...\n`);
	outputChannel.append(`Using config file "${configFilename}"\n`);

	readFile(configFilename, (err, data) => {
		if (err) {
			outputChannel.show();
			outputChannel.append(`Error: ${err}\n`);
		} else {
			const config = tryParse(data.toString());
			var rootDir = dirname(configFilename);

			if (config) {
				if (config.root) {
					rootDir = join(rootDir, config.root);
				}
				outputChannel.append(`Using directory "${rootDir}" as cartridges root\n`);

				webdav = new WebDav({
					hostname: config.hostname,
					username: config.username,
					password: config.password,
					version: config['code-version'] || config.version,
					root: rootDir
					}, config.debug ?
						(...msgs) => {outputChannel.appendLine(`${msgs.join(' ')}`)} :
						() => {}
				);
				var retryCounter = 0;

				var observableUploader = uploadAndWatch(webdav, outputChannel, config, rootDir)
					.retryWhen(function (errors) {
						// retry for some errors, end the stream with an error for others
						return errors.do(function (e) {
							if (e instanceof Error && e.message === 'Unauthorized') {
								throw e;
							} else if (retryCounter < 3) {
								outputChannel.appendLine(`Trying to re-upload`);
								retryCounter++;
							} else {
								throw e;
							}
						});
					})

					uploaderBus.on('start', () => {
						if (currentOperation) {
							currentOperation.unsubscribe();
							outputChannel.appendLine(`Restarting`);
						} else {
							outputChannel.appendLine(`Starting`);
						}
						currentOperation = observableUploader.subscribe(
							() => {
								// reset counter to zero if success
								retryCounter = 0;
							},
							err => {
								outputChannel.show();
								outputChannel.append(`Error: ${err}\n`);
							},
							() => {
								outputChannel.appendLine(`END!`);
							}
						);
					});

					uploaderBus.on('stop', () => {
						if (currentOperation) {
							outputChannel.appendLine(`Stopping`);
							currentOperation.unsubscribe();
							currentOperation = null;
						}
					});

					uploaderBus.emit('start');
			} else {
				outputChannel.show();
				outputChannel.append(`Error: Unable parse cofig\n`);
			}
		}
	});

	return new Disposable(() => {
		outputChannel.dispose();
		if (currentOperation) {
			currentOperation.unsubscribe();
		}
	});
}