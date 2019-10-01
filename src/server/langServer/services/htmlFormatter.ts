/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { HTMLFormatConfiguration } from '../htmlLanguageService';
import { TextDocument, Range, TextEdit, Position } from 'vscode-languageserver-types';
import { IBeautifyHTMLOptions } from '../beautify/beautify-html';
import { repeat } from '../utils/strings';
import { IConnection } from 'vscode-languageserver';


export function format(document: TextDocument, range: Range, options: HTMLFormatConfiguration, connection: IConnection): TextEdit[] {
	let value = document.getText();
	let includesEnd = true;
	let initialIndentLevel = 0;
	if (range) {
		let startOffset = document.offsetAt(range.start);
		// include all leading whitespace iff at the beginning of the line
		let extendedStart = startOffset;
		while (extendedStart > 0 && isWhitespace(value, extendedStart - 1)) {
			extendedStart--;
		}
		if (extendedStart === 0 || isEOL(value, extendedStart - 1)) {
			startOffset = extendedStart;
		} else {
			// else keep at least one whitespace
			if (extendedStart < startOffset) {
				startOffset = extendedStart + 1;
			}
		}

		// include all following whitespace until the end of the line
		let endOffset = document.offsetAt(range.end);
		let extendedEnd = endOffset;
		while (extendedEnd < value.length && isWhitespace(value, extendedEnd)) {
			extendedEnd++;
		}
		if (extendedEnd === value.length || isEOL(value, extendedEnd)) {
			endOffset = extendedEnd;
		}
		range = Range.create(document.positionAt(startOffset), document.positionAt(endOffset));

		includesEnd = endOffset === value.length;
		value = value.substring(startOffset, endOffset);

		if (startOffset !== 0) {
			let startOfLineOffset = document.offsetAt(Position.create(range.start.line, 0));
			initialIndentLevel = computeIndentLevel(document.getText(), startOfLineOffset, options);
		}
	} else {
		range = Range.create(Position.create(0, 0), document.positionAt(value.length));
	}

	let htmlOptions: IBeautifyHTMLOptions = {
		indent_size: options.insertSpaces ? options.tabSize : 1,
		indent_char: options.insertSpaces ? ' ' : '\t',
		indent_level: initialIndentLevel,
		inline: [],
		wrap_line_length: getFormatOption(options, 'wrapLineLength', 160),
		unformatted: getTagsFormatOption(options, 'unformatted', []),
		content_unformatted: getTagsFormatOption(options, 'contentUnformatted', []),
		indent_inner_html: getFormatOption(options, 'indentInnerHtml', false),
		preserve_newlines: getFormatOption(options, 'preserveNewLines', true),
		max_preserve_newlines: getFormatOption(options, 'maxPreserveNewLines', 32786),
		indent_handlebars: getFormatOption(options, 'indentHandlebars', false),
		end_with_newline: includesEnd && getFormatOption(options, 'endWithNewline', true),
		extra_liners: getTagsFormatOption(options, 'extraLiners', []),
		wrap_attributes: getFormatOption(options, 'wrapAttributes', 'force-expand-multiline'),
		eol: '\n'
	};
	['isscript', 'pre', 'script'].forEach(key => {
		if (htmlOptions.content_unformatted && !htmlOptions.content_unformatted.includes(key)) {
			htmlOptions.content_unformatted.push(key);
		}
	});
	// if (connection) {
	// 	connection.console.log(JSON.stringify(htmlOptions));
	// }

	var html_beautify = require('js-beautify').html;

	let result: string = html_beautify(value, htmlOptions);
	if (initialIndentLevel > 0 && range.start.character === 0) {
		let indent = options.insertSpaces ? repeat(' ', (options.tabSize || 4) * initialIndentLevel) : repeat('\t', initialIndentLevel);
		result = indent + result; // keep the indent
	}

	const eol = htmlOptions.eol || '\n';
	function findStartLine(res: string, index: number) {
		while (res.charAt(index) !== eol && index > 0) {
			index--;
		}
		return index;
	}
	htmlOptions.end_with_newline = false;
	var lastIndex = result.indexOf('<isscript>');
	while (lastIndex > -1) {
		const startPos = lastIndex + 10;
		const endPos = result.indexOf('</isscript>', startPos);

		if (endPos > -1) {
			const scriptToFormat = result.substring(startPos, endPos);

			const js_beautify = require('js-beautify').js;

			var res: string = js_beautify(scriptToFormat, htmlOptions);

			const newLinePos = findStartLine(result, startPos - 10);

			res = eol + res.split(eol).map(l => repeat(' ', startPos - newLinePos - 7) + l).join(eol);
			res += eol + repeat(' ', startPos - newLinePos - 11);

			result = result.substr(0, startPos) + res + result.substr(endPos)
			lastIndex = result.indexOf('</isscript>', startPos)
		}
		lastIndex = result.indexOf('<isscript>', lastIndex);
	}
	lastIndex = result.indexOf('${');
	while (lastIndex > -1) {
		const startPos = lastIndex + 2;
		const endPos = result.indexOf('}', startPos);

		if (endPos > -1) {
			const scriptToFormat = result.substring(startPos, endPos);

			const js_beautify = require('js-beautify').js;

			var res: string = js_beautify(scriptToFormat.trim(), htmlOptions);

			if (res.split(eol).length > 1) {
				const newLinePos = findStartLine(result, startPos - 2);
				res = res.split(eol).map((
					l, idx) => idx === 0 ? l : repeat(' ', startPos - newLinePos - 7) + l).join(eol);
				//res += eol + repeat(' ', startPos - newLinePos - 3);
			}

			result = result.substr(0, startPos) + res + result.substr(endPos)
			lastIndex = result.indexOf('}', startPos)
		}
		lastIndex = result.indexOf('${', lastIndex);
	}
	// restore iselse
	result = result.replace(/[ ]{4}<iselse \/>/ig, '<iselse/>')
	result = result.replace(/[ ]{4}<iselseif /ig, '<iselseif ')
	result = result.replace(/<iscontinue \/>/ig, '<iscontinue/>')
	result = result.replace(/<isbreak \/>/ig, '<isbreak/>')
	result = result.replace(/<isreplace \/>/ig, '<isreplace/>')
	result = result.replace(/<isactivedatahead \/>/ig, '<isactivedatahead/>')



	return [{
		range: range,
		newText: result
	}];
}

function getFormatOption(options: HTMLFormatConfiguration, key: string, dflt: any): any {
	if (options && options.hasOwnProperty(key)) {
		let value = options[key];
		if (value !== null) {
			return value;
		}
	}
	return dflt;
}

function getTagsFormatOption(options: HTMLFormatConfiguration, key: string, dflt: string[]): string[] {
	let list = <string>getFormatOption(options, key, null);
	if (typeof list === 'string') {
		if (list.length > 0) {
			return list.split(',').map(t => t.trim().toLowerCase());
		}
		return [];
	}
	return dflt;
}

function computeIndentLevel(content: string, offset: number, options: HTMLFormatConfiguration): number {
	let i = offset;
	let nChars = 0;
	let tabSize = options.tabSize || 4;
	while (i < content.length) {
		let ch = content.charAt(i);
		if (ch === ' ') {
			nChars++;
		} else if (ch === '\t') {
			nChars += tabSize;
		} else {
			break;
		}
		i++;
	}
	return Math.floor(nChars / tabSize);
}

// function getEOL(document: TextDocument): string {
// 	let text = document.getText();
// 	if (document.lineCount > 1) {
// 		let to = document.offsetAt(Position.create(1, 0));
// 		let from = to;
// 		while (from > 0 && isEOL(text, from - 1)) {
// 			from--;
// 		}
// 		return text.substr(from, to - from);
// 	}
// 	return '\n';
// }

function isEOL(text: string, offset: number) {
	return '\r\n'.indexOf(text.charAt(offset)) !== -1;
}

function isWhitespace(text: string, offset: number) {
	return ' \t'.indexOf(text.charAt(offset)) !== -1;
}
