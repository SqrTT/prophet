import { ExtensionContext, window, WorkspaceConfiguration, workspace, RelativePattern, Uri, commands, QuickPickItem, WorkspaceFolder } from "vscode";
import { ServerOptions, TransportKind, LanguageClientOptions, LanguageClient } from "vscode-languageclient";
import { join, sep, basename } from "path";
import { findFiles, getDWConfig, readFile, getCartridgesFolder } from "./lib/FileHelper";
import { reduce } from "rxjs/operators";

let isOrderedCartridgesWarnShown = false;
export async function getOrderedCartridges(workspaceFolders: WorkspaceFolder[]) {
	let cartridgesPath = workspace.getConfiguration('extension.prophet').get('cartridges.path') as string;

	if (!cartridgesPath || !cartridgesPath.trim()) {
		const dwConfig = await getDWConfig(workspaceFolders);

		if (dwConfig.cartridgesPath) {
			cartridgesPath = dwConfig.cartridgesPath;
		} else if (dwConfig.cartridge && dwConfig.cartridge.length) {
			cartridgesPath = dwConfig.cartridge.join(':');
		} else {
			const sitesXmlFile = await Promise.all(workspaceFolders.map(
				workspaceFolder => findFiles(new RelativePattern(workspaceFolder, '**/site.xml'), 1).toPromise()
			));
			const sitesXmlFileFiltered = sitesXmlFile.filter(Boolean);

			if (sitesXmlFileFiltered.length) {
				const siteBuffer = await readFile(sitesXmlFileFiltered[0].fsPath);
				const site = siteBuffer.toString();

				const match = (/<custom-cartridges>(.*?)<\/custom-cartridges>/ig).exec(site);
				if (match && match[1]) {
					cartridgesPath = match[1];
				}
			}
		}
	}

	if (cartridgesPath) {
		const cartridges = cartridgesPath.split(':');

		const cartridgesFolders = await Promise.all(workspaceFolders.map(
			workspaceFolder => getCartridgesFolder(workspaceFolder)
				.pipe(reduce<string, string[]>((acc, r) => acc.concat(r), [] as string[])).toPromise()
		));

		const cartridgesFoldersFlat = ([] as string[]).concat(...cartridgesFolders);

		return cartridges.map(cartridgeName => {
			return {
				name: cartridgeName,
				fsPath: cartridgesFoldersFlat.find(cartridgesFolder => basename(cartridgesFolder) === cartridgeName)
			};
		});
	} else if (!isOrderedCartridgesWarnShown) {
		isOrderedCartridgesWarnShown = true;
		window.showInformationMessage('Cartridges path is not detected automatically, related features will be disabled. Consider specifying in your dw.json as \'cartridgesPath\' property, please.');
	}
}
/**
 * Create the Script language server with the proper parameters
 *
 * @param context the extension context
 * @param configuration the extension configuration
 */
export function createScriptLanguageServer(context: ExtensionContext, configuration: WorkspaceConfiguration = workspace.getConfiguration('extension.prophet', null)) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(join('dist', 'scriptServer.js'));
	// The debug options for the server
	const debugOptions = { execArgv: ['--nolazy', '--inspect=6040'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{
			scheme: 'file',
			pattern: '**/cartridge/{scripts,controllers,models}/**/*.js'
		}, {
			scheme: 'file',
			pattern: '**/cartridge/templates/default/**/*.isml'
		}],
		synchronize: {
			// Synchronize the setting section 'languageServerExample' to the server
			//configurationSection: 'extension.prophet',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			// fileEvents: workspace.createFileSystemWatcher('**/*.isml'),
			//fileEvents: workspace.createFileSystemWatcher('**/.htmlhintrc')
		}
	};

	// Create the language client and start the client.
	const scriptLanguageClient = new LanguageClient('dwScriptLanguageServer', 'Script Language Server', serverOptions, clientOptions);
	//context.subscriptions.push(new SettingMonitor(ismlLanguageClient, 'extension.prophet.htmlhint.enabled').start());

	scriptLanguageClient.onReady().then(async () => {

		if (workspace.workspaceFolders) {
			const orderedCartridges = await getOrderedCartridges(workspace.workspaceFolders);

			if (orderedCartridges && orderedCartridges.length) {
				const orderedCartridgesWithFiles = await Promise.all(orderedCartridges.map(async cartridge => {
					if (cartridge.fsPath) {
						const files = await findFiles(new RelativePattern(cartridge.fsPath, '**/{scripts,controllers,models}/**/*.js'))
							.pipe(reduce((acc, val) => {
								return acc.concat(val);
							}, [] as Uri[])).toPromise();

						return {
							name: cartridge.name,
							fsPath: Uri.file(cartridge.fsPath).toString(),
							files: files.map(file => ({
								path: file.fsPath.replace(cartridge.fsPath || '', '').split(sep).join('/'),
								fsPath: Uri.file(file.fsPath).toString()
							}))
						};
					}
				}));

				const orderedCartridgesWithFilesFiltered = orderedCartridgesWithFiles.filter(Boolean);

				if (orderedCartridgesWithFilesFiltered.length) {
					scriptLanguageClient.sendNotification('cartridges.files', { list: orderedCartridgesWithFilesFiltered });
				}

				const orderedCartridgesWithTemplates = await Promise.all(orderedCartridges.map(async cartridge => {
					if (cartridge.fsPath) {
						const files = await findFiles(new RelativePattern(cartridge.fsPath, 'cartridge/templates/default/**/*.isml'))
							.pipe(reduce((acc, val) => {
								return acc.concat(val);
							}, [] as Uri[])).toPromise();

						if (files.length) {
							return {
								name: cartridge.name,
								fsPath: Uri.file(cartridge.fsPath).toString(),
								files: files.map(file => ({
									path: file.fsPath.split(sep).join('/').split('/cartridge/templates/default/').pop()?.replace('.isml', ''),
									fsPath: Uri.file(file.fsPath).toString()
								}))
							};
						}
					}
				}));

				const orderedCartridgesWithTemplatesFiltered = orderedCartridgesWithTemplates.filter(Boolean);

				if (orderedCartridgesWithTemplatesFiltered.length) {
					scriptLanguageClient.sendNotification('cartridges.templates', { list: orderedCartridgesWithTemplatesFiltered });
				}

				const orderedCartridgesWithControllers = await Promise.all(orderedCartridges.map(async cartridge => {
					if (cartridge.fsPath) {
						const files = await findFiles(new RelativePattern(cartridge.fsPath, 'cartridge/controllers/*.js'))
							.pipe(reduce((acc, val) => {
								return acc.concat(val);
							}, [] as Uri[])).toPromise();

						if (files.length) {
							return {
								name: cartridge.name,
								fsPath: Uri.file(cartridge.fsPath).toString(),
								files: files.map(file => ({
									path: file.fsPath.split(sep).join('/').split('/cartridge/').pop()?.replace('.isml', ''),
									fsPath: Uri.file(file.fsPath).toString()
								}))
							};
						}
					}
				}));

				const orderedCartridgesWithControllersFiltered = orderedCartridgesWithControllers.filter(Boolean);

				if (orderedCartridgesWithControllersFiltered.length) {
					scriptLanguageClient.sendNotification('cartridges.controllers', {
						list: orderedCartridgesWithControllersFiltered
					});
				}

				context.subscriptions.push(commands.registerCommand('extension.prophet.command.controllers.find', async () => {
					scriptLanguageClient.sendNotification('get.controllers.list');
				}));
				scriptLanguageClient.onNotification('get.controllers.list.result', ({ endpoints }) => {
					interface QuickPickTargetedItem extends QuickPickItem {
						target: any
					}
					const quickPickItems: QuickPickTargetedItem[] = (endpoints || []).map(endpoint => {
						return {
							label: endpoint.name,
							description: endpoint.mode + ' - ' + endpoint.cartridgeName,
							target: endpoint
						}
					});

					window.showQuickPick(quickPickItems).then(selected => {
						if (selected) {
							commands.executeCommand(
								'vscode.open',
								Uri.parse(selected.target.fsPath).with({
									fragment: selected.target.startPosition.line + 1
								})
							);
						}
					});
				});

				orderedCartridges.forEach(cartridge => {
					if (cartridge.fsPath) {
						const watcher = workspace.createFileSystemWatcher(
							new RelativePattern(cartridge.fsPath, 'cartridge/controllers/*.js'));

						context.subscriptions.push(watcher);

						['Change', 'Create', 'Delete'].forEach(action => {
							context.subscriptions.push(watcher['onDid' + action](uri => {
								if (uri.scheme === 'file') {
									scriptLanguageClient.sendNotification('cartridges.controllers.modification', {
										action,
										cartridge: cartridge,
										uri: uri.toString()
									});
								}
							}));
						});

					}
				});

				const orderedCartridgesWithProperties = await Promise.all(orderedCartridges.map(async cartridge => {
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
				}));

				const orderedCartridgesWithPropertiesFiltered = orderedCartridgesWithProperties.filter(Boolean);

				if (orderedCartridgesWithPropertiesFiltered.length) {
					scriptLanguageClient.sendNotification('cartridges.properties', { list: orderedCartridgesWithPropertiesFiltered });
				}
			}
		}
	}).catch(err => {
		window.showErrorMessage(JSON.stringify(err));
	});

	return scriptLanguageClient;
}
