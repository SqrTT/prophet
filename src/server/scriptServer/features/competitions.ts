import { URI } from "vscode-uri";
import { CompletionItemKind, InsertTextFormat, CancellationToken, CompletionList, TextEdit, Range, IConnection, TextDocuments } from "vscode-languageserver";
import classesList from '../../langServer/reqClassList';
import * as acornLoose from 'acorn-loose';
import * as acornWalk from 'acorn-walk';
import { removeExt, IEndpoint, ICartridge, insertParents } from "../serverUtils";
import { basename } from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getIndexes } from "./indexes";


interface IEndpointsMapEntry {
	fsPath: string,
	start: number,
	end: number,
	mode: IEndpoint['mode'],
	cartridgeName: string,
	startPosition: IEndpoint['startPosition'],
	endPosition: IEndpoint['endPosition'],
	endShow: IEndpoint['endShow'],
	startShow: IEndpoint['startShow']
}

async function getEndpointsMap() {
	const endpoints: ({ [key: string]: IEndpointsMapEntry }) = {};
	(await getIndexes().controllers).forEach(cartridgeControllers => {
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

async function getMessagesList(file?: string) {
	const messages = new Map<string, { label: string, fullValue: string; value: string }>();

	(await getIndexes().properties).forEach(cartridge => {
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

async function getTemplatesList() {
	const list = new Map<string, string>();

	(await getIndexes().templates).forEach(cartridge => {
		cartridge.files.forEach(file => {
			if (!list.has(file.path)) {
				list.set(file.path, file.fsPath);
			}
		});
	});
	return list;
}

async function getAsteriskRequireFiles() {
	var asteriskFiles = new Set<string>();

	(await getIndexes().scriptFiles).forEach(cartridge => {
		cartridge.files.forEach(file => {
			asteriskFiles.add('*' + file.path.replace(/\.(js|json)$/, ''));
		})
	});

	return Array.from(asteriskFiles);
}



async function getCartridgesRequireFiles() {
	var cartridgesFiles = new Set<string>();

	(await getIndexes().scriptFiles).forEach(cartridge => {
		cartridge.files.forEach(file => {
			cartridgesFiles.add(removeExt(cartridge.name));
		})
	});

	return Array.from(cartridgesFiles);
}

async function getTildaRequireFiles(cartridgeName: string) {
	var cartridgesFiles = new Set<string>();

	(await getIndexes().scriptFiles).forEach(cartridge => {
		if (cartridgeName === cartridge.name) {
			cartridge.files.forEach(file => {
				cartridgesFiles.add(`~` + removeExt(file.path));
			})
		}
	});

	return Array.from(cartridgesFiles);
}


interface ICompetitions {
	label: string;
	kind: CompletionItemKind;
	value: string;
	range: [number, number];
	insertTextFormat: 1;
}

const completionsList: ((activeNode: any, offset: number, cartridgeName: string, fsPath: string) => Promise<ICompetitions[]>)[] = [
	async function (activeNode, offset, cartridgeName) {
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
				.concat(showAsterisk ? await getAsteriskRequireFiles() : [])
				.concat(showTildaFiles ? await getTildaRequireFiles(cartridgeName) : [])
				.concat(showCartridge ? await getCartridgesRequireFiles() : [])
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
	async function (activeNode, offset, cartridgeName) {
		if (
			activeNode &&
			activeNode?.type === 'CallExpression' &&
			activeNode.callee.name === 'require' &&
			!activeNode.arguments.length
		) {
			return classesList
				.concat(await getAsteriskRequireFiles())
				.concat(await getCartridgesRequireFiles())
				.concat(await getTildaRequireFiles(cartridgeName))
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
	async function (activeNode, offset, cartridgeName) {
		if (
			activeNode?.type === 'Literal' &&
			activeNode?.parent?.type === 'CallExpression' &&
			activeNode?.parent?.callee?.type === 'MemberExpression' &&
			(
				(activeNode.parent?.callee?.object?.name === 'res' &&
					activeNode.parent?.callee?.property?.name === 'render')
				|| (activeNode.parent?.callee?.object?.name === 'ISML' &&
					activeNode.parent?.callee?.property?.name === 'renderTemplate')
			)
		) {

			return Array.from((await getTemplatesList()).keys()).map(template => {
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
	async function (activeNode, offset, cartridgeName) {
		if (
			activeNode?.type === 'CallExpression' &&
			activeNode?.callee?.type === 'MemberExpression' &&
			(
				(activeNode?.callee?.object?.name === 'res' &&
					activeNode?.callee?.property?.name === 'render')
				|| (activeNode?.callee?.object?.name === 'ISML' &&
					activeNode?.callee?.property?.name === 'renderTemplate')
			) &&
			!activeNode.arguments.length
		) {
			return Array.from((await getTemplatesList()).keys()).map(template => {
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
	async function (activeNode, offset, cartridgeName) {
		if (
			activeNode?.type === 'Literal' &&
			activeNode?.parent?.type === 'CallExpression' &&
			activeNode?.parent?.callee?.type === 'MemberExpression' &&
			activeNode?.parent?.callee?.object?.name === 'URLUtils' &&
			['url', 'http', 'https', 'abs'].includes(activeNode?.parent?.callee?.property?.name)
		) {

			const endpoints = await getEndpointsMap();
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
	async function (activeNode, offset, cartridgeName, fsPath) {
		if (
			activeNode?.type === 'Literal' &&
			activeNode?.parent?.type === 'CallExpression' &&
			activeNode?.parent?.callee?.type === 'MemberExpression' &&
			activeNode?.parent?.callee?.object?.name === 'server' &&
			['append', 'prepend', 'replace'].includes(activeNode?.parent?.callee?.property?.name)
		) {
			const controllerName = removeExt(basename(fsPath));
			if (controllerName) {
				const endpoints = await getEndpointsMap();
				return Object.keys(endpoints)
					.filter(endpointName => endpointName.startsWith(controllerName + '-'))
					.map(endpointName => {
						return {
							label: endpointName.replace(controllerName + '-', ''),
							kind: CompletionItemKind.Value,
							value: endpointName.replace(controllerName + '-', ''),
							range: [activeNode.start + 1, activeNode.end - 1],
							insertTextFormat: InsertTextFormat.PlainText
						}
					})
			}
		};
		return [];
	},
	async function (activeNode, offset, cartridgeName, fsPath) {
		if (
			activeNode?.type === 'CallExpression' &&
			activeNode?.callee?.type === 'MemberExpression' &&
			activeNode?.callee?.object?.name === 'server' &&
			['append', 'prepend', 'replace'].includes(activeNode?.callee?.property?.name) &&
			!activeNode.arguments.length
		) {
			const controllerName = basename(fsPath, '.js');
			if (controllerName) {
				const controllerPrefix = controllerName + '-';
				const endpoints = await getEndpointsMap();
				const reqResNext = ', function (req, res, next) {\nnext();\n}';
				return Object.keys(endpoints)
					.filter(endpointName => endpointName.startsWith(controllerPrefix))
					.map(endpointName => {
						return {
							label: endpointName.replace(controllerPrefix, ''),
							kind: CompletionItemKind.Value,
							value: `'${endpointName.replace(controllerPrefix, '')}'${reqResNext}`,
							range: [offset, offset],
							insertTextFormat: InsertTextFormat.PlainText
						}
					})
			}
		};
		return [];
	},
	async function (activeNode, offset, cartridgeName) {
		if (
			activeNode?.type === 'CallExpression' &&
			activeNode?.callee?.type === 'MemberExpression' &&
			activeNode?.callee?.object?.name === 'URLUtils' &&
			['url', 'http', 'https', 'abs'].includes(activeNode?.callee?.property?.name) &&
			!activeNode.arguments.length
		) {
			const endpoints = await getEndpointsMap();
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
	async function (activeNode, offset, cartridgeName) {
		if (
			activeNode?.type === 'CallExpression' &&
			activeNode?.callee?.type === 'MemberExpression' &&
			activeNode?.callee?.object?.name === 'Resource' &&
			['msgf', 'msg'].includes(activeNode?.callee?.property?.name) &&
			!activeNode.arguments.length
		) {
			const messagesList = await getMessagesList();
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
	async function (activeNode, offset, cartridgeName) {
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
			const messagesList = await getMessagesList(activeNode.parent.arguments[1].value);
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

async function completion(content: string, offset: number, cancelToken: CancellationToken, reqTime: number, activeCartridge: ICartridge, fsPath: string) {
	const ast = await acornLoose.parse(content, { ecmaVersion: 5 });
	if (cancelToken.isCancellationRequested) {
		console.log('Canceled completion request');
		return [];
	}

	if (ast && offset !== undefined) {
		const findNodeAround: Function = acornWalk.findNodeAround;
		const activeNode: any = findNodeAround(ast, offset, () => true)?.node;
		insertParents(ast);

		const completions = await completionsList.reduce(async (accPromise, completionFn) => {
			return accPromise.then(acc => completionFn(activeNode, offset, activeCartridge.name, fsPath).then(res => {
				if (res) {
					return acc.concat(res);
				} else {
					return acc;
				}
			}));
		}, Promise.resolve([] as ICompetitions[]));

		if (cancelToken.isCancellationRequested) {
			console.log('Canceled completion request');
			return [];
		}
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

export function activate(connection: IConnection, documents: TextDocuments<TextDocument>) {
	console.log = connection.console.log.bind(connection.console);
	connection.onCompletion(async (params, cancelToken) => {
		const reqTime = Date.now();

		const document = documents.get(params.textDocument.uri);
		if (!document) {
			connection.console.error('125: Unable find document')
			return;
		}

		const offset = document.offsetAt(params.position);
		const uri = URI.parse(params.textDocument.uri);

		const activeCartridge = Array.from(await getIndexes().scriptFiles).find(cartridge =>
			params.textDocument.uri.startsWith(cartridge.fsPath));

		if (document.languageId === 'javascript' && activeCartridge) {

			const completions = await completion(document.getText(), offset, cancelToken, reqTime, activeCartridge, uri.fsPath);

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

						const completions = await completion(scriptContent, offset - scriptOffset, cancelToken, reqTime, activeCartridge, uri.fsPath);

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
}
