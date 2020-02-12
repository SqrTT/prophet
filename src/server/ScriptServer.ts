
import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection,
	TextDocuments, InitializeResult,
	WorkspaceFolder,
	TextDocumentSyncKind,
	CompletionList,
	CompletionItemKind,
	InsertTextFormat,
	TextEdit,
	Range
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import classesList from './langServer/reqClassList';
import * as acornLoose from 'acorn-loose';
//import * as acorn from 'acorn';
import * as acornWalk from 'acorn-walk';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));


// Create a simple text document manager. The text document manager
// supports full document sync only
let documents = new TextDocuments(TextDocument);
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

function insertParents(ast) {
	(function walk(node, parent) {
		node.parent = parent;

		Object.keys(node).forEach(function (key) {
			if (key === 'parent') return;

			var child = node[key];
			if (Array.isArray(child)) {
				child.forEach(function (c) {
					if (c && typeof c.type === 'string') {
						walk(c, node);
					}
				});
			} else if (child && typeof child.type === 'string') {
				walk(child, node);
			}
		});
	})(ast, undefined);
}


connection.onCompletion(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		connection.console.error('125: Unable find document')
		return;
	}
	const ast = await acornLoose.parse(document.getText(), { ecmaVersion: 5 });
	const offset = document.offsetAt(params.position);

	if (ast && offset !== undefined) {
		const findNodeAround: Function = acornWalk.findNodeAround;
		const nodeRequire: any = findNodeAround(ast, offset, () => true)?.node;

		insertParents(ast);

		if (
			nodeRequire &&
			nodeRequire.type === 'Literal' &&
			nodeRequire.parent &&
			nodeRequire.parent.type === 'CallExpression' &&
			nodeRequire.parent.callee.name === 'require'
		) {
			function getReplaceRange(replaceStart: number, replaceEnd: number = offset): Range {
				if (replaceStart > offset) {
					replaceStart = offset;
				}
				if (!document) {
					throw new Error('no document');
				}
				return {
					start: document.positionAt(replaceStart),
					end: document.positionAt(replaceEnd)
				};
			}
			const result: CompletionList = {
				isIncomplete: false,
				items: classesList.map(api => {
					return {
						label: api,
						kind: CompletionItemKind.Value,
						textEdit: TextEdit.replace(
							getReplaceRange(nodeRequire.start + 1, nodeRequire.end - 1),
							api
						),
						insertTextFormat: InsertTextFormat.PlainText
					}
				})
			};
			connection.console.info('completion for require');
			return result;
		}
	}
});

// A text document has changed. Validate the document.
documents.onDidChangeContent((event) => {
	// the contents of a text document has changed
	//validateTextDocument(connection, event.document);
});



// Listen on the connection
connection.listen();

process.once('uncaughtException', err => {
	console.log(err);
	connection.console.error(String(err) + '\n' + err.stack);
	connection.dispose();
	process.exit(-1);
})

