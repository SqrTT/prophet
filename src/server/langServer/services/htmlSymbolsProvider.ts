/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TextDocument, Location, Range, SymbolInformation, SymbolKind} from 'vscode-languageserver-types';
import {HTMLDocument, Node} from '../parser/htmlParser';
//import {TokenType, createScanner, ScannerState} from '../parser/htmlScanner';

export function findDocumentSymbols(document: TextDocument, htmlDocument: HTMLDocument): SymbolInformation[] {
	let symbols = <SymbolInformation[]>[];

	htmlDocument.roots.forEach(node => {
		provideFileSymbolsInternal(document, node, '', symbols)
	});

	return symbols;
}

function provideFileSymbolsInternal(document: TextDocument, node: Node, container: string, symbols: SymbolInformation[]): void {

	let name = nodeToName(node);
	let location = Location.create(document.uri, Range.create(document.positionAt(node.start), document.positionAt(node.end)));
	let symbol = <SymbolInformation> {
		name: name,
		location: location,
		containerName: container,
		kind: <SymbolKind>SymbolKind.Field
	}

	symbols.push(symbol);

	node.children.forEach(child => {
		provideFileSymbolsInternal(document, child, name, symbols);
	});
}


function nodeToName(node: Node): string {
	let name = node.tag;

	if (node.attributes) {
		let id = node.attributes['id'];
		let classes = node.attributes['class'];
		let attrName = node.attributes['name'] || node.attributes['var'] || node.attributes['alias'] || node.attributes['condition'] || node.attributes['template'] ;
		
		if (id) {
			name += `#${id.replace(/[\"\']/g, '')}`;
		}

		if (classes) {
			name += classes.replace(/[\"\']/g, '').split(/\s+/).map(className => `.${className}`).join('');
		}

		if (attrName) {
			name += ` ${attrName.replace(/[\"\'\$\{\}]/g, '')}`;
		}

		if (node.tag === 'isset') {
			name += ` = ${(node.attributes['value'] || '').replace(/[\"\'\$\{\}]/g, '')}`;
		}
	}

	return name;
}