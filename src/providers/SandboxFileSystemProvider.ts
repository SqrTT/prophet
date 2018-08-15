
'use strict';

import { FileSystemError, Event, FileSystemProvider, Uri, FileStat, FileType, EventEmitter, FileChangeEvent, Disposable } from 'vscode';
import * as path from 'path';
import WebDav, { DavOptions } from '../server/WebDav';
import { DOMParser } from 'xmldom';


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

function parseResponse(data: string, statMode: boolean): FileStat[] {
	const xmlResponse = domParser.parseFromString(data);
	const logStatus: FileStat[] = [];

	const responses = xmlResponse.getElementsByTagName('response');
	for (let i = 0, length = responses.length; i < length; i++) {
		const response = responses.item(i);

		const name = getNodeText(response.getElementsByTagName('displayname'));

		if (name) {
			const href = getNodeText(response.getElementsByTagName('href'));
			const lastmodified = getNodeText(response.getElementsByTagName('getlastmodified'));
			const contentlength = getNodeText(response.getElementsByTagName('getcontentlength'));
		} else if (statMode) {
			//const href = getNodeText(response.getElementsByTagName('href'));
			const lastmodified = Date.parse(getNodeText(response.getElementsByTagName('getlastmodified')) || '');
			const creationdate = Date.parse(getNodeText(response.getElementsByTagName('creationdate')) || '');

			const resourcetype = getNodeText(response.getElementsByTagName('resourcetype'));

			return [{
				type: resourcetype ? FileType.Directory : FileType.File,
				mtime: lastmodified,
				ctime: creationdate,
				size: 0
			}];
		}
	}
	return logStatus;
}


export class SandboxFS implements FileSystemProvider {
	private webDav: WebDav;
	constructor(webdavOptions: DavOptions) {
		this.webDav = new WebDav(webdavOptions);
		this.webDav.config.version = '';
	}

	stat(uri: Uri): FileStat | Thenable<FileStat> {
		if (uri.path === '/') {
			return {
				type: FileType.Directory,
				ctime: 0,
				mtime: 0,
				size: 0
			}
		} else if (uri.path.startsWith('/Impex')) {
			this.webDav.folder = 'Impex';

			return this.webDav.dirList(uri.path.substr(6), '.').toPromise().then(result => {
				const resp =  parseResponse(result, true);
				debugger;
				return resp.pop();
			}, err => {debugger});
		} else {
			throw FileSystemError.FileNotFound(uri);
		}
	}

	readDirectory(uri: Uri): [string, FileType][] {
		//const entry = this._lookupAsDirectory(uri, false);
		let result: [string, FileType][] = [];
		// for (const [name, child] of entry.entries) {
		//     result.push([name, child.type]);
		// }

		if (uri.path === '/') {
			result.push(['Impex', FileType.Directory]);
			result.push(['Temp', FileType.Directory]);
			result.push(['Realmdata', FileType.Directory]);
			result.push(['Static', FileType.Directory]);
		} else {
			debugger;
		}
		return result;
	}

	// --- manage file contents

	readFile(uri: Uri): Uint8Array {
		debugger;
		//return this._lookupAsFile(uri, false).data;
	}

	writeFile(uri: Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void {
		// let basename = path.posix.basename(uri.path);
		// let parent = this._lookupParentDirectory(uri);
		// let entry = parent.entries.get(basename);
		// if (entry instanceof Directory) {
		//     throw FileSystemError.FileIsADirectory(uri);
		// }
		// if (!entry && !options.create) {
		//     throw FileSystemError.FileNotFound(uri);
		// }
		// if (entry && options.create && !options.overwrite) {
		//     throw FileSystemError.FileExists(uri);
		// }
		// if (!entry) {
		//     entry = new File(basename);
		//     parent.entries.set(basename, entry);
		//     this._fireSoon({ type: FileChangeType.Created, uri });
		// }
		// entry.mtime = Date.now();
		// entry.size = content.byteLength;
		// entry.data = content;

		// this._fireSoon({ type: FileChangeType.Changed, uri });
	}

	// --- manage files/folders

	rename(oldUri: Uri, newUri: Uri, options: { overwrite: boolean }): void {

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

	delete(uri: Uri): void {
	    // let dirname = uri.with({ path: path.posix.dirname(uri.path) });
	    // let basename = path.posix.basename(uri.path);
	    // let parent = this._lookupAsDirectory(dirname, false);
	    // if (!parent.entries.has(basename)) {
	    //     throw FileSystemError.FileNotFound(uri);
	    // }
	    // parent.entries.delete(basename);
	    // parent.mtime = Date.now();
	    // parent.size -= 1;
	    // this._fireSoon({ type: FileChangeType.Changed, uri: dirname }, { uri, type: FileChangeType.Deleted });
	}

	createDirectory(uri: Uri): void {
		// let basename = path.posix.basename(uri.path);
		// let dirname = uri.with({ path: path.posix.dirname(uri.path) });
		// let parent = this._lookupAsDirectory(dirname, false);

		// let entry = new Directory(basename);
		// parent.entries.set(entry.name, entry);
		// parent.mtime = Date.now();
		// parent.size += 1;
		// this._fireSoon({ type: FileChangeType.Changed, uri: dirname }, { type: FileChangeType.Created, uri });
	}

	// --- lookup

	// private _lookup(uri: Uri, silent: false): Entry;
	// private _lookup(uri: Uri, silent: boolean): Entry | undefined;
	// private _lookup(uri: Uri, silent: boolean): Entry | undefined {
	//     let parts = uri.path.split('/');
	//     let entry: Entry = this.root;
	//     for (const part of parts) {
	//         if (!part) {
	//             continue;
	//         }
	//         let child: Entry | undefined;
	//         if (entry instanceof Directory) {
	//             child = entry.entries.get(part);
	//         }
	//         if (!child) {
	//             if (!silent) {
	//                 throw FileSystemError.FileNotFound(uri);
	//             } else {
	//                 return undefined;
	//             }
	//         }
	//         entry = child;
	//     }
	//     return entry;
	// }

	// private _lookupAsDirectory(uri: Uri, silent: boolean): Directory {
	//     let entry = this._lookup(uri, silent);
	//     if (entry instanceof Directory) {
	//         return entry;
	//     }
	//     throw FileSystemError.FileNotADirectory(uri);
	// }

	// private _lookupAsFile(uri: Uri, silent: boolean): File {
	//     let entry = this._lookup(uri, silent);
	//     if (entry instanceof File) {
	//         return entry;
	//     }
	//     throw FileSystemError.FileIsADirectory(uri);
	// }

	// private _lookupParentDirectory(uri: Uri): Directory {
	//     const dirname = uri.with({ path: path.posix.dirname(uri.path) });
	//     return this._lookupAsDirectory(dirname, false);
	// }

	// --- manage file events

	private _emitter = new EventEmitter<FileChangeEvent[]>();
	// private _bufferedEvents: FileChangeEvent[] = [];
	// private _fireSoonHandle: NodeJS.Timer;

	readonly onDidChangeFile: Event<FileChangeEvent[]> = this._emitter.event;

	watch(resource: Uri, opts): Disposable {
		// ignore, fires for all changes...
		return new Disposable(() => { });
	}

	// private _fireSoon(...events: FileChangeEvent[]): void {
	//     this._bufferedEvents.push(...events);
	//     clearTimeout(this._fireSoonHandle);
	//     this._fireSoonHandle = setTimeout(() => {
	//         this._emitter.fire(this._bufferedEvents);
	//         this._bufferedEvents.length = 0;
	//     }, 5);
	// }
}
