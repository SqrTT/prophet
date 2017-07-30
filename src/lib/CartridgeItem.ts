'use strict';
import { TreeItemCollapsibleState, TreeItem, Command } from 'vscode';
import { join, extname } from 'path';

/**
 * A TreeItem to show cartridge elements in the explorer view.
 * @prop {string} name The display name of the TreeItem (shown to the end-user)
 * @prop {CartridgeItemType} type The CartridgeItem type
 * @prop {string} location The absolute location of the folder/file
 * @prop {TreeItemCollapsibleState} collapsibleState Whether or not the TreeItem is collapseable and if its expanded orn not.
 * @prop {Command} command The command to execute when the TreeItem is clicked
 */
export class CartridgeItem extends TreeItem {
    fileExtension: string;

    constructor(
        public readonly name: string,
        public readonly type: CartridgeItemType,
        public readonly location: string,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly command?: Command
    ) {
        super(name, collapsibleState);

        this.location = location;
        this.type = type;

        if (this.type === CartridgeItemType.File) {
            this.fileExtension = extname(this.name).replace('.', '');
            this.iconPath = join(__filename, '..', '..', '..', 'images', 'resources', this.fileExtension + '.svg');
            this.contextValue = 'file';
        } else if (this.type === CartridgeItemType.Folder) {
            this.contextValue = 'folder';
        } else if (this.type === CartridgeItemType.Cartridge) {
            this.contextValue = 'cartridge';
            this.iconPath = join(__filename, '..', '..', '..', 'images', 'resources', 'cartridge.svg');
        } else {
            this.contextValue = 'uknown';
        }
    }
}

/*
    The type of the CartridgeItem
*/
export enum CartridgeItemType {
    /**
     * The CartridgeItem is a file of a cartridge
     */
    File = 'cartridge-item-file',
    /**
     * The CartridgeItem is a subfolder of a cartridge
     */
    Folder = 'cartridge-item-folder',
    /**
     * The CartridgeItem is a cartridge folder (project folder)
     */
    Cartridge = 'cartridge'
}

export default CartridgeItem;
