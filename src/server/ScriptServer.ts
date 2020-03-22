
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
	LocationLink,
} from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { TextDocument } from 'vscode-languageserver-textdocument';
import classesList from './langServer/reqClassList';
import * as acornLoose from 'acorn-loose';
//import * as acorn from 'acorn';
import * as acornWalk from 'acorn-walk';
import { sep, basename } from 'path';
import { promises } from 'fs';
import { positionAt, getLineOffsets } from './getLineOffsets';
import { parse } from './scriptServer/propertiesParser';

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
	},
	endShow: {
		line: number,
		character: number
	},
	startShow: {
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

interface IPropertyRecord {
	startPosition: {
		line: number,
		character: number,
	},
	endPosition: {
		line: number,
		character: number
	},
	value: string
}
interface IProperty {
	name: string;
	linesCount: number;
	fsPath: string,
	records: Map<string, IPropertyRecord>
}
interface ICartridgeProperties {
	name: string;
	fsPath: string,
	properties: Map<string, IProperty>
}

const cartridges = new Set<ICartridge>();
const templates = new Set<ICartridge>()
const controllers: ICartridgeControllers[] = [];
const cartridgesProperties: ICartridgeProperties[] = []

const zeroRange = Object.freeze({
	start: {
		line: 0,
		character: 0
	},
	end: {
		line: 0,
		character: 0
	}
});

function getAsteriskRequireFiles() {
	var asteriskFiles = new Set<string>();

	cartridges.forEach(cartridge => {
		cartridge.files.forEach(file => {
			asteriskFiles.add('*' + file.path.replace('.js', ''));
		})
	});

	return Array.from(asteriskFiles);
}

function isStartingWithCartridgeName(value: string) {
	const val = value.startsWith('/') ? value.substring(1) : value;
	const [cartridgeName] = val.split('/');

	return Array.from(cartridges).some(controllerCartridge => controllerCartridge.name === cartridgeName);
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

function insertParents(ast: any) {
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
			activeNode?.type === 'Literal' &&
			activeNode?.parent?.type === 'CallExpression' &&
			activeNode.parent?.callee.name === 'require'
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
			activeNode?.type === 'CallExpression' &&
			activeNode.callee.name === 'require' &&
			!activeNode.arguments.length
		) {
			return classesList
				.concat(getAsteriskRequireFiles())
				.concat(getCartridgesRequireFiles())
				.concat(getTildaRequireFiles(cartridgeName))
				.map(api => {
					return {
						label: api,
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
	function (activeNode, offset, cartridgeName) {
		if (
			activeNode?.type === 'CallExpression' &&
			activeNode?.callee?.type === 'MemberExpression' &&
			activeNode?.callee?.object?.name === 'Resource' &&
			['msgf', 'msg'].includes(activeNode?.callee?.property?.name) &&
			!activeNode.arguments.length
		) {
			const messagesList = getMessagesList();
			return Array.from(messagesList.values()).map(message => {
				return {
					label: message.label,
					kind: CompletionItemKind.Field,
					value: message.fullValue,
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
			activeNode?.parent?.callee?.object?.name === 'Resource' &&
			['msgf', 'msg'].includes(activeNode?.parent?.callee?.property?.name) &&
			activeNode?.parent?.arguments.length > 1 &&
			activeNode?.parent?.arguments[1].value &&
			activeNode === activeNode?.parent?.arguments[0]
		) {
			const messagesList = getMessagesList(activeNode.parent.arguments[1].value);
			return Array.from(messagesList.values()).map(message => {
				return {
					label: message.label,
					kind: CompletionItemKind.Field,
					value: message.value,
					range: [activeNode.start + 1, activeNode.end - 1],
					insertTextFormat: InsertTextFormat.PlainText
				}
			})
		};
		return [];
	}
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
				insertParents(ast);
				result.push({
					name: activeNode.arguments[0].value,
					mode: activeNode.callee.property.name,
					start: activeNode.arguments[0].start,
					end: activeNode.arguments[0].end,
					startPosition: positionAt(activeNode.arguments[0].start, content),
					endPosition: positionAt(activeNode.arguments[0].end, content),
					startShow: positionAt(activeNode.parent.start, content),
					endShow: positionAt(activeNode.parent.end, content),
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
								name: basename(fileName, '.js'),
								fsPath: file.fsPath,
								endpoints: endpoints
							})
						}
					}
				}
			} catch (e) {
				console.error('Error parse file: \n' + JSON.stringify(e, null, '    '));
			}
		}
		return cartridgeControllers;
	}));

	controllers.push(...cartridges);

	console.info(`got cartridges controllers list, parse time: ${(Date.now() - startTime) / 1000}]`);
});

connection.onNotification('get.controllers.list', () => {
	const endpoints: any[] = [];
	controllers.forEach(cartridgeControllers => {
		cartridgeControllers.controllers.forEach(controller => {
			controller.endpoints.forEach(endpoint => {
				endpoints.push({
					fsPath: controller.fsPath,
					start: endpoint.start,
					end: endpoint.end,
					mode: endpoint.mode,
					name: controller.name + '-' + endpoint.name,
					cartridgeName: cartridgeControllers.name,
					startPosition: endpoint.startPosition,
					endPosition: endpoint.endPosition,
					endShow: endpoint.endShow,
					startShow: endpoint.startShow
				});
			});
		});
	});

	connection.sendNotification('get.controllers.list.result', { endpoints });
});

connection.onNotification('cartridges.controllers.modification', async ({ action, cartridge, uri }) => {
	const cartridgeController = controllers.find(controller => controller.name === cartridge.name);

	if (cartridgeController) {
		const index = cartridgeController.controllers.findIndex(controller => controller.fsPath === uri);
		if (index > -1) {
			cartridgeController.controllers.splice(index, 1);
		}

		if ('Create' === action || 'Change' === action) {
			try {
				const fileName = URI.parse(uri).fsPath;
				const fileContent = await promises.readFile(fileName, 'utf8');
				if (fileContent) {
					const ast = await acornLoose.parse(fileContent, { ecmaVersion: 5 });
					if (ast) {
						//insertParents(ast);
						const endpoints = getControllerEndpoints(ast, fileContent);
						if (endpoints && endpoints.length) {
							cartridgeController.controllers.push({
								name: basename(fileName, '.js'),
								fsPath: uri,
								endpoints: endpoints
							})
						}
					}
				}
			} catch (e) {
				console.error('Error: \n' + JSON.stringify(e, null, '    '));
			}
		}
	}
	console.info(`controller modified: ${action} : ${uri}`);
});


connection.onNotification('cartridges.properties.modification', async ({ action, cartridge, uri, template }) => {
	const cartridgeProperties = cartridgesProperties.find(controller => controller.name === cartridge.name);

	if (cartridgeProperties) {
		cartridgeProperties.properties.delete(template);

		if ('Create' === action || 'Change' === action) {
			try {
				const fileName = URI.parse(uri).fsPath;
				const fileContent = await promises.readFile(fileName, 'utf8');
				if (fileContent) {
					const records = parse(fileContent);
					const property: IProperty = {
						fsPath: uri,
						name: template,
						linesCount: getLineOffsets(fileContent).length,
						records: new Map()
					};
					records.forEach(record => {
						property.records.set(record.recordName, {
							value: record.value,
							startPosition: positionAt(record.startPos, fileContent),
							endPosition: positionAt(record.endPos, fileContent)
						});
					});
					cartridgeProperties.properties.set(template, property);
				}
			} catch (e) {
				console.error('Error: \n' + JSON.stringify(e, null, '    '));
			}
		}
	}
	console.info(`properties modified: ${action} : ${uri}`);
});

connection.onNotification('cartridges.properties', async ({ list }) => {
	const startTime = Date.now();

	const cartridges = await Promise.all((list as any[]).map(async cartridge => {
		const cartridgeControllers: ICartridgeProperties = {
			name: cartridge.name,
			fsPath: cartridge.fsPath,
			properties: new Map()
		}
		for (const file of cartridge.files) {
			if (!file.name.includes('_')) { // ignore locale specific translations, yet
				try {
					const fileName = URI.parse(file.fsPath).fsPath;
					const fileContent = await promises.readFile(fileName, 'utf8');
					if (fileContent) {
						const records = parse(fileContent);
						const property: IProperty = {
							fsPath: file.fsPath,
							name: file.name,
							linesCount: getLineOffsets(fileContent).length,
							records: new Map()
						};
						records.forEach(record => {
							property.records.set(record.recordName, {
								value: record.value,
								startPosition: positionAt(record.startPos, fileContent),
								endPosition: positionAt(record.endPos, fileContent)
							});
						});
						cartridgeControllers.properties.set(file.name, property);
					}
				} catch (e) {
					console.error('Error parse properties file: \n' + JSON.stringify(e, null, '    '));
				}
			}
		}
		return cartridgeControllers;
	}));

	cartridgesProperties.push(...cartridges);

	console.info(`got cartridges properties list, parse time: ${(Date.now() - startTime) / 1000}]`);
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
	} else if (document.languageId === 'isml' && activeCartridge) {
		const content = document.getText();
		const endSymbol = content.indexOf('}', offset);

		if (endSymbol > -1) {
			const openingSymbol = content.lastIndexOf('${', endSymbol);

			if (openingSymbol > -1) {
				if (endSymbol >= offset && openingSymbol <= offset) {
					const scriptOffset = openingSymbol + 2;
					const scriptContent = content.substring(scriptOffset, endSymbol);

					const completions = await completion(scriptContent, offset - scriptOffset, cancelToken, reqTime, activeCartridge);

					if (!cancelToken.isCancellationRequested && completions?.length) {
						const list: CompletionList = {
							isIncomplete: false,
							items: completions.map(completion => {
								return {
									label: completion.label,
									kind: completion.kind,
									textEdit: TextEdit.replace(
										getReplaceRange(document,
											scriptOffset + completion.range[0],
											scriptOffset + completion.range[1]
										),
										completion.value
									),
									insertTextFormat: completion.insertTextFormat
								};
							})
						};
						return list;
					}
				}

			}
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
						endPosition: endpoint.endPosition,
						endShow: endpoint.endShow,
						startShow: endpoint.startShow
					};
				}
			});
		});
	});
	return endpoints;
}

function getMessagesList(file?: string) {
	const messages = new Map<string, { label: string, fullValue: string; value: string }>();

	cartridgesProperties.forEach(cartridge => {
		cartridge.properties.forEach(propertyFile => {
			if (!file || file === propertyFile.name) {
				Array.from(propertyFile.records.keys()).forEach(name => {
					const key = name + ' [' + propertyFile.name + ']';

					if (!messages.has(key)) {
						messages.set(key, {
							label: key,
							fullValue: `'${name}', '${propertyFile.name}', null`,
							value: name
						});
					}
				});
			}
		});
	});

	return messages;
}

interface IGoTo {
	fsPath: string;
	range: Range;
	showRange: Range;
	originalStart: number;
	originalEnd: number;
}

async function gotoLocation(content: string, offset: number, cancelToken: CancellationToken, reqTime: number, activeCartridge: ICartridge, uri: URI): Promise<IGoTo | undefined> {
	const ast = await acornLoose.parse(content, { ecmaVersion: 5 });
	if (cancelToken.isCancellationRequested) {
		console.log('Canceled definition request');
	}

	if (ast && offset !== undefined) {
		const findNodeAround: Function = acornWalk.findNodeAround;
		const activeNode: any = findNodeAround(ast, offset, () => true)?.node;

		if (!activeNode) {
			return;
		}

		insertParents(ast);

		if (
			activeNode.type === 'Literal' &&
			activeNode.value &&
			activeNode.parent?.type === 'CallExpression' &&
			activeNode.parent?.callee?.name === 'require'
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
					return {
						fsPath: found,
						range: zeroRange,
						showRange: {
							start: {
								line: 0,
								character: 0
							},
							end: {
								line: 9,
								character: 0
							}
						},
						originalEnd: activeNode.end,
						originalStart: activeNode.start
					}
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
					return {
						fsPath: found,
						range: zeroRange,
						showRange: {
							start: {
								line: 0,
								character: 0
							},
							end: {
								line: 9,
								character: 0
							}
						},
						originalEnd: activeNode.end,
						originalStart: activeNode.start
					};
				}
			} else if (activeNode.value.startsWith('dw')) {
				return;
			} else if (isStartingWithCartridgeName(activeNode.value)) {
				const value: string = activeNode.value;
				const val = value.startsWith('/') ? value.substring(1) : value;
				const [cartridgeName, ...other] = val.split('/');
				const filePath = '/' + other.join('/').replace(/\.js$/, '')

				const cartridge = Array.from(cartridges).find(controllerCartridge => controllerCartridge.name === cartridgeName);

				if (cartridge) {
					let found: string | undefined;
					cartridge.files.some(file => {
						if (filePath === file.path.replace('.js', '')) {
							found = file.fsPath;
							return true;
						}
					});

					if (found) {
						return {
							fsPath: found,
							range: zeroRange,
							showRange: {
								start: {
									line: 0,
									character: 0
								},
								end: {
									line: 9,
									character: 0
								}
							},
							originalEnd: activeNode.end,
							originalStart: activeNode.start
						};
					}
				}
			}
		} else if (
			activeNode.type === 'MemberExpression'
			&& activeNode.object?.name === 'module'
			&& activeNode.property?.name === 'superModule'
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
				return {
					fsPath: found,
					range: zeroRange,
					showRange: {
						start: {
							line: 0,
							character: 0
						},
						end: {
							line: 9,
							character: 0
						}
					},
					originalEnd: activeNode.end,
					originalStart: activeNode.start
				};
			}
		} else if (
			activeNode.type === 'Literal' &&
			activeNode.value &&
			activeNode.parent?.type === 'CallExpression' &&
			activeNode.parent?.callee?.type === 'MemberExpression' &&
			activeNode.parent?.callee?.object?.name === 'res' &&
			activeNode.parent?.callee?.property?.name === 'render'
		) {
			const value = activeNode.value.replace('.isml', '').replace(/^\//, '');

			const found = Array.from(getTemplatesList()).find(([template]) => {
				return value === template;
			});
			if (found) {
				return {
					fsPath: found[1],
					range: zeroRange,
					showRange: {
						start: {
							line: 0,
							character: 0
						},
						end: {
							line: 9,
							character: 0
						}
					},
					originalEnd: activeNode.end,
					originalStart: activeNode.start
				};
			}
		} else if (
			activeNode.type === 'Literal' &&
			activeNode.parent?.type === 'CallExpression' &&
			activeNode.parent?.callee.type === 'MemberExpression' &&
			activeNode.parent?.callee.object.name === 'URLUtils' &&
			['url', 'http', 'https', 'abs'].includes(activeNode.parent.callee.property.name)
		) {
			const endpoints = getEndpointsMap();
			const value = activeNode.value;

			const found = endpoints[value];

			if (found) {
				return {
					fsPath: found.fsPath,
					range: {
						start: found.startPosition,
						end: found.endPosition
					},
					showRange: {
						start: found.startShow,
						end: found.endShow
					},
					originalEnd: activeNode.end,
					originalStart: activeNode.start
				};
			}
		} else if (
			activeNode.type === 'Literal' &&
			activeNode.value &&
			activeNode.parent?.type === 'CallExpression' &&
			activeNode.parent?.callee?.type === 'MemberExpression' &&
			activeNode.parent?.callee?.object?.name === 'Resource' &&
			['msg', 'msgf'].includes(activeNode.parent?.callee?.property?.name)
		) {
			const namespace = activeNode.parent?.arguments[1]?.value;
			const key = activeNode.value;

			if (key && namespace) {
				const found = cartridgesProperties.find(cartridgesProperty => {
					return cartridgesProperty.properties.get(namespace)?.records.has(key);
				});

				if (found) {
					const prop = found.properties.get(namespace);
					if (prop) {
						const record = prop.records.get(key);
						if (record) {
							return {
								fsPath: prop.fsPath,
								showRange: {
									start: {
										line: Math.max(record.startPosition.line, 0),
										character: 0
									},
									end: {
										line: Math.min(record.endPosition.line + 1, prop.linesCount),
										character: 0
									}
								},
								range: {
									start: {
										line: Math.max(record.startPosition.line - 1, 0),
										character: 0
									},
									end: {
										line: Math.min(record.endPosition.line + 1, prop.linesCount),
										character: 0
									}
								},
								originalEnd: activeNode.end,
								originalStart: activeNode.start
							};
						}
					}
				}
			}
		}
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
		const content = document.getText();
		const loc = await gotoLocation(document.getText(), offset, cancelToken, reqTime, activeCartridge, uri);

		if (!cancelToken.isCancellationRequested && loc) {

			return [LocationLink.create(
				loc.fsPath,
				loc.range,
				loc.showRange,
				{
					start: positionAt(loc.originalStart, content),
					end: positionAt(loc.originalEnd, content)
				}
			)];
		}
	} else if (document.languageId === 'isml' && activeCartridge) {
		const content = document.getText();
		const endSymbol = content.indexOf('}', offset);

		if (endSymbol > -1) {
			const openingSymbol = content.lastIndexOf('${', endSymbol);

			if (openingSymbol > -1) {
				if (endSymbol >= offset && openingSymbol <= offset) {
					const scriptOffset = openingSymbol + 2;
					const scriptContent = content.substring(scriptOffset, endSymbol);

					const loc = await gotoLocation(scriptContent, offset - scriptOffset, cancelToken, reqTime, activeCartridge, uri);
					if (!cancelToken.isCancellationRequested && loc) {

						return [LocationLink.create(
							loc.fsPath,
							loc.range,
							loc.showRange,
							{
								start: positionAt(loc.originalStart + scriptOffset, content),
								end: positionAt(loc.originalEnd + scriptOffset, content)
							}
						)];
					}
				}

			}
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

