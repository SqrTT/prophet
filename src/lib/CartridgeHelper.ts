'use strict';
import { TreeItemCollapsibleState } from 'vscode';
import { exists, readFile, existsSync, mkdirSync, writeFile, mkdir,  } from 'fs';
import { dirname, join, basename, sep } from 'path';
import CartridgeItem from './CartridgeItem';

export const checkIfCartridge = (projectFile: string): Promise<boolean> => {
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

export const toCardridge = (projectFile: string, activeFile?: string): Promise<CartridgeItem> => {
    return new Promise((resolve, reject) => {
        let projectFileDirectory = dirname(projectFile);
        const projectName = basename(projectFileDirectory);

        let subFolder = ''
        exists(join(projectFileDirectory, 'cartridge'), (exists) => {
            if (exists) {
                subFolder = 'cartridge';
            }

            let actualCartridgeLocation = join(projectFileDirectory, subFolder);

            resolve(new CartridgeItem(
                projectName || 'Unknown project name', 'cartridge',
                actualCartridgeLocation,
                (activeFile && activeFile.startsWith(actualCartridgeLocation))
                    ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed));
        })
    });
}

export class CartridgeCreator {
    constructor(private workspaceRoot: string) {

    }

    createCartridge(name, directory) {
        this.createMainDirectory(name, directory);
        this.createProjectFiles(name, directory);
        this.createCartridgeDirectories(name, directory);
        this.createPropertiesFile(name, directory);
    }

    createMainDirectory(name, directory) {
        let pathToCreate = join(this.workspaceRoot, directory, name);

        pathToCreate
            .split(sep)
            .reduce((currentPath, folder) => {
                currentPath += folder + sep;
                if (!existsSync(currentPath)) {
                    mkdirSync(currentPath);
                }
                return currentPath;
            }, '');
    }

    createCartridgeDirectories(name, directory) {
        let directoriesToCreate = ['controllers', 'forms', 'pipelines', 'scripts', 'static', 'templates', 'webreferences', 'webreferences2'];

        mkdir(join(this.workspaceRoot, directory, name, 'cartridge'));
        for (let i = 0; i < directoriesToCreate.length; i++) {
            mkdir(join(this.workspaceRoot, directory, name, 'cartridge', directoriesToCreate[i]));
        }

    }

    createProjectFiles(name, directory) {
        writeFile(join(this.workspaceRoot, directory, name, '.project'),
            `<?xml version="1.0" encoding="UTF-8"?>
<projectDescription>
    <name>${name}</name>
    <comment></comment>
    <projects>
    </projects>
    <buildSpec>
        <buildCommand>
            <name>com.demandware.studio.core.beehiveElementBuilder</name>
            <arguments>
            </arguments>
        </buildCommand>
    </buildSpec>
    <natures>
        <nature>com.demandware.studio.core.beehiveNature</nature>
    </natures>
</projectDescription>
`           , function (err) {
                if (err) {
                    return console.log(err);
                }
            });

        writeFile(join(this.workspaceRoot, directory, name, '.tern-project'),
            `{
    "ecmaVersion": 5,
    "plugins": {
        "guess-types": {
        
        },
        "outline": {
        
        },
        "demandware": {
        
        }
    }
}'
`      , function (err) {
                if (err) {
                    return console.log(err);
                }
            });
    }

    createPropertiesFile(name, directory) {
        var day = {
            1: 'Mon',
            2: 'Tue',
            3: 'Wed',
            4: 'Thu',
            5: 'Fri',
            6: 'Sat',
            7: 'Sun'
        };

        var month = {
            1: "Jan",
            2: "Feb",
            3: "Mar",
            4: "Apr",
            5: "May",
            6: "Jun",
            7: "Jul",
            8: "Aug",
            9: "Sep",
            10: "Oct",
            11: "Nov",
            12: "Dec",
        };

        let currentDateTime = new Date();
        let timeString = day[currentDateTime.getDay()] + ' '
            + month[currentDateTime.getMonth()] + ' '
            + currentDateTime.getDate() + ' '
            + currentDateTime.getHours() + ':'
            + currentDateTime.getMinutes() + ':'
            + currentDateTime.getSeconds() + ' CEST ' + currentDateTime.getFullYear();

        writeFile(join(this.workspaceRoot, directory, name, 'cartridge', name + '.properties'),
            `## cartridge.properties for cartridge ${name}
#${timeString}
demandware.cartridges.${name}.multipleLanguageStorefront=true
demandware.cartridges.${name}.id=${name}`
            , function (err) {
                if (err) {
                    return console.log(err);
                }
            });
    }
}

