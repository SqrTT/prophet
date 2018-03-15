'use strict';
import { readdir, access as nativeAccess, lstat as nativeLStat, Stats } from 'fs';
import { join, dirname } from 'path';
import { Uri, CancellationTokenSource, workspace, RelativePattern, WorkspaceFolder, window } from 'vscode';
import { Observable } from 'rxjs';
import { readConfigFile } from '../server/WebDav';



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
			'{node_modules,.git}',
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

export function getCartridgesFolder(workspaceFolder : WorkspaceFolder) {
	return findFiles(new RelativePattern(workspaceFolder, '**/.project')).map(project => dirname(project.fsPath));
};

export function getDWConfig(workspaceFolders?: WorkspaceFolder[]) {
	if (workspaceFolders) {
		const dwConfigFiles = Promise.all(workspaceFolders.map(
			workspaceFolder => findFiles(new RelativePattern(workspaceFolder, '**/dw.json'), 1).toPromise()
		));
		return dwConfigFiles.then(configFiles => {
			if (configFiles) {
				configFiles =  configFiles.filter(Boolean);
				if (!configFiles.length) {
					return Promise.reject('Unable to find sandbox configuration (dw.json)');
				} else if (configFiles.length === 1) {
					return configFiles[0].fsPath;
				} else {
					return window.showQuickPick(configFiles.map(config => config.fsPath), { placeHolder: 'Select configuration for debugger' });
				}

			} else {
				return Promise.reject('Unable to find sandbox configuration (dw.json)');
			}
		}).then(filepath => {
			if (filepath) {
				return readConfigFile(filepath).toPromise();
			} else {
				return Promise.reject('Please choose configuration first');
			}
		})
	} else {
		return Promise.reject('Workspaces not found');
	}
}