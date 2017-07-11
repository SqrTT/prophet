
import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection,
	TextDocuments, InitializeResult, DocumentLinkParams, DocumentLink, Range, Position
} from 'vscode-languageserver';

import Uri from 'vscode-uri';
import {join} from 'path';

import {readFile} from 'fs';
import * as glob from 'glob';
import {EventEmitter} from 'events';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

let selectedFilesEmitter = new EventEmitter();

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let warnedOnce = new Set<string>();
let customTagPromise : Promise<any>;

const customTagsMap = new Map<string, string>();


// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities. 
let workspaceRoot: string | undefined;
connection.onInitialize((params): InitializeResult => {

	if (params.rootPath) {
		connection.console.log('isml server init..');

		customTagPromise = parseFilesForCustomTags(params.rootPath);

		workspaceRoot = params.rootPath;
		return {
			capabilities: {
					// Tell the client that the server works in FULL text document sync mode
					textDocumentSync: documents.syncKind,
					//hoverProvider: true
					documentLinkProvider: {
						resolveProvider: true
					}
				}
			}
	} else {
		connection.console.log('isml server would not work without project');
		return {
			capabilities: {

			}
		}
	}
});


let lastFilePath = '';
connection.onDocumentLinks((params: DocumentLinkParams) => {

	connection.console.log('onDocumentLinks ' + JSON.stringify(params));

	return customTagPromise.then(() => new Promise((resolve, reject) => {
		const uri = Uri.parse(params.textDocument.uri);

		if (uri.scheme === 'file') {
			readFile(uri.fsPath, (err, data) => {
				lastFilePath = uri.fsPath;
				if (err) {
					reject(err);
				} else {
					const fileLines = data.toString().split('\n');
					const documentLinks : DocumentLink[] = [];
					const customTagsList = Array.from(customTagsMap.keys());

					fileLines.forEach((fileLine, index) => {

						const customTag = customTagsList.find(customTag => fileLine.includes('<is' + customTag))

						if (customTag) {
							const startPos = fileLine.indexOf('<is' + customTag);

							documentLinks.push(DocumentLink.create(
								Range.create(
									Position.create(index, startPos + 1),
									Position.create(index, startPos + customTag.length + 3)
								)
							));
						}

						if (fileLine.includes('template="')) {
							const startPos = fileLine.indexOf('template="') + 10;
							const endPos = fileLine.indexOf('"', startPos);

							if (fileLine[startPos] !== '$') { // ignore variable
								documentLinks.push(DocumentLink.create(
									Range.create(
										Position.create(index, startPos),
										Position.create(index, endPos)
									)
								));
							}

						}
					});
					resolve(documentLinks);
				}
			});
		} else {
			resolve([]);
			const warnMsg = `Unable to handle a "${uri.scheme}" scheme`;
			if (!warnedOnce.has(warnMsg)) {
				connection.console.warn(warnMsg);
				warnedOnce.add(warnMsg);
			}
		}
	}));
});

connection.onDocumentLinkResolve(documentLink => {
	
	return new Promise((resolve, reject) => {
		readFile(lastFilePath, (err, data) => {
			if (err) {
				reject(err);
			} else {
				const fileLines = data.toString().split('\n');
				const customTagsList = Array.from(customTagsMap.keys());

				fileLines.some((fileLine, index) => {
					const customTag = customTagsList.find(customTag => fileLine.includes('<is' + customTag));

					if (documentLink.range.start.line === index && (customTag || fileLine.includes('template="'))) {

						let fileToOpen : string;

						if (customTag) {
							fileToOpen = customTagsMap.get(customTag) || '';
						} else {
							const startPos = fileLine.indexOf('template="') + 10;
							const endPos = fileLine.indexOf('"', startPos);

							fileToOpen = fileLine.substr(startPos, endPos - startPos);
						}

						
						if (!fileToOpen.includes('.isml')) {
							fileToOpen = fileToOpen + '.isml';
						}

						// options is optional
						glob(join('**', 'templates' ,'**', fileToOpen), {
							cwd: workspaceRoot,
							nodir: true,
							follow: false,
							ignore: ['**/node_modules/**', '**/.git/**'],
							cache: true
						}, (er, files) => {
							if (er) {
								connection.console.error('fileToOpen opening ERROR ' + JSON.stringify(er))
								reject(er);
							} else {
								if (!files && !files.length) {
									connection.console.warn('Not found files to open');
									reject(new Error('No files to open'));
								} else if (files.length === 1) {
									let doc = DocumentLink.create(
										documentLink.range,
										Uri.file(join(workspaceRoot + '', files.pop())).toString()
									);
									connection.console.log('fileToOpen opening: ' + JSON.stringify(doc));
									resolve(doc);
								} else {
									selectedFilesEmitter.once('selectedfile', selected => {
										if (selected) {
											let doc = DocumentLink.create(
												documentLink.range,
												Uri.file(join(workspaceRoot + '', selected)).toString()
											);
											connection.console.log('fileToOpen opening: ' + JSON.stringify(doc));
											resolve(doc);
										} else {
											resolve();
										}
									});
									connection.sendNotification('isml:selectfiles', {data: files});
								}
							}
						})
						return true;
					} else {
						return false;
					}
				});
			}
		});
	});

});

connection.onNotification('isml:selectedfile', test => {
	selectedFilesEmitter.emit('selectedfile', test);
})

// Listen on the connection
connection.listen();

process.once('uncaughtException', err => {
	connection.console.error(err);
	connection.dispose();
	process.exit(-1);
})


function parseFilesForCustomTags(rootPath) {
	return new Promise((resolve, reject) => {
		glob(join('**', 'templates' ,'**', '*modules*.isml'), {
			cwd: rootPath,
			nodir: true,
			follow: false,
			ignore: ['**/node_modules/**', '**/.git/**'],
			cache: true
		}, (er, files) => {
			if (er) {
				connection.console.error(er);
				reject(er);
			} else {
				const processedFiles = files.map(file => new Promise((resolve, reject) => {
					readFile(join(rootPath, file), (err, data) => {
						if (err) {
							connection.console.error(err.toString());
							reject(err);
						} else {
							const fileContent = data.toString().replace(/[\s\n\r]/ig, '');

							fileContent.replace(/\<ismodule(.+?)\>/ig, function (str, $1) {
								const name = (/name\=[\'\"](.+?)[\'\"]/ig).exec($1);
								const template = (/template\=[\'\"](.+?)[\'\"]/ig).exec($1);

								if (name && template) {
									customTagsMap.set(name[1], template[1]);
								}
								return '';
							})
							resolve();
						}
					})
				}));
				Promise.all(processedFiles).then(resolve, reject);
			}
		});
	});
}