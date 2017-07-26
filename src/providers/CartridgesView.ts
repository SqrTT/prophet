'use strict';
import {TreeItemCollapsibleState, EventEmitter, TreeDataProvider, Event, window, TreeItem, Uri, Command} from 'vscode';
import { exists, readFile } from 'fs';
import { dirname, join, extname, basename } from 'path';
import * as glob from 'glob';
import { getDirectories, getFiles, pathExists } from '../lib/FileHelper';

const checkIfCartridge = (projectFile: string): Promise<boolean> => {
	return new Promise((resolve, reject) => {
		readFile(projectFile, 'UTF-8', (err, data) => {
			if (err) {
				reject(err)
			} else {
				// Check the file for demandware package (since the file is not that big no need for a DOM parser) 
				resolve(data.includes('com.demandware.studio.core.beehiveNature'));
			}
		});
	});
};
const toCardridge = (projectFile: string): Promise<CartridgeItem> => {
	return new Promise((resolve, reject) => {
		let projectFileDirectory = dirname(projectFile);
		const projectName = basename(projectFileDirectory);

		let subFolder = ''
		exists(join(projectFileDirectory, 'cartridge'), (exists) => {
			if (exists) {
				subFolder = 'cartridge';
			}
			resolve(new CartridgeItem(projectName || 'Unknown project name', 'cartridge', join(projectFileDirectory, subFolder), TreeItemCollapsibleState.Collapsed));
		})
	});
}

function filterAsync<T>(array: T[], filter) {
	return Promise.all(array.map(entry => filter(entry)))
	.then(bits => array.filter(entry => bits.shift()))
};

export class CartridgesView implements TreeDataProvider<CartridgeItem> {
	private _onDidChangeTreeData: EventEmitter<CartridgeItem | undefined> = new EventEmitter<CartridgeItem | undefined>();
	readonly onDidChangeTreeData: Event<CartridgeItem | undefined> = this._onDidChangeTreeData.event;

	constructor(private workspaceRoot: string) {

	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: CartridgeItem): TreeItem {
		return element;
	}

	getChildren(element?: CartridgeItem): Thenable<CartridgeItem[]> {
		if (!this.workspaceRoot) {
			window.showInformationMessage('No dependency in empty workspace');
			return Promise.resolve([]);
		}

		return new Promise(resolve => {
			if (element) {
				resolve(this.getCartridgeItemFilesOrFolders(element));
			} else {
				pathExists(this.workspaceRoot).then((exist) => {
					if (exist) {
						this.getCartridgesInWorkspace(this.workspaceRoot).then(resolve);
					} else {
						window.showInformationMessage('No workspace!');
						resolve([]);
					}
				});
			}
		});
	}

	private async getCartridgeItemFilesOrFolders(element: CartridgeItem): Promise<CartridgeItem[]> {
		var files = await getFiles(element.location);
		var directories = await getDirectories(element.location);

		if (files.length || directories.length) {
			const toFileElement = (fileName: string): CartridgeItem => {
				return new CartridgeItem(fileName, 'cartridge-item-file', join(element.location, fileName), TreeItemCollapsibleState.None, {
					command: 'open',
					title: 'Open file',
					arguments: [Uri.parse('file://' + join(element.location, fileName))],
				});
			}

			const toFolderElement = (directory: string): CartridgeItem => {
				return new CartridgeItem(directory, 'cartridge-item-folder', join(element.location, directory), TreeItemCollapsibleState.Collapsed);
			}

			return directories.map(toFolderElement).concat(files.map(toFileElement));
		}

		return [new CartridgeItem('No files', 'cartridge-file', '', TreeItemCollapsibleState.None)];
	}


	private getCartridgesInWorkspace(workspaceRoot: string): Promise<CartridgeItem[]> {
		return new Promise((resolve, reject) => {
			pathExists(workspaceRoot).then(exists => {
				if (exists) {
					glob('**/.project', {
						cwd: workspaceRoot,
						root: workspaceRoot,
						nodir: true,
						follow: false,
						absolute: true,
						ignore: ['**/node_modules/**', '**/.git/**']
					}, (error, projectFiles: string[]) => {

						if (error) {
							return reject(error);
						}

						//let filteredDirectories = directories.filter(checkIfCartridge);

						if (projectFiles.length) {
							filterAsync(projectFiles, checkIfCartridge).then((filteredProjectFiles) => {
								Promise.all(filteredProjectFiles.map(toCardridge)).then(resolve);
							});
							return projectFiles.filter(checkIfCartridge).map(toCardridge);
						} else {
							resolve([new CartridgeItem('No cartridges found in this workspace.', 'cartridge', this.workspaceRoot, TreeItemCollapsibleState.None)]);
						}
					});

				} else {
					resolve([]);
				}
			});
		});
	}
}

class CartridgeItem extends TreeItem {
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