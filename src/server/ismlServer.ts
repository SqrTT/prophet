
import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection,
	TextDocuments, InitializeResult, DocumentLinkParams, DocumentLink, Range, Position,
	Hover,
	WorkspaceFolder
} from 'vscode-languageserver';
import { getLanguageService } from './langServer/htmlLanguageService';

import { URI } from 'vscode-uri';

import { readFile } from 'fs';
import { EventEmitter } from 'events';

import { enableLinting, validateTextDocument, onDidChangeConfiguration, disableLinting } from './langServer/services/ismlLinting';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

let selectedFilesEmitter = new EventEmitter();

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let workspaceFolders: WorkspaceFolder[] = [];
const customTagsMap = new Map<string, string>();

interface ISearch {
	resolve: Function,
	reject: Function
}
var searchLastID = 1;
const searchMap = new Map<number, ISearch>();

async function findFiles(workspacePath: string, pattern: string) {
	const currentLastID = ++searchLastID;

	return new Promise<string[]>((resolve, reject) => {
		searchMap.set(currentLastID, {
			resolve,
			reject
		});
		connection.sendNotification('find:files', { workspacePath, pattern, searchID: currentLastID });
	});
}
connection.onNotification('find:filesFound', ({ searchID, result }) => {
	const searchres = searchMap.get(searchID);
	if (searchres) {
		searchres.resolve(result);
		searchMap.delete(searchID);
	}
});

// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
let languageService = getLanguageService();
let userFormatParams;

connection.onInitialized(() => {
	parseFilesForCustomTags(workspaceFolders);
	connection.workspace.onDidChangeWorkspaceFolders((event) => {
		connection.workspace.getWorkspaceFolders().then(_workspaceFolders => {
			workspaceFolders = _workspaceFolders || [];

			workspaceFolders = workspaceFolders.filter(workspaceFolder => workspaceFolder.uri.includes('file:'))

			parseFilesForCustomTags(workspaceFolders);
		});
		connection.console.log('Workspace folder change event received');
	});
});



connection.onInitialize((params): InitializeResult => {

	connection.console.log('isml server init...' + JSON.stringify(params.workspaceFolders));

	if (params.initializationOptions.enableHtmlHint) {
		connection.console.log('htmlhint enabled');
		enableLinting(connection, documents);
	} else {
		disableLinting(connection, documents);
		connection.console.log('htmlhint disabled');
	}


	// The VS Code htmlhint settings have changed. Revalidate all documents.
	connection.onDidChangeConfiguration((args) => {
		onDidChangeConfiguration(connection, documents, args);
	});

	userFormatParams = params.initializationOptions.formatParams;
	workspaceFolders = params.workspaceFolders || [];

	workspaceFolders = workspaceFolders.filter(workspaceFolder => workspaceFolder.uri.includes('file:'))

	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			//hoverProvider: true
			documentLinkProvider: {
				resolveProvider: true
			},
			documentRangeFormattingProvider: true,
			documentHighlightProvider: true,
			hoverProvider: true,
			completionProvider: {
				resolveProvider: false
			},
			documentSymbolProvider: true,
			workspace: {
				workspaceFolders: {
					supported: true,
					changeNotifications: true
				}
			}
		}
	}

});



let lastFileLines: string[] = [];
connection.onDocumentLinks((params: DocumentLinkParams) => {

	//connection.console.log('onDocumentLinks ' + JSON.stringify(params));

	return new Promise((resolve, reject) => {
		let document = documents.get(params.textDocument.uri);

		if (!document) {
			reject(new Error('Unable find document'));
			return;
		}

		const fileLines = document.getText().split('\n');
		const documentLinks: DocumentLink[] = [];
		const customTagsList = Array.from(customTagsMap.keys());

		lastFileLines = fileLines;

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

	});
});

connection.onDocumentLinkResolve(documentLink => {

	return new Promise((resolve, reject) => {
		const fileLines = lastFileLines;
		const customTagsList = Array.from(customTagsMap.keys());

		fileLines.some((fileLine, index) => {
			const customTag = customTagsList.find(customTag => fileLine.includes('<is' + customTag));

			if (documentLink.range.start.line === index && (customTag || fileLine.includes('template="'))) {

				let fileToOpen: string;

				if (customTag) {
					fileToOpen = customTagsMap.get(customTag) || '';
				} else {
					const startPos = fileLine.indexOf('template="') + 10;
					const endPos = fileLine.indexOf('"', startPos);

					fileToOpen = fileLine.substr(startPos, endPos - startPos);
				}


				if (!fileToOpen.endsWith('.isml')) {
					fileToOpen = fileToOpen + '.isml';
				}
				Promise.all(workspaceFolders.map(workspaceFolder => {
					return findFiles(workspaceFolder.uri, '**/templates/**/' + fileToOpen);
				})).then(result => {
					const files = ([] as string[]).concat(...result);

					if (!files || !files.length) {
						connection.console.warn('Not found files to open');
						reject(new Error('No files to open'));
					} else if (files.length === 1) {
						let doc = DocumentLink.create(
							documentLink.range,
							URI.file(files.pop()!).toString()
						);
						connection.console.log('fileToOpen opening: ' + JSON.stringify(doc));
						resolve(doc);
					} else {
						selectedFilesEmitter.once('selectedfile', selected => {
							if (selected) {
								let doc = DocumentLink.create(
									documentLink.range,
									URI.file(selected).toString()
								);
								connection.console.log('fileToOpen opening: ' + JSON.stringify(doc));
								resolve(doc);
							} else {
								resolve();
							}
						});
						connection.sendNotification('isml:selectfiles', { data: files });
					}

				});

				return true;
			} else {
				return false;
			}
		});
	});

});

connection.onNotification('isml:selectedfile', test => {
	selectedFilesEmitter.emit('selectedfile', test);
})

connection.onDocumentRangeFormatting(formatParams => {
	let document = documents.get(formatParams.textDocument.uri);

	if (!document) {
		connection.console.error('123: Unable find document')
		return;
	}


	return languageService.format(document, formatParams.range, Object.assign({}, userFormatParams, formatParams.options), connection);
});

connection.onDocumentHighlight(docParam => {
	let document = documents.get(docParam.textDocument.uri);
	if (!document) {
		connection.console.error('124: Unable find document')
		return;
	}

	return languageService.findDocumentHighlights(
		document,
		docParam.position,
		languageService.parseHTMLDocument(document)
	);
});

connection.onHover(hoverParam => {
	let document = documents.get(hoverParam.textDocument.uri);
	if (!document) {
		connection.console.error('125: Unable find document')
		return;
	}
	return languageService.doHover(
		document,
		hoverParam.position,
		languageService.parseHTMLDocument(document)
	) || <Promise<Hover | undefined>>Promise.resolve(undefined);
});


connection.onCompletion(params => {
	let document = documents.get(params.textDocument.uri);
	if (!document) {
		connection.console.error('125: Unable find document')
		return;
	}
	return languageService.doComplete(
		document,
		params.position,
		languageService.parseHTMLDocument(document)
	);
});

// A text document has changed. Validate the document.
documents.onDidChangeContent((event) => {
	// the contents of a text document has changed
	validateTextDocument(connection, event.document);
});

connection.onDocumentSymbol(params => {
	let document = documents.get(params.textDocument.uri);
	if (!document) {
		connection.console.error('126: Unable find document')
		return;
	}

	return languageService.findDocumentSymbols(document, languageService.parseHTMLDocument(document));
});



// Listen on the connection
connection.listen();

process.once('uncaughtException', err => {
	console.log(err);
	connection.console.error(String(err) + '\n' + err.stack);
	connection.dispose();
	process.exit(-1);
})


function parseFilesForCustomTags(workspaceFolders: WorkspaceFolder[] | null) {
	if (workspaceFolders) {
		customTagsMap.clear();
		connection.console.log('Finding files with custom tags... ');
		workspaceFolders.forEach(workspaceFolder => {
			findFiles(workspaceFolder.uri, '**/*modules*.isml').then(files => {
				connection.console.log('Found files --' + JSON.stringify(files));
				if (files) {
					files.forEach(file => new Promise((resolve, reject) => {
						readFile(file, (err, data) => {
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
				}
			})
		});
	}
}
