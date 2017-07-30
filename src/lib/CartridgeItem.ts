'use strict';
import { TreeItemCollapsibleState, TreeItem, Command } from 'vscode';
import { join, extname } from 'path';

export default class CartridgeItem extends TreeItem {
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