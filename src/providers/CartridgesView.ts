'use strict';
import { TreeItemCollapsibleState, EventEmitter, TreeDataProvider, Event, window, TreeItem, Uri, workspace, ViewColumn, ExtensionContext, commands, RelativePattern } from 'vscode';

import { join, basename, dirname } from 'path';
import { mkdir, open, close } from 'fs';

import { getDirectories, getFiles, pathExists } from '../lib/FileHelper';
import { checkIfCartridge, getPathsCartridges, CartridgeCreator } from '../lib/CartridgeHelper';
import { filterAsync } from '../lib/CollectionUtil';
import { GenericTreeItem, DirectoryTreeItem, FileTreeItem, CartridgeTreeItem, WorkspaceTreeItem } from '../lib/CartridgeViewsItem';



const cartridgeViewOutputChannel = window.createOutputChannel('Cartridges List (Prophet)');



/**
 * Creates a CartridgeItem based on the project file.
 * @param projectFile The absolute path to the file location of the Eclipse project file.
 * @param activeFile The active file in the current workspace.
 */
export async function createCardridgeElement(projectFile: string, activeFile?: string): Promise<CartridgeTreeItem> {
	const projectFileDirectory = dirname(projectFile);
	const projectName = basename(projectFileDirectory);

	let subFolder = '';
	const existsDirectory = await pathExists(join(projectFileDirectory, 'cartridge'));

	if (existsDirectory) {
		subFolder = 'cartridge';
	}

	const actualCartridgeLocation = join(projectFileDirectory, subFolder);

	return new CartridgeTreeItem(
		projectName || 'Unknown project name',
		actualCartridgeLocation,
		(activeFile && activeFile.startsWith(actualCartridgeLocation))
			? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed);
};

/**
 * Creates a folder CartridgeItem.
 * @param {string} directory The directory name
 * @param {GenericTreeItem} element  The parent element
 * @param {string} activeFile The path to the currently active file in the workspace
 */
const createFolderElement = (directory: string, element: GenericTreeItem, activeFile?: string): DirectoryTreeItem => {
	const actualFolderLocation = join(element.location, directory);
	return new DirectoryTreeItem(
		directory,
		actualFolderLocation,
		(activeFile && activeFile.startsWith(actualFolderLocation))
			? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed);
};

/**
 * Creates a file CartridgeItem
 * @param {string} fileName The file name
 * @param {GenericTreeItem} element The parent element
 */
const createFileElement = (fileName: string, element: GenericTreeItem): GenericTreeItem => {
	return new FileTreeItem(fileName,
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
export class CartridgesView implements TreeDataProvider<GenericTreeItem> {
	private _onDidChangeTreeData: EventEmitter<GenericTreeItem | undefined> = new EventEmitter<GenericTreeItem | undefined>();
	readonly onDidChangeTreeData: Event<GenericTreeItem | undefined> = this._onDidChangeTreeData.event;
	private lastFileOpened = 'NO_FILE';
	/**
	 * Load the cartridges within the curren workspace
	 * @param {string} workspaceFolder The absolute path of the workspace
	 * @param {string} activeFile The absolute path of the file to expand the tree on
	 */
	constructor(private activeFile?: string) {
		//this.workspaceFolder = (workspace.workspaceFolders && workspace.workspaceFolders[0].uri.fsPath) || '';

		workspace.onDidOpenTextDocument((textDocument) => {
			// Use startswith since editor for some reason also send the .git file.
			if (textDocument.uri.scheme === 'file' && !textDocument.fileName.startsWith(this.lastFileOpened)) {
				this.lastFileOpened = textDocument.fileName;
				this.refresh(textDocument.fileName);
			}
		});
	}
	static initialize(context: ExtensionContext) {

		// add CartridgesView
		const cartridgesView = new CartridgesView(
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
					if (workspace.workspaceFolders && workspace.workspaceFolders.length > 1) {
						window.showWorkspaceFolderPick().then(workspaceFolder => {
							if (workspaceFolder && typeof folderValue === 'string') {
								new CartridgeCreator(workspaceFolder.uri.fsPath).createCartridge(value.trim().replace(' ', '_'), folderValue.trim());
								if (cartridgesView) {
									cartridgesView.refresh((window.activeTextEditor) ? window.activeTextEditor.document.fileName : undefined);
								}
							}
						})
					} else if (workspace.workspaceFolders) {
						new CartridgeCreator(workspace.workspaceFolders[0].uri.fsPath).createCartridge(value.trim().replace(' ', '_'), folderValue.trim());

						if (cartridgesView) {
							cartridgesView.refresh((window.activeTextEditor) ? window.activeTextEditor.document.fileName : undefined);
						}
					}
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

	getTreeItem(element: GenericTreeItem): TreeItem {
		return element;
	}

	async getChildren(element?: GenericTreeItem): Promise<GenericTreeItem[]> {
		if (!workspace.workspaceFolders) {
			window.showInformationMessage('No dependency in empty workspace.');
			return [];
		}

		if (element) {
			return await this.getCartridgeItemFilesOrFolders(element);
		} else {
			if (workspace.workspaceFolders.length === 1) {
				const exist = await pathExists(workspace.workspaceFolders[0].uri.fsPath);

				if (exist) {
					return await this.getCartridgesInWorkspace(workspace.workspaceFolders[0].uri.fsPath);
				} else {
					window.showInformationMessage('No workspace!');
					return [];
				}
			} else {
				const fileWorkspaceFolders = workspace.workspaceFolders.filter(workspaceFolder => workspaceFolder.uri.scheme === 'file');
				return await fileWorkspaceFolders.map(workspaceFolder =>
					new WorkspaceTreeItem(
						workspaceFolder.name,
						workspaceFolder.uri.fsPath,
						TreeItemCollapsibleState.Expanded
					)
				);
			}

		}
	}

	/**
	 * Fetches all folders and files that are children of the passed element. This function can be used recursively.
	 * @param {GenericTreeItem} element The parent element
	 */
	private async getCartridgeItemFilesOrFolders(element: GenericTreeItem): Promise<GenericTreeItem[]> {

		if (element instanceof WorkspaceTreeItem) {
			return this.getCartridgesInWorkspace(element.location);
		} else {
			const files = await getFiles(element.location);
			const directories = await getDirectories(element.location);
			const activeFile = this.activeFile;

			if (files.length || directories.length) {
				return directories
					.map(dir => createFolderElement(dir, element, activeFile))
					.concat(files.map(
						file => createFileElement(file, element)
					));
			}

			return [GenericTreeItem.NoFiles];
		}
	}

	/**
	 * Fetches all cartridges within the given path (should be the workspace root)
	 * @param workspaceFolder The absolute path to the workspace root
	 */
	private async getCartridgesInWorkspace(workspaceFolder: string): Promise<GenericTreeItem[]> {
		const activeFile = this.activeFile;

		const workspaceExists = await pathExists(workspaceFolder);

		if (workspaceExists) {
			cartridgeViewOutputChannel.appendLine('Found workspace.');

			const packagePath = join(workspaceFolder, 'package.json');

			const paths = await getPathsCartridges(workspaceFolder, packagePath);

			if (paths && paths.length) {
				cartridgeViewOutputChannel.appendLine('Found extra cartridges in package file paths:\n\t*' + paths.join('\n\t*'));
			}

			const filesUri = await workspace.findFiles(new RelativePattern(workspaceFolder, '**/.project'));

			let projectFiles = filesUri.map(file => file.fsPath);
			cartridgeViewOutputChannel.appendLine('Found catridges in workspace:\n\t*' + projectFiles.join('\n\t*'));

			if (projectFiles.length) {
				projectFiles = [...new Set(projectFiles.concat(paths))];

				const filteredProjectFiles = await filterAsync(projectFiles, checkIfCartridge);

				return await Promise.all(
					filteredProjectFiles.map(
						projectFile => createCardridgeElement(projectFile, activeFile)
					)
				);

			} else {
				return [new CartridgeTreeItem('No cartridges found in this workspace.',
					workspaceFolder,
					TreeItemCollapsibleState.None)];
			}
		} else {
			return [GenericTreeItem.NoCartridges];
		}
	}

	public createFile(cartridgeFileItem: GenericTreeItem) {
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

	public createDirectory(cartridgeDirectoryItem: GenericTreeItem) {
		const folderCreationOptions = {
			prompt: 'Name: '
		};

		window.showInputBox(folderCreationOptions).then(folderValue => {
			if (folderValue) {
				mkdir(join(cartridgeDirectoryItem.location, folderValue), err => {
					if (err) {
						window.showErrorMessage(`Exception while creating directory! ( ${err} )`);
					} else {
						this.refresh();
					}
				});
			}
		});
	}
}
