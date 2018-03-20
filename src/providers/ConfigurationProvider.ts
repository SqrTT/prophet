
'use strict';

import * as vscode from 'vscode';

// import { join, isAbsolute, dirname } from 'path';
// import * as fs from 'fs';


const initialConfigurations = {
	version: '0.1.0',
	configurations: [
		{
			'type': 'prophet',
			'request': 'launch',
			'name': 'Attach to Sandbox'
		}
	]
};

export class ProphetConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Returns an initial debug configuration based on contextual information, e.g. package.json or folder.
	 */
	provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration[]> {
		return  initialConfigurations.configurations;
	}

    // TODO: add fallback for lookup dw.json config
	// /**
	//  * Try to add all missing attributes to the debug configuration being launched.
	//  */
	// resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {

	// }
}
