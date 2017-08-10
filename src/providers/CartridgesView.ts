'use strict';
import { TreeItemCollapsibleState, EventEmitter, TreeDataProvider, Event, window, TreeItem, Uri, workspace, ViewColumn } from 'vscode';

import { join } from 'path';
import * as glob from 'glob';
import { mkdirSync, open, close } from 'fs';

import { getDirectories, getFiles, pathExists } from '../lib/FileHelper';
import { checkIfCartridge, toCardridge, getPathsCartridges } from '../lib/CartridgeHelper';
import { filterAsync } from '../lib/CollectionUtil';
import { CartridgeItem, CartridgeItemType } from '../lib/CartridgeItem';

/**
 * Creates a folder CartridgeItem.
 * @param {string} directory The directory name
 * @param {CartridgeItem} element  The parent element
 * @param {string} activeFile The path to the currently active file in the workspace
 */
const toFolderElement = (directory: string, element: CartridgeItem, activeFile?: string): CartridgeItem => {
	const actualFolderLocation = join(element.location, directory);
	return new CartridgeItem(
		directory,
		CartridgeItemType.Directory,
		actualFolderLocation,
		(activeFile && activeFile.startsWith(actualFolderLocation))
			? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed);
};

/**
 * Creates a file CartridgeItem
 * @param {string} fileName The file name
 * @param {CartridgeItem} element The parent element
 */
const toFileElement = (fileName: string, element: CartridgeItem): CartridgeItem => {
	return new CartridgeItem(fileName,
		CartridgeItemType.File,
		join(element.location, fileName),
		TreeItemCollapsibleState.None, {
			command: 'vscode.open',
			title: 'Open file',
			arguments: [Uri.file(join(element.location, fileName))],
		});
};

/**
 * A TreeDataProvider that shows all cartridge projects within the current workspace.
 */
export class CartridgesView implements TreeDataProvider<CartridgeItem> {
	private _onDidChangeTreeData: EventEmitter<CartridgeItem | undefined> = new EventEmitter<CartridgeItem | undefined>();
	readonly onDidChangeTreeData: Event<CartridgeItem | undefined> = this._onDidChangeTreeData.event;

    /**
     * Load the cartridges within the curren workspace
     * @param {string} workspaceRoot The absolute path of the workspace
     * @param {string} activeFile The absolute path of the file to expand the tree on
     */
	constructor(private workspaceRoot: string, private activeFile?: string) {
		workspace.onDidOpenTextDocument((e) => {
			this.refresh(e.fileName);
		});
	}

    /**
     * Refresh the tree data.
     * @param {string} file The absolute path of the file to expand the tree on
     */
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
			window.showInformationMessage('No dependency in empty workspace.');
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

    /**
     * Fetches all folders and files that are children of the passed element. This function can be used recursively.
     * @param {CartridgeItem} element The parent element
     */
	private async getCartridgeItemFilesOrFolders(element: CartridgeItem): Promise<CartridgeItem[]> {
		const files = await getFiles(element.location);
		const directories = await getDirectories(element.location);
		const activeFile = this.activeFile;

		if (files.length || directories.length) {
			return directories.map(
				function (dir) {
					return toFolderElement(dir, element, activeFile);
				}).concat(files.map(
					function (file) {
						return toFileElement(file, element);
					}
				));
		}

		return [CartridgeItem.NoFiles];
	}

    /**
     * Fetches all cartridges within the given path (should be the workspace root)
     * @param workspaceRoot The absolute path to the workspace root
     */
	private getCartridgesInWorkspace(workspaceRoot: string): Promise<CartridgeItem[]> {
		return new Promise((resolve, reject) => {
			const activeFile = this.activeFile;

			pathExists(workspaceRoot).then(workspaceExists => {
				if (workspaceExists) {
					const packagePath = join(workspaceRoot, 'package.json');

					getPathsCartridges(workspaceRoot, packagePath).then(function (paths) {
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

							if (projectFiles.length) {
								projectFiles = [...new Set(projectFiles.concat(paths))];
								filterAsync(projectFiles, checkIfCartridge).then((filteredProjectFiles) => {
									Promise.all(filteredProjectFiles.map(
										function (projectFile) {
											return toCardridge(projectFile, activeFile);
										})).then(resolve);
								});
							} else {
								resolve([new CartridgeItem('No cartridges found in this workspace.',
									CartridgeItemType.Cartridge,
									this.workspaceRoot,
									TreeItemCollapsibleState.None)]);
							}
						});
					});
				} else {
					resolve([CartridgeItem.NoCartridges]);
				}
			});
		});
	}

	public createFile(cartridgeFileItem: CartridgeItem) {
		const fileCreationOptions = {
			prompt: 'Name: '
		};

		window.showInputBox(fileCreationOptions).then(fileValue => {
			if (fileValue) {
				open(join(cartridgeFileItem.location, fileValue), 'wx', function (err, fd) {
					if (!err) {
						close(fd, function (closingErr) {
							if (closingErr) {
								window.showErrorMessage(`Exception while creating file! ( ${closingErr} )`);
							} else {
								workspace.openTextDocument(Uri.file(join(cartridgeFileItem.location, fileValue))).then(document => {
									return window.showTextDocument(document,
										{ viewColumn: ViewColumn.One, preserveFocus: false, preview: true });
								});
							}

						});
					} else {
						window.showErrorMessage(`Exception while creating file! ( ${err} )`);
					}
				});
			}
		});
	}

	public createDirectory(cartridgeDirectoryItem: CartridgeItem) {
		const folderCreationOptions = {
			prompt: 'Name: '
		};

		window.showInputBox(folderCreationOptions).then(folderValue => {
			if (folderValue) {
				mkdirSync(join(cartridgeDirectoryItem.location, folderValue));
				this.refresh();
			}
		});
	}
}
