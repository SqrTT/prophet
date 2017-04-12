/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

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

export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.commands.registerCommand('extension.prophet.provideInitialConfigurations', () => {
		return [
			'// Use IntelliSense to learn about possible Prophet attributes.',
			'// Hover to view descriptions of existing attributes.',
			JSON.stringify(initialConfigurations, null, '\t')
		].join('\n');
	}));
}

export function deactivate() {
	// nothing to do
}
