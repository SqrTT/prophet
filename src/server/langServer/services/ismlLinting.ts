
import {
	IConnection,
	Diagnostic,
	DiagnosticSeverity,
	TextDocuments,
	ErrorMessageTracker,
	DidChangeConfigurationParams
} from "vscode-languageserver";
import { TextDocument } from 'vscode-languageserver-textdocument';


import { URI } from 'vscode-uri';

import * as path from 'path';

let stripJsonComments: any = require('strip-json-comments');
import fs = require('fs');

import * as htmlhint from '../htmlhint';
import { replaceIsPrintAttr } from "../utils/strings";
import { positionAt } from "../../getLineOffsets";

function attributePos(event: IParserEvent, attrOffset: number, attrContent: string) {
	const spaces = attrContent.length - attrContent.trimLeft().length + event.tagName.length + 1;
	const position = positionAt(attrOffset + spaces, event.raw)
	return {
		line: position.line + event.line,
		col: position.line === 0 ? attrOffset + event.col + spaces : position.character + 1
	}
}

var htmlHintClient: any = null;
let htmlhintrcOptions: any = {};

interface Settings {
	htmlhint: {
		enable: boolean;
		options: any;
	}
	[key: string]: any;
}

let settings: Settings | null = null;

interface ITagType {
	denyTag?: string;
	selfclosing?: boolean;
	attrsRequired?: string[];
	redundantAttrs?: string[];
	attrsOptional?: [string, string][]
}


const tagsTypings: { [key: string]: ITagType } = {
	br: {
		denyTag: 'error',
	},
	a: {
		selfclosing: false,
		attrsRequired: ['href'],
		redundantAttrs: ['alt']
	},
	div: {
		selfclosing: false
	},
	main: {
		selfclosing: false,
		redundantAttrs: ['role']
	},
	nav: {
		selfclosing: false,
		redundantAttrs: ['role']
	},
	script: {
		attrsOptional: [['async', 'async'], ['defer', 'defer']],
		redundantAttrs: ['type=javascript,text/javascript']
	},
	img: {
		selfclosing: true,
		attrsRequired: [
			'src', 'alt'
		]
	},
	area: {
		selfclosing: true
	},
	base: {
		selfclosing: true
	},
	col: {
		selfclosing: true
	},
	embed: {
		selfclosing: true
	},
	hr: {
		selfclosing: true
	},
	input: {
		selfclosing: true
	},
	keygen: {
		selfclosing: true
	},
	link: {
		selfclosing: true
	},
	menuitem: {
		selfclosing: true
	},
	meta: {
		selfclosing: true
	},
	param: {
		selfclosing: true
	},
	source: {
		selfclosing: true
	},
	track: {
		selfclosing: true
	},
	wbr: {
		selfclosing: true
	}
};

const defaultLinterConfig = {
	"tagname-lowercase": true,
	"attr-lowercase": true,
	"attr-value-double-quotes": false,
	"doctype-first": false,
	"max-length": false,
	"tag-pair": true,
	"spec-char-escape": false,
	"id-unique": false,
	"src-not-empty": true,
	"attr-no-duplication": true,
	"title-require": false,
	"doctype-html5": true,
	"space-tab-mixed-disabled": "space",
	"inline-style-disabled": true,
	"tag-self-close": true,
	"localize-strings": true,
	"encoding-off-warn": true,
	"unsafe-external-link": true,
	"no-html-comment": true,
	"no-div-without-class": true,
	"tags-check": {
		"isslot": {
			"selfclosing": true,
			"attrsRequired": ["id", ["context", "global", "category", "folder"], "description"]
		},
		"iscache": {
			"selfclosing": true,
			"attrsRequired": ["hour|minute", ["type", "relative", "daily"]],
			"attrsOptional": [["varyby", "price_promotion"]]
		},
		"isdecorate": {
			"selfclosing": false,
			"attrsRequired": ["template"]
		},
		"isreplace": {
			"selfclosing": true
		},
		"isinclude": {
			"selfclosing": true,
			"attrsRequired": ["template|url"]
		},
		"iscontent": {
			"selfclosing": true,
			"attrsOptional": [["encoding", "on", "off", "html", "xml", "wml"], ["compact", "true", "false"]],
			"attrsRequired": ["type", "charset"]
		},
		"ismodule": {
			"selfclosing": true,
			"attrsRequired": ["template", "name"]
		},
		"isobject": {
			"selfclosing": false,
			"attrsRequired": ["object", ["view", "none", "searchhit", "recommendation", "setproduct", "detail"]]
		},
		"isset": {
			"selfclosing": true,
			"attrsRequired": ["name", "value", ["scope", "session", "request", "page", "pdict"]]
		},
		"iscomponent": {
			"selfclosing": true,
			"attrsRequired": ["pipeline"]
		},
		"iscontinue": {
			"selfclosing": true
		},
		"isbreak": {
			"selfclosing": true
		},
		"isnext": {
			"selfclosing": true
		},
		"isscript": {
			"selfclosing": false,
			denyTag: 'warn'
		},
		"iselse": {
			"selfclosing": true
		},
		"isloop": {
			"selfclosing": false,
			"attrsRequired": ["items|iterator|begin", "alias|var|end"]
		},
		"isif": {
			"selfclosing": false,
			"attrsRequired": ["condition"]
		},
		"iselseif": {
			"selfclosing": true,
			"attrsRequired": ["condition"]
		},
		"isprint": {
			"selfclosing": true,
			"attrsRequired": ["value"],
			"attrsOptional": [["encoding", "on", "off", "htmlcontent", "htmlsinglequote", "htmldoublequote", "htmlunquote", "jshtml", "jsattribute", "jsblock", "jssource", "jsonvalue", "uricomponent", "uristrict", "xmlcontent", "xmlsinglequote", "xmldoublequote", "xmlcomment"], ["timezone", "SITE", "INSTANCE", "utc"]]
		},
		"isstatus": {
			"selfclosing": true,
			"attrsRequired": ["value"]
		},
		"isredirect": {
			"selfclosing": true,
			"attrsOptional": [["permanent", "true", "false"]],
			"attrsRequired": ["location"]
		},
		"isinputfield": {
			"selfclosing": true,
			"attrsRequired": ["type", "formfield"]
		}
	}
};

const encodingValues = ["on", "htmlcontent", "htmlsinglequote", "htmldoublequote", "htmlunquote", "jshtml", "jsattribute", "jsblock", "jssource", "jsonvalue", "uricomponent", "uristrict", "xmlcontent", "xmlsinglequote", "xmldoublequote", "xmlcomment"];

interface IParserEvent {
	tagName: string;
	col: number;
	line: number;
	raw: string;
	attrs: {
		name: string,
		value: string,
		index: number;
		raw: string;
	}[];
	close: boolean;
	lastEvent?: IParserEvent
}
interface IParser {
	addListener: (eventName: string, handler: (event: IParserEvent) => void) => void
}

interface IReporter {
	warn: (msg: string, line: number, col: number, self: any, raw: string) => void;
	error: (msg: string, line: number, col: number, self: any, raw: string) => void;
	report: (tag: string, msg: string, line: number, col: number, self: any, raw: string) => void;
}

interface IOptions {

}

interface IRules {
	id: string;
	description: string;
	init: (parser: IParser, reporter: IReporter, options: IOptions) => void
}

const customRules: IRules[] = [{
	id: 'tags-check',
	description: 'Checks html tags.',
	init(parser, reporter, options) {
		var self = this;

		if (typeof options !== 'boolean') {
			Object.assign(tagsTypings, options);
		}

		parser.addListener('tagstart', function (event) {
			var attrs = event.attrs;
			var col = event.col + event.tagName.length + 1;

			const tagName = event.tagName.toLowerCase();

			if (tagsTypings[tagName]) {
				const currentTagType = tagsTypings[tagName];

				if (currentTagType.selfclosing === true && !event.close) {
					reporter.warn(`The <${tagName}> tag must be self closed.`, event.line, event.col, self, event.raw);
				} else if (currentTagType.selfclosing === false && event.close) {
					reporter.warn(`The <${tagName}> tag must not be self closed.`, event.line, event.col, self, event.raw);
				}

				if (currentTagType.attrsRequired) {
					currentTagType.attrsRequired.forEach(id => {
						if (Array.isArray(id)) {
							const copyOfId = id.map(a => a);
							const realID = copyOfId.shift();
							const values = copyOfId;

							if (attrs.some(attr => attr.name === realID)) {
								attrs.forEach(attr => {
									if (attr.name === realID && !values.includes(attr.value)) {
										reporter.error(`The <${tagName}> tag must have attr '${realID}' with one value of '${values.join('\' or \'')}'.`, event.line, col, self, event.raw);
									}
								});
							} else {
								reporter.error(`The <${tagName}> tag must have attr '${realID}'.`, event.line, col, self, event.raw);
							}
						} else if (!attrs.some(attr => id.split('|').includes(attr.name))) {
							reporter.error(`The <${tagName}> tag must have attr '${id}'.`, event.line, col, self, event.raw);
						}
					});
				}
				if (currentTagType.attrsOptional) {
					currentTagType.attrsOptional.forEach(id => {
						if (Array.isArray(id)) {
							const copyOfId = id.map(a => a);
							const realID = copyOfId.shift();
							const values = copyOfId;

							if (attrs.some(attr => attr.name === realID)) {
								attrs.forEach(attr => {
									if (attr.name === realID && !values.includes(attr.value)) {
										const { line, col } = attributePos(event, attr.index, attr.raw);

										reporter.error(`The <${tagName}> tag must have optional attr '${realID}' with one value of '${values.join('\' or \'')}'.`, line, col, self, event.raw);
									}
								});
							}
						}
					});
				}

				if (currentTagType.redundantAttrs) {
					currentTagType.redundantAttrs.forEach((attrName: string) => {
						if (attrName.includes('=')) {
							const [nameOfAttr, attrValues] = attrName.split('=');
							const valuesOfAttr = attrValues.split(',');

							const found = attrs.find((attr: { name: string; value: string; }) =>
								attr.name === nameOfAttr && valuesOfAttr.includes((attr.value || '').toLowerCase()))

							if (found) {
								const { line, col } = attributePos(event, found.index, found.raw);

								reporter.error(`The attr '${found.name}' with  '${found.value}' is redundant for <${tagName}> and should be omitted.`, line, col, self, event.raw);
							}
						} else {
							const found = attrs.find(attr => attr.name === attrName);

							if (found) {
								const { line, col } = attributePos(event, found.index, found.raw);

								reporter.error(`The attr '${found.name}' is redundant for <${tagName}> and should be omitted.`, line, col, self, event.raw);
							}
						}
					});
				}
				if (currentTagType.denyTag) {
					reporter.report(currentTagType.denyTag, `The <${tagName}> tag ${currentTagType.denyTag === 'error' ? 'must' : 'should'} not be used.`, event.line, event.col, self, event.raw);
				}
			}
		});
	}
}, {
	id: 'attr-no-duplication',
	description: 'Elements cannot have duplicate attributes.',
	init: function (parser, reporter) {
		var self = this;

		parser.addListener('tagstart', function (event) {
			var attrs = event.attrs;
			var attr;
			var attrName;

			if (event.tagName.toLowerCase() === 'ismodule') {
				return;
			}

			var mapAttrName: { [key: string]: boolean } = {};
			for (var i = 0, l = attrs.length; i < l; i++) {
				attr = attrs[i];
				attrName = attr.name;
				if (mapAttrName[attrName] === true) {
					const { line, col: attrCol } = attributePos(event, attr.index, attr.raw);
					reporter.error('Duplicate of attribute name [ ' + attr.name + ' ] was found.',
						line, attrCol, self, attr.raw);
				}
				mapAttrName[attrName] = true;
			}
		});
	}
}, {
	id: 'unsafe-external-link',
	description: 'Links to cross-origin destinations are unsafe',
	init: function (parser, reporter) {
		var self = this;

		parser.addListener('tagstart', function (event) {
			if (event.tagName.toLowerCase() === 'a') {
				const attrs = event.attrs || [];
				const targetAttr = attrs.find(attr => attr.name === 'target' && attr.value === '_blank');

				if (targetAttr) {
					const relAttr = attrs.find(attr => attr.name === 'rel');

					if (
						!relAttr
						|| (!(relAttr.value || '').includes('noopener')
							&& !(relAttr.value || '').includes('noreferrer'))
					) {
						const { line, col } = relAttr ? attributePos(event, relAttr.index, relAttr.raw) : event;

						reporter.warn(`Links to cross-origin destinations are unsafe. Add 'rel = "noopener"' or 'rel = "noreferrer"' to any external links to improve performance and prevent security vulnerabilities.`, line, col, self, targetAttr.raw);
					}
				}
			}
		});
	}
}, {
	id: 'encoding-off-warn',
	description: 'Omit usage of encoding off.',
	init: function (parser, reporter) {
		var self = this;

		parser.addListener('tagstart', function (event) {
			if (event.tagName.toLowerCase() === 'isprint') {
				const attrs = event.attrs || [];
				attrs.forEach(attr => {
					if (attr.name === 'encoding' && attr.value === 'off') {
						const { line, col } = attributePos(event, attr.index, attr.raw);

						reporter.warn(`Try to omit usage of encoding="off". Use encoding="off" only if you understand consequences and this is really required. "${encodingValues.join(', ')}" may fit better your needs.`,
							line, col, self, attr.raw);
					}
				});
			}
		});
	}
}, {
	id: 'max-length',
	description: 'Lines limitation.',
	init(parser, reporter, option) {
		var self = this;

		if (option) {
			const checkLength = (event: IParserEvent) => {
				if (event.col > option) {
					reporter.error(
						`Line must be at most ${option} characters`,
						event.line - 1,
						event.col,
						self,
						event.raw
					);
				}
			};

			parser.addListener('tagstart', checkLength);
			parser.addListener('text', checkLength);
			parser.addListener('cdata', checkLength);
			parser.addListener('tagend', checkLength);
			parser.addListener('comment', checkLength);
		}
	},
}, {
	id: 'no-html-comment',
	description: 'avoid usage of html comments. Use  <iscomment/> instead.',
	init(parser, reporter, option) {
		const self = this;
		parser.addListener('comment', event => {
			if (!event.raw.includes('dwMarker') && !event.raw.includes('DOCTYPE')) {
				reporter.warn(
					`avoid usage of html comments. Use  <iscomment/> instead.`,
					event.line,
					event.col,
					self,
					event.raw
				);
			}
		});
	}
}, {
	id: 'no-div-without-class',
	description: 'avoid usage div without attribute class',
	init(parser, reporter, option) {
		const self = this;

		parser.addListener('tagstart', function (event) {
			if (event.tagName.toLowerCase() === 'div') {
				const attrs = event.attrs || [];
				const classAttr = attrs.find(attr => attr.name === 'class');

				if (!classAttr || !classAttr.value) {
					reporter.warn('Please avoid usage div tag without class. Most likely this block is redundant',
						event.line,
						event.col,
						self,
						event.raw
					);
				}
			}
		});
	}
},
{
	id: 'localize-strings',
	description: 'Localizable string is only allowed.',
	init(parser, reporter, option) {
		var self = this;

		parser.addListener('text', event => {
			const str: string = event.raw.trimLeft();
			if (str.length && (!str.startsWith('${') && !str.startsWith('___') && !str.startsWith('{{'))) {// non empty text
				if (event.lastEvent && ['isscript', 'iscomment'].includes(event.lastEvent.tagName)) {
					return;
				}

				const spaces = event.raw.length - event.raw.trimLeft().length;

				reporter.error(
					`Use localization for strings (Resource.msg)`,
					event.line,
					event.col + spaces,
					self,
					event.raw
				);
			};
		});
	},
}];

function getErrorMessage(err: any, document: TextDocument): string {
	let result: string;
	if (typeof err.message === 'string' || err.message instanceof String) {
		result = <string>err.message;
	} else {
		result = `An unknown error occurred while validating file: ${URI.parse(document.uri).fsPath}`;
	}
	return result;
}

/**
 * Given a path to a .htmlhintrc file, load it into a javascript object and return it.
 */
function loadConfigurationFile(configFile: string): any {
	var ruleSet: any = null;
	if (fs.existsSync(configFile)) {
		var config = fs.readFileSync(configFile, 'utf8');
		try {
			ruleSet = JSON.parse(stripJsonComments(config));
		}
		catch (e) {
			console.warn('The .htmlhintrc configuration file is invalid. Source: ' + configFile);
			console.warn(e);
		}
	}
	return ruleSet;
}

export function validateTextDocument(connection: IConnection, document: TextDocument): void {
	try {
		doValidate(connection, document);
	} catch (err) {
		connection.window.showErrorMessage(getErrorMessage(err, document));
	}
}

/**
 * Get the html-hint configuration settings for the given html file.  This method will take care of whether to use
 * VS Code settings, or to use a .htmlhintrc file.
 */
function getConfiguration(filePath: string): any {
	var options: any;
	if (
		settings &&
		settings.htmlhint &&
		settings.htmlhint.options &&
		Object.keys(settings.htmlhint.options).length > 0
	) {
		options = settings.htmlhint.options;
	}
	else {
		options = findConfigForHtmlFile(filePath);
	}

	options = options || {};
	return options;
}

/**
 * Given the path of an html file, this function will look in current directory & parent directories
 * to find a .htmlhintrc file to use as the linter configuration.  The settings are
 */
function findConfigForHtmlFile(base: string) {
	var options: any;

	if (fs.existsSync(base)) {

		// find default config file in parent directory
		if (fs.statSync(base).isDirectory() === false) {
			base = path.dirname(base);
		}

		while (base && !options) {
			var tmpConfigFile = path.resolve(base + path.sep, '.htmlhintrc');

			// undefined means we haven't tried to load the config file at this path, so try to load it.
			if (htmlhintrcOptions[tmpConfigFile] === undefined) {
				htmlhintrcOptions[tmpConfigFile] = loadConfigurationFile(tmpConfigFile);
			}

			// defined, non-null value means we found a config file at the given path, so use it.
			if (htmlhintrcOptions[tmpConfigFile]) {
				options = htmlhintrcOptions[tmpConfigFile];
				break;
			}

			base = base.substring(0, base.lastIndexOf(path.sep));
		}
	}
	return options;
}


/**
* Given an htmlhint Error object, approximate the text range highlight
*/
function getRange(error: htmlhint.Error, lines: string[]): any {

	const line = lines[error.line - 1];
	var isWhitespace = false;
	var curr = error.col;
	while (curr < line.length && !isWhitespace) {
		var char = line[curr];
		isWhitespace = (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '<');
		++curr;
	}

	if (isWhitespace) {
		--curr;
	}

	return {
		start: {
			line: error.line - 1, // Html-hint line numbers are 1-based.
			character: error.col - 1
		},
		end: {
			line: error.line - 1,
			character: curr
		}
	};
}

const evidenceMap = {
	'warn': DiagnosticSeverity.Warning,
	'error': DiagnosticSeverity.Error,
	'info': DiagnosticSeverity.Information,
	'hint': DiagnosticSeverity.Hint
}
/**
 * Given an htmlhint.Error type return a VS Code server Diagnostic object
 */
function makeDiagnostic(problem: htmlhint.Error, lines: string[]): Diagnostic {

	return {
		severity: evidenceMap[problem.type] || DiagnosticSeverity.Error,
		message: problem.message,
		range: getRange(problem, lines),
		code: problem.rule.id
	};
}

function replaceSystemPlaceholders(str: string) {
	let currentPos = -1;
	while ((currentPos = str.indexOf('${', currentPos + 1)) !== -1) {
		const closingTag = str.indexOf('}', currentPos);

		if (closingTag > -1) {
			const content = str.substr(currentPos, closingTag - currentPos + 1);
			str = str.substr(0, currentPos) + content.replace(/[^\n^\r]/ig, '_') + str.substr(closingTag + 1);
			currentPos = -1; // reset pos since content may shift
		}
	};
	return str;
}

function doValidate(connection: IConnection, document: TextDocument): void {
	const uri = document.uri;
	if (htmlHintClient) {
		try {
			const fsPath = URI.parse(document.uri).fsPath;
			const contents = replaceSystemPlaceholders(replaceIsPrintAttr(document.getText()));
			const lines = contents.split('\n');

			const config = Object.assign({}, defaultLinterConfig, getConfiguration(fsPath)); //;

			const errors: htmlhint.Error[] = htmlHintClient.verify(contents, config);

			const diagnostics: Diagnostic[] = [];
			if (errors.length > 0) {
				errors.forEach(each => {
					diagnostics.push(makeDiagnostic(each, lines));
				});
			}
			connection.sendDiagnostics({ uri, diagnostics });
		} catch (err) {
			if (typeof err.message === 'string' || err.message instanceof String) {
				throw new Error(<string>err.message);
			}
			throw err;
		}
	} else {
		connection.sendDiagnostics({ uri, diagnostics: [] });
	}
}

function validateAllTextDocuments(connection: IConnection, documents: TextDocument[]): void {
	let tracker = new ErrorMessageTracker();
	documents.forEach(document => {
		try {
			validateTextDocument(connection, document);
		} catch (err) {
			tracker.add(getErrorMessage(err, document));
		}
	});
	tracker.sendErrors(connection);
}
export function disableLinting(connection: IConnection, documents: TextDocuments<TextDocument>) {
	htmlHintClient = null;
	let tracker = new ErrorMessageTracker();
	documents.all().forEach(document => {
		try {
			validateTextDocument(connection, document);
		} catch (err) {
			tracker.add(getErrorMessage(err, document));
		}
	});
	tracker.sendErrors(connection);
	connection.onDidChangeWatchedFiles(() => { })
}

export function enableLinting(connection: IConnection, documents: TextDocuments<TextDocument>) {
	htmlHintClient = require('htmlhint/dist/htmlhint').default;

	customRules.forEach(rule => htmlHintClient.addRule(rule));

	// The watched .htmlhintrc has changed. Clear out the last loaded config, and revalidate all documents.
	connection.onDidChangeWatchedFiles((params) => {
		for (var i = 0; i < params.changes.length; i++) {
			htmlhintrcOptions[URI.parse(params.changes[i].uri).fsPath] = undefined;
		}
		validateAllTextDocuments(connection, documents.all());
	})
}

export function onDidChangeConfiguration(connection: IConnection, documents: TextDocuments<TextDocument>, params: DidChangeConfigurationParams) {

	settings = params.settings;
	if (
		settings &&
		settings.extension &&
		settings.extension.prophet &&
		settings.extension.prophet.htmlhint &&
		settings.extension.prophet.htmlhint.enabled &&
		!htmlHintClient
	) {
		enableLinting(connection, documents);
		connection.console.log('htmlhint enabled');
	} else if (
		settings &&
		settings.extension &&
		settings.extension.prophet &&
		settings.extension.prophet.htmlhint &&
		!settings.extension.prophet.htmlhint.enabled && htmlHintClient
	) {
		connection.console.log('htmlhint disabled');
		disableLinting(connection, documents);
	}
};
