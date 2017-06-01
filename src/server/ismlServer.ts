
// //http://localhost:60606/target=/app_storefront_core_ext/cartridge/templates/default/components/header/headermenu.isml&count=0
// //http://localhost:60606/target=/app_storefront_controllers/cartridge/controllers/Home.js&start=IncludeHeaderMenu&count=1

// import {
// 	IPCMessageReader, IPCMessageWriter,
// 	createConnection, IConnection,
// 	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity, 
// 	InitializeParams, InitializeResult, RequestHandler, TextDocumentPositionParams, Hover, ResponseError, ErrorCodes
// } from 'vscode-languageserver';

// // Create a connection for the server. The connection uses Node's IPC as a transport
// let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// // Create a simple text document manager. The text document manager
// // supports full document sync only
// let documents: TextDocuments = new TextDocuments();
// // Make the text document manager listen on the connection
// // for open, change and close text document events
// documents.listen(connection);

// // After the server has started the client sends an initialize request. The server receives
// // in the passed params the rootPath of the workspace plus the client capabilities. 
// let workspaceRoot: string | undefined;
// connection.onInitialize((params): InitializeResult => {
// 	connection.console.log('isml server init');
// 	if (params.rootPath) {
// 		workspaceRoot = params.rootPath;
// 		return {
// 			capabilities: {
// 				// Tell the client that the server works in FULL text document sync mode
// 				textDocumentSync: documents.syncKind,
// 				hoverProvider: true
// 				}
// 			}
// 	} else {
// 		return {
// 			capabilities: {

// 			}
// 		}
// 	}
// });

// connection.onHover((textDocumentPosition: TextDocumentPositionParams) => {
// 	connection.console.log(JSON.stringify(textDocumentPosition));


// 	return new ResponseError(ErrorCodes.UnknownErrorCode, 'no info');
// });

// // Listen on the connection
// connection.listen();

// process.once('uncaughtException', err => {
// 	connection.console.error(err);
// 	connection.dispose();
// 	process.exit(-1);
// })
