'use strict';
import { TreeItemCollapsibleState, TreeItem, Command } from 'vscode';
import { join, extname } from 'path';


/**
 * A TreeItem to show cartridge elements in the explorer view.
 * @prop {string} name The display name of the TreeItem (shown to the end-user)
 * @prop {string} location The absolute location of the folder/file
 * @prop {TreeItemCollapsibleState} collapsibleState Whether or not the TreeItem is collapseable and if its expanded.
 * @prop {Command} command The command to execute when the TreeItem is clicked
 */
export class GenericTreeItem extends TreeItem {
	public static NoFiles : FileTreeItem;
	public static NoCartridges : CartridgeTreeItem;

	constructor(
		public readonly name: string,
		public readonly location: string,
		public readonly collapsibleState: TreeItemCollapsibleState,
		public readonly command?: Command
	) {
		super(name, collapsibleState);
		this.location = location;
	}
}

export class FileTreeItem extends GenericTreeItem {
	private fileExtension: string;
	constructor(
		public readonly name: string,
		public readonly location: string,
		public readonly collapsibleState: TreeItemCollapsibleState,
		public readonly command?: Command
	) {
		super(name, location, collapsibleState, command);
		this.fileExtension = extname(this.name).replace('.', '');
		this.iconPath = join(__filename, '..', '..', '..', 'images', 'resources', this.fileExtension + '.svg');
	}
}
GenericTreeItem.NoFiles = new FileTreeItem('No files', '', TreeItemCollapsibleState.None);

export class CartridgeTreeItem extends GenericTreeItem {
	constructor(
		public readonly name: string,
		public readonly location: string,
		public readonly collapsibleState: TreeItemCollapsibleState,
		public readonly command?: Command
	) {
		super(name, location, collapsibleState, command);
		this.iconPath = join(__filename, '..', '..', '..', 'images', 'resources', 'cartridge.svg');
	}
}
GenericTreeItem.NoCartridges = new CartridgeTreeItem('No Cartridges', '', TreeItemCollapsibleState.None);

export class WorkspaceTreeItem extends GenericTreeItem {
	constructor(
		public readonly name: string,
		public readonly location: string,
		public readonly collapsibleState: TreeItemCollapsibleState,
		public readonly command?: Command
	) {
		super(name, location, collapsibleState, command);
		this.iconPath = join(__filename, '..', '..', '..', 'images', 'resources', 'txt.svg');// fixme: find better icon
	}
}

export class DirectoryTreeItem extends GenericTreeItem {
	constructor(
		public readonly name: string,
		public readonly location: string,
		public readonly collapsibleState: TreeItemCollapsibleState,
		public readonly command?: Command
	) {
		super(name, location, collapsibleState, command);
		//this.iconPath = join(__filename, '..', '..', '..', 'images', 'resources', 'sandbox.svg');
	}
}

