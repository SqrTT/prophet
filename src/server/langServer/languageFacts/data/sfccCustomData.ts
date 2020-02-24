/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// file generated from vscode-web-custom-data NPM package

import { HTMLDataV1 } from '../../htmlLanguageTypes';

export const ismlData: HTMLDataV1 = {
	"version": 1.1,
	"tags": [{
		name: 'isprint',
		attributes: [{
			name: 'value',
			values: [{
				name: '${}'
			}],
			description: {
				kind: "markdown",
				value: 'Allowed data type: expression only. String is not allowed output is an expression that resolves to the text you want to output.'
			}
		}, {
			name: 'encoding',
			valueSet: 'oe'
		}, {
			name: 'timezone',
			valueSet: 'tz'
		}, {
			name: 'padding'
		}, {
			name: 'style',
			valueSet: 'pst'
		}],
		description: {
			kind: "markdown",
			value: 'The `<isprint />` tag outputs the result of expressions and template variables. Even though it is possible to output expression results without `<isprint />`, you should always use it because it contributes to optimizing your template code.',
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/isprint.html'
		}]
	},
	{
		name: 'isset',
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/isset.html'
		}],
		description: {
			kind: "markdown",
			value:
				`'<isset>' can be used to define and set a user-defined variable. In B2C Commerce, every user-defined variable is of a specific scope, which defines the visibility and lifetime of the variable. B2C Commerce distinguishes between user-defined variables of the request, pdict, session and page scope.

Scope session means that the variable is accessible to all templates during a particular storefront session. The lifetime of a session variable ends with a session. A session variable can be used in expressions.

The first occurrence of <isset> in a template declares and sets the variable, there is no other special tag needed for declaration. If the variable already exists, <isset> resets it to the specified value.`
		},
		attributes: [{
			name: 'name'
		}, {
			name: 'value',
			values: [{
				name: '${}'
			}]
		}, {
			name: 'scope',
			valueSet: 'sc'
		}]
	}],
	"globalAttributes": [],
	"valueSets": [
		{
			"name": "b",
			"values": [
				{ "name": "true" },
				{ "name": "false" }
			]
		},
		{
			"name": "u",
			"values": [
				{ "name": "true" },
				{ "name": "false" },
				{ "name": "undefined" }
			]
		},
		{
			"name": "o",
			"values": [
				{ "name": "on" },
				{ "name": "off" }
			]
		},
		{
			"name": "oe",
			"values": [
				{ name: "on" },
				{ name: "off" },
				{ name: "htmlcontent" },
				{ name: "htmlsinglequote" },
				{ name: "htmldoublequote" },
				{ name: "htmlunquote" },
				{ name: "jshtml" },
				{ name: "jsattribute" },
				{ name: "jsblock" },
				{ name: "jssource" },
				{ name: "jsonvalue" },
				{ name: "uricomponent" },
				{ name: "uristrict" },
				{ name: "xmlcontent" },
				{ name: "xmlsinglequote" },
				{ name: "xmldoublequote" },
				{ name: "xmlcomment" }
			]
		},
		{
			"name": "y",
			"values": [
				{
					"name": "yes"
				},
				{
					"name": "no"
				}
			]
		},
		{
			"name": "sc",
			"values": [
				{ name: "session" },
				{ name: "request" },
				{ name: "page" }
			]
		},
		{
			"name": "tz",
			"values": [
				{ name: "SITE" },
				{ name: "INSTANCE" },
				{ name: "utc" }
			]
		},
		{
			"name": "pst",
			"values": [
				{ name: 'MONEY_SHORT' },
				{ name: 'MONEY_LONG' },
				{ name: 'EURO_SHORT' },
				{ name: 'EURO_LONG' },
				{ name: 'EURO_COMBINED' },
				{ name: 'INTEGER' },
				{ name: 'DECIMAL' },
				{ name: 'QUANTITY_SHORT' },
				{ name: 'QUANTITY_LONG' },
				{ name: 'DATE_SHORT' },
				{ name: 'DATE_LONG' },
				{ name: 'DATE_TIME' }
			]
		},
		{
			"name": "contentenc",
			"values": [
				{ name: "on" },
				{ name: "off" },
				{ name: "html" },
				{ name: "xml" },
				{ name: "wml" }
			]
		},
		{
			"name": "ston",
			"values": [
				{
					"name": "on"
				}
			]
		},
		{
			"name": "sttype",
			"values": [
				{
					"name": "relative"
				},
				{
					"name": "daily"
				}
			]
		},
		{
			"name": "varyby",
			"values": [
				{
					"name": "price_promotion"
				}
			]
		},
		{
			"name": "sltcontext",
			"values": [
				{
					"name": "global"
				},
				{
					"name": "category"
				},
				{
					"name": "folder"
				}
			]
		}
	]
};
