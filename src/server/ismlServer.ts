
import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection,
	TextDocuments, InitializeResult, DocumentLinkParams, DocumentLink, Range, Position,
	Hover,
	WorkspaceFolder,
	TextDocument,
	Files,
	Diagnostic,
	DiagnosticSeverity
} from 'vscode-languageserver';
import { getLanguageService } from './langServer/htmlLanguageService';
let linter: any = null;
import Uri from 'vscode-uri';

import { readFile } from 'fs';
import { EventEmitter } from 'events';

import * as htmlhint from "./langServer/htmlhint";

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

const tagsTypings = {
	a: {
		selfclosing: false,
		attrsRequired: ['href'],
		redundantAttrs: ['alt']
	},
	div: {
		selfclosing: false
	},
	main: {
		selfclosing: false,
		redundantAttrs: ['role']
	},
	nav: {
		selfclosing: false,
		redundantAttrs: ['role']
	},
	script: {
		attrsOptional: [['async', 'async'], ['defer', 'defer']],
		redundantAttrs: ['type']
	},
	img: {
		selfclosing: true,
		attrsRequired: [
			'src', 'alt'
		]
	}
};

const defaultLinterConfig = {
	"tagname-lowercase": true,
	"attr-lowercase": false,
	"attr-value-double-quotes": false,
	"doctype-first": false,
	"max-lenght": false,
	"tag-pair": true,
	"spec-char-escape": false,
	"id-unique": false,
	"src-not-empty": true,
	"attr-no-duplication": true,
	"title-require": false,
	"doctype-html5": true,
	"space-tab-mixed-disabled": "space",
	"inline-style-disabled": false,
	"tag-self-close": true,
	"tags-check": {
		"isslot": {
			"selfclosing": true,
			"attrsRequired": ["id", ["context", "global", "category", "folder"], "description"]
		},
		"iscache": {
			"selfclosing": true,
			"attrsRequired": ["hour|minute", ["type", "relative", "daily"]],
			"attrsOptional": [["varyby", "price_promotion"]]
		},
		"isdecorate": {
			"selfclosing": false,
			"attrsRequired": ["template"]
		},
		"isreplace": {
			"selfclosing": true
		},
		"isinclude": {
			"selfclosing": true,
			"attrsRequired": ["template|url"]
		},
		"iscontent": {
			"selfclosing": true,
			"attrsOptional": [["encoding", "on", "off", "html", "xml", "wml"], ["compact", "true", "false"]],
			"attrsRequired": ["type", "charset"]
		},
		"ismodule": {
			"selfclosing": true,
			"attrsRequired": ["template", "name"]
		},
		"isobject": {
			"selfclosing": false,
			"attrsRequired": ["object", ["view", "none", "searchhit", "recommendation", "setproduct", "detail"]]
		},
		"isset": {
			"selfclosing": true,
			"attrsRequired": ["name", "value", ["scope", "session", "request", "page", "pdict"]]
		},
		"iscomponent": {
			"selfclosing": true,
			"attrsRequired": ["pipeline"]
		},
		"iscontinue": {
			"selfclosing": true
		},
		"isbreak": {
			"selfclosing": true
		},
		"isnext": {
			"selfclosing": true
		},
		"isscript": {
			"selfclosing": false
		},
		"iselse": {
			"selfclosing": true
		},
		"isloop": {
			"selfclosing": false,
			"attrsRequired": ["items|iterator|begin", "alias|var|end"]
		},
		"isif": {
			"selfclosing": false,
			"attrsRequired": ["condition"]
		},
		"iselseif": {
			"selfclosing": true,
			"attrsRequired": ["condition"]
		},
		"isprint": {
			"selfclosing": true,
			"attrsRequired": ["value"],
			"attrsOptional": [["encoding", "on", "off"], ["timezone", "SITE", "INSTANCE", "utc"]]
		},
		"isstatus": {
			"selfclosing": true,
			"attrsRequired": ["value"]
		},
		"isredirect": {
			"selfclosing": true,
			"attrsOptional": [["permanent", "true", "false"]],
			"attrsRequired": ["location"]
		},
		"isinputfield": {
			"selfclosing": true,
			"attrsRequired": ["type", "formfield"]
		}
	}
};

connection.onInitialize((params): InitializeResult => {

	connection.console.log('isml server init...' + JSON.stringify(params.workspaceFolders));

	linter = require('htmlhint').HTMLHint;

	const customRules = [{
		id: 'tags-check',
		description: 'Checks html tags.',
		init: function (parser, reporter, options) {
			var self = this;

			if (typeof options !== 'boolean') {
				Object.assign(tagsTypings, options);
			}

			parser.addListener('tagstart', function (event) {
				var attrs = event.attrs;
				var col = event.col + event.tagName.length + 1;

				const tagName = event.tagName.toLowerCase();

				if (tagsTypings[tagName]) {
					const currentTagType = tagsTypings[tagName];

					if (currentTagType.selfclosing === true && !event.close) {
						reporter.warn(`The <${tagName}> tag must be selfclosing.`, event.line, event.col, self, event.raw);
					} else if (currentTagType.selfclosing === false && event.close) {
						reporter.warn(`The <${tagName}> tag must not be selfclosing.`, event.line, event.col, self, event.raw);
					}

					if (currentTagType.attrsRequired) {
						currentTagType.attrsRequired.forEach(id => {
							if (Array.isArray(id)) {
								const copyOfId = id.map(a => a);
								const realID = copyOfId.shift();
								const values = copyOfId;

								if (attrs.some(attr => attr.name === realID)) {
									attrs.forEach(attr => {
										if (attr.name === realID && !values.includes(attr.value)) {
											reporter.error(`The <${tagName}> tag must have attr '${realID}' with one value of '${values.join('\' or \'')}'.`, event.line, col, self, event.raw);
										}
									});
								} else {
									reporter.error(`The <${tagName}> tag must have attr '${realID}'.`, event.line, col, self, event.raw);
								}
							} else if (!attrs.some(attr => id.split('|').includes(attr.name))) {
								reporter.error(`The <${tagName}> tag must have attr '${id}'.`, event.line, col, self, event.raw);
							}
						});
					}
					if (currentTagType.attrsOptional) {
						currentTagType.attrsOptional.forEach(id => {
							if (Array.isArray(id)) {
								const copyOfId = id.map(a => a);
								const realID = copyOfId.shift();
								const values = copyOfId;

								if (attrs.some(attr => attr.name === realID)) {
									attrs.forEach(attr => {
										if (attr.name === realID && !values.includes(attr.value)) {
											reporter.error(`The <${tagName}> tag must have optional attr '${realID}' with one value of '${values.join('\' or \'')}'.`, event.line, col + attr.index + 1, self, event.raw);
										}
									});
								}
							}
						});
					}

					if (currentTagType.redundantAttrs) {
						currentTagType.redundantAttrs.forEach(attrName => {
							if (attrs.some(attr => attr.name === attrName)) {
								reporter.error(`The attr '${attrName}' is redundant for <${tagName}> and should be ommited.`, event.line, col, self, event.raw);
							}
						});
					}

				}
			});
		}
	}, {
		id: 'attr-no-duplication',
		description: 'Elements cannot have duplicate attributes.',
		init: function (parser, reporter) {
			var self = this;

			parser.addListener('tagstart', function (event) {
				var attrs = event.attrs;
				var attr;
				var attrName;
				var col = event.col + event.tagName.length + 1;

				if (event.tagName.toLowerCase() === 'ismodule') {
					return;
				}

				var mapAttrName = {};

				for (var i = 0, l = attrs.length; i < l; i++) {
					attr = attrs[i];
					attrName = attr.name;
					if (mapAttrName[attrName] === true) {
						reporter.error('Duplicate of attribute name [ ' + attr.name + ' ] was found.',
							event.line, col + attr.index, self, attr.raw);
					}
					mapAttrName[attrName] = true;
				}
			});
		}
	}, {
		id: 'max-lenght',
		description: 'Lines limitation.',
		init(parser, reporter, option) {
			var self = this;

			if (option) {
				const checkLenght = event => {
					if (event.col > option) {
						reporter.error(
							`Line must be at most ${option} characters`,
							event.line - 1,
							event.col,
							self,
							event.raw
						);
					}
				};

				parser.addListener('tagstart', checkLenght);
				parser.addListener('text', checkLenght);
				parser.addListener('cdata', checkLenght);
				parser.addListener('tagend', checkLenght);
				parser.addListener('comment', checkLenght);
			}
		}
	}
	];

	customRules.forEach(rule => linter.addRule(rule));

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
							Uri.file(files.pop()!).toString()
						);
						connection.console.log('fileToOpen opening: ' + JSON.stringify(doc));
						resolve(doc);
					} else {
						selectedFilesEmitter.once('selectedfile', selected => {
							if (selected) {
								let doc = DocumentLink.create(
									documentLink.range,
									Uri.file(selected).toString()
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
function getErrorMessage(err: any, document: TextDocument): string {
	let result: string;
	if (typeof err.message === 'string' || err.message instanceof String) {
		result = <string>err.message;
	} else {
		result = `An unknown error occured while validating file: ${Files.uriToFilePath(document.uri)}`;
	}
	return result;
}

function validateTextDocument(connection: IConnection, document: TextDocument): void {
	try {
		doValidate(connection, document);
	} catch (err) {
		connection.window.showErrorMessage(getErrorMessage(err, document));
	}
}

/**
* Given an htmlhint Error object, approximate the text range highlight
*/
function getRange(error: htmlhint.Error, lines: string[]): any {

	let line = lines[error.line - 1];
	var isWhitespace = false;
	var curr = error.col;
	while (curr < line.length && !isWhitespace) {
		var char = line[curr];
		isWhitespace = (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '<');
		++curr;
	}

	if (isWhitespace) {
		--curr;
	}

	return {
		start: {
			line: error.line - 1, // Html-hint line numbers are 1-based.
			character: error.col - 1
		},
		end: {
			line: error.line - 1,
			character: curr
		}
	};
}

/**
 * Given an htmlhint.Error type return a VS Code server Diagnostic object
 */
function makeDiagnostic(problem: htmlhint.Error, lines: string[]): Diagnostic {

	return {
		severity: DiagnosticSeverity.Error,
		message: problem.message,
		range: getRange(problem, lines),
		code: problem.rule.id
	};
}

function doValidate(connection: IConnection, document: TextDocument): void {
	try {
		let uri = document.uri;
		//let fsPath = Files.uriToFilePath(uri);
		let contents = document.getText();
		let lines = contents.split('\n');

		//let config = {}; //getConfiguration(fsPath);

		let errors: htmlhint.Error[] = linter.verify(contents, defaultLinterConfig);

		let diagnostics: Diagnostic[] = [];
		if (errors.length > 0) {
			errors.forEach(each => {
				diagnostics.push(makeDiagnostic(each, lines));
			});
		}
		connection.sendDiagnostics({ uri, diagnostics });
	} catch (err) {
		let message: string;
		if (typeof err.message === 'string' || err.message instanceof String) {
			message = <string>err.message;
			throw new Error(message);
		}
		throw err;
	}
}

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
