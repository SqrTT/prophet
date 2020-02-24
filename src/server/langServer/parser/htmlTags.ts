/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*!
BEGIN THIRD PARTY
*/
/*--------------------------------------------------------------------------------------------
 *  This file is based on or incorporates material from the projects listed below (Third Party IP).
 *  The original copyright notice and the license under which Microsoft received such Third Party IP,
 *  are set forth below. Such licenses and notices are provided for informational purposes only.
 *  Microsoft licenses the Third Party IP to you under the licensing terms for the Microsoft product.
 *  Microsoft reserves all other rights not expressly granted under this agreement, whether by implication,
 *  estoppel or otherwise.
 *--------------------------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------------------------
 *  Copyright © 2015 W3C® (MIT, ERCIM, Keio, Beihang). This software or document includes includes material copied
 *  from or derived from HTML 5.1 W3C Working Draft (http://www.w3.org/TR/2015/WD-html51-20151008/.)"
 *--------------------------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------------------------
 *  Ionic Main Site (https://github.com/driftyco/ionic-site).
 *  Copyright Drifty Co. http://drifty.com/.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file
 *  except in compliance with the License. You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
 *  WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
 *  MERCHANTABLITY OR NON-INFRINGEMENT.
 *
 *  See the Apache Version 2.0 License for specific language governing permissions
 *  and limitations under the License.
 *--------------------------------------------------------------------------------------------*/

import strings = require('../utils/strings');
import arrays = require('../utils/arrays');


const localize = (a: string, b: string) => b;

export const EMPTY_ELEMENTS: string[] = [
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'keygen',
	'link',
	'menuitem',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
	'isset',
	'isprint',
	'isstatus',
	'iselse',
	'isbreak',
	'iscontinue',
	'isslot',
	'isinclude',
	'iscontent',
	'isinputfield',
	'iscache']
	.sort();


export function isEmptyElement(e: string): boolean {
	return !!e && arrays.binarySearch(
		EMPTY_ELEMENTS, e.toLowerCase(), (s1: string, s2: string) => s1.localeCompare(s2)) >= 0;
}

export interface IHTMLTagProvider {
	setConfigs(config: { templateIndex?: string[] });
	getId(): string;
	isApplicable(languageId: string);
	collectTags(collector: (tag: string, label: string) => void): void;
	collectAttributes(tag: string, collector: (attribute: string, type: string) => void): void;
	collectValues(tag: string, attribute: string, collector: (value: string) => void): void;
}

export interface ITagSet {
	[tag: string]: HTMLTagSpecification;
}

export class HTMLTagSpecification {
	constructor(public label: string, public attributes: string[] = []) { }
}

interface IValueSets {
	[tag: string]: string[];
}


export const SFCC_TAGS: ITagSet = {
	isset: new HTMLTagSpecification(
		'Сan be used to define and set a user-defined variable. In Digital, every user-defined variable is of a specific scope, which defines the visibility and lifetime of the variable. Digital distinguishes between user-defined variables of the request, pdict, session and page scope.',
		['scope:sc', 'value', 'name']
	),
	isif: new HTMLTagSpecification(
		'Creating conditional template code and controlling the flow of business logic. The <isif> tag group allows you to create conditional programming constructs using custom tags.',
		['condition']
	),
	isloop: new HTMLTagSpecification(
		'Creating loops for flow control. \nWith <isloop> you can loop through the elements of a specified iterator. As an example, you can list data like categories, products, shipping and payment methods. <isloop> statements can be nested in one another.',
		['items', 'iterator', 'alias', 'var', 'status', 'begin', 'end', 'step']
	),
	isprint: new HTMLTagSpecification(
		'The <isprint> tag outputs the result of expressions and template variables. Even though it is possible to output expression results without <isprint>, you should always use it because it contributes to optimizing your template code.',
		['value', 'encoding:oe', 'timezone:tz', 'padding', 'style:pst']
	),
	iscomment: new HTMLTagSpecification(
		'Use <iscomment> to document your templates, to include reminders or instructions for yourself and others who work with the system without making them available to anyone who "views source" on the page. Anything enclosed in an <iscomment> ... </iscomment> structure is not parsed by the template processor and does not appear in the generated storefront page.'
	),
	isreplace: new HTMLTagSpecification(
		'The decorator template uses the tag <isreplace/> to identify where the decorated content is to be included. Typically, only one tag (<isreplace/>) is used in the decorator template. However, multiple or zero <isreplace/> tags can also be used.'
	),
	isdecorate: new HTMLTagSpecification(
		'The decorator template has the tag <isreplace/> identifying where the decorated content shall be included. Typically, only one tag (<isreplace/>) is used in the decorator template. However, multiple or zero <isreplace/> tags can also be used. If the decorating template does not have an <isreplace/> tag, the decorated content is omitted from the resultant output.',
		['template']
	),
	isscript: new HTMLTagSpecification(
		'The <isscript> tag supports server-side scripts for scriptlets and inline script expressions, using ${ } syntax. The script expressions are supported everywhere expressions are supported, including in tags and inline.'
	),
	isinclude: new HTMLTagSpecification(
		'Includes the contents of one template inside another or the contents of another URL. The template being included can be as complex as an entire page template, or as simple as a single line of HTML code.',
		['template:tpl', 'url', 'sf-toolkit:o']
	),
	iscontent: new HTMLTagSpecification(
		'<iscontent/> modifies the HTTP header (sets the content type) of the generated output stream sent to the browser or e-mail client. The HTTP header is identified by its MIME type.',
		['type', 'encoding:contentenc', 'compact:b', 'charset']
	),
	iscache: new HTMLTagSpecification(
		'To improve the performance of the online storefront by caching pages and also enable developers to disable page caching. The requested storefront page is retrieved from the cache without running the pipeline that invokes the template and generates the desired page.',
		['status:ston', 'type:sttype', 'hour', 'minute', 'varyby:varyby', 'if']
	),
	iselse: new HTMLTagSpecification(
		'Use with <isif> to specify what happens if neither the <isif> condition nor any <iselseif> conditions evaluate to true.'
	),
	iselseif: new HTMLTagSpecification(
		'Use with <iselseif> to specify a subcondition off an <isif> tag.',
		['condition']
	),
	isredirect: new HTMLTagSpecification(
		'Use <isredirect> to redirect the browser to a specified URL.',
		['location', 'permanent:b']
	),
	iscontinue: new HTMLTagSpecification(
		'Stops processing the current item in the loop and starts the next item in loop. The <iscontinue> tag differs from the <isnext> tag in that isnext just moves the iterator forward one and continues processing next line of code. <iscontinue> breaks out of the processing and then moves to top of loop to start processing again, if there are other items to process. '
	),
	ismodule: new HTMLTagSpecification(
		'Use <ismodule> to declare custom tags in your templates. The declaration can be located anywhere in the template, as long as it appears before the first usage of the declared tag. Multiple declarations of the same tag do not interrupt template processing, the last one is used. You can also define a custom tag in an included template and use it afterward in the including template.',
		['template', 'name', 'attribute']
	),
	isbreak: new HTMLTagSpecification(
		'Terminating loops unconditionally. <isbreak> can be used within a loop (defined by an <isloop> tag) to terminate a loop unconditionally. For more information on creating loops see <isloop>. If <isbreak> is used in a nested loop, it terminates only the inner loop.'
	),
	isslot: new HTMLTagSpecification(
		'<isslot> can be used as a placeholder for where the content should be displayed. The id attribute is used by Business Manager to identify the slot in one or more slot configurations. The context attribute specifies the scope of the slot. The context-object attribute is required when the scope of the context attribute is either category or folder. The context-object attribute is used to lookup the slot configuration for the given slot. Use the description attribute to describe the slot.',
		['id', 'context:sltcontext', 'context-object', 'description', 'preview-url']
	)
}

export function getSFCCProvider(): IHTMLTagProvider {

	var globalAttributes = [];

	var valueSets: IValueSets = {
		b: ['true', 'false'],
		u: ['true', 'false', 'undefined'],
		o: ['on', 'off'],
		oe: ["on", "off", "htmlcontent", "htmlsinglequote", "htmldoublequote", "htmlunquote", "jshtml", "jsattribute", "jsblock", "jssource", "jsonvalue", "uricomponent", "uristrict", "xmlcontent", "xmlsinglequote", "xmldoublequote", "xmlcomment"],
		y: ['yes', 'no'],
		sc: ["session", "request", "page"],
		tz: ["SITE", "INSTANCE", "utc"],
		pst: ['MONEY_SHORT', 'MONEY_LONG', 'EURO_SHORT', 'EURO_LONG', 'EURO_COMBINED', 'INTEGER', 'DECIMAL', 'QUANTITY_SHORT', 'QUANTITY_LONG', 'DATE_SHORT', 'DATE_LONG', 'DATE_TIME'],
		contentenc: ["on", "off", "html", "xml", "wml"],
		ston: ['on'],
		sttype: ['relative', 'daily'],
		varyby: ['price_promotion'],
		sltcontext: ["global", "category", "folder"],
		tpl: []
	};

	return {
		setConfigs(configs) {
			if (configs && configs.templateIndex) {
				valueSets.tpl = configs.templateIndex;
			}
		},
		getId: () => 'sfcc',
		isApplicable: () => true,
		collectTags: (collector: (tag: string, label: string) => void) => collectTagsDefault(collector, SFCC_TAGS),
		collectAttributes: (tag: string, collector: (attribute: string, type: string) => void) => {
			collectAttributesDefault(tag, collector, SFCC_TAGS, globalAttributes);

		},
		collectValues: (tag: string, attribute: string, collector: (value: string) => void) => collectValuesDefault(tag, attribute, collector, SFCC_TAGS, globalAttributes, valueSets)
	};
}

function collectTagsDefault(collector: (tag: string, label: string) => void, tagSet: ITagSet): void {
	for (var tag in tagSet) {
		collector(tag, tagSet[tag].label);
	}
}

function collectAttributesDefault(tag: string, collector: (attribute: string, type: string) => void, tagSet: ITagSet, globalAttributes: string[]): void {
	globalAttributes.forEach(attr => {
		var segments = attr.split(':');
		collector(segments[0], segments[1]);
	});
	if (tag) {
		var tags = tagSet[tag];
		if (tags) {
			var attributes = tags.attributes;
			if (attributes) {
				attributes.forEach(attr => {
					var segments = attr.split(':');
					collector(segments[0], segments[1]);
				});
			}
		}
	}
}

function collectValuesDefault(tag: string, attribute: string, collector: (value: string) => void, tagSet: ITagSet, globalAttributes: string[], valueSets: IValueSets, customTags?: { [tag: string]: string[] }): void {
	var prefix = attribute + ':';
	var processAttributes = (attributes: string[]) => {
		attributes.forEach((attr) => {
			if (attr.length > prefix.length && strings.startsWith(attr, prefix)) {
				var typeInfo = attr.substr(prefix.length);
				if (typeInfo === 'v') {
					collector(attribute);
				} else {
					var values = valueSets[typeInfo];
					if (values) {
						values.forEach(collector);
					}
				}
			}
		});
	};
	if (tag) {
		var tags = tagSet[tag];
		if (tags) {
			var attributes = tags.attributes;
			if (attributes) {
				processAttributes(attributes);
			}
		}
	}
	processAttributes(globalAttributes);
	if (customTags) {
		var customTagAttributes = customTags[tag];
		if (customTagAttributes) {
			processAttributes(customTagAttributes);
		}
	}
}
/*!
END THIRD PARTY
*/
