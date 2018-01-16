'use strict';
import { TreeItemCollapsibleState, EventEmitter, TreeDataProvider, Event, window, TreeItem, Uri, workspace, ViewColumn, ExtensionContext, commands, RelativePattern, WorkspaceFolder } from 'vscode';

import { join } from 'path';
import { mkdirSync, open, close } from 'fs';

import { getDirectories, getFiles, pathExists } from '../lib/FileHelper';
import { checkIfCartridge, toCardridge, getPathsCartridges } from '../lib/CartridgeHelper';
import { filterAsync } from '../lib/CollectionUtil';
import { CartridgeItem, CartridgeItemType } from '../lib/CartridgeItem';
import { Observable } from 'rxjs';


const cartridgeViewOutputChannel = window.createOutputChannel('Cartridges List (Prophet)');

/**
 * Creates a folder CartridgeItem.
 * @param {string} directory The directory name
 * @param {CartridgeItem} element  The parent element
 * @param {string} activeFile The path to the currently active file in the workspace
 */
const createFolderElement = (directory: string, element: CartridgeItem, activeFile?: string): CartridgeItem => {
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
const createFileElement = (fileName: string, element: CartridgeItem): CartridgeItem => {
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
	private lastFileOpened = 'NO_FILE';
	private workspaceFolder : string;
	/**
	 * Load the cartridges within the curren workspace
	 * @param {string} workspaceFolder The absolute path of the workspace
	 * @param {string} activeFile The absolute path of the file to expand the tree on
	 */
	constructor(private workspaceFolders$$: Observable<Observable<WorkspaceFolder>>, private activeFile?: string) {
		this.workspaceFolder = (workspace.workspaceFolders && workspace.workspaceFolders[0].uri.fsPath) || '';

		workspace.onDidOpenTextDocument((textDocument) => {
			// Use startswith since editor for some reason also send the .git file.
			if (textDocument.uri.scheme === 'file' && !textDocument.fileName.startsWith(this.lastFileOpened) ) {
				this.lastFileOpened = textDocument.fileName;
				this.refresh(textDocument.fileName);
			}
		});
	}
	static initialize(context: ExtensionContext, workspaceFolders$$: Observable<Observable<WorkspaceFolder>>) {

		// add CartridgesView
		const cartridgesView = new CartridgesView(
			workspaceFolders$$,
			(window.activeTextEditor) ? window.activeTextEditor.document.fileName : undefined
		);

		context.subscriptions.push(commands.registerCommand('extension.prophet.command.refresh.cartridges', () => {
			if (cartridgesView) {
				cartridgesView.refresh(
					((window.activeTextEditor) ? window.activeTextEditor.document.fileName : undefined));
			}
		}));

		context.subscriptions.push(commands.registerCommand('extension.prophet.command.create.folder', (cartridgeDirectoryItem) => {
			if (cartridgesView) {
				cartridgesView.createDirectory(cartridgeDirectoryItem);
			}
		}));

		context.subscriptions.push(commands.registerCommand('extension.prophet.command.create.file', (cartridgeFileItem) => {
			if (cartridgesView) {
				cartridgesView.createFile(cartridgeFileItem);
			}
		}));


		context.subscriptions.push(commands.registerCommand('extension.prophet.command.create.cartridge', () => {
			const folderOptions = {
				prompt: 'Folder: ',
				placeHolder: 'Folder to create cartridge in (leave empty if none)'
			};

			const cartridgeOptions = {
				prompt: 'Cartridgename: ',
				placeHolder: 'your_cartridge_id'
			};

			window.showInputBox(folderOptions).then(folderValue => {
				window.showInputBox(cartridgeOptions).then(value => {
					if (!value) { return; }
					if (!folderValue) { folderValue = ''; }

					//new CartridgeCreator(rootPath).createCartridge(value.trim().replace(' ', '_'), folderValue.trim());

					if (cartridgesView) {
						cartridgesView.refresh((window.activeTextEditor) ? window.activeTextEditor.document.fileName : undefined);
					}
					// fixme
					// if (uploader.isUploadEnabled()) {
					// 	uploader.loadUploaderConfig(rootPath, context);
					// }
				});
			});
		}));


		context.subscriptions.push(
			window.registerTreeDataProvider('cartridgesView', cartridgesView)
		);
	}

	/**
	 * Refresh the tree data.
	 * @param {string} file The absolute path of the file to expand the tree on
	 */
	refresh(file?: string): void {
		if (file) {
			cartridgeViewOutputChannel.appendLine('\nRefreshing workspace with active file: ' + file);
			this.activeFile = file;
		}
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: CartridgeItem): TreeItem {
		return element;
	}

	async getChildren(element?: CartridgeItem): Promise<CartridgeItem[]> {
		if (!workspace.workspaceFolders) {
			window.showInformationMessage('No dependency in empty workspace.');
			return [];
		}

		if (element) {
			return await this.getCartridgeItemFilesOrFolders(element);
		} else {
			const exist = await pathExists(this.workspaceFolder);

			if (exist) {
				return await this.getCartridgesInWorkspace(this.workspaceFolder);
			} else {
				window.showInformationMessage('No workspace!');
				return [];
			}
		}
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
					return createFolderElement(dir, element, activeFile);
				}).concat(files.map(
					function (file) {
						return createFileElement(file, element);
					}
				));
		}

		return [CartridgeItem.NoFiles];
	}

	/**
	 * Fetches all cartridges within the given path (should be the workspace root)
	 * @param workspaceFolder The absolute path to the workspace root
	 */
	private async getCartridgesInWorkspace(workspaceFolder: string): Promise<CartridgeItem[]> {
		const activeFile = this.activeFile;

		const workspaceExists = await pathExists(workspaceFolder);

		if (workspaceExists) {
			cartridgeViewOutputChannel.appendLine('Found workspace.');

			const packagePath = join(workspaceFolder, 'package.json');

			const paths = await getPathsCartridges(workspaceFolder, packagePath);

			if (paths && paths.length) {
				cartridgeViewOutputChannel.appendLine('Found extra cartridges in package file paths:\n\t*' + paths.join('\n\t*'));
			}

			const filesUri = await workspace.findFiles(new RelativePattern(workspaceFolder, '/**/.project'), '{node_modules,.git}');

			let projectFiles = filesUri.map(file => file.fsPath);
			cartridgeViewOutputChannel.appendLine('Found catridges in workspace:\n\t*' + projectFiles.join('\n\t*'));

			if (projectFiles.length) {
				projectFiles = [...new Set(projectFiles.concat(paths))];

				const filteredProjectFiles = await filterAsync(projectFiles, checkIfCartridge);

				return await Promise.all(
					filteredProjectFiles.map(
						projectFile => toCardridge(projectFile, activeFile)
					)
				);

			} else {
				return [new CartridgeItem('No cartridges found in this workspace.',
					CartridgeItemType.Cartridge,
					workspaceFolder,
					TreeItemCollapsibleState.None)];
			}
		} else {
			return [CartridgeItem.NoCartridges];
		}
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
