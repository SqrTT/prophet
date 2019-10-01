import { TreeDataProvider, TreeItem, TreeItemCollapsibleState, Command, commands, window, ExtensionContext, workspace, RelativePattern, Uri, EventEmitter, Event, QuickPickItem } from "vscode";
import { findFiles } from "../lib/FileHelper";
import { parse, sep } from 'path';
import { Observable } from "rxjs";



class ControllerItem extends TreeItem {
	constructor(
		public readonly name: string,
		public readonly collapsibleState: TreeItemCollapsibleState,
		public readonly command?: Command,
	) {
		super(name, collapsibleState);

		this.command = {
			title: 'Open',
			command: 'extension.prophet.command.log.open',
			tooltip: 'Open controller',
			arguments: [this]
		};

		// const iconType = [
		// 	'fatal',
		// 	'error',
		// 	'warn',
		// 	'info',
		// 	'debug'
		// ].find(t => name.includes(t)) || 'log';

		this.iconPath = false; //join(__filename, '..', '..', '..', 'images', 'resources', iconType + '.svg');
		//this.contextValue = 'dwLogFile';
	}
}

class ControllerActionItem extends TreeItem {
	files: { name: string, file: Uri, row: number, methodName: string }[] = [];
	constructor(
		public readonly name: string,
		public readonly endpointName: string,
		public readonly collapsibleState: TreeItemCollapsibleState,
		public readonly command?: Command
	) {
		super(endpointName, collapsibleState);


	}
}

class ControllerActionItemFile extends TreeItem {
	constructor(
		public readonly name: string,
		public readonly collapsibleState: TreeItemCollapsibleState,
		public readonly command?: Command
	) {
		super(name, TreeItemCollapsibleState.None);
	}
}

interface ControllerEntry {
	controllerName: string,
	line: number,
	file: Uri,
	entry: string,
	methodName: string
}

function getCartridgeNameFromPath(str: string) {
	let folders = str.split(sep);
	let res: string | undefined = '';

	while ((res = folders.pop())) {
		if (res === 'cartridge') {
			return folders.pop() || '<never>';
		}
	}

	return res || '<none>';

}

interface QuickPickTargetedItem extends QuickPickItem {
	target: ControllerEntry
}


export class ControllersView implements TreeDataProvider<ControllerItem> {
	private _onDidChangeTreeData: EventEmitter<ControllerItem | undefined> = new EventEmitter<ControllerItem | undefined>();
	readonly onDidChangeTreeData: Event<ControllerItem | undefined> = this._onDidChangeTreeData.event;
	static initialize(context: ExtensionContext) {

		const controllersView = new ControllersView();
		context.subscriptions.push(
			window.registerTreeDataProvider('dwControllersView', controllersView)
		);

		let qpItems : QuickPickTargetedItem[] | undefined;

		context.subscriptions.push(commands.registerCommand('extension.prophet.command.controllers.find', async () => {
			if (qpItems) {
				window.showQuickPick(qpItems).then(selected => {
					if (selected) {
						commands.executeCommand(
							'vscode.open',
							selected.target.file.with({ fragment: String(selected.target.line + 1) })
						);
					}
				});
			} else {
				controllersView.scanProjectForControllers().then(_qpItems=> {
					qpItems = _qpItems;
					window.showQuickPick(qpItems).then(selected => {
						if (selected) {
							commands.executeCommand(
								'vscode.open',
								selected.target.file.with({ fragment: String(selected.target.line + 1) })
							);
						}
					});
				})
			}
		}));

		context.subscriptions.push(commands.registerCommand('extension.prophet.command.controllers.refresh', (cartridgeDirectoryItem) => {
			controllersView._onDidChangeTreeData.fire();
			controllersView.scanProjectForControllers().then(_qpItems=> {
				qpItems = _qpItems;
			});
		}));

	}
	async scanProjectForControllers() {
		const controllers = await this.findControllers();

		const endpoints = await Promise.all(controllers.map(controller => {
			return this.findEndpoints(controller.name);
		}));
		const qpItems: Map<string, QuickPickTargetedItem> = new Map();;

		endpoints.forEach(endpoint => {
			endpoints.forEach(controller => {
				controller.forEach(entries => {
					entries.forEach(entry => {
						const cartridgeName = getCartridgeNameFromPath(entry.file.fsPath);
						const key = cartridgeName + entry.controllerName + entry.entry;

						if (!qpItems.has(key)) {
							qpItems.set(key, {
								label: `${entry.controllerName}-${entry.entry}`,
								description: cartridgeName + (entry.methodName ? ' - ' + entry.methodName : ''),
								target: entry
							})
						}
					})
				});
			});
		})
		return Array.from(qpItems.values());
	}
	getTreeItem(element: ControllerItem): TreeItem {
		return element;
	}
	async getChildren(element?: ControllerItem | ControllerActionItem | ControllerActionItemFile): Promise<ControllerItem[] | ControllerActionItem[] | ControllerActionItemFile[]> {

		if (element instanceof ControllerActionItem) {
			return element.files.map(file => new ControllerActionItemFile(
				getCartridgeNameFromPath(file.file.path) + (file.methodName ? ` (${file.methodName})` : ''),
				TreeItemCollapsibleState.None,
				{
					command: 'vscode.open',
					title: 'Open file',
					arguments: [file.file.with({ fragment: String(file.row + 1) })],
				}
			));
		} else if (element instanceof ControllerItem) {

			const endPoints = await this.findEndpoints(element.name);

			const endpointsMap = new Map<string, ControllerActionItem>();

			endPoints.forEach(endpoints => {
				endpoints.forEach(endpoint => {
					if (!endpointsMap.has(endpoint.entry)) {
						endpointsMap.set(endpoint.entry, new ControllerActionItem(
							endpoint.controllerName,
							endpoint.entry,
							TreeItemCollapsibleState.Collapsed
						))
					}
					const record = endpointsMap.get(endpoint.entry);

					if (record) {
						record.files.push({
							file: endpoint.file,
							name: endpoint.entry,
							row: endpoint.line,
							methodName: endpoint.methodName
						});
					}
				});
			});

			return Array.from(endpointsMap.values()).sort((a, b) => a.endpointName > b.endpointName ? 1 : -1);;
		} else {
			return await this.findControllers();
		}

	}

	private async findControllers() {
		const filesWorkspaceFolders = (workspace.workspaceFolders || []).filter(workspaceFolder => workspaceFolder.uri.scheme === 'file');
		const controllerFiles = await Promise.all(filesWorkspaceFolders.map(workspaceFolder => findFiles(new RelativePattern(workspaceFolder, '**/cartridge/controllers/*.js'), +Infinity).reduce((acc, item) => { acc.push(item); return acc; }, [])
			.toPromise()));
		return controllerFiles.reduce((acc: ControllerItem[], files) => {
			files.forEach(file => {
				const name = parse(file.path).name;
				const exist = acc.find(ctrl => ctrl.name === name);
				if (!exist) {
					acc.push(new ControllerItem(name, TreeItemCollapsibleState.Collapsed));
				}
			});
			return acc;
		}, []).sort((a, b) => a.name > b.name ? 1 : -1);
	}

	private async findEndpoints(controllerName: string) {
		const filesWorkspaceFolders = (workspace.workspaceFolders || []).filter(workspaceFolder => workspaceFolder.uri.scheme === 'file');
		const endPoints = await Promise.all(filesWorkspaceFolders.map(workspaceFolder => findFiles(new RelativePattern(workspaceFolder, `**/cartridge/controllers/${controllerName}.js`), +Infinity)
			.flatMap(file => {
				return Observable.fromPromise(workspace.fs.readFile(file))
					.flatMap(fileContent => {
						const fileRows = fileContent.toString().split('\n');
						return new Observable<ControllerEntry>(observer => {
							fileRows.forEach((row, index, content) => {
								if (row.includes('server.')) {
									const entryRegexp = /server\.(get|post|append|prepend|replace)\(([\"\'](\w.+?)['\"])/ig;
									const match = entryRegexp.exec(row);
									if (match && match[3]) {
										observer.next({
											methodName: match[1] || '',
											controllerName: controllerName,
											line: index,
											file: file,
											entry: match[3]
										});
									}
									else {
										const entryNextLineRegexp = /server\.(get|post|append|prepend|replace)\((\s+?)?$/ig;
										const entryNextLineRegexpMatch = entryNextLineRegexp.exec(row);
										if (entryNextLineRegexpMatch) {
											const nextRow = content[index + 1];
											const nameOnNextLine = /^(\s+?)?['"](\w+?)['"]/ig;
											const nextRowMatch = nameOnNextLine.exec(nextRow);
											if (nextRowMatch && nextRowMatch[2]) {
												observer.next({
													methodName: entryNextLineRegexpMatch[1] || '',
													controllerName: controllerName,
													line: index + 1,
													file: file,
													entry: nextRowMatch[2]
												});
											}
										}
									}
								}
								else if (row.includes('exports.')) {
									const oldControllersCase = /exports.(\w+?) =/ig;
									const match = oldControllersCase.exec(row);
									if (match && match[1]) {
										observer.next({
											methodName: '',
											controllerName: controllerName,
											line: index,
											file: file,
											entry: match[1]
										});
									}
								}
							});
							observer.complete();
						});
					});
			})
			.reduce((acc, item) => { acc.push(item); return acc; }, [])
			.toPromise()));
		return endPoints;
	}
}
