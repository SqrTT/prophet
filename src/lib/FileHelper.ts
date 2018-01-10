'use strict';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Fetches all directories within the given path syncrhonously.
 *
 * Note: Currently only used in the uploadserver
 * @param srcpath The path to look in for directories
 */
export function getDirectoriesSync(srcpath: string): string[] {
	return fs.readdirSync(srcpath).filter(file => fs.statSync(path.join(srcpath, file)).isDirectory());
}

/**
 * Fetches all directories within the given path.
 * @param srcpath The path to look in for directories
 */
export async function getDirectories(srcpath: string): Promise<string[]> {
	return new Promise<string[]>((resolve, reject) => {
		fs.readdir(srcpath, function (err, result: string[]) {
			if (err) {
				reject(err);
			} else {
				resolve(result.filter(file => fs.lstatSync(path.join(srcpath, file)).isDirectory()));
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
		fs.readdir(srcpath, function (err, result: string[]) {
			if (err) {
				reject(err.message);
			} else {
				resolve(result.filter(file => fs.lstatSync(path.join(srcpath, file)).isFile()));
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
		fs.access(location, error => {
			resolve(!error);
		});
	});
}
