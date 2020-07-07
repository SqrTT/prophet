import { tagsTypings, encodingValues } from "./ismlLinting";
import { positionAt } from "../../getLineOffsets";

function attributePos(event: IParserEvent, attrOffset: number, attrContent: string) {
	const spaces = attrContent.length - attrContent.trimLeft().length + event.tagName.length + 1;
	const position = positionAt(attrOffset + spaces, event.raw)
	return {
		line: position.line + event.line,
		col: position.line === 0 ? attrOffset + event.col + spaces : position.character + 1
	}
}

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
	info: (msg: string, line: number, col: number, self: any, raw: string) => void;
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

function hasDynamicValue(str: string) {
	return str.includes('${');
}

const ariaType = {
	BOOLEAN: {
		values: ['true', 'false'],
		check: (val: string) => hasDynamicValue(val) || ariaType.BOOLEAN.values.some(v => v === val)
	},
	BOOLEANUNDEFINED: {
		values: ['true', 'false', 'undefined'],
		check: (val: string) => hasDynamicValue(val) || ariaType.BOOLEAN.values.some(v => v === val)
	},
	ANY: {
		values: [],
		check: () => true
	},
	IDRef: {
		values: [],
		check: () => true
	},
	TRISTATE: {
		values: ['true', 'false', 'mixed'],
		check: (val: string) => hasDynamicValue(val) || ariaType.TRISTATE.values.some(v => v === val)
	},
	NUMBER: {
		values: ['Any real numerical value.'],
		check: (val: string) => {
			return hasDynamicValue(val) || parseFloat(val).toString() === val;
		}
	},
	INTEGER: {
		values: ['A numerical value without a fractional component'],
		check: (val: string) => {
			return hasDynamicValue(val) || parseInt(val, 10).toString() === val;
		}
	},
	STRING: {
		values: ['Unconstrained value type'],
		check: (val: string, hasEq) => {
			return hasDynamicValue(val) || (hasEq && typeof val === 'string');
		}
	},
	LIVETOKEN: {
		values: ['assertive', 'off', 'polite'],
		check: (val: string) => hasDynamicValue(val) || ariaType.LIVETOKEN.values.some(v => v === val)
	},
	INVALIDTOKEN: {
		values: ['grammar', 'false', 'spelling', 'true'],
		check: (val: string) => hasDynamicValue(val) || ariaType.INVALIDTOKEN.values.some(v => v === val)
	},
	RELEVANTTOKEN: {
		values: ['additions', 'additions text', 'all', 'removals', 'text'],
		check: (val: string) => hasDynamicValue(val) || ariaType.RELEVANTTOKEN.values.some(v => v === val)
	},
	AUTOCOMPLETETOKEN: {
		values: ['both', 'inline', 'list', 'none'],
		check: (val: string) => hasDynamicValue(val) || ariaType.AUTOCOMPLETETOKEN.values.some(v => v === val)
	},
	ORIENTATIONTOKEN: {
		values: ['horizontal', 'vertical'],
		check: (val: string) => hasDynamicValue(val) || ariaType.ORIENTATIONTOKEN.values.some(v => v === val)
	},
	SORTTOKEN: {
		values: ['ascending', 'descending', 'none', 'other'],
		check: (val: string) => hasDynamicValue(val) || ariaType.SORTTOKEN.values.some(v => v === val)
	},
	CURRENTTOKEN: {
		values: ['page', 'step', 'location', 'date', 'time', 'true', 'false'],
		check: (val: string) => hasDynamicValue(val) || ariaType.CURRENTTOKEN.values.some(v => v === val)
	},
	URI: {
		values: ['A Uniform Resource Identifier as defined by RFC 3986. It may reference a separate document, or a content fragment identifier in a separate document, or a content fragment identifier within the same document.'],
		check: (value: string) => {
			return hasDynamicValue(value) || /^(https?|ftp):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i.test(value);;
		}
	}
}

const ariaAttributes = {
	"aria-labelledby": { type: ariaType.IDRef },
	"aria-checked": { type: ariaType.TRISTATE },
	"aria-activedescendant": { type: ariaType.IDRef },
	"aria-valuenow": { type: ariaType.NUMBER },
	"aria-valuetext": { type: ariaType.STRING },
	"aria-atomic": { type: ariaType.BOOLEAN },
	"aria-busy": { type: ariaType.BOOLEAN },
	"aria-controls": { type: ariaType.IDRef },
	"aria-describedat": { type: ariaType.URI },
	"aria-describedby": { type: ariaType.BOOLEAN },
	"aria-disabled": { type: ariaType.BOOLEAN },
	"aria-dropeffect": { type: ariaType.BOOLEAN },
	"aria-flowto": { type: ariaType.IDRef },
	"aria-grabbed": { type: ariaType.BOOLEANUNDEFINED },
	"aria-haspopup": { type: ariaType.IDRef },
	"aria-hidden": { type: ariaType.BOOLEAN },
	"aria-invalid": { type: ariaType.INVALIDTOKEN },
	"aria-label": { type: ariaType.STRING },
	"aria-live": { type: ariaType.LIVETOKEN },
	"aria-owns": { type: ariaType.IDRef },
	"aria-relevant": { type: ariaType.RELEVANTTOKEN },
	"aria-autocomplete": { type: ariaType.AUTOCOMPLETETOKEN },
	"aria-expanded": { type: ariaType.BOOLEANUNDEFINED },
	"aria-level": { type: ariaType.INTEGER },
	"aria-multiline": { type: ariaType.BOOLEAN },
	"aria-multiselectable": { type: ariaType.BOOLEAN },
	"aria-orientation": { type: ariaType.ORIENTATIONTOKEN },
	"aria-pressed": { type: ariaType.TRISTATE },
	"aria-readonly": { type: ariaType.BOOLEAN },
	"aria-required": { type: ariaType.BOOLEAN },
	"aria-selected": { type: ariaType.BOOLEANUNDEFINED },
	"aria-sort": { type: ariaType.SORTTOKEN },
	"aria-valuemax": { type: ariaType.NUMBER },
	"aria-valuemin": { type: ariaType.NUMBER },
	"aria-posinset": { type: ariaType.INTEGER },
	"aria-setsize": { type: ariaType.INTEGER },
	"aria-current": { type: ariaType.CURRENTTOKEN },
	"aria-errormessage": { type: ariaType.IDRef },
	"aria-modal": { type: ariaType.BOOLEAN },
	"aria-placeholder": { type: ariaType.STRING },
	"aria-dragged": { type: ariaType.ANY },
	"aria-colcount": { type: ariaType.INTEGER },
	"aria-colindex": { type: ariaType.INTEGER },
	"aria-colspan": { type: ariaType.INTEGER },
	"aria-details": { type: ariaType.IDRef },
	"aria-rowcount": { type: ariaType.INTEGER },
	"aria-rowindex": { type: ariaType.INTEGER },
	"aria-rowspan": { type: ariaType.INTEGER },
	"aria-roledescription": { type: ariaType.STRING },
	"aria-keyshortcuts": { type: ariaType.STRING }
}

const builtInTagsList = [
	"isprint", "isset", "isif", "isloop", "iscomment", "isreplace", "isdecorate", "isscript", "isinclude", "iscontent", "iscache", "iselse", "iselseif", "isredirect", "iscontinue", "ismodule", "isbreak", "isslot", "iscomponent", "isobject"
];


export const customRules: IRules[] = [{
	id: 'sfcc-custom-tags',
	description: 'Checks if "util/modules" template is require or missing',
	init(parser, reporter, options) {
		const self = this;
		const customTags = new Set<IParserEvent>();
		let hasModulesInclude: IParserEvent | undefined;
		parser.addListener('tagstart', function (event) {
			if (event.tagName.toLowerCase().startsWith('is') && !builtInTagsList.includes(event.tagName)) {
				customTags.add(event);
			} else if (event.tagName.toLowerCase() === 'isinclude') {
				event.attrs.some(attr => {
					if (
						attr.name.toLowerCase() === 'template'
						&& (attr.value.includes('components/modules')
							|| attr.value.includes('util/modules'))
					) {
						hasModulesInclude = event;
					}
				});
			}
		});
		parser.addListener('end', function (event) {
			if (hasModulesInclude && !customTags.size) {
				reporter.warn(`'util/modules' or 'components/modules' was included but custom tags are not used`, hasModulesInclude.line, hasModulesInclude.col, self, hasModulesInclude.raw);
			} else if (!hasModulesInclude && customTags.size) {
				Array.from(customTags).forEach(customTag => {
					reporter.warn(`Custom tag '${customTag.tagName}' is used but 'util/modules' or 'components/modules' was not included`, customTag.line, customTag.col, self, customTag.raw);
				});
			}
		});
	}
}, {
	id: 'no-deprecated-sfcc-iscache-status',
	description: 'Disallows deprecated attributes or attribute values.',
	init(parser, reporter, options) {
		var self = this;
		parser.addListener('tagstart', function (event) {
			if (event.tagName.toLowerCase() === 'iscache') {
				event.attrs.some(attr => {
					if (attr.name.toLowerCase() === 'status' && (attr.value || '').toLowerCase() === 'off') {
						const { line, col: attrCol } = attributePos(event, attr.index, attr.raw);
						reporter.warn(`Attribute "status" is deprecated for iscache tag`, line, attrCol, self, attr.raw);
					}
					return false;
				});
			}
		});
	}
}, {
	id: 'no-aria-hidden-with-hidden-attr',
	description: 'Attribute "aria-hidden" is unnecessary for elements that have attribute "hidden"',
	init(parser, reporter, options) {
		var self = this;
		parser.addListener('tagstart', function (event) {
			var attrs = event.attrs;
			attrs.forEach(attr => {
				const attrName = attr.name.toLowerCase();
				if (attrName.toLowerCase() === 'aria-hidden' && attrs.some(a => a.name.toLowerCase() === 'hidden')) {
					const { line, col: attrCol } = attributePos(event, attr.index, attr.raw);
					reporter.warn(`Attribute "aria-hidden" is unnecessary for elements that have attribute "hidden"`, line, attrCol, self, attr.raw);
				}
			});
		});
	}
}, {
	id: 'no-whitespace-in-id-attr',
	description: 'Attribute "for" is allowed only for "label" and "output" tag',
	init(parser, reporter, options) {
		var self = this;
		parser.addListener('tagstart', function (event) {
			var attrs = event.attrs;
			attrs.forEach(attr => {
				const attrName = attr.name.toLowerCase();
				if (attrName.toLowerCase() === 'id' && (attr.value).replace(/\$\{.+?\}/, '').includes(' ')) {
					const { line, col: attrCol } = attributePos(event, attr.index, attr.raw);
					reporter.error(`Bad value "${attr.value}" for attribute id on element "${event.tagName}": An ID must not contain whitespace.`, line, attrCol, self, attr.raw);
				}
			});
		});
	}
}, {
	id: 'for-attr-is-allowed-for-label-and-output',
	description: 'Attribute "for" is allowed only for "label" and "output" tag',
	init(parser, reporter, options) {
		var self = this;
		parser.addListener('tagstart', function (event) {
			var attrs = event.attrs;
			attrs.forEach(attr => {
				const attrName = attr.name.toLowerCase();
				if (attrName.toLowerCase() === 'for' && !['label', 'output'].includes(event.tagName.toLowerCase())) {
					const { line, col: attrCol } = attributePos(event, attr.index, attr.raw);
					reporter.warn(`Attribute "for" not allowed on element "${event.tagName}" at this point.`, line, attrCol, self, attr.raw);
				}
			});
		});
	}
}, {
	id: 'aria-attr-has-proper-value',
	description: 'Checks aria attr to have allowed value',
	init(parser, reporter, options) {
		var self = this;

		parser.addListener('tagstart', function (event) {
			var attrs = event.attrs;
			attrs.forEach(attr => {
				const attrName = attr.name.toLowerCase();
				if (
					attrName.toLowerCase().startsWith('aria-')
					&& ariaAttributes[attrName]
					&& !ariaAttributes[attrName].type.check(attr.value, attr.raw.includes('='))
				) {

					const { line, col: attrCol } = attributePos(event, attr.index, attr.raw);
					reporter.warn(`Aria attribute "${attr.name}" have invalid value. Valid values are '${ariaAttributes[attrName].type.values.join('\', \'')}'`, line, attrCol, self, attr.raw);
				}
			});
		});
	}
}, {
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
				}
				else if (currentTagType.selfclosing === false && event.close) {
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
							}
							else {
								reporter.error(`The <${tagName}> tag must have attr '${realID}'.`, event.line, col, self, event.raw);
							}
						}
						else if (!attrs.some(attr => id.split('|').includes(attr.name))) {
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
							const found = attrs.find((attr: {
								name: string;
								value: string;
							}) => attr.name === nameOfAttr && valuesOfAttr.includes((attr.value || '').toLowerCase()));
							if (found) {
								const { line, col } = attributePos(event, found.index, found.raw);
								reporter.error(`The attr '${found.name}' with  '${found.value}' is redundant for <${tagName}> and should be omitted.`, line, col, self, event.raw);
							}
						}
						else {
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
			var mapAttrName: {
				[key: string]: boolean;
			} = {};
			for (var i = 0, l = attrs.length; i < l; i++) {
				attr = attrs[i];
				attrName = attr.name;
				if (mapAttrName[attrName] === true) {
					const { line, col: attrCol } = attributePos(event, attr.index, attr.raw);
					reporter.error('Duplicate of attribute name [ ' + attr.name + ' ] was found.', line, attrCol, self, attr.raw);
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
					if (!relAttr
						|| (!(relAttr.value || '').includes('noopener')
							&& !(relAttr.value || '').includes('noreferrer'))) {
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
						reporter.warn(`Try to omit usage of encoding="off". Use encoding="off" only if you understand consequences and this is really required. "${encodingValues.join(', ')}" may fit better your needs.`, line, col, self, attr.raw);
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
					reporter.error(`Line must be at most ${option} characters`, event.line - 1, event.col, self, event.raw);
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
				reporter.warn(`avoid usage of html comments. Use  <iscomment/> instead.`, event.line, event.col, self, event.raw);
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
					reporter.warn('Please avoid usage div tag without class. Most likely this block is redundant', event.line, event.col, self, event.raw);
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
			if (str.length && (!str.startsWith('${') && !str.startsWith('___') && !str.startsWith('{{'))) { // non empty text
				if (event.lastEvent && ['isscript', 'iscomment'].includes(event.lastEvent.tagName)) {
					return;
				}
				const spaces = event.raw.length - event.raw.trimLeft().length;
				reporter.error(`Use localization for strings (Resource.msg)`, event.line, event.col + spaces, self, event.raw);
			}
			;
		});
	},
}];
