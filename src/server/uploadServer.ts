import { Observable } from 'rxjs/Observable';

import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/observable/merge';
import 'rxjs/add/operator/concat';
import 'rxjs/add/operator/retryWhen';


import { OutputChannel, workspace } from 'vscode';
import { default as WebDav, DavOptions } from './WebDav';
import { getDirectoriesSync } from '../lib/FileHelper'
import { dirname, join } from 'path';
import { createReadStream } from 'fs';
import * as chokidar from 'chokidar';


export function readConfigFile(configFilename: string): Observable<DavOptions> {
	return Observable.create(observer => {
		var stream = createReadStream(configFilename);
		let chunks: any[] = [];

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
				observer.next(JSON.parse(Buffer.concat(chunks).toString()));
			} catch (err) {
				observer.error(err);
			}
		});

		return () => {
			chunks = <any>null;
			stream.close()
		}
	});
}

export function getWebDavClient(config: DavOptions, outputChannel: OutputChannel, rootDir: string): Observable<WebDav> {
	return Observable.create(observer => {
		const webdav = new WebDav({
			hostname: config.hostname,
			username: config.username,
			password: config.password,
			version: config['code-version'] || config.version,
			root: rootDir
		}, config.debug ?
				(...msgs) => { outputChannel.appendLine(`${msgs.join(' ')}`) } :
				() => { }
		);
		observer.next(webdav);
	});
}


function fileWatcher(config, cartRoot: string) {
	return Observable.create(observer => {
		var cartridges;
		if (config.cartridge && config.cartridge.length) {
			cartridges = config.cartridge;
		} else {
			cartridges = getDirectoriesSync(cartRoot)
		}

		let watcher = chokidar.watch(null, {
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
			watcher = null;
			cartridges = null;
		}
	});
}

const uploadCartridges = (webdav: WebDav, outputChannel: OutputChannel, config: any, cartRoot: string) => {
	var cartridges;
	if (config.cartridge && config.cartridge.length) {
		cartridges = config.cartridge;
	} else {
		cartridges = getDirectoriesSync(cartRoot)
	}

	const toUpload = cartridges
		.map(str => str.trim())
		.filter(Boolean)
		.map(cartridge => {
			const notify = (...msgs) => {
				outputChannel.appendLine(msgs.join(' '));
			};
			const dirToUpload = join(cartRoot, cartridge);
			return webdav
				.uploadCartridges(dirToUpload, notify, { isCartridge: true });
		});
	return Observable.merge(...toUpload, 3).concat(Promise.resolve(1));
}


function uploadAndWatch(webdav: WebDav, outputChannel: OutputChannel, config: any, rootDir: string) {
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
					const time = new Date();
					if (action === 'upload') {
						outputChannel.appendLine(
							`[U ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}]: "${fileName}"`
						);

						return webdav.post(fileName, rootDir);
					} else if (action === 'delete') {
						outputChannel.appendLine(`[D ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}]: "${fileName}"`);

						return webdav.delete(fileName, rootDir);
					} else {
						throw Error('Unknown action');
					}
				}, 5)
		})
}
export function init(configFilename: string, outputChannel: OutputChannel) {
	let conf;
	return readConfigFile(configFilename).flatMap(config => {
		var rootDir = dirname(configFilename);
		if (config.root) {
			rootDir = join(rootDir, config.root);
		}
		conf = config;
		outputChannel.appendLine(`Using directory "${rootDir}" as cartridges root`);
		return getWebDavClient(config, outputChannel, rootDir);
	}).flatMap(webdav => {
		var retryCounter = 0;
		return uploadAndWatch(webdav, outputChannel, conf, webdav.config.root)
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
			}).do(() => {
				retryCounter = 0;
				conf = null;
			});
	})
}