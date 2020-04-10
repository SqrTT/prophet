
'use strict';

import { FileSystemError, Event, FileSystemProvider, Uri, FileStat, FileType, EventEmitter, FileChangeEvent, Disposable } from 'vscode';
import * as path from 'path';
import WebDav, { DavOptions } from '../server/WebDav';
import { DOMParser } from 'xmldom';


const rootFolders = ['Impex', 'Temp', 'Realmdata', 'Static'];

const domParser = new DOMParser();

function getNodeText(node): string | undefined {
	if (node && node.length && node.item(0).childNodes.length) {
		const value = node.item(0).childNodes['0'].nodeValue;
		if (value) {
			return value;
		} else {
			return undefined;
		}
	} else {
		return undefined;
	}
}

function ab2str(buf: Uint8Array) {
	const dec = new TextDecoder();
	return  dec.decode(buf);
}
function str2ab(str: string) {
	var buf = new ArrayBuffer(str.length); // 2 bytes for each char
	var bufView = new Uint8Array(buf);
	for (var i = 0, strLen = str.length; i < strLen; i++) {
		bufView[i] = str.charCodeAt(i);
	}
	return bufView;
}

function parseStatResponse(data: string): FileStat | undefined {
	const xmlResponse = domParser.parseFromString(data);

	const responses = xmlResponse.getElementsByTagName('response');
	for (let i = 0, length = responses.length; i < length; i++) {
		const response = responses.item(i);

		//const href = getNodeText(response.getElementsByTagName('href'));
		const lastmodified = Date.parse(getNodeText(response.getElementsByTagName('getlastmodified')) || '');
		const creationdate = Date.parse(getNodeText(response.getElementsByTagName('creationdate')) || '');

		const collection = response.getElementsByTagName('collection');

		return {
			type: collection.length ? FileType.Directory : FileType.File,
			mtime: lastmodified,
			ctime: creationdate,
			size: 0
		};
	}
}

function parseDirResponse(data) {
	const xmlResponse = domParser.parseFromString(data);
	const dirList: [string, FileType][] = [];

	const responses = xmlResponse.getElementsByTagName('response');
	for (let i = 1, length = responses.length; i < length; i++) {
		const response = responses.item(i);

		const name = getNodeText(response.getElementsByTagName('displayname'));

		if (name) {
			const collection = response.getElementsByTagName('collection');

			dirList.push([name, collection.length ? FileType.Directory : FileType.File]);
		}
	}
	return dirList;
}

export class SandboxFS implements FileSystemProvider {
	private webDav: Promise<WebDav>;
	constructor(webdavOptions: Promise<DavOptions>) {
		this.webDav = webdavOptions.then(opt => new WebDav(opt)).then(opt => {
			opt.config.version = '';
			return opt;
		});
	}
	static readonly SCHEME = 'ccfs';

	async stat(uri: Uri): Promise<FileStat> {
		if (uri.path === '/') {
			return {
				type: FileType.Directory,
				ctime: 0,
				mtime: 0,
				size: 0
			}
		} else {
			const rootFolder = uri.path.split('/')[1];

			if (rootFolder && rootFolders.includes(rootFolder)) {
				(await this.webDav).folder = rootFolder;
				return (await this.webDav).dirList(uri.path, '/' + rootFolder).toPromise().then(result => {
					const resp = parseStatResponse(result);

					if (resp) {
						return Promise.resolve(resp);
					} else {
						return Promise.reject('15: Unable parse response');
					}
				});
			} else {
				throw FileSystemError.FileNotFound(uri);
			}
		}
	}

	async readDirectory(uri: Uri): Promise<[string, FileType][]> {
		//const entry = this._lookupAsDirectory(uri, false);
		let result: [string, FileType][] = [];

		if (uri.path === '/') {
			rootFolders.forEach(folderName => {
				result.push([folderName, FileType.Directory]);
			});
		} else {
			const rootFolder = uri.path.split('/')[1];

			if (rootFolder && rootFolders.includes(rootFolder)) {
				(await this.webDav).folder = rootFolder;

				return (await this.webDav).dirList(uri.path, '/' + rootFolder).toPromise().then(result => {
					const resp = parseDirResponse(result);

					if (resp) {
						return Promise.resolve(resp);
					} else {
						return Promise.reject('15: Unable parse response');
					}
				});
			} else {
				throw FileSystemError.FileNotFound(uri);
			}
		}


		return result;
	}

	// --- manage file contents

	async readFile(uri: Uri): Promise<Uint8Array> {
		const rootFolder = uri.path.split('/')[1];

		if (rootFolder && rootFolders.includes(rootFolder)) {
			(await this.webDav).folder = rootFolder;

			return (await this.webDav).get(uri.path, '/' + rootFolder).toPromise().then(result => {

				return Promise.resolve(str2ab(result));
			});
		} else {
			throw FileSystemError.FileNotFound(uri);
		}
	}

	async writeFile(uri: Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): Promise<void> {
		const rootFolder = uri.path.split('/')[1];

		if (rootFolder && rootFolders.includes(rootFolder)) {
			(await this.webDav).folder = rootFolder;

			return (await this.webDav).postBody(
				path.relative('/' + rootFolder, uri.path),
				ab2str(content))
				.toPromise().then(() => Promise.resolve());
		} else {
			throw FileSystemError.FileNotFound(uri);
		}
	}

	// --- manage files/folders

	rename(oldUri: Uri, newUri: Uri, options: { overwrite: boolean }): void {
		throw Error('Not implemented');
		// if (!options.overwrite && this._lookup(newUri, true)) {
		//     throw FileSystemError.FileExists(newUri);
		// }

		// let entry = this._lookup(oldUri, false);
		// let oldParent = this._lookupParentDirectory(oldUri);

		// let newParent = this._lookupParentDirectory(newUri);
		// let newName = path.posix.basename(newUri.path);

		// oldParent.entries.delete(entry.name);
		// entry.name = newName;
		// newParent.entries.set(newName, entry);

		// this._fireSoon(
		//     { type: FileChangeType.Deleted, uri: oldUri },
		//     { type: FileChangeType.Created, uri: newUri }
		// );
	}

	async delete(uri: Uri): Promise<void> {
		const rootFolder = uri.path.split('/')[1];

		if (rootFolder && rootFolders.includes(rootFolder)) {
			(await this.webDav).folder = rootFolder;

			return (await this.webDav).delete(uri.path,
				'/' + rootFolder)
				.toPromise().then(() => Promise.resolve());
		} else {
			throw FileSystemError.FileNotFound(uri);
		}
	}

	async createDirectory(uri: Uri): Promise<void> {
		const rootFolder = uri.path.split('/')[1];

		if (rootFolder && rootFolders.includes(rootFolder)) {
			(await this.webDav).folder = rootFolder;

			return (await this.webDav).mkdir(uri.path,
				'/' + rootFolder)
				.toPromise().then(() => Promise.resolve());
		} else {
			throw FileSystemError.FileNotFound(uri);
		}
	}
	// --- manage file events

	private _emitter = new EventEmitter<FileChangeEvent[]>();
	// private _bufferedEvents: FileChangeEvent[] = [];
	// private _fireSoonHandle: NodeJS.Timer;

	readonly onDidChangeFile: Event<FileChangeEvent[]> = this._emitter.event;

	watch(resource: Uri, opts): Disposable {
		// ignore, fires for all changes...
		return new Disposable(() => { });
	}
}
