import {TreeItemCollapsibleState, TreeDataProvider, TreeItem, Command} from 'vscode';

import { join, extname } from 'path';
import WebDav from '../server/WebDav';
import {DOMParser} from 'xmldom';
import {Observable} from 'rxjs';

const domParser = new DOMParser();

function getNodeText(node) : string | undefined {
	if (node && node.length && node.item(0).childNodes.length) {
		var value = node.item(0).childNodes['0'].nodeValue;
		if (value) {
			return value;
		} else {
			return undefined;
		}
	} else {
		return undefined;
	}
}

function parseResponse(data: string) : LogStatus[] {
	var xmlResponse = domParser.parseFromString(data);
	const logStatus : LogStatus[] = [];

	const responses = xmlResponse.getElementsByTagName('response');
	for (var i = 0, length = responses.length; i < length; i++) {
		var response = responses.item(i);

		var name = getNodeText(response.getElementsByTagName('displayname'));

		if (name) {
			var href = getNodeText(response.getElementsByTagName('href'));
			var lastmodified = getNodeText(response.getElementsByTagName('getlastmodified'));
			var contentlength = getNodeText(response.getElementsByTagName('getcontentlength'));

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

function observable2promise<T>(observable: Observable<T>) : Promise<T> {
	return new Promise((resolve, reject) => {
		observable.subscribe(resolve, reject, reject);
	})
}


export class LogsView implements TreeDataProvider<LogItem> {
	constructor(private webdavClient: WebDav) {
		this.webdavClient.config.version = '';
		this.webdavClient.folder = 'Logs'
		// this.webdavClient.dirList('.', '.').subscribe(
		// 	(data) => {
		// 		var test = parseResponse(data)
		// 		debugger;
		// 	},
		// 	err => {
		// 		debugger;
		// 	}
		// );

	}
	getTreeItem(element: LogItem): TreeItem {
		return element;
	}

	getChildren(element?: LogItem): Thenable<LogItem[]> {

		return observable2promise(this.webdavClient.dirList('.', '.').map(data => {
			const statuses = parseResponse(data);
			const sortedStauses = statuses.sort((a,b) => b.lastmodifed.getTime() - a.lastmodifed.getTime());
			return sortedStauses.map(status => {
				return new LogItem(status.filename, 'file', status.filePath, TreeItemCollapsibleState.None);
			});
		}));
	}
}

class LogStatus {
	constructor(
		public readonly filename: string,
		public readonly lastmodifed: Date,
		public readonly filePath: string,
		public length : number
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

		if (this.type === 'cartridge-item-file') {
			this.fileExtension = extname(this.name).replace('.', '');

			this.iconPath = {
				light: join(__filename, '..', '..', '..', 'images', 'resources', this.fileExtension + '.svg'),
				dark: join(__filename, '..', '..', '..', 'images', 'resources', this.fileExtension + '.svg')
			};

			this.contextValue = 'file';
		} else if (this.type === 'cartridge-item-folder') {
			this.contextValue = 'folder';
		} else {
			this.contextValue = 'cartridge';

			this.iconPath = {
				light: join(__filename, '..', '..', '..', 'images', 'resources', 'cartridge.svg'),
				dark: join(__filename, '..', '..', '..', 'images', 'resources', 'cartridge.svg')
			};
		}
	}
}