
'use strict';
import {Observable} from 'rxjs/Observable';
import {join} from 'path';
import { workspace, Disposable, ExtensionContext, commands, window, Uri, OutputChannel } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';

import {existsSync} from 'fs';
import {createServer} from "http";
import * as glob from 'glob';


const initialConfigurations = {
	version: '0.1.0',
	configurations: [
		{
			"type": "prophet",
			"request": "launch",
			"name": "Attach to Sandbox",
			"hostname": "*.demandware.net",
			"username": "<username>",
			"password": "<password>",
			"codeversion": "version1",
			"cartridgeroot": "auto",
			"workspaceroot": "${workspaceRoot}"
		}
	]
};

var uploaderSubscription;
var outputChannel : OutputChannel;

export function activate(context: ExtensionContext) {
	const configuration = workspace.getConfiguration('extension.prophet');
	context.subscriptions.push(commands.registerCommand('extension.prophet.provideInitialConfigurations', () => {
		return [
			'// Use IntelliSense to learn about possible Prophet attributes.',
			'// Hover to view descriptions of existing attributes.',
			JSON.stringify(initialConfigurations, null, '\t')
		].join('\n');
	}));

	outputChannel = window.createOutputChannel('Prophet Uploader');

	context.subscriptions.push(outputChannel);

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(join('out', 'server', 'ismlServer.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };
	
	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run : { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}
	
	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: (configuration.get('ismlServer.activateOn') as string[] || ['isml'] ).map(type => ({
			language: type,
			scheme: 'file'
		})),
		synchronize: {
			// Synchronize the setting section 'languageServerExample' to the server
			configurationSection: 'ismlLanguageServer',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			//fileEvents: workspace.createFileSystemWatcher('**/*.isml')
		}
	}
	
	// Create the language client and start the client.
	let ismlLanguageServer = new LanguageClient('ismlLanguageServer', 'ISML Language Server', serverOptions, clientOptions);
	let disposable = ismlLanguageServer.start();


	ismlLanguageServer.onReady().then(() => {
		ismlLanguageServer.onNotification('isml:selectfiles', (test) => {
			window.showQuickPick(test.data).then(selected => {
				ismlLanguageServer.sendNotification('isml:selectedfile', selected);
			}, err => {
				ismlLanguageServer.sendNotification('isml:selectedfile', undefined);
			});
		});
	})

	
	// Push the disposable to the context's subscriptions so that the 
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	if (workspace.rootPath) {
		/// open files from browser
		var server = createServer(function (req, res) {
			res.writeHead(200, {'Content-Type': 'text/plain'});
			res.end('ok');

			if (req.url && req.url.includes('/target') && workspace.rootPath) {
				var reqUrl = req.url.split('/target=')[1].split('&')[0]; // fixme

				var filePaths = [
					join(workspace.rootPath, ...reqUrl.split('/')),
					join(workspace.rootPath, 'cartridges', ...reqUrl.split('/')),
					join(workspace.rootPath, ...reqUrl.split('/')).replace('.js', '.ds'),
					join(workspace.rootPath, 'cartridges', ...reqUrl.split('/')).replace('.js', '.ds')
				];

				var filePath = filePaths.find(existsSync);

				if (filePath) {
					commands.executeCommand('vscode.open', Uri.file(filePath)).then(() => {
						
					}, err => {
						window.showErrorMessage(err);
					});
				} else {
					window.showWarningMessage(`Unable to find "${reqUrl}"`);
				}
			}

		});
		server.once('error', err => {
			if (err instanceof Error) {
				window.showWarningMessage(`Unable open port for browsers files, probably other instance or Digital Studio is opened. Error: ${err.message}`);
				server.close();
			}
		});
		server.once('listening', () => {
			context.subscriptions.push(
				new Disposable(() => {
					server.close();
				})
			);
		})

		server.listen(60606);
		const rootPath = workspace.rootPath;

		var prevState;
		context.subscriptions.push(workspace.onDidChangeConfiguration(() => {
			const configuration = workspace.getConfiguration('extension.prophet');
			const isUploadEnabled = configuration.get('upload.enabled');

			if (isUploadEnabled !== prevState) {
				prevState = isUploadEnabled;
				if (isUploadEnabled) {
					loadUploaderConfig(rootPath);
				} else {
					if (uploaderSubscription) {
						outputChannel.appendLine(`Stopping`);
						uploaderSubscription.unsubscribe();
						uploaderSubscription = null;
					}
				}
			}

		}));

		context.subscriptions.push(commands.registerCommand('extension.prophet.command.enable.upload', () => {
			loadUploaderConfig(rootPath);
		}));
		context.subscriptions.push(commands.registerCommand('extension.prophet.command.clean.upload', () => {
			loadUploaderConfig(rootPath);
		}));
		context.subscriptions.push(commands.registerCommand('extension.prophet.command.disable.upload', () => {
			if (uploaderSubscription) {
				outputChannel.appendLine(`Stopping`);
				uploaderSubscription.unsubscribe();
				uploaderSubscription = null;
			}
		}));

		const isUploadEnabled = configuration.get('upload.enabled');
		prevState = isUploadEnabled;
		if (isUploadEnabled) {
			loadUploaderConfig(rootPath);
		} else {
			outputChannel.appendLine('Uploader disabled in configuration');
		}

	}
}

function loadUploaderConfig(rootPath) {
	if (uploaderSubscription) {
		uploaderSubscription.unsubscribe();
		uploaderSubscription = null;
		outputChannel.appendLine(`Restarting`);
	} else {
		outputChannel.appendLine(`Starting...`);
	}

	uploaderSubscription = Observable.create(observer => {
		var subscribtion;
		glob('**/dw.json', {
			cwd: rootPath,
			root: rootPath,
			nodir: true,
			follow: false,
			ignore: ['**/node_modules/**', '**/.git/**']
		}, (error, files : string[]) => {
			if (error) {
				observer.error(error);
			} else if (files.length && workspace.rootPath) {
				import('./server/uploadServer').then(function (uploadServer) {
					const configFilename = join(rootPath, files.shift() || '');
					outputChannel.appendLine(`Using config file "${configFilename}"`);

					subscribtion = uploadServer.init(configFilename, outputChannel)
						.subscribe(
						() => {
							// reset counter to zero if success
						},
						err => {
							observer.error(err)
						},
						() => {
							observer.complete();
						}
					);
				});
			} else {
				observer.error('Unable to find "dw.json". Upload cartridges disabled.');
			}
		});
		return () => {
			subscribtion.unsubscribe();
		}
	}).subscribe(
		() => {},
		err => {
			outputChannel.show();
			outputChannel.appendLine(`Error: ${err}`);
		}
	);


}

export function deactivate() {
	// nothing to do
}
