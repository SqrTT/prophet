import { IConnection, TextDocuments, Diagnostic, Range, Position, DiagnosticSeverity } from "vscode-languageserver";
import * as acorn from 'acorn';
import * as acornWalk from 'acorn-walk';
import { URI } from "vscode-uri";
import { sep, dirname } from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { insertParents } from "../serverUtils";

const clientSideFolders = ['js', 'client', 'default', 'static', 'node_modules'];
function isBackEndFile(filePath: string) {
	const pathArr = dirname(filePath).split(sep);
	return filePath.endsWith('.js') && pathArr.every(folder => !clientSideFolders.includes(folder));
}

function hasGlobalScope(parent) {
	while (parent) {
		if (parent.type === 'FunctionExpression' || parent.type === 'FunctionDeclaration') {
			return false;
		} else {
			parent = parent.parent;
		}
	}
	return true;
}

function doValidate(connection: IConnection, document: TextDocument): void {
	const diagnostics: Diagnostic[] = [];

	try {
		const astNode = acorn.parse(document.getText(), {
			ecmaVersion: 5,
			allowReserved: false,
			locations: true
		});

		insertParents(astNode);
		const globalVariablesRequire = new Map<string, any>();
		const globallyUsedIdentifiers = new Set<string>();

		acornWalk.simple(astNode, {
			CallExpression(activeNode: any, state) {
				if (activeNode?.type === 'CallExpression'
					&& activeNode.callee.name === 'require'
					&& activeNode.arguments.length
					&& activeNode.arguments[0].type === 'Literal'
					&& !activeNode.arguments[0].value.startsWith('dw/')
				) {
					const isGlobal = hasGlobalScope(activeNode);

					const variableName = activeNode?.parent?.id?.name;
					if (isGlobal && variableName) {
						globalVariablesRequire.set(variableName, activeNode);
					}
				}
			},
			Identifier(node: any, state) {
				if (node.parent.type !== 'VariableDeclarator' && hasGlobalScope(node) && node?.name) {
					globallyUsedIdentifiers.add(node?.name);
				}
			}
		});

		diagnostics.push(...Array.from(globalVariablesRequire.entries())
			.filter(([variableName]) => !globallyUsedIdentifiers.has(variableName))
			.map(([variableName, activeNode]) => {
				return Diagnostic.create(
					Range.create(
						Position.create(activeNode.loc.start.line - 1, activeNode.loc.start.column),
						Position.create(activeNode.loc.end.line - 1, activeNode.loc.end.column)
					),
					`Prohibited global usage of require unless module is used globally. '${variableName}' should be declared inside function.`,
					DiagnosticSeverity.Warning
				)
			})
		);

	} catch (e) {

		if (
			e instanceof SyntaxError
			&& e?.message?.includes('The keyword ')
			&& (e.message.includes(`'const'`) || e.message.includes(`'let'`))
		) {
			const error = e as any;
			diagnostics.push(Diagnostic.create(
				Range.create(
					Position.create(error.loc.line - 1, error.loc.column),
					Position.create(error.loc.line - 1, error.loc.column + (e.message.includes(`'let'`) ? 3 : 5))
				),
				e.message + '. Avoid usage `const` or `let` since Rhino version of this keyword don\'t follow standard and may bring issues. For instance, `const` has lexical scope instead of block',
				DiagnosticSeverity.Error,
				undefined
			));
		} else if (e instanceof SyntaxError) {
			const error = e as any;
			diagnostics.push(Diagnostic.create(
				Range.create(
					Position.create(error.loc.line - 1, error.loc.column),
					Position.create(error.loc.line - 1, 1000)
				),
				e.message,
				DiagnosticSeverity.Error,
				undefined
			));
		}
	}
	connection.sendDiagnostics({ uri: document.uri, diagnostics, version: document.version });
}

export function activate(connection: IConnection, documents: TextDocuments<TextDocument>) {
	// A text document has changed. Validate the document.
	documents.onDidChangeContent((event) => {
		const document = event.document;
		const fsPath = URI.parse(document.uri).fsPath;

		if (isBackEndFile(fsPath)) {
			doValidate(connection, document);
		}
	});
}
