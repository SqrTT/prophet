/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const initialConfigurations = {
    version: '0.0.1',
    configurations: [
        {
            type: 'mock',
            request: 'launch',
            name: 'Mock Debug',
            program: '${workspaceRoot}/readme.md',
            stopOnEntry: true
        }
    ]
};
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('extension.prophet.getProgramName', config => {
        return vscode.window.showInputBox({
            placeHolder: "Please enter the name of a markdown file in the workspace folder",
            value: "readme.md"
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.prophet.provideInitialConfigurations', () => {
        return [
            '// Use IntelliSense to learn about possible Mock debug attributes.',
            '// Hover to view descriptions of existing attributes.',
            JSON.stringify(initialConfigurations, null, '\t')
        ].join('\n');
    }));
}
exports.activate = activate;
function deactivate() {
    // nothing to do
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map