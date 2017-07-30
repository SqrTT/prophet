'use strict';
import { TreeItemCollapsibleState, EventEmitter, TreeDataProvider, Event, window, TreeItem, Uri, workspace } from 'vscode';

import { join } from 'path';
import * as glob from 'glob';

import { getDirectories, getFiles, pathExists } from '../lib/FileHelper';
import { checkIfCartridge, toCardridge } from '../lib/CartridgeHelper';
import CartridgeItem from '../lib/CartridgeItem';


const toFolderElement = (directory: string, element: CartridgeItem, activeFile?: string): CartridgeItem => {
	let actualFolderLocation = join(element.location, directory);
	return new CartridgeItem(
		directory,
		'cartridge-item-folder',
		actualFolderLocation,
		(activeFile && activeFile.startsWith(actualFolderLocation))
			? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed);
}

function filterAsync<T>(array: T[], filter) {
	return Promise.all(array.map(entry => filter(entry)))
		.then(bits => array.filter(entry => bits.shift()))
};

export class CartridgesView implements TreeDataProvider<CartridgeItem> {
	private _onDidChangeTreeData: EventEmitter<CartridgeItem | undefined> = new EventEmitter<CartridgeItem | undefined>();
	readonly onDidChangeTreeData: Event<CartridgeItem | undefined> = this._onDidChangeTreeData.event;

	constructor(private workspaceRoot: string, private activeFile?: string) {
		workspace.onDidOpenTextDocument((e) => {
			this.refresh(e.fileName);
		});
	}

	refresh(file?: string): void {
		if (file) {
			this.activeFile = file;
		}
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
		let files = await getFiles(element.location);
		let directories = await getDirectories(element.location);
		let activeFile = this.activeFile;

		if (files.length || directories.length) {
			const toFileElement = (fileName: string): CartridgeItem => {
				return new CartridgeItem(fileName, 'cartridge-item-file', join(element.location, fileName), TreeItemCollapsibleState.None, {
					command: 'vscode.open',
					title: 'Open file',
					arguments: [Uri.file(join(element.location, fileName))],
				});
			}


			return directories.map(function (dir) { return toFolderElement(dir, element, activeFile); }).concat(files.map(toFileElement));
		}

		return [new CartridgeItem('No files', 'cartridge-file', '', TreeItemCollapsibleState.None)];
	}


	private getCartridgesInWorkspace(workspaceRoot: string): Promise<CartridgeItem[]> {
		return new Promise((resolve, reject) => {
			let activeFile = this.activeFile;



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
								Promise.all(filteredProjectFiles.map(function (projectFile) { return toCardridge(projectFile, activeFile) })).then(resolve);
							});
							return projectFiles.filter(checkIfCartridge).map(function (projectFile) { return toCardridge(projectFile, activeFile) });
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