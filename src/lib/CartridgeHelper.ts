'use strict';
import * as glob from 'glob';
import { TreeItemCollapsibleState } from 'vscode';
import { exists, readFile, existsSync, mkdirSync, writeFile, mkdir, } from 'fs';
import { dirname, join, basename, sep } from 'path';
import { CartridgeItem, CartridgeItemType } from './CartridgeItem';
import { pathExists } from '../lib/FileHelper';

/**
 * Checks whether or not an Eclipse project file is a Salesforce project.
 * @param projectFile The absolute path to the file location of the Eclipse project file.
 */
export const checkIfCartridge = (projectFile: string): Promise<boolean> => {
	return new Promise((resolve, reject) => {
		readFile(projectFile, 'UTF-8', (err, data) => {
			if (err) {
				reject(err);
			} else {
				// Check the file for demandware package (since the file is not that big no need for a DOM parser)
				resolve(data.includes('com.demandware.studio.core.beehiveNature'));
			}
		});
	});
};

/**
 * Creates a CartridgeItem based on the project file.
 * @param projectFile The absolute path to the file location of the Eclipse project file.
 * @param activeFile The active file in the current workspace.
 */
export const toCardridge = (projectFile: string, activeFile?: string): Promise<CartridgeItem> => {
	return new Promise((resolve, reject) => {
		const projectFileDirectory = dirname(projectFile);
		const projectName = basename(projectFileDirectory);

		let subFolder = '';
		exists(join(projectFileDirectory, 'cartridge'), (existsDirectory) => {
			if (existsDirectory) {
				subFolder = 'cartridge';
			}

			const actualCartridgeLocation = join(projectFileDirectory, subFolder);

			resolve(new CartridgeItem(
				projectName || 'Unknown project name', CartridgeItemType.Cartridge,
				actualCartridgeLocation,
				(activeFile && activeFile.startsWith(actualCartridgeLocation))
					? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed));
		});
	});
};

/**
 * Checks for cartridges in the paths variable. (References to other cartridges)
 * @param workspaceRoot The current workspaceroot
 * @param packageFile The path to the package file.
 */
export const getPathsCartridges = (workspaceRoot, packageFile): Promise<string[]> => {
	return new Promise((resolve, reject) => {
		pathExists(packageFile).then(packageExists => {
			if (packageExists) {
				readFile(packageFile, 'UTF-8', (error, data) => {
					if (error) {
						reject('Error reading package file.')
					}

					const packageFileObject = JSON.parse(data);

					if (packageFileObject.paths) {
						const promises: Promise<string[]>[] = [];
						const paths : string[] = [];
						
						if (packageFileObject.paths) {
							for (var key in packageFileObject.paths) {
								paths.push(packageFileObject.paths[key]);
							}
						};

						paths.forEach(function (path) {
							if (typeof path === 'string') {
								promises.push(new Promise((resolvePathProjects, rejectPathProjects) => {
									exists(join(workspaceRoot, path), packagePathExists => {
										if (packagePathExists) {
											glob('**/.project', {
												cwd: join(workspaceRoot, path),
												root: join(workspaceRoot, path),
												nodir: true,
												follow: false,
												absolute: true,
												ignore: ['**/node_modules/**', '**/.git/**']
											}, (globError, projectFiles: string[]) => {
												if (globError) { rejectPathProjects(globError); };
												resolvePathProjects(projectFiles);
											});
										} else {
											resolvePathProjects([]);
										}
									});
								}));
							}
						});

						Promise.all(promises).then(result => {
							resolve([].concat(result.concat.apply([], result)));
						}, error => {
							reject('Exception processing package paths: ' + error);
						});
					} else {
						resolve([]);
					}
				});
			} else {
				resolve([]);
			}
		});
	});
};

/**
 * A helper class to create cartridges.
 *
 * Note: This is currently a class to make it extensible, could be usefull to do things to a newly created cartridge.
 */
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
		const pathToCreate = join(this.workspaceRoot, directory, name);

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
		const directoriesToCreate = ['controllers',
			'forms',
			'pipelines',
			'scripts',
			'static',
			'templates',
			'webreferences',
			'webreferences2'];

		mkdir(join(this.workspaceRoot, directory, name, 'cartridge'));
		for (let i = 0; i < directoriesToCreate.length; i++) {
			mkdir(join(this.workspaceRoot, directory, name, 'cartridge', directoriesToCreate[i]));
		}

	}

	createProjectFiles(name, directory) {
		writeFile(join(this.workspaceRoot, directory, name, '.project'),
			`<?xml version='1.0' encoding='UTF-8'?>
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
					return err;
				}
			});

		writeFile(join(this.workspaceRoot, directory, name, '.tern-project'),
			`{
    'ecmaVersion': 5,
    'plugins': {
        'guess-types': {
        },
        'outline': {
        },
        'demandware': {
        }
    }
}'
`      , function (err) {
				if (err) {
					return err;
				}
			});
	}

	createPropertiesFile(name, directory) {
		const day = {
			1: 'Mon',
			2: 'Tue',
			3: 'Wed',
			4: 'Thu',
			5: 'Fri',
			6: 'Sat',
			7: 'Sun'
		};

		const month = {
			1: 'Jan',
			2: 'Feb',
			3: 'Mar',
			4: 'Apr',
			5: 'May',
			6: 'Jun',
			7: 'Jul',
			8: 'Aug',
			9: 'Sep',
			10: 'Oct',
			11: 'Nov',
			12: 'Dec',
		};

		const currentDateTime = new Date();
		const timeString = day[currentDateTime.getDay()] + ' '
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
					return err;
				}
			});
	}
}
