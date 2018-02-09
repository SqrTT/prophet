
'use strict';
import { join } from 'path';
import { workspace, ExtensionContext, commands, window, Uri, WorkspaceConfiguration, debug, WorkspaceFolder } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { CartridgesView } from './providers/CartridgesView';

import { existsSync } from 'fs';
import { createServer } from 'http';
import Uploader from "./providers/Uploader";
import { ProphetConfigurationProvider } from './providers/ConfigurationProvider';
import {Observable} from 'rxjs/Observable';
import 'rxjs/add/operator/takeUntil';

function getWorkspaceFolders$$(context: ExtensionContext) : Observable<Observable<WorkspaceFolder>>{
	return new Observable(observer => {

		function createObservableWorkspace(workspaceFolder : WorkspaceFolder) {
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

	const workspaceFolders$$ = getWorkspaceFolders$$(context);

	// const configuration = workspace.getConfiguration('extension.prophet');
	// var ismlLanguageServer = createIsmlLanguageServer(context, configuration);
	// context.subscriptions.push(ismlLanguageServer.start());

	function subscribe2disposable($: Observable<any>) {
		const subscr = $.subscribe();

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

}

function initializeToolkitActions() {
	return new Observable<never>(observeer => {
		const server = createServer(function (req, res) {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end('ok');
			if (req.url && req.url.includes('/target') && workspace.rootPath) {
				const reqUrl = req.url.split('/target=')[1].split('&')[0]; // fixme
				const filePaths = [
					join(workspace.rootPath, ...reqUrl.split('/')),
					join(workspace.rootPath, 'cartridges', ...reqUrl.split('/')),
					join(workspace.rootPath, ...reqUrl.split('/')).replace('.js', '.ds'),
					join(workspace.rootPath, 'cartridges', ...reqUrl.split('/')).replace('.js', '.ds')
				];
				const filePath = filePaths.find(existsSync);
				if (filePath) {
					commands.executeCommand('vscode.open', Uri.file(filePath)).then(() => {
						// DO NOTHING
					}, err => {
						window.showErrorMessage(err);
					});
				}
				else {
					window.showWarningMessage(`Unable to find '${reqUrl}'`);
				}
			}
		});
		server.once('error', err => {
			if (err instanceof Error) {
				window.showWarningMessage(`Unable open port for browsers files, probably other instance or Digital Studio is opened. Error: ${err.message}`);
				server.close();
			}
		});


		server.listen(60606);

		return () => {
			server.close();
		}
	});

}

/**
 * Create the ISML language server with the proper parameters
 *
 * @param context the extension context
 * @param configuration the extension configuration
 */
function createIsmlLanguageServer(context: ExtensionContext, configuration: WorkspaceConfiguration) {
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
	const htmlConf = workspace.getConfiguration('html.format');
	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: (configuration.get('ismlServer.activateOn') as string[] || ['isml']).map(type => ({
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
	});

	return ismlLanguageServer;

}

export function deactivate() {
	// nothing to do
}
