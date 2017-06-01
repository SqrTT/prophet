/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as path from 'path';
import { workspace, Disposable, ExtensionContext, commands, window } from 'vscode';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';

import * as http from 'http';
import {existsSync} from 'fs';


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

export function activate(context: ExtensionContext) {

	context.subscriptions.push(commands.registerCommand('extension.prophet.provideInitialConfigurations', () => {
		return [
			'// Use IntelliSense to learn about possible Prophet attributes.',
			'// Hover to view descriptions of existing attributes.',
			JSON.stringify(initialConfigurations, null, '\t')
		].join('\n');
	}));


	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('out', 'server', 'ismlServer.js'));
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
		documentSelector: ['isml'],
		synchronize: {
			// Synchronize the setting section 'languageServerExample' to the server
			configurationSection: 'ismlLanguageServer',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			//fileEvents: workspace.createFileSystemWatcher('**/.')
		}
	}
	
	// Create the language client and start the client.
	//let disposable = new LanguageClient('ismlLanguageServer', 'ISML Language Server', serverOptions, clientOptions).start();
	
	// Push the disposable to the context's subscriptions so that the 
	// client can be deactivated on extension deactivation
	//context.subscriptions.push(disposable);


	/// open files from browser
console.log('runned server');
	var server = http.createServer(function (req, res) {
		res.writeHead(200, {'Content-Type': 'text/plain'});
 		res.end('ok');

		if (req.url && req.url !== '/favicon.ico' && workspace.rootPath) {
			var reqUrl = req.url.split('/target=')[1].split('&')[0]; // fixme

			var filePaths = [
				path.join(workspace.rootPath, ...reqUrl.split('/')),
				path.join(workspace.rootPath, 'cartridges', ...reqUrl.split('/')),
				path.join(workspace.rootPath, ...reqUrl.split('/')).replace('.js', '.ds'),
				path.join(workspace.rootPath, 'cartridges', ...reqUrl.split('/')).replace('.js', '.ds')
			];

			console.log(JSON.stringify(filePaths));

			var filePath = filePaths.find(filename => existsSync(filename));

			if (filePath) {
				workspace.openTextDocument(filePath).then((textDocument) => {
					window.showTextDocument(textDocument);
				}, err => {
					window.showErrorMessage(err);
				});
			}
///home/tolik/git/ecom-fnw/cartridges/app_storefront_controllers/cartridge/controllers/Home.js
///home/tolik/git/ecom-fnw/cartridges/app_storefront_controllers/cartridge/controllers/Home.ds
			
		}

	});
	server.listen(60606);

	//server.close();
}

export function deactivate() {
	// nothing to do
}
