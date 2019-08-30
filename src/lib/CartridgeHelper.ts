'use strict';
import { workspace, RelativePattern } from 'vscode';
import { exists, readFile, existsSync, mkdirSync, writeFile, mkdir, createReadStream } from 'fs';
import { join, sep } from 'path';
import { pathExists } from '../lib/FileHelper';
import { Observable } from 'rxjs';

/**
 * Checks whether or not an Eclipse project file is a Salesforce project.
 * @param projectFile The absolute path to the file location of the Eclipse project file.
 */
export const checkIfCartridge = (projectFile: string): Promise<boolean> => {
	return checkIfCartridge$(projectFile).toPromise();
};

function readFileByLine(filePath: string) : Observable<string>{
	return Observable.fromPromise(import('readline')).flatMap(readline => {
		return new Observable((obs) => {
			const lineReader = readline.createInterface({
				input: createReadStream(filePath)
			});

			lineReader.on('line', (line) => { obs.next(line) });

			lineReader.once('close', () => { obs.complete() });

			lineReader.once('error', (err) => { obs.error(err) });

			return () => {
				lineReader.removeAllListeners();
				lineReader.close();
			}
		});
	})

}

//data.
export const checkIfCartridge$ = (projectFile: string) : Observable<boolean> => {
	return readFileByLine(projectFile)
		.first(line => line.includes('com.demandware.studio.core.beehiveNature'), () => true, false);
};

/**
 * Checks for cartridges in the paths variable. (References to other cartridges)
 * @param workspaceFolder The current workspaceroot
 * @param packageFile The path to the package file.
 */
export const getPathsCartridges = (workspaceFolder, packageFile): Promise<string[]> => {
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
						const paths: string[] = [];

						if (packageFileObject.paths) {
							for (var key in packageFileObject.paths) {
								paths.push(packageFileObject.paths[key]);
							}
						};

						paths.forEach(function (path) {
							if (typeof path === 'string') {
								promises.push(new Promise((resolvePathProjects, rejectPathProjects) => {
									exists(join(workspaceFolder, path), packagePathExists => {
										if (packagePathExists) {
											workspace
												.findFiles(new RelativePattern(workspaceFolder, '.project'))
												.then(filesUri => {
													resolvePathProjects(filesUri.map(fileUri => fileUri.fsPath))
												}, rejectPathProjects);
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
	constructor(private workspaceFolder: string) {

	}

	createCartridge(name, directory) {
		this.createMainDirectory(name, directory);
		this.createProjectFiles(name, directory);
		this.createCartridgeDirectories(name, directory);
		this.createPropertiesFile(name, directory);
	}

	createMainDirectory(name, directory) {
		const pathToCreate = join(this.workspaceFolder, directory, name);

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

	/**
	 * Creates the cartridge folder structure
	 * 
	 * @param name name of the cartridge to create
	 * @param directory the directory the cartridge is created in
	 */
	createCartridgeDirectories(name : string, directory : string) {
		const directoriesToCreate = [
			'controllers',
			'experience',
			'experience/pages',
			'experience/components',
			'forms',
			'forms/default',
			'pipelines',
			'scripts',
			'static',
			'static/default',
			'templates',
			'templates/default',
			'templates/resources',
			'webreferences',
			'webreferences2'
		];

		mkdir(join(this.workspaceFolder, directory, name, 'cartridge'), undefined, () => {});
		for (let i = 0; i < directoriesToCreate.length; i++) {
			mkdir(join(this.workspaceFolder, directory, name, 'cartridge', ...(directoriesToCreate[i].split('/'))), undefined, () => {});
		}

	}

	createProjectFiles(name, directory) {
		writeFile(join(this.workspaceFolder, directory, name, '.project'),
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

		writeFile(join(this.workspaceFolder, directory, name, '.tern-project'),
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

		writeFile(join(this.workspaceFolder, directory, name, 'cartridge', name + '.properties'),
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
