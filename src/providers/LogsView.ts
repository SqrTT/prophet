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
	Disposable
} from 'vscode';

import { join, basename } from 'path';
import WebDav from '../server/WebDav';
import { DOMParser } from 'xmldom';
import { Observable, Subject } from 'rxjs';
import timeago from 'timeago.js';


const commandBus = new Subject<'refresh.logview' | 'filter.logview' | 'log.open' | 'clean.log'>();

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
				name.replace(/-blade\d{0,2}-\d{0,2}-appserver/ig, ''),
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
	start(commands, ) {
		const logsView = this;
		const subscriptions : Disposable[] = [];

		subscriptions.push(
			window.registerTreeDataProvider('dwLogsView', logsView)
		)
		subscriptions.push(commands.registerCommand('extension.prophet.command.refresh.logview', () => {
			logsView.refresh();
		}));

		subscriptions.push(commands.registerCommand('extension.prophet.command.filter.logview', () => {
			logsView.showFilterBox();
		}));

		subscriptions.push(commands.registerCommand('extension.prophet.command.log.open', (filename) => {
			logsView.openLog(filename);
		}));

		subscriptions.push(commands.registerCommand('extension.prophet.command.clean.log', (logItem) => {
			logsView.cleanLog(logItem);
		}));

		uploadServer.readConfigFile(configFilename).flatMap(config => {
			return uploadServer.getWebDavClient(config, this.outputChannel, rootPath);
		}).subscribe(webdav => {


		});

		return {
			dispose: () => {
				subscriptions.forEach(subscription => subscription.dispose());
			}
		}
	}
	constructor(private webdavClient: WebDav) {
		this.webdavClient.config.version = '';
		this.webdavClient.folder = 'Logs';
	}
	private _onDidChangeTreeData: EventEmitter<LogItem | undefined> = new EventEmitter<LogItem | undefined>();
	readonly onDidChangeTreeData: Event<LogItem | undefined> = this._onDidChangeTreeData.event;
	private _logsFileNameFilter : string = '';

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}
	getTreeItem(element: LogItem): TreeItem {
		return element;
	}
	cleanLog(logItem : LogItem) {
		window.withProgress({
			title: 'Cleaning log file',
			location: ProgressLocation.Window
		}, () => observable2promise(
				this.webdavClient.postBody(
					logItem.location.replace('/on/demandware.servlet/webdav/Sites/Logs/', ''),
					`log cleaned by prophet - ${new Date()}\n`
				)
			)
		)
	}
	openLog(filename: string) {
		window.withProgress({
			title: 'Opening log file',
			location: ProgressLocation.Window
		}, () => observable2promise(this.webdavClient.get(basename(filename), '.')).then(
				(filedata) => {
					// replace timestamp
					filedata = filedata.replace(/\[(.+? GMT)\] /ig, ($0, $1) => {
						const date = new Date($1);
						return `\n\n[${timeago().format(date)}/${date}]\n`;
					});

					// replace paths
					//
					const root = this.webdavClient.config.root;
					filedata = filedata.replace(/\tat (.*?):(.*?) \(/ig, ($0, $1, $2) => {
						return `\tat file://${join(root, ...$1.split('/'))}#${$2} (`;
					});

					// add new line before message
					filedata = filedata.replace(/  /ig, '\n');

					return workspace.openTextDocument({ 'language': 'dwlog', 'content': filedata })
						.then(document => {
							return window.showTextDocument(document, { viewColumn: ViewColumn.One, preserveFocus: false, preview: true });
						}).then(textEditor => {
							textEditor.revealRange(
								new Range(
									new Position(textEditor.document.lineCount - 1, 0),
									new Position(textEditor.document.lineCount - 1, 1)
								)
							);
						});
				},
				err => {
					window.showErrorMessage(err);
				}
			)
		)

	}

	getChildren(element?: LogItem): Thenable<LogItem[]> {
		return observable2promise(this.webdavClient.dirList('.', '.').map(data => {
			let statuses = parseResponse(data);

			if (this._logsFileNameFilter) {
				statuses = statuses.filter(status =>
					status.filename.includes(this._logsFileNameFilter)
				);
			}

			const sortedStauses = statuses.sort((a, b) => b.lastmodifed.getTime() - a.lastmodifed.getTime());
			return sortedStauses.map(status => {
				return new LogItem(status.filename, 'file', status.filePath, TreeItemCollapsibleState.None);
			});
		}));
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
		public readonly command?: Command
	) {
		super(name, collapsibleState);

		this.location = location;
		this.type = type;

		this.command = {
			title: 'Open log file',
			command: 'extension.prophet.command.log.open',
			tooltip: 'Open log file',
			arguments: [location]
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
