import { URI } from "vscode-uri";
import * as acornLoose from 'acorn-loose';
import * as acornWalk from 'acorn-walk';
import { CancellationToken, Range, LocationLink } from "vscode-languageserver";
import { insertParents, removeExt, ICartridge, IEndpoint } from "../serverUtils";
import { sep } from "path";
import { positionAt } from "../../getLineOffsets";
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

interface IGoTo {
	fsPath: string;
	range: Range;
	showRange: Range;
	originalStart: number;
	originalEnd: number;
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

async function isStartingWithCartridgeName(value: string) {
	const val = value.startsWith('/') ? value.substring(1) : value;
	const [cartridgeName] = val.split('/');

	return Array.from(await getIndexes().scriptFiles).some(controllerCartridge => controllerCartridge.name === cartridgeName);
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
				const value = removeExt(activeNode.value).replace('*', '');

				Array.from(await getIndexes().scriptFiles).some(cartridge => {
					return cartridge.files.some(file => {
						if (value === removeExt(file.path)) {
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
				const value = removeExt(activeNode.value).replace('~', '')

				activeCartridge.files.some(file => {
					if (value === removeExt(file.path)) {
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
				const filePath = removeExt('/' + other.join('/'));
				;
				const cartridge = Array.from(await getIndexes().scriptFiles).find(controllerCartridge => controllerCartridge.name === cartridgeName);

				if (cartridge) {
					let found: string | undefined;
					cartridge.files.some(file => {
						if (filePath === removeExt(file.path)) {
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
			const cartridgesBellow = Array.from(await getIndexes().scriptFiles).filter(cartridge => {
				if (activeCartridge.name === cartridge.name) {
					isBellow = true;
					return false;
				}
				return isBellow;
			});

			const value = removeExt(uri.path.split(sep).join('/'));
			cartridgesBellow.some(cartridge => {
				return cartridge.files.some(file => {
					if (value.endsWith(removeExt(file.path))) {
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
			(
				(activeNode.parent?.callee?.object?.name === 'res' &&
					activeNode.parent?.callee?.property?.name === 'render')
				|| (activeNode.parent?.callee?.object?.name === 'ISML' &&
					activeNode.parent?.callee?.property?.name === 'renderTemplate')
			)
		) {
			const value = activeNode.value.replace('.isml', '').replace(/^\//, '');

			const found = Array.from(await getTemplatesList()).find(([template]) => {
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
			const endpoints = await getEndpointsMap();
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
				const found = (await getIndexes().properties).find(cartridgesProperty => {
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

export function activate (connection, documents) {
	console.log = connection.console.log.bind(connection.console);
	connection.onDefinition(async (params, cancelToken) => {
		const reqTime = Date.now();
		console.log('req definition:' + params.textDocument.uri);

		const document = documents.get(params.textDocument.uri);
		if (!document) {
			connection.console.error('125: Unable find document')
			return undefined;
		}
		const offset = document.offsetAt(params.position);
		const uri = URI.parse(params.textDocument.uri);

		const activeCartridge = Array.from(await getIndexes().scriptFiles).find(cartridge =>
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
}

