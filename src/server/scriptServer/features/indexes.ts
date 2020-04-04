import { ICartridge, ICartridgeControllers, removeExt, ICartridgeProperties, IProperty, insertParents, IEndpoint } from "../serverUtils";
import { URI } from "vscode-uri";
import { promises } from "fs";
import { basename } from "path";
import { getLineOffsets, positionAt } from "../../getLineOffsets";
import { IConnection } from "vscode-languageserver";
import * as acornLoose from 'acorn-loose';
import * as acornWalk from 'acorn-walk';
import { parse } from "../propertiesParser";


let resolveConnection: (connection: IConnection) => void | undefined;
const connectionPromise = new Promise<IConnection>(resolve => {
	resolveConnection = resolve;
});

function getControllerEndpoints(ast, content: string) {
	const result: IEndpoint[] = [];
	acornWalk.simple(ast, {
		AssignmentExpression: (node) => {
			const activeNode: any = node;

			if (
				activeNode &&
				activeNode.type === 'AssignmentExpression' &&
				activeNode?.left?.type === 'MemberExpression' &&
				activeNode?.right?.type === 'CallExpression' &&
				activeNode?.right?.callee?.type === 'MemberExpression' &&
				activeNode?.right?.callee?.object?.name === 'guard' &&
				activeNode?.right?.callee?.property?.name === 'ensure' &&
				activeNode?.right?.arguments[0]?.type === 'ArrayExpression' &&
				activeNode?.right?.arguments[0]?.elements
			) {
				const elements = activeNode.right.arguments[0].elements;

				result.push({
					name: activeNode.left.property.name,
					mode: elements.map(element => element.value).join(' : '),
					start: activeNode.left.property.start,
					end: activeNode.left.property.end,
					startPosition: positionAt(activeNode.left.property.start, content),
					endPosition: positionAt(activeNode.left.property.end, content),
					startShow: positionAt(activeNode.start, content),
					endShow: positionAt(activeNode.end, content),
				});
			}
		},
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

const cartridges = new Promise<Set<ICartridge>>(resolve => {
	connectionPromise.then(connection => {
		connection.onNotification('cartridges.files', ({ list }) => {
			const cartridges = new Set<ICartridge>()
			list?.forEach(cartridge => {
				cartridges.add(cartridge);
			});
			resolve(cartridges);
			console.info('got cartridges files list');
			//console.info('cartridges files list: ' + JSON.stringify(list, undefined, '  '));
		});
	})
});

const templates = new Promise<Set<ICartridge>>(resolve => {
	connectionPromise.then(connection => {
		connection.onNotification('cartridges.templates', ({ list }) => {
			const cartridgeTemplates = new Set<ICartridge>();

			list?.forEach(cartridge => {
				cartridgeTemplates.add(cartridge);
			});
			console.info('got cartridges templates list');
			resolve(cartridgeTemplates);
			// console.info('cartridges files list: ' + JSON.stringify(list, undefined, '  '));
		});
	});
});

const controllers = new Promise<ICartridgeControllers[]>(resolve => {
	connectionPromise.then(connection => {
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
										name: removeExt(basename(fileName)),
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

			resolve(cartridges);

			console.info(`got cartridges controllers list, parse time: ${(Date.now() - startTime) / 1000}]`);
		});
	});

});

controllers.then(controllers => {
	connectionPromise.then(connection => {
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
										name: removeExt(basename(fileName)),
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
	})
})

const cartridgesProperties = new Promise<ICartridgeProperties[]>(resolve => {
	connectionPromise.then(connection => {
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

			resolve(cartridges);

			console.info(`got cartridges properties list, parse time: ${(Date.now() - startTime) / 1000}]`);
		})
	});
});

cartridgesProperties.then(cartridgesProperties => {
	connectionPromise.then(connection => {
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
	})
})

const indexes = {
	scriptFiles: cartridges,
	templates: templates,
	properties: cartridgesProperties,
	controllers: controllers
}


export function getIndexes() {
	return indexes;
}

export function activateIndexes(connect: IConnection) {
	resolveConnection(connect);
}
