
import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection,
	TextDocuments, InitializeResult,
	WorkspaceFolder,
	TextDocumentSyncKind
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getIndexes, activateIndexes } from './scriptServer/features/indexes';

// Create a connection for the server. The connection uses Node's IPC as a transport
const connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
const console = connection.console;

activateIndexes(connection);

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents = new TextDocuments(TextDocument);
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let workspaceFolders: WorkspaceFolder[] = [];

connection.onInitialized(() => {

	connection.workspace.onDidChangeWorkspaceFolders((event) => {
		connection.workspace.getWorkspaceFolders().then(_workspaceFolders => {
			workspaceFolders = _workspaceFolders || [];

			workspaceFolders = workspaceFolders.filter(workspaceFolder => workspaceFolder.uri.includes('file:'))


		});
		connection.console.log('Workspace folder change event received');
	});

	import('./scriptServer/features/gotoLocation').then(gotoLocation => {
		gotoLocation.activate(connection, documents);
	});
	import('./scriptServer/features/competitions').then(competitions => {
		competitions.activate(connection, documents);
	});
	import('./scriptServer/features/diagnostics').then(linting => {
		linting.activate(connection, documents);
	});
});



connection.onInitialize((params): InitializeResult => {

	connection.console.log('Script Server init...' + JSON.stringify(params.workspaceFolders));

	// The VS Code htmlhint settings have changed. Revalidate all documents.
	// connection.onDidChangeConfiguration((args) => {
	// 	onDidChangeConfiguration(connection, documents, args);
	// });


	workspaceFolders = params.workspaceFolders || [];

	workspaceFolders = workspaceFolders.filter(workspaceFolder => workspaceFolder.uri.includes('file:'))

	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: TextDocumentSyncKind.Full,
			//hoverProvider: true
			//documentLinkProvider: {
			//	resolveProvider: true
			//},
			//documentRangeFormattingProvider: true,
			//documentHighlightProvider: true,
			//hoverProvider: true,
			definitionProvider: true,
			completionProvider: {
				resolveProvider: false
			},
			//documentSymbolProvider: true,
			workspace: {
				workspaceFolders: {
					supported: true,
					changeNotifications: true
				}
			}
		}
	}

});


connection.onNotification('get.controllers.list', () => {
	getIndexes().controllers.then(controllers => {
		const endpoints: any[] = [];
		controllers.forEach(cartridgeControllers => {
			cartridgeControllers.controllers.forEach(controller => {
				controller.endpoints.forEach(endpoint => {
					endpoints.push({
						fsPath: controller.fsPath,
						start: endpoint.start,
						end: endpoint.end,
						mode: endpoint.mode,
						name: controller.name + '-' + endpoint.name,
						cartridgeName: cartridgeControllers.name,
						startPosition: endpoint.startPosition,
						endPosition: endpoint.endPosition,
						endShow: endpoint.endShow,
						startShow: endpoint.startShow
					});
				});
			});
		});
		connection.sendNotification('get.controllers.list.result', { endpoints });
	});
});


// A text document has changed. Validate the document.
documents.onDidChangeContent((event) => {
	// the contents of a text document has changed
	//validateTextDocument(connection, event.document);
});


// Listen on the connection
connection.listen();

process.once('uncaughtException', err => {
	console.error(String(err) + '\n' + err.stack);
	connection.dispose();
	process.exit(-1);
})

