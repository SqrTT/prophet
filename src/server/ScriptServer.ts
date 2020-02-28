
import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection,
	TextDocuments, InitializeResult,
	WorkspaceFolder,
	TextDocumentSyncKind,
	CompletionList,
	CompletionItemKind,
	InsertTextFormat,
	TextEdit,
	Range,
	CancellationToken,
	Location,
	Definition,
} from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { TextDocument } from 'vscode-languageserver-textdocument';
import classesList from './langServer/reqClassList';
import * as acornLoose from 'acorn-loose';
//import * as acorn from 'acorn';
import * as acornWalk from 'acorn-walk';
import { sep } from 'path';
import { promises } from 'fs';

// Create a connection for the server. The connection uses Node's IPC as a transport
const connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
const console = connection.console;

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents = new TextDocuments(TextDocument);
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);


let workspaceFolders: WorkspaceFolder[] = [];

interface ICartridge {
	name: string;
	fsPath: string;
	files: { path: string, fsPath: string }[]
}
interface IEndpoint {
	name: string,
	mode: 'get' | 'post' | 'append' | 'prepend' | 'use' | 'replace',
	start: number,
	end: number,
	startPosition: {
		line: number,
		character: number
	},
	endPosition: {
		line: number,
		character: number
	}
}
interface IController {
	name: string,
	fsPath: string,
	endpoints: IEndpoint[]
}

interface ICartridgeControllers {
	name: string;
	fsPath: string,
	controllers: IController[]
}

const cartridges = new Set<ICartridge>();
const templates = new Set<ICartridge>()
const controllers = new Array<ICartridgeControllers>();

function getAsteriskRequireFiles() {
	var asteriskFiles = new Set<string>();

	cartridges.forEach(cartridge => {
		cartridge.files.forEach(file => {
			asteriskFiles.add('*' + file.path.replace('.js', ''));
		})
	});

	return Array.from(asteriskFiles);
}
function getLineOffsets(text: string) {
	var lineOffsets: number[] = [];
	var isLineStart = true;
	for (var i = 0; i < text.length; i++) {
		if (isLineStart) {
			lineOffsets.push(i);
			isLineStart = false;
		}
		var ch = text.charAt(i);
		isLineStart = (ch === '\r' || ch === '\n');
		if (ch === '\r' && i + 1 < text.length && text.charAt(i + 1) === '\n') {
			i++;
		}
	}
	if (isLineStart && text.length > 0) {
		lineOffsets.push(text.length);
	}
	return lineOffsets;
};

function positionAt(offset: number, content: string) {
	offset = Math.max(Math.min(offset, content.length), 0);
	var lineOffsets = getLineOffsets(content);
	var low = 0, high = lineOffsets.length;
	if (high === 0) {
		return { line: 0, character: offset };
	}
	while (low < high) {
		var mid = Math.floor((low + high) / 2);
		if (lineOffsets[mid] > offset) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}
	// low is the least x for which the line offset is larger than the current offset
	// or array.length if no line offset is larger than the current offset
	var line = low - 1;
	return {
		line: line, character: offset - lineOffsets[line]
	};
}

function getCartridgesRequireFiles() {
	var cartridgesFiles = new Set<string>();

	cartridges.forEach(cartridge => {
		cartridge.files.forEach(file => {
			cartridgesFiles.add(cartridge.name + file.path.replace('.js', ''));
		})
	});

	return Array.from(cartridgesFiles);
}

function getTildaRequireFiles(cartridgeName: string) {
	var cartridgesFiles = new Set<string>();

	cartridges.forEach(cartridge => {
		if (cartridgeName === cartridge.name) {
			cartridge.files.forEach(file => {
				cartridgesFiles.add(`~` + file.path.replace('.js', ''));
			})
		}
	});

	return Array.from(cartridgesFiles);
}

function getTemplatesList() {
	const list = new Map<string, string>();

	templates.forEach(cartridge => {
		cartridge.files.forEach(file => {
			if (!list.has(file.path)) {
				list.set(file.path, file.fsPath);
			}
		});
	});
	return list;
}

connection.onInitialized(() => {

	connection.workspace.onDidChangeWorkspaceFolders((event) => {
		connection.workspace.getWorkspaceFolders().then(_workspaceFolders => {
			workspaceFolders = _workspaceFolders || [];

			workspaceFolders = workspaceFolders.filter(workspaceFolder => workspaceFolder.uri.includes('file:'))


		});
		connection.console.log('Workspace folder change event received');
	});
});



connection.onInitialize((params): InitializeResult => {

	connection.console.log('Script Server init...' + JSON.stringify(params.workspaceFolders));

	// The VS Code htmlhint settings have changed. Revalidate all documents.
	// connection.onDidChangeConfiguration((args) => {
	// 	onDidChangeConfiguration(connection, documents, args);
	// });


	workspaceFolders = params.workspaceFolders || [];

	workspaceFolders = workspaceFolders.filter(workspaceFolder => workspaceFolder.uri.includes('file:'))

	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: TextDocumentSyncKind.Full,
			//hoverProvider: true
			//documentLinkProvider: {
			//	resolveProvider: true
			//},
			//documentRangeFormattingProvider: true,
			//documentHighlightProvider: true,
			//hoverProvider: true,
			definitionProvider: true,
			completionProvider: {
				resolveProvider: false
			},
			//documentSymbolProvider: true,
			workspace: {
				workspaceFolders: {
					supported: true,
					changeNotifications: true
				}
			}
		}
	}

});

function insertParents(ast) {
	(function walk(node, parent) {
		node.parent = parent;

		Object.keys(node).forEach(function (key) {
			if (key === 'parent') return;

			var child = node[key];
			if (Array.isArray(child)) {
				child.forEach(function (c) {
					if (c && typeof c.type === 'string') {
						walk(c, node);
					}
				});
			} else if (child && typeof child.type === 'string') {
				walk(child, node);
			}
		});
	})(ast, undefined);
}
interface ICompetitions {
	label: string;
	kind: CompletionItemKind;
	value: string;
	range: [number, number];
	insertTextFormat: 1;
}

const completionsList: ((activeNode: any, offset: number, cartridgeName: string) => ICompetitions[])[] = [
	function (activeNode, offset, cartridgeName) {
		if (
			activeNode &&
			activeNode.type === 'Literal' &&
			activeNode.parent &&
			activeNode.parent.type === 'CallExpression' &&
			activeNode.parent.callee.name === 'require'
		) {
			const showAsterisk = !activeNode.value || (activeNode.value[0] !== '.' && activeNode.value[0] !== '~');
			const showCartridge = !activeNode.value || (activeNode.value[0] !== '*' && activeNode.value[0] !== '.' && activeNode.value[0] !== '~');
			const showTildaFiles = !activeNode.value || (activeNode.value[0] !== '*' && activeNode.value[0] !== '.');;

			return classesList
				.concat(showAsterisk ? getAsteriskRequireFiles() : [])
				.concat(showTildaFiles ? getTildaRequireFiles(cartridgeName) : [])
				.concat(showCartridge ? getCartridgesRequireFiles() : [])
				.map(api => {
					return {
						label: api,
						kind: CompletionItemKind.Value,
						value: api,
						range: [activeNode.start + 1, activeNode.end - 1],
						insertTextFormat: InsertTextFormat.PlainText
					}
				})
		};
		return [];
	},
	function (activeNode, offset, cartridgeName) {
		if (
			activeNode &&
			activeNode.type === 'CallExpression' &&
			activeNode.callee.name === 'require' &&
			!activeNode.arguments.length
		) {
			return classesList
				.concat(getAsteriskRequireFiles())
				.concat(getCartridgesRequireFiles())
				.concat(getTildaRequireFiles(cartridgeName))
				.map(api => {
					return {
						label: `'${api}'`,
						kind: CompletionItemKind.Value,
						value: `'${api}'`,
						range: [offset, offset],
						insertTextFormat: InsertTextFormat.PlainText
					}
				})
		};
		return [];
	},
	function (activeNode, offset, cartridgeName) {
		if (
			activeNode?.type === 'Literal' &&
			activeNode?.parent?.type === 'CallExpression' &&
			activeNode?.parent?.callee?.type === 'MemberExpression' &&
			activeNode?.parent?.callee?.object?.name === 'res' &&
			activeNode?.parent?.callee?.property?.name === 'render'
		) {

			return Array.from(getTemplatesList().keys()).map(template => {
				return {
					label: template,
					kind: CompletionItemKind.Value,
					value: template,
					range: [activeNode.start + 1, activeNode.end - 1],
					insertTextFormat: InsertTextFormat.PlainText
				}
			})
		};
		return [];
	},
	function (activeNode, offset, cartridgeName) {
		if (
			activeNode?.type === 'CallExpression' &&
			activeNode?.callee?.type === 'MemberExpression' &&
			activeNode?.callee?.object.name === 'res' &&
			activeNode?.callee?.property?.name === 'render' &&
			!activeNode.arguments.length
		) {
			return Array.from(getTemplatesList().keys()).map(template => {
				return {
					label: `${template}`,
					kind: CompletionItemKind.Value,
					value: `'${template}'`,
					range: [offset, offset],
					insertTextFormat: InsertTextFormat.PlainText
				}
			})
		};
		return [];
	},
	function (activeNode, offset, cartridgeName) {
		if (
			activeNode?.type === 'Literal' &&
			activeNode?.parent?.type === 'CallExpression' &&
			activeNode?.parent?.callee?.type === 'MemberExpression' &&
			activeNode?.parent?.callee?.object?.name === 'URLUtils' &&
			['url', 'http', 'https', 'abs'].includes(activeNode?.parent?.callee?.property?.name)
		) {

			const endpoints = getEndpointsMap();
			return Object.keys(endpoints).map(endpointName => {
				return {
					label: endpointName,
					kind: CompletionItemKind.Value,
					value: endpointName,
					range: [activeNode.start + 1, activeNode.end - 1],
					insertTextFormat: InsertTextFormat.PlainText
				}
			})
		};
		return [];
	},
	function (activeNode, offset, cartridgeName) {
		if (
			activeNode?.type === 'CallExpression' &&
			activeNode?.callee?.type === 'MemberExpression' &&
			activeNode?.callee?.object?.name === 'URLUtils' &&
			['url', 'http', 'https', 'abs'].includes(activeNode?.callee?.property?.name) &&
			!activeNode.arguments.length
		) {
			const endpoints = getEndpointsMap();
			return Object.keys(endpoints).map(endpointName => {
				return {
					label: `${endpointName}`,
					kind: CompletionItemKind.Value,
					value: `'${endpointName}'`,
					range: [offset, offset],
					insertTextFormat: InsertTextFormat.PlainText
				}
			})
		};
		return [];
	},
]

async function completion(content: string, offset: number, cancelToken: CancellationToken, reqTime: number, activeCartridge: ICartridge) {
	const ast = await acornLoose.parse(content, { ecmaVersion: 5 });
	if (cancelToken.isCancellationRequested) {
		console.log('Canceled completion request');
	}

	if (ast && offset !== undefined) {
		const findNodeAround: Function = acornWalk.findNodeAround;
		const activeNode: any = findNodeAround(ast, offset, () => true)?.node;
		insertParents(ast);

		const completions = completionsList.reduce((acc, completionFn) => {
			const res = completionFn(activeNode, offset, activeCartridge.name)
			if (res) {
				return acc.concat(res);
			} else {
				return acc;
			}
		}, [] as ICompetitions[]);

		if (completions.length) {
			console.log(`${completions.length} completion: ${Date.now() - reqTime}ms `);
			return completions;
		}
	}
	console.log(`no completion: ${Date.now() - reqTime}ms `);
	return [];
}

function getReplaceRange(document: TextDocument, replaceStart: number, replaceEnd: number): Range {
	return {
		start: document.positionAt(replaceStart),
		end: document.positionAt(replaceEnd)
	};
}

connection.onNotification('cartridges.files', ({ list }) => {

	list?.forEach(cartridge => {
		cartridges.add(cartridge);
	});
	console.info('got cartridges files list');
	// console.info('cartridges files list: ' + JSON.stringify(list, undefined, '  '));
});

connection.onNotification('cartridges.templates', ({ list }) => {

	list?.forEach(cartridge => {
		templates.add(cartridge);
	});
	console.info('got cartridges templates list');
	// console.info('cartridges files list: ' + JSON.stringify(list, undefined, '  '));
});



function getControllerEndpoints(ast, content: string) {
	const result: IEndpoint[] = [];
	acornWalk.simple(ast, {
		CallExpression: (node, state) => {
			const activeNode: any = node;
			if (
				activeNode?.type === 'CallExpression' &&
				activeNode?.arguments.length &&
				activeNode?.callee?.type === 'MemberExpression' &&
				activeNode?.callee?.object.name === 'server' &&
				['get', 'post', 'append', 'prepend', 'use', 'replace'].includes(activeNode?.callee?.property?.name)
			) {
				result.push({
					name: activeNode.arguments[0].value,
					mode: activeNode.callee.property.name,
					start: activeNode.arguments[0].start,
					end: activeNode.arguments[0].end,
					startPosition: positionAt(activeNode.arguments[0].start, content),
					endPosition: positionAt(activeNode.arguments[0].end, content),
				});
			};
		}
	});

	return result;
}

connection.onNotification('cartridges.controllers', async ({ list }) => {
	const startTime = Date.now();

	const cartridges = await Promise.all((list as any[]).map(async cartridge => {
		const cartridgeControllers: ICartridgeControllers = {
			name: cartridge.name,
			fsPath: cartridge.fsPath,
			controllers: []
		}
		for (const file of cartridge.files) {
			try {
				const fileName = URI.parse(file.fsPath).fsPath;
				const fileContent = await promises.readFile(fileName, 'utf8');
				if (fileContent) {
					const ast = await acornLoose.parse(fileContent, { ecmaVersion: 5 });
					if (ast) {
						//insertParents(ast);
						const endpoints = getControllerEndpoints(ast, fileContent);
						if (endpoints && endpoints.length) {
							cartridgeControllers.controllers.push({
								name: file.path.replace('.js', '').replace('controllers/', ''),
								fsPath: file.fsPath,
								endpoints: endpoints
							})
						}
					}
				}
			} catch (e) {
				console.error('Error: \n' + JSON.stringify(e, null, '    '));
			}
		}
		return cartridgeControllers;
	}));

	cartridges.forEach(cartridgeControllers => {
		controllers.push(cartridgeControllers);
	});

	console.info(`got cartridges controllers list, parse time: ${(Date.now() - startTime) / 1000}]`);
});

connection.onNotification('get.controllers.list', () => {
	const endpoints = getEndpointsMap();
	connection.sendNotification('get.controllers.list.result', endpoints);
});

connection.onCompletion(async (params, cancelToken) => {
	const reqTime = Date.now();

	const document = documents.get(params.textDocument.uri);
	if (!document) {
		connection.console.error('125: Unable find document')
		return;
	}
	const offset = document.offsetAt(params.position);
	const uri = URI.parse(params.textDocument.uri);

	const activeCartridge = Array.from(cartridges).find(cartridge =>
		uri.fsPath.startsWith(uri.fsPath));

	if (document.languageId === 'javascript' && activeCartridge) {

		const completions = await completion(document.getText(), offset, cancelToken, reqTime, activeCartridge);

		if (!cancelToken.isCancellationRequested && completions?.length) {

			const list: CompletionList = {
				isIncomplete: false,
				items: completions.map(completion => {
					return {
						label: completion.label,
						kind: completion.kind,
						textEdit: TextEdit.replace(
							getReplaceRange(document, completion.range[0], completion.range[1]),
							completion.value
						),
						insertTextFormat: completion.insertTextFormat
					};
				})
			};
			return list;
		}
	}
});

function getEndpointsMap() {
	const endpoints = {};
	controllers.forEach(cartridgeControllers => {
		cartridgeControllers.controllers.forEach(controller => {
			controller.endpoints.forEach(endpoint => {
				const endpointName = controller.name + '-' + endpoint.name;
				if (!endpoints[endpointName]) {
					endpoints[endpointName] = {
						fsPath: controller.fsPath,
						start: endpoint.start,
						end: endpoint.end,
						mode: endpoint.mode,
						cartridgeName: cartridgeControllers.name,
						startPosition: endpoint.startPosition,
						endPosition: endpoint.endPosition
					};
				}
			});
		});
	});
	return endpoints;
}

async function definition(content: string, offset: number, cancelToken: CancellationToken, reqTime: number, activeCartridge: ICartridge, uri: URI): Promise<Definition | undefined> {
	const ast = await acornLoose.parse(content, { ecmaVersion: 5 });
	if (cancelToken.isCancellationRequested) {
		console.log('Canceled definition request');
	}

	if (ast && offset !== undefined) {
		const findNodeAround: Function = acornWalk.findNodeAround;
		const activeNode: any = findNodeAround(ast, offset, () => true)?.node;
		insertParents(ast);

		if (
			activeNode?.type === 'Literal' &&
			activeNode?.parent?.type === 'CallExpression' &&
			activeNode?.parent?.callee?.name === 'require' &&
			activeNode?.value
		) {
			if (activeNode.value.startsWith('*')) {
				var found = '';
				const value = activeNode.value.replace('.js', '').replace('*', '');

				Array.from(cartridges).some(cartridge => {
					return cartridge.files.some(file => {
						if (value === file.path.replace('.js', '')) {
							found = file.fsPath;
							return true;
						}
					});
				});
				if (found) {
					return Location.create(found, {
						start: { character: 0, line: 0 },
						end: { character: 0, line: 0 }
					});
				}
			} else if (activeNode.value.startsWith('~')) {
				var found = '';
				const value = activeNode.value.replace('.js', '').replace('~', '')

				activeCartridge.files.some(file => {
					if (value === file.path.replace('.js', '')) {
						found = file.fsPath;
						return true;
					}
				});

				if (found) {
					return Location.create(found, {
						start: { character: 0, line: 0 },
						end: { character: 0, line: 0 }
					});
				}
			} else if (activeNode.value.startsWith('dw')) {
				return;
			}
		} else if (
			activeNode?.type === 'MemberExpression'
			&& activeNode?.object?.name === 'module'
			&& activeNode?.property?.name === 'superModule'
		) {
			var found = '';

			let isBellow = false;
			const cartridgesBellow = Array.from(cartridges).filter(cartridge => {
				if (activeCartridge.name === cartridge.name) {
					isBellow = true;
					return false;
				}
				return isBellow;
			});

			const value = uri.path.split(sep).join('/').replace('.js', '');
			cartridgesBellow.some(cartridge => {
				return cartridge.files.some(file => {
					if (value.endsWith(file.path.replace('.js', ''))) {
						found = file.fsPath;
						return true;
					}
				});
			});
			if (found) {
				return Location.create(found, {
					start: { character: 0, line: 0 },
					end: { character: 0, line: 0 }
				});
			}
		} else if (
			activeNode.type === 'Literal' &&
			activeNode?.parent?.type === 'CallExpression' &&
			activeNode?.parent?.callee?.type === 'MemberExpression' &&
			activeNode?.parent?.callee?.object?.name === 'res' &&
			activeNode?.parent?.callee?.property?.name === 'render' &&
			activeNode?.value
		) {
			const value = activeNode.value.replace('.isml', '').replace(/^\//, '');

			const found = Array.from(getTemplatesList()).find(([template]) => {
				return value === template;
			});
			if (found) {
				return Location.create(found[1], {
					start: { character: 0, line: 0 },
					end: { character: 0, line: 0 }
				});
			}
		} else if (
			activeNode.type === 'Literal' &&
			activeNode.parent.type === 'CallExpression' &&
			activeNode.parent.callee.type === 'MemberExpression' &&
			activeNode.parent.callee.object.name === 'URLUtils' &&
			['url', 'http', 'https', 'abs'].includes(activeNode.parent.callee.property.name)
		) {
			const endpoints = getEndpointsMap();
			const value = activeNode.value;

			const found = endpoints[value];

			if (found) {
				return Location.create(found.fsPath, {
					start: found.startPosition,
					end: found.endPosition
				});
			}

		};
	}
	console.log(`no definition: ${Date.now() - reqTime}ms `);
}



connection.onDefinition(async (params, cancelToken) => {
	const reqTime = Date.now();
	console.info('req definition:' + params.textDocument.uri);

	const document = documents.get(params.textDocument.uri);
	if (!document) {
		connection.console.error('125: Unable find document')
		return undefined;
	}
	const offset = document.offsetAt(params.position);
	const uri = URI.parse(params.textDocument.uri);

	const activeCartridge = Array.from(cartridges).find(cartridge =>
		params.textDocument.uri.startsWith(cartridge.fsPath));

	if (document.languageId === 'javascript' && activeCartridge) {
		const loc = await definition(document.getText(), offset, cancelToken, reqTime, activeCartridge, uri);

		if (!cancelToken.isCancellationRequested && loc) {

			return loc;
		}
	}
	return null;
});
// A text document has changed. Validate the document.
documents.onDidChangeContent((event) => {
	// the contents of a text document has changed
	//validateTextDocument(connection, event.document);
});


// Listen on the connection
connection.listen();

process.once('uncaughtException', err => {
	console.error(String(err) + '\n' + err.stack);
	connection.dispose();
	process.exit(-1);
})

