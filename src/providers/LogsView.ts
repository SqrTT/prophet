import {
	TreeItemCollapsibleState,
	TreeDataProvider,
	TreeItem,
	Command,
	EventEmitter,
	Event,
	window,
	ProgressLocation,
	workspace,
	ViewColumn,
	Position,
	Range,
	Disposable,
	Uri,
	ExtensionContext
} from 'vscode';

import { join, basename } from 'path';
import { default as WebDav } from '../server/WebDav';
import { DOMParser } from 'xmldom';
import { Observable, Subject } from 'rxjs';
import timeago from 'timeago.js';
import { getCartridgesFolder, getConfig } from '../lib/FileHelper';


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

function parseResponse(data: string): LogStatus[] {
	const xmlResponse = domParser.parseFromString(data);
	const logStatus: LogStatus[] = [];

	const responses = xmlResponse.getElementsByTagName('response');
	for (let i = 0, length = responses.length; i < length; i++) {
		const response = responses.item(i);

		const name = getNodeText(response.getElementsByTagName('displayname'));

		if (name && name.endsWith('.log')) {
			const href = getNodeText(response.getElementsByTagName('href'));
			const lastmodified = getNodeText(response.getElementsByTagName('getlastmodified'));
			const contentlength = getNodeText(response.getElementsByTagName('getcontentlength'));

			logStatus.push(new LogStatus(
				name.includes('-blade') ? name.substr(0, name.indexOf('-blade')) : name,
				new Date(String(lastmodified)),
				String(href),
				Number(contentlength))
			);
		}
	}
	return logStatus;
}

function observable2promise<T>(observable: Observable<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		observable.subscribe(resolve, reject, reject);
	});
}

export class LogsView implements TreeDataProvider<LogItem> {
	private webdavClients: Map<string, WebDav> = new Map();

	static initialize(commands, context: ExtensionContext, dwConfig$$: Observable<Observable<Uri>>) {

		const subscriptions: Disposable[] = [];
		const logsView = new LogsView();

		subscriptions.push(
			window.registerTreeDataProvider('dwLogsView', logsView)
		)
		subscriptions.push(commands.registerCommand('extension.prophet.command.refresh.logview', () => {
			logsView.refresh();
		}));

		subscriptions.push(commands.registerCommand('extension.prophet.command.filter.logview', () => {
			logsView.showFilterBox();
		}));

		subscriptions.push(commands.registerCommand('extension.prophet.command.log.open', (logItem) => {
			logsView.openLog(logItem);
		}));

		subscriptions.push(commands.registerCommand('extension.prophet.command.clean.log', (logItem) => {
			logsView.cleanLog(logItem);
		}));

		//subscriptions.forEach(subscription => subscription.dispose());

		return dwConfig$$.map(dwConfig$ => {
			const end$ = new Subject();
			return dwConfig$
				.do(() => { }, undefined, () => { end$.next(); end$.complete() })
				.flatMap((dwConfig) => {
					return getConfig(dwConfig.fsPath);
				})
				.flatMap((davOptins) => {
					return new Observable((observer) => {
						if (!logsView.webdavClients.has(davOptins.hostname)) {
							const webdav = new WebDav(davOptins);
							webdav.config.version = '';
							webdav.folder = 'Logs';
							logsView.webdavClients.set(davOptins.hostname, webdav);
							logsView.refresh();
						}

						return () => {
							if (logsView.webdavClients.has(davOptins.hostname)) {
								logsView.webdavClients.delete(davOptins.hostname);
								logsView.refresh();
							}
						}
					});
				})
				.takeUntil(end$);
		});
	}
	constructor() { }
	private _onDidChangeTreeData: EventEmitter<LogItem | undefined> = new EventEmitter<LogItem | undefined>();
	readonly onDidChangeTreeData: Event<LogItem | undefined> = this._onDidChangeTreeData.event;
	private _logsFileNameFilter: string = '';

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}
	getTreeItem(element: LogItem): TreeItem {
		return element;
	}
	cleanLog(logItem: LogItem) {
		const webdavClient = this.webdavClients.get(logItem.hostname);

		if (webdavClient) {
			window.withProgress({
				title: 'Cleaning log file',
				location: ProgressLocation.Window
			}, () => observable2promise(
				webdavClient.postBody(
					logItem.location.replace('/on/demandware.servlet/webdav/Sites/Logs/', ''),
					`log cleaned by prophet - ${webdavClient.config.username} - ${new Date()}\n\r`
				)
			)
			)
		}
	}
	openLog(logItem: LogItem) {
		const webdavClient = this.webdavClients.get(logItem.hostname);
		if (webdavClient) {
			window.withProgress({
				title: 'Opening log file',
				location: ProgressLocation.Window
			}, () => observable2promise(webdavClient.get(basename(logItem.location), '.')).then(
				(filedata) => {
					// replace timestamp
					filedata = filedata.replace(/\[(.+? GMT)\] /ig, ($0, $1) => {
						const date = new Date($1);
						return `\n\n\n[${timeago().format(date)}/${date}]\n`;
					});

					if (workspace.workspaceFolders) {
						const fileWorkspaceFolders = workspace.workspaceFolders.filter(workspaceFolder => workspaceFolder.uri.scheme === 'file');
						const workspaceFolders$ = fileWorkspaceFolders.map(workspaceFolder => {
							return getCartridgesFolder(workspaceFolder);
						});

						return Observable.merge(...workspaceFolders$)
							.reduce((acc, val) => {
								acc.add(val);
								return acc;
							}, new Set<string>())
							.flatMap(cartridges => {

								// replace paths
								//

								filedata = filedata.replace(/ (.*?)[:#](\d*)/ig, ($0, debuggerPath, $2) => {
									const debuggerSep = debuggerPath.split('/');
									const cartridgeName = debuggerSep.shift() || '';
									const cartPath = Array.from(cartridges).find(cartridge => basename(cartridge) === cartridgeName);
									if (!cartPath) {
										return $0;
									}

									//debuggerPath = debuggerPath.substr(1);

									var file = Uri.file(join(cartPath, ...debuggerSep));
									return ` ${file.toString()}#${$2}`;
								});

								// add new line before message
								filedata = filedata.replace(/  /ig, '\n');

								return Observable.fromPromise(workspace.openTextDocument({ 'language': 'dwlog', 'content': filedata })
									.then(document => {
										return window.showTextDocument(document, { viewColumn: ViewColumn.One, preserveFocus: false, preview: true });
									}).then(textEditor => {
										var lastIndex = filedata.lastIndexOf('\n\n\n');

										var newLines = filedata.substr(lastIndex).split('\n').length;
										textEditor.revealRange(
											new Range(
												new Position(textEditor.document.lineCount - newLines, 0),
												new Position(textEditor.document.lineCount - newLines, 1)
											)
										);
									}));
							})

							.toPromise();
					} else {
						return Promise.reject('No workspaceFolders available');
					}
				},
				err => {
					window.showErrorMessage(err);
				}
			)
			)
		}
	}

	async getChildren(element?: LogItem) {
		if (this.webdavClients.size === 0) {
			return [];
		} else {
			if (element) {
				const webdavClient = this.webdavClients.get(element.hostname);

				if (webdavClient) {
					return await observable2promise(webdavClient.dirList('.', '.').map(data => {
						let statuses = parseResponse(data);

						if (this._logsFileNameFilter) {
							statuses = statuses.filter(status =>
								status.filename.includes(this._logsFileNameFilter)
							);
						}

						const sortedStauses = statuses.sort((a, b) => b.lastmodifed.getTime() - a.lastmodifed.getTime());
						var time = timeago();
						return sortedStauses.map(status => {

							return new LogItem(
								`${status.filename} - ${time.format(status.lastmodifed)}`,
								'file',
								status.filePath,
								TreeItemCollapsibleState.None,
								element.hostname);
						});
					}));
				} else {
					throw Error('Unable get webdav client');
				}
			} else {
				return Array.from(this.webdavClients.values()).map(webdavClient => {
					return new LogItem(
						webdavClient.config.hostname.split('.').shift() || 'noName',
						'host',
						webdavClient.config.hostname,
						TreeItemCollapsibleState.Collapsed,
						webdavClient.config.hostname
					);
				});
			}
		}
	}
	showFilterBox() {
		window.showInputBox({
			prompt: "Filter the logs view by filename",
			placeHolder: "Type log name search string",
			value: this._logsFileNameFilter
		}).then(searchFilter => {
			if (searchFilter !== undefined) {
				this._logsFileNameFilter = searchFilter;
				this.refresh();
			}
		});
	}
}

class LogStatus {
	constructor(
		public readonly filename: string,
		public readonly lastmodifed: Date,
		public readonly filePath: string,
		public length: number
	) {

	}
}

class LogItem extends TreeItem {
	fileExtension: string;

	constructor(
		public readonly name: string,
		public readonly type: string,
		public readonly location: string,
		public readonly collapsibleState: TreeItemCollapsibleState,
		public readonly hostname: string,
		public readonly command?: Command,
	) {
		super(name, collapsibleState);

		this.location = location;
		this.type = type;

		this.command = {
			title: 'Open log file',
			command: 'extension.prophet.command.log.open',
			tooltip: 'Open log file',
			arguments: [this]
		};

		const iconType = [
			'fatal',
			'error',
			'warn',
			'info',
			'debug'
		].find(t => name.includes(t)) || 'log';

		this.iconPath = join(__filename, '..', '..', '..', 'images', 'resources', iconType + '.svg');
		this.contextValue = 'dwLogFile';
	}
}
