'use strict';
import { readdirSync, statSync, lstatSync, readdir, access } from 'fs';
import { join } from 'path';
import { GlobPattern, Uri, CancellationTokenSource, workspace } from 'vscode';
import { Observable } from 'rxjs';

/**
 * Fetches all directories within the given path syncrhonously.
 *
 * Note: Currently only used in the uploadserver
 * @param srcpath The path to look in for directories
 */
export function getDirectoriesSync(srcpath: string): string[] {
	return readdirSync(srcpath).filter(file => statSync(join(srcpath, file)).isDirectory());
}

/**
 * Fetches all directories within the given path.
 * @param srcpath The path to look in for directories
 */
export async function getDirectories(srcpath: string): Promise<string[]> {
	return new Promise<string[]>((resolve, reject) => {
		readdir(srcpath, function (err, result: string[]) {
			if (err) {
				reject(err);
			} else {
				resolve(result.filter(file => lstatSync(join(srcpath, file)).isDirectory()));
			}
		});
	});
}

/**
 * Fetches all files with the given path.
 * @param srcpath The path to look in for files
 */
export async function getFiles(srcpath: string): Promise<string[]> {
	return new Promise<string[]>((resolve, reject) => {
		readdir(srcpath, function (err, result: string[]) {
			if (err) {
				reject(err.message);
			} else {
				resolve(result.filter(file => lstatSync(join(srcpath, file)).isFile()));
			}
		});
	});
}

/**
 * Checks whether or not a file or directory exists.
 * @param location The path to the file/directory to check
 */
export async function pathExists(location: string): Promise<boolean> {
	return new Promise<boolean>(resolve => {
		access(location, error => {
			resolve(!error);
		});
	});
}

export function findFiles(include: GlobPattern, maxResults?: number, errIfNoFound?: boolean) {
	return new Observable<Uri>(observer => {
		const tokenSource = new CancellationTokenSource();
		let isDone = false;

		workspace.findFiles(
			include,
			'{node_modules,.git}',
			maxResults,
			tokenSource.token
		).then(files => {
			isDone = true;
			if (errIfNoFound && !files.length) {
				observer.error(new Error('Unable find files: ' + include));
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