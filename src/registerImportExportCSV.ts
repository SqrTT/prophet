import { join, sep } from 'path';
import { workspace, ExtensionContext, commands, window, Uri, RelativePattern } from 'vscode';
import { promises } from 'fs';
import { reduce } from 'rxjs/operators';
import { findFiles } from './lib/FileHelper';
import { getOrderedCartridges } from './extensionScriptServer';
import { parse } from './server/scriptServer/propertiesParser';
import { getLineOffsets, positionAt } from './server/getLineOffsets';
import { ICartridgeProperties, IProperty } from './server/scriptServer/serverUtils';

 function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
	return value !== null && value !== undefined;
}
export function registerImportExportCSV(context: ExtensionContext) {
	context.subscriptions.push(commands.registerCommand('extension.prophet.command.export.properties.to.csv', async () => {

		const outputPath = await window.showSaveDialog({
			filters: {
				'CSV': ['csv']
			},
			saveLabel: 'Export properties to cvs file...'
		});

		if (outputPath && workspace.workspaceFolders && workspace.workspaceFolders.length) {
			const preferences = (await Promise.all(workspace.workspaceFolders.filter(wrk => wrk.uri.scheme === 'file').map(wrk => findFiles({
				base: wrk.uri.fsPath,
				pattern: '**/preferences.xml'
			}).pipe(reduce((acc, val) => {
				return acc.concat(val);
			}, [] as Uri[])).toPromise()))).filter(Boolean);

			const preferencesFlat = ([] as Uri[]).concat(...preferences);

			const sitesLocales = (await Promise.all(preferencesFlat.map(async (preferenceUri) => {
				const fileContent = (await workspace.fs.readFile(preferenceUri)).toString();
				const matches = (/= ?"SiteLocales" ?>(.+?)<\/ ?preference>/g).exec(fileContent);

				if (matches && matches[1]) {
					return matches[1].split(':');
				}
			})));

			const sitesLocalesUniq = new Set<string>();
			sitesLocales.forEach(locales => {
				if (locales) {
					locales.forEach(locale => {
						sitesLocalesUniq.add(locale);
						sitesLocalesUniq.add(locale.split('_')[0]);
					});
				}
			});

			const sitesLocalesUniqSorted = Array.from(sitesLocalesUniq).sort((a, b) => a.length - b.length);

			const cartridges = await getOrderedCartridges(workspace.workspaceFolders);

			if (cartridges && cartridges.length) {
				const orderedCartridgesWithProperties = (await Promise.all(cartridges.map(async (cartridge) => {
					if (cartridge.fsPath) {
						const files = await findFiles(new RelativePattern(cartridge.fsPath, 'cartridge/templates/resources/*.properties'))
							.pipe(reduce((acc, val) => {
								return acc.concat(val);
							}, [] as Uri[])).toPromise();

						if (files.length) {
							return {
								name: cartridge.name,
								fsPath: Uri.file(cartridge.fsPath).toString(),
								files: files.map(file => ({
									name: file.fsPath.split(sep).join('/').split('/cartridge/templates/resources/').pop()?.replace('.properties', ''),
									fsPath: Uri.file(file.fsPath).toString()
								}))
							};
						}
					}
				}))).filter(Boolean);
				const orderedCartridgesWithPropertiesFiltered = orderedCartridgesWithProperties.filter(notEmpty);

				const uniqProperties = new Set<string>();

				orderedCartridgesWithPropertiesFiltered.forEach(cartridge => {
					if (cartridge) {
						cartridge.files.forEach(file => {
							if (file.name) {
								const sections = file.name.split('_');
								if (sections.length && sections[0]) {
									uniqProperties.add(sections[0]);
								}
							}
						});
					}
				});
				const cartridgesProperties = await Promise.all(orderedCartridgesWithPropertiesFiltered.map(async (cartridge) => {
					const cartridgeControllers: ICartridgeProperties = {
						name: cartridge.name,
						fsPath: cartridge.fsPath,
						properties: new Map()
					};
					for (const file of cartridge.files) {
						if (file.name) { // ignore locale specific translations, yet
							try {
								const fileName = Uri.parse(file.fsPath).fsPath;
								const fileContent = await promises.readFile(fileName, 'utf8');
								if (fileContent) {
									const records = parse(fileContent);
									const property: IProperty = {
										fsPath: file.fsPath,
										name: file.name,
										linesCount: getLineOffsets(fileContent).length,
										records: new Map()
									};
									records.forEach(record => {
										property.records.set(record.recordName, {
											value: record.value,
											startPosition: positionAt(record.startPos, fileContent),
											endPosition: positionAt(record.endPos, fileContent)
										});
									});
									cartridgeControllers.properties.set(file.name, property);
								}
							}
							catch (e) {
								console.error('Error parse properties file: \n' + JSON.stringify(e, null, '    '));
							}
						}
					}
					return cartridgeControllers;
				}));

				const csvToWrite = [
					['PropertyFile', 'Key', 'default', ...sitesLocalesUniqSorted]
				];
				function getAllKeys(file: string) {
					const keys = new Set<string>();

					cartridgesProperties.forEach(cartridgesProperty => {
						cartridgesProperty.properties.forEach((v, key) => {
							if (['', ...sitesLocalesUniqSorted].some(k => v.name === (k ? file + '_' + k : file))) {
								v.records.forEach((_, key) => {
									keys.add(key);
								});
							};
						});
					});
					return Array.from(keys);
				}
				function getValueForKeyInLocale(file: string, key: string, locale: string) {
					const loc = locale ? file + '_' + locale : file;

					for (const cartridgesProperty of cartridgesProperties) {
						for (const [name, property] of cartridgesProperty.properties) {
							if (name === loc) {
								for (const [recordName, record] of property.records) {
									if (recordName === key) {
										return record.value;
									}
								}
							}
						}
					}
					return '';
				}
				for (const uniqProperty of uniqProperties) {
					const keysOf = getAllKeys(uniqProperty);

					for (const keyOf of keysOf) {
						const recordToSave = [
							uniqProperty,
							keyOf,
							getValueForKeyInLocale(uniqProperty, keyOf, ''),
							...(sitesLocalesUniqSorted.map(locale => getValueForKeyInLocale(uniqProperty, keyOf, locale)))
						];

						csvToWrite.push(recordToSave);
					}
				}
				function needsQuote(str: string): boolean {
					return str.includes(',') || str.includes('\n') || str.includes('"');
				}
				function quoteField(field: string): string {
					return `"${field.replace(/"/g, '""')}"`;
				}
				var enc = new TextEncoder();
				await workspace.fs.writeFile(outputPath, enc.encode(csvToWrite.map(r => {
					return r.map(col => {
						return needsQuote(col) ? quoteField(col) : col;
					}).join(',');
				}).join('\n')));
			}
		}
	}));

	context.subscriptions.push(commands.registerCommand('extension.prophet.command.import.csv.to.properties', async () => {
		const inputPath = await window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: {
				'CSV': ['csv']
			},
			openLabel: 'Import cvs file...'
		});


		// ref: http://stackoverflow.com/a/1293163/2343
		// This will parse a delimited string into an array of
		// arrays. The default delimiter is the comma, but this
		// can be overriden in the second argument.
		function CSVToArray(strData, strDelimiter) {
			// Check to see if the delimiter is defined. If not,
			// then default to comma.
			strDelimiter = (strDelimiter || ",");

			// Create a regular expression to parse the CSV values.
			var objPattern = new RegExp(
				(
					// Delimiters.
					"(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +

					// Quoted fields.
					"(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +

					// Standard fields.
					"([^\"\\" + strDelimiter + "\\r\\n]*))"
				),
				"gi"
			);


			// Create an array to hold our data. Give the array
			// a default empty first row.
			var arrData: string[][] = [[]];

			// Create an array to hold our individual pattern
			// matching groups.
			var arrMatches: RegExpExecArray | null = null;


			// Keep looping over the regular expression matches
			// until we can no longer find a match.
			while (arrMatches = objPattern.exec(strData)) {

				// Get the delimiter that was found.
				var strMatchedDelimiter = arrMatches[1];

				// Check to see if the given delimiter has a length
				// (is not the start of string) and if it matches
				// field delimiter. If id does not, then we know
				// that this delimiter is a row delimiter.
				if (strMatchedDelimiter.length &&
					strMatchedDelimiter !== strDelimiter) {

					// Since we have reached a new row of data,
					// add an empty row to our data array.
					arrData.push([]);

				}

				var strMatchedValue: string | undefined;

				// Now that we have our delimiter out of the way,
				// let's check to see which kind of value we
				// captured (quoted or unquoted).
				if (arrMatches[2]) {

					// We found a quoted value. When we capture
					// this value, unescape any double quotes.
					strMatchedValue = arrMatches[2].replace(
						new RegExp("\"\"", "g"),
						"\""
					);

				}
				else {

					// We found a non-quoted value.
					strMatchedValue = arrMatches[3];

				}


				// Now that we have our value string, let's add
				// it to the data array.
				arrData[arrData.length - 1].push(strMatchedValue);
			}

			// Return the parsed data.
			return (arrData);
		}

		if (inputPath && inputPath.length && workspace.workspaceFolders && workspace.workspaceFolders.length) {

			const cartridges = await getOrderedCartridges(workspace.workspaceFolders);

			if (cartridges && cartridges.length) {
				const selected = await window.showQuickPick(cartridges.map(cartridge => cartridge.name), {
					placeHolder: 'Select cartridge to unpack csv'
				});

				if (selected) {
					const selectedCartridge = cartridges.find(cartridge => cartridge.name === selected);
					const selectedCartridgePath = selectedCartridge?.fsPath;
					if (!selectedCartridgePath) {
						return;
					}

					const fileContent = (await workspace.fs.readFile(inputPath[0])).toString();

					const parsedContent = CSVToArray(fileContent, ',');

					const [csvTitle, ...csvBody] = parsedContent;

					const uniqProperties = new Set<string>();

					csvBody.forEach(record => {
						uniqProperties.add(record[0]);
					});

					const [, , , ...sitesLocalesUniq] = csvTitle;

					function getRows(uniqProperty: string, localeIdx: number) {
						return csvBody.filter(row => row[0] === uniqProperty).map(row => {
							return [row[1], row[localeIdx]];
						});
					}

					for (const uniqProperty of uniqProperties) {
						['', ...sitesLocalesUniq].forEach((uniqLocale, idx) => {
							const filename = uniqLocale ? uniqProperty + '_' + uniqLocale : uniqProperty;

							const localeRows = getRows(uniqProperty, idx + 2);

							const localeRowsWithValue = localeRows.filter(row => row[1]);

							if (localeRowsWithValue && localeRowsWithValue.length) {
								const fullFilePath = join(selectedCartridgePath, 'cartridge', 'templates', 'resources', filename + '.properties');

								const contentToWrite = localeRowsWithValue.map(r => r.join('=')).join('\n');
								var enc = new TextEncoder();

								workspace.fs.writeFile(Uri.parse(fullFilePath), enc.encode(contentToWrite));
							}
						});
					}
				}
			}
		}
	}));
}
