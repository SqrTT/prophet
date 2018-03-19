
'use strict';
import { join, dirname, sep } from 'path';
import { workspace, ExtensionContext, commands, window, Uri, WorkspaceConfiguration, debug, WorkspaceFolder, RelativePattern } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { CartridgesView } from './providers/CartridgesView';
import { LogsView } from './providers/LogsView';

import { existsSync } from 'fs';
import { createServer, ServerResponse, IncomingMessage } from 'http';
import Uploader from "./providers/Uploader";
import { ProphetConfigurationProvider } from './providers/ConfigurationProvider';
import { Subject, Observable } from 'rxjs';
import { findFiles, getDWConfig, getCartridgesFolder } from './lib/FileHelper';

/**
 * Create the ISML language server with the proper parameters
 *
 * @param context the extension context
 * @param configuration the extension configuration
 */
function createIsmlLanguageServer(context: ExtensionContext, configuration: WorkspaceConfiguration = workspace.getConfiguration('extension.prophet', null)) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(join('out', 'server', 'ismlServer.js'));
	// The debug options for the server
	const debugOptions = { execArgv: ['--nolazy', '--debug=6004'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};
	const htmlConf = workspace.getConfiguration('html.format', null);
	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: (configuration.get('ismlServer.activateOn', ['isml'])).map(type => ({
			language: type,
			scheme: 'file'
		})),
		synchronize: {
			// Synchronize the setting section 'languageServerExample' to the server
			configurationSection: 'ismlLanguageServer',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			// fileEvents: workspace.createFileSystemWatcher('**/*.isml')
		},
		initializationOptions: {
			formatParams: {
				wrapLineLength: htmlConf.get('wrapLineLength'),
				unformatted: htmlConf.get('unformatted'),
				contentUnformatted: htmlConf.get('contentUnformatted'),
				indentInnerHtml: htmlConf.get('indentInnerHtml'),
				preserveNewLines: htmlConf.get('preserveNewLines'),
				maxPreserveNewLines: htmlConf.get('maxPreserveNewLines'),
				indentHandlebars: htmlConf.get('indentHandlebars'),
				endWithNewline: htmlConf.get('endWithNewline'),
				extraLiners: htmlConf.get('extraLiners'),
				wrapAttributes: htmlConf.get('wrapAttributes')
			}

		}
	};

	// Create the language client and start the client.
	const ismlLanguageServer = new LanguageClient('ismlLanguageServer', 'ISML Language Server', serverOptions, clientOptions);

	ismlLanguageServer.onReady().then(() => {
		ismlLanguageServer.onNotification('isml:selectfiles', (test) => {
			const prophetConfiguration = workspace.getConfiguration('extension.prophet');
			const cartPath = String(prophetConfiguration.get('cartridges.path'));

			if (cartPath.trim().length) {
				const cartridges = cartPath.split(':');

				const cartridge = cartridges.find(cartridgeItem =>
					(test.data || []).some(filename => filename.includes(cartridgeItem)));

				if (cartridge) {
					ismlLanguageServer.sendNotification('isml:selectedfile', test.data.find(
						filename => filename.includes(cartridge)
					));
					return;
				}

			}
			window.showQuickPick(test.data).then(selected => {
				ismlLanguageServer.sendNotification('isml:selectedfile', selected);
			}, err => {
				ismlLanguageServer.sendNotification('isml:selectedfile', undefined);
			});
		});
		ismlLanguageServer.onNotification('find:files', ({ searchID, workspacePath, pattern }) => {
			workspace.findFiles(
				new RelativePattern(workspacePath, pattern),
				//'{node_modules,.git}'
			).then(result => {
				ismlLanguageServer.sendNotification('find:filesFound', { searchID, result: (result || []).map(uri => uri.fsPath) });
			})
		});
	}).catch(err => {
		window.showErrorMessage(JSON.stringify(err));
	});

	return ismlLanguageServer;
}

function getWorkspaceFolders$$(context: ExtensionContext): Observable<Observable<WorkspaceFolder>> {
	return new Observable(observer => {

		function createObservableWorkspace(workspaceFolder: WorkspaceFolder) {
			return new Observable<WorkspaceFolder>(wrkObserver => {
				const wrkListener = workspace.onDidChangeWorkspaceFolders(event => {
					try {
						event.removed && event.removed.forEach(removedWrk => {
							if (removedWrk.uri.fsPath === workspaceFolder.uri.fsPath) {
								wrkObserver.complete();
								wrkListener.dispose();
							}
						});
					} catch (e) {
						wrkObserver.error(e);
					}
				});
				wrkObserver.next(workspaceFolder)
				return () => {
					wrkListener.dispose();
				}
			});
		}

		const listener = workspace.onDidChangeWorkspaceFolders(event => {
			event.added.forEach(addWrk => {
				if (addWrk.uri.scheme === 'file') {
					observer.next(createObservableWorkspace(addWrk));
				}
			});
		});

		if (workspace.workspaceFolders) {
			workspace.workspaceFolders.forEach(addWrk => {
				if (addWrk.uri.scheme === 'file') {
					observer.next(createObservableWorkspace(addWrk));
				}
			});
		}

		context.subscriptions.push({
			dispose() {
				observer.complete();
				listener.dispose();
			}
		})
		return () => {
			listener.dispose();
		};
	});
}

export function activate(context: ExtensionContext) {

	// register a configuration provider
	context.subscriptions.push(
		debug.registerDebugConfigurationProvider(
			'prophet',
			new ProphetConfigurationProvider()
		)
	);


	initDebugger();

	const workspaceFolders$$ = getWorkspaceFolders$$(context);

	// const configuration = workspace.getConfiguration('extension.prophet');
	// var ismlLanguageServer = createIsmlLanguageServer(context, configuration);
	// context.subscriptions.push(ismlLanguageServer.start());

	function subscribe2disposable($: Observable<any>) {
		const subscr = $.subscribe(() => { }, err => {
			window.showErrorMessage(JSON.stringify(err));
		});

		context.subscriptions.push({
			dispose() {
				subscr.unsubscribe();
			}
		});

	}

	/// open files from browser
	subscribe2disposable(initializeToolkitActions().takeUntil(workspaceFolders$$.filter(() => false)));

	/// uploader
	Uploader.initialize(context, workspaceFolders$$);

	// CartridgesView
	CartridgesView.initialize(context);

	const dwConfig$$ = workspaceFolders$$.map(workspaceFolder$ => {
		const end$ = new Subject();
		return workspaceFolder$
			.do(() => { }, undefined, () => { end$.next(); end$.complete() })
			.flatMap(workspaceFolder => {
				return findFiles(new RelativePattern(workspaceFolder, '**/dw.json'), 1)
			}).takeUntil(end$);
	});

	subscribe2disposable(LogsView.initialize(commands, context, dwConfig$$).mergeAll());

	context.subscriptions.push(createIsmlLanguageServer(context).start());
}

function initDebugger() {
	debug.onDidReceiveDebugSessionCustomEvent(event => {
		if (event.event === 'prophet.getdebugger.config' && workspace.workspaceFolders) {
			getDWConfig(workspace.workspaceFolders)
				.then(configData => {
					if (workspace.workspaceFolders) {
						return Promise.all(workspace.workspaceFolders.map(
							workspaceFolder => workspace.findFiles(new RelativePattern(workspaceFolder, '**/.project'), '{node_modules,.git}')
						)).then(projects => {
							const flattenProjectsPaths = ([] as Uri[]).concat(...projects).map(project => dirname(project.fsPath));
							if (flattenProjectsPaths.length) {
								return event.session.customRequest('DebuggerConfig', {
									config: configData,
									cartridges: flattenProjectsPaths
								});
							} else {
								return Promise.reject('Unable get cartridges list');
							}
						});
					} else {
						return Promise.reject('Unable detect workspaces');
					}
				}).catch(err => {
					window.showErrorMessage(JSON.stringify(err));
				});
		}
	});
}

interface IServerRequest {
	req: IncomingMessage,
	res: ServerResponse
}


function initializeToolkitActions() {
	return new Observable<IServerRequest>(observeer => {
		const server = createServer((req, res) => { observeer.next({ req, res }) });
		server.once('error', err => {
			if (err instanceof Error) {
				window.showWarningMessage(`Unable open port for browsers files, probably other instance or Digital Studio is opened. Error: ${err.message}`);
				server.close();
			}
			observeer.error(err);
		});

		server.listen(60606);

		return () => {
			server.close();
		}
	}).flatMap(({ req, res }) => {
		if (workspace.workspaceFolders && workspace.workspaceFolders.length) {
			const cartridgesFolders = workspace.workspaceFolders
				.map(workspaceFolder => getCartridgesFolder(workspaceFolder));

			return Observable.merge(...cartridgesFolders)
				.reduce((acc, val) => {
					acc.add(val);
					return acc;
				}, new Set<string>())
				.flatMap(cartridges => {
					res.writeHead(200, { 'Content-Type': 'text/plain' });
					res.end('ok');
					if (req.url && req.url.includes('/target')) {
						const reqUrl = req.url.split('/target=')[1].split('&')[0]; // fixme

						const clientFilePath = convertDebuggerPathToClient(reqUrl, Array.from(cartridges));

						if (clientFilePath) {
							const filePaths = [
								clientFilePath,
								clientFilePath.replace('.js', '.ds'),
							];

							const filePath = filePaths.find(existsSync);
							if (filePath) {
								commands.executeCommand('vscode.open', Uri.file(filePath)).then(() => {
									// DO NOTHING
								}, err => {
									window.showErrorMessage(err);
								});
							} else {
								window.showWarningMessage(`Unable to find '${reqUrl}'`);
							}
						} else {
							window.showWarningMessage(`Unable to find '${reqUrl}'`);
						}
					}

					return Observable.of(1);
				});
		} else {
			return Observable.empty();
		}

	});

}

function convertDebuggerPathToClient(debuggerPath: string, cartridges: string[]): string {
	debuggerPath = debuggerPath.substr(1);
	const debuggerSep = debuggerPath.split('/');
	const cartridgeName = debuggerSep.shift() || '';


	const cartPath = cartridges.find(cartridge => cartridge.endsWith(cartridgeName));

	if (cartPath) {
		const tmp = join(cartPath, debuggerSep.join(sep));
		return tmp;
	} else {
		this.logError("Unable match cartridge");
		return '';
	}

}

export function deactivate() {
	// nothing to do
}

commands.registerCommand('extension.prophet.command.open.documentation', () => {
	commands.executeCommand('vscode.open', Uri.parse('https://documentation.demandware.com'));
});

commands.registerCommand('extension.prophet.command.open.xchange', () => {
	commands.executeCommand('vscode.open', Uri.parse('https://xchange.demandware.com'));
});
