'use strict';
import { readdir, access as nativeAccess, lstat as nativeLStat, Stats, readFile as readFileNative } from 'fs';
import { join, dirname } from 'path';
import { Uri, CancellationTokenSource, workspace, RelativePattern, WorkspaceFolder, window } from 'vscode';
import { Observable, of, empty } from 'rxjs';
import { flatMap, map } from 'rxjs/operators';
import WebDav, { readConfigFile, DavOptions } from '../server/WebDav';
import { checkIfCartridge$ } from './CartridgeHelper';

/**
 * The saved password when not provided via configuration
 */
let savedPassword: string | undefined;

let passwordInputPromise: Promise<DavOptions> | undefined;

async function readDir(src: string) {
	return new Promise<string[]>((resolve, reject) => {
		readdir(src, function (err, result) {
			if (err) {
				reject(err);
			} else {
				resolve(result);
			}
		});
	})
};
/**
 * Fetches all directories within the given path.
 * @param srcpath The path to look in for directories
 */
export async function getDirectories(srcpath: string): Promise<string[]> {
	const files = await readDir(srcpath);

	const filesStats = await Promise.all(files.map(
		file => stat(join(srcpath, file))
	));

	return filesStats.map((fileStat, idx) => fileStat.isDirectory() ? files[idx] : '').filter(Boolean);
}

export async function stat(srcpath: string) {
	return new Promise<Stats>((resolve, reject) => {
		nativeLStat(srcpath, (err, stats: Stats) => {
			if (err) {
				reject(err);
			} else {
				resolve(stats);
			}
		})
	});
}

export async function access(srcpath: string) {
	return new Promise<void>((resolve, reject) => {
		nativeAccess(srcpath, err => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

export async function readFile(srcpath: string) {
	return new Promise<Buffer>((resolve, reject) => {
		readFileNative(srcpath, (err, data) => {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
}

/**
 * Fetches all files with the given path.
 * @param srcpath The path to look in for files
 */
export async function getFiles(srcpath: string): Promise<string[]> {
	const files = await readDir(srcpath);

	const filesStats = await Promise.all(files.map(
		file => stat(join(srcpath, file))
	));

	return filesStats.map((fileStat, idx) => fileStat.isFile() ? files[idx] : '').filter(Boolean);
}

/**
 * Checks whether or not a file or directory exists.
 * @param location The path to the file/directory to check
 */
export async function pathExists(location: string): Promise<boolean> {
	return new Promise<boolean>(resolve => {
		nativeAccess(location, error => {
			resolve(!error);
		});
	});
}

export function findFiles(include: RelativePattern, maxResults?: number, errIfNoFound?: boolean) {
	return new Observable<Uri>(observer => {
		const tokenSource = new CancellationTokenSource();

		workspace.findFiles(
			include,
			new RelativePattern(include.base, '{node_modules,.git}'),
			maxResults,
			tokenSource.token
		).then(files => {
			if (errIfNoFound && !files.length) {
				observer.error(new Error('Unable find files: ' + include.pattern));
			} else {
				files.forEach(file => {
					observer.next(file);
				})
				observer.complete();
			}
		}, err => {
			observer.error(err);
		})

		return () => {
			tokenSource.dispose();
		}
	});
}

export function getCartridgesFolder(workspaceFolder: WorkspaceFolder) {
	return findFiles(new RelativePattern(workspaceFolder, '**/.project'))
		.pipe(flatMap((project) => {
			return checkIfCartridge$(project.fsPath).pipe(
				flatMap(isCartridge => isCartridge ? of(project) : empty()))
		}))
		.pipe(map<Uri, string>(project => dirname(project.fsPath)));
};

let showQuickPickPromise: undefined | Promise<string | undefined>

export function getDWConfig(workspaceFolders?: readonly WorkspaceFolder[]): Promise<DavOptions> {
	if (workspaceFolders) {
		const filesWorkspaceFolders = workspaceFolders.filter(workspaceFolder => workspaceFolder.uri.scheme === 'file');
		const dwConfigFiles = Promise.all(filesWorkspaceFolders.map(
			workspaceFolder => findFiles(new RelativePattern(workspaceFolder, '**/dw.{json,js}'), 1).toPromise()
		));

		return dwConfigFiles.then(configFiles => {
			if (configFiles) {
				configFiles = configFiles.filter(Boolean);
				if (!configFiles.length) {
					return Promise.reject('Unable to find sandbox configuration (dw.{json,js})');
				} else if (configFiles.length === 1) {
					return configFiles[0].fsPath;
				} else {
					if (!showQuickPickPromise) {
						showQuickPickPromise = Promise.resolve(passwordInputPromise)
							.then(() =>
								window.showQuickPick(configFiles.map(config => config.fsPath), { placeHolder: 'Select configuration' })
							);
					}
					return showQuickPickPromise;
				}

			} else {
				return Promise.reject('Unable to find sandbox configuration (dw.{json,js})');
			}
		}).then(getConfig);
	} else {
		return Promise.reject('Workspaces not found');
	}
}

/**
 * Get config for a file path, complete the config via user input when required
 * internal usage only
 * @param filePath
 */
function getConfig(filePath?: string) {
	if (filePath) {
		return readConfigFile(filePath).toPromise().then(config => {
			if (config.password) {
				return config;
			} else if (savedPassword) {
				config.password = savedPassword;
				return config;
			} else {
				if (!passwordInputPromise) {
					passwordInputPromise = new Promise<DavOptions>((resolve, reject) => {
						window.showInputBox({
							password: true,
							placeHolder: `Enter password for ${config.hostname}`
						}).then(pass => {
							if (pass) {
								config.password = pass;
								const webdav = new WebDav(config);
								webdav.getActiveCodeVersion().toPromise().then(() => {
									savedPassword = pass;
									passwordInputPromise = undefined;
									resolve(config);
								}, err => {
									window.showErrorMessage(`${config.username}@${config.hostname} :  ${err}`);
									passwordInputPromise = undefined;
									reject(err);
								});
							} else {
								passwordInputPromise = undefined;
								reject('No password provided');
							}
						}, reject);
					})
				}
				return passwordInputPromise;
			}
		});
	} else {
		return Promise.reject('Please choose configuration first');
	}
};
