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
			valueSet: 'oe',
			description: {
				kind: "markdown",
				value: 'Default value is on. With this attribute, you can explicitly switch automatic encoding on and off. Salesforce B2C Commerce supports encoding in HTML, XML and WML. Even if encoding is turned off, you an use the StringUtil API to encode individual strings.\n' +
					'The context element enables you to encode data to avoid cross-site scripting attacks in areas such as HTML attributes, XML, JavaScript, and JSON. Each value maps to a method in the SecureEncoder Class.\n' +
					' * `htmlcontent`: encodes a given input for use in a general context.\n' +
					' * `htmlsinglequote`: encodes a given input for use in an HTML Attribute guarded by a single quote.\n' +
					' * `htmldoublequote`: encodes a given input for use in an HTML Attribute guarded by a double quote.\n' +
					' * `htmlunquote`: encodes a given input for use in an HTML Attribute left unguarded.\n' +
					' * `jshtml`: encodes a given input for use in JavaScript inside an HTML context.\n' +
					' * `jsattribute`: encodes a given input for use in JavaScript inside an HTML attribute.\n' +
					' * `jsblock`: encodes a given input for use in JavaScript inside an HTML block.\n' +
					' * `jssource`: encodes a given input for use in JavaScript inside a JavaScript source file.\n' +
					' * `jsonvalue`: encodes a given input for use in a JSON Object Value to prevent escaping into a trusted context.\n' +
					' * `uricomponent`: encodes a given input for use as a component of a URI.\n' +
					' * `uristrict`: encodes a given input for use as a component of a URI.\n' +
					' * `xmlcontent`: encodes a given input for use in an XML comments.\n' +
					' * `xmlsinglequote`: encodes a given input for use in an XML attribute guarded by a single quote.\n' +
					' * `xmldoublequote`: encodes a given input for use in an XML attribute guarded by a double quote.\n' +
					' * `xmlcomment`: encodes a given input for use in a general XML context.\n'
			}
		}, {
			name: 'timezone',
			valueSet: 'tz',
			description: {
				kind: "markdown",
				value: 'specify a particular time zone used for printing dates. This attribute enables to specify whether you want to print dates with the instance time zone, the site time zone or without time zone conversion.\n\n' +
					'Example: \n\n```html' +
					'<isprint value="${new Date()}" style="DATE_LONG" timezone="SITE">\n' +
					'<isprint value="${new Date()}" style="DATE_LONG" timezone="INSTANCE">\n' +
					'<isprint value="${customer.birthday}" style="DATE_SHORT" timezone="utc"/>\n```'
			}
		}, {
			name: 'padding',
			description: {
				kind: "markdown",
				value: 'used only with mail templates, which are templates using plain rather than html type, to define field width and other spacing issues. For example, when printing a list of product names using a loop statement, you can define a constant field width for every element of the list. The value for padding can be any positive or negative number. The absolute value of padding_constant defines the field width. A positive value produces left-aligned output; a negative value produces right-aligned output. If the output string is greater than the field size, the output string is truncated at its right end.'
			}
		}, {
			name: 'style',
			description: {
				kind: "markdown",
				value: 'specifies a style identifier. Instead of using the style parameter, you can alternatively define a formatter string with the formatter attribute.'
			},
			valueSet: 'pst'
		}, {
			name: 'formatter',
			description: {
				kind: "markdown",
				value: 'defines a formatting string to control how <isprint> outputs expression results. For information on building your own formatter string, refer to Formatting Expression Results (which follows). If formatter is used, style must be omitted.'
			},
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
	}, {
		name: 'isif',
		description: {
			kind: "markdown",
			value: 'Creating conditional template code and controlling the flow of business logic. The <isif> tag group allows you to create conditional programming constructs using custom tags.'
		},
		attributes: [{
			name: 'condition',
			description: 'expression evaluates to a boolean value. If the <isif> condition is `true`, the system executes the code immediately following the <isif> tag, ignoring the enclosed <iselseif> and <iselse> tags. If the <isif> condition is `false`, the system ignores the code immediately following the <isif> tag, and then tests each <iselseif> condition in order. When the system finds a true <iselseif> condition, the system executes the code immediately following the <iselseif> tag and ignores any remaining <iselseif> and <iselse> tags. If all <iselseif> conditions are `false`, the system executes the code following the <iselse> tag.',
			values: [{
				name: '${}'
			}]
		}]
	}, {
		name: 'isloop',
		description: {
			kind: "markdown",
			value: 'Creating loops for flow control. \nWith `<isloop>` you can loop through the elements of a specified iterator. As an example, you can list data like categories, products, shipping and payment methods. `<isloop>` statements can be nested in one another.' +
				'\n Supporting Tags \n * Use `<isbreak/>` to unconditionally terminate a loop.\n * Use `<isnext/>` to jump forward in a loop'
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/isloop.html'
		}],
		attributes: [
			{
				name: 'items',
				description: {
					kind: "markdown",
					value: 'expression that returns an object to iterate over. Attributes iterator and items can be used interchangeably.'
				}
			},
			{
				name: 'iterator',
				description: {
					kind: "markdown",
					value: 'expression that returns an object to iterate over. Attributes iterator and items can be used interchangeably.'
				}
			},
			{
				name: 'alias',
				description: {
					kind: "markdown",
					value: 'Name of the variable referencing the object in the iterable collection referenced in the current iteration.'
				}
			},
			{
				name: 'var',
				description: {
					kind: "markdown",
					value: 'Name of the variable referencing the object in the iterable collection referenced in the current iteration.'
				}
			},
			{
				name: 'status',
				description: {
					kind: "markdown",
					value: 'variable name referencing the loop status object. The loop status is used to query information such as the counter or whether its the first item.\n\n' +
						'If status is specified, a loop status object is assigned to the given variable name. Below are the properties of the loop status object:\n\n' +
						'| Attribute | Description |\n' +
						'| --------- | ----------- |\n' +
						'|count|The number of iterations, starting with 1.|\n' +
						'|index|The current index into the set of items, while iterating.|\n' +
						'|first|`true`, if this is the first item while iterating (count == 1).|\n' +
						'|last|`true`, if this is the last item while iterating.|\n' +
						'|odd|`true`, if count is an odd value.|\n' +
						'|even|`true`, if count is an even value.|\n'
				}
			},
			{
				name: 'begin',
				description: {
					kind: "markdown",
					value: 'expression specifying a begin index for the loop. If the begin is greater than 0, the <isloop> skips the first x items and starts looping at the begin index. If begin is smaller than 0, 0 is used as the begin value.'
				}
			},
			{
				name: 'end',
				description: {
					kind: "markdown",
					value: 'expression specifying an end index (inclusive). If end is smaller than begin, the <isloop> is skipped.'
				}
			},
			{
				name: 'step',
				description: {
					kind: "markdown",
					value: 'expression specifying the step used to increase the index. If step is smaller than one, one is used as the step value.'
				}
			}
		]
	}, {
		name: 'iscomment',
		attributes: [],
		description: {
			kind: 'markdown',
			value: 'Use <iscomment> to document your templates, to include reminders or instructions for yourself and others who work with the system without making them available to anyone who "views source" on the page. Anything enclosed in an <iscomment>... </iscomment> structure isn\'t parsed by the template processor and doesn\'t appear in the generated storefront page. \n\n' +
				' HTML comments created by surrounding the text with the character strings <!-- and --> are now deprecated. This is because this commenting method provides no confidentiality. Anyone can use a browsers View | Source menu to see the HTML code, including the comments.'
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/iscomment.html'
		}]
	}, {
		name: 'isreplace',
		attributes: [],
		description: {
			kind: 'markdown',
			value: 'The decorator template uses the tag <isreplace/> to identify where the decorated content is to be included. Typically, only one tag (<isreplace/>) is used in the decorator template. However, multiple or zero <isreplace/> tags can also be used.' +

				'\nIf the decorating template doesn\'t have an <isreplace/> tag, the decorated content is, effectively, omitted from the resultant output. If the decorator template has multiple <isreplace/> tags, the content to be decorated is included for each <isreplace/> tag.'
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/isreplace.html'
		}]
	}, {
		name: 'isdecorate',
		attributes: [{
			name: 'template',
			description: {
				kind: 'plaintext',
				value: 'the name of the decorator template that is used to decorate the contents.'
			}
		}],
		description: {
			kind: 'markdown',
			value: 'This tag lets you decorate the enclosed content with the contents of the specified (decorator) template.\n' +
				'The decorator template has the tag <isreplace/> identifying where the decorated content shall be included. Typically, only one tag (<isreplace/>) is used in the decorator template. However, multiple or zero <isreplace/> tags can also be used. If the decorating template doesn\'t have an <isreplace/> tag, the decorated content is omitted from the resultant output. If the decorator template has multiple <isreplace/> tags, the content to be decorated will be included for each <isreplace/> tag.'
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/isdecorate.html'
		}]
	}, {
		name: 'isscript',
		attributes: [],
		description: {
			kind: 'markdown',
			value: 'The <isscript> tag supports server-side scripts for scriptlets and inline script expressions, using ${ } syntax. The script expressions are supported everywhere expressions are supported, including in tags and inline.'
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/isscript.html'
		}]
	}, {
		name: 'isinclude',
		attributes: [{
			name: "template",
			description: {
				kind: 'plaintext',
				value: 'specifies the name and location of the included template. Use a fixed value or an expression. This is a local include.'
			}
		}, {
			name: "url",
			description: {
				kind: 'plaintext',
				value: ' specifies a URL via a literal string or an expression. This includes the content of this URL, typically a URL from the same server. This is a remote include.'
			}
		}, {
			name: "sf-toolkit",
			valueSet: 'o'
		}],
		description: {
			kind: "markdown",
			value: 'Includes the contents of one template inside another or the contents of another URL. The template being included can be as complex as an entire page template, or as simple as a single line of HTML code.\n\n' +

				'Iterators used in the including template can be referenced from the included template. This is particularly useful if you want to use an included template in a loop statement. To avoid infinite template processing caused by self-includes, the maximum include depth is fixed to 10.'
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/isinclude.html'
		}]
	}, {
		name: 'iscontent',
		description: {
			kind: 'plaintext',
			value: 'modifies the HTTP header (sets the content type) of the generated output stream sent to the browser or email client. The HTTP header is identified by its MIME type.'
		},
		attributes: [{
			name: 'type',
			values: [{ name: 'text/html' }],
			description: {
				kind: 'markdown',
				value: 'specifies the MIME type of the generated output stream. If no type is specified, the MIME_type is set to `text/html`. Generally, storefront pages and email output are set to `text/html`.Use an expression for dynamic content types. You can set the encoding explicitly using the charset attribute, or determine it implicitly from the content type.'
			}
		}, {
			name: 'encoding',
			valueSet: 'contentenc'
		}, {
			name: 'compact',
			valueSet: 'b'
		}, {
			name: 'charset',
			'values': [{ name: 'UTF-8' }]
		}],
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/iscontent.html'
		}]
	}, {
		name: 'iscache',
		attributes: [{
			name: 'status',
			values: [{ name: 'on' }],
			description: {
				kind: 'plaintext',
				value: 'Before <iscache status="off"/> was deprecated, it was necessary to set <iscache status="on"/> to enable page caching. Now the presence of the <iscache/> tag implicitly enables page caching, and it is no longer necessary to set <iscache status="on"/>.'
			}
		}, {
			name: 'type',
			valueSet: 'sttype',
		}, {
			name: 'hour',
		}, {
			name: 'minute'
		}, {
			name: 'varyby',
			valueSet: 'varyby',
			description: {
				kind: 'plaintext',
				value: 'lets you mark a page as personalized. Salesforce B2C Commerce identifies unique pages based on a combination of price book, promotion, sorting rule and customization*, caches the different variants of the page, and then delivers the correct version to the user. If a page is personalized by means other than price book, promotion, sorting rule and customization, the page must not be cached, because the wrong variants of the page would be delivered to the user. For performance reasons, a page should be only marked with the varyby property if the page is personalized. Otherwise, the performance can unnecessarily degrade.'
			}
		}, {
			name: 'if',
			description: {
				kind: 'plaintext',
				value: 'This must be a boolean expression. Anything else returns an error.'
			}
		}],
		description: {
			kind: 'markdown',
			value: 'To improve the performance of the online storefront by caching pages and also enable developers to disable page caching.\n\n' +

				'The requested storefront page is retrieved from the cache without running the pipeline that invokes the template and generates the desired page.\n\n' +

				'	Note: It isn\'t always possible or desirable to cache a page. For example, there are restrictions for caching pages that contain buyer-related data, such as address or basket information, or for pages containing framesets. See also Page Caching.\n\n' +
				'If you want a storefront page to be cached after the response is generated to the first request for the template, you must include the <iscache> tag in the template. The tag allows you to specify when the cached page should expire from the cache; after a fixed period or daily at a particular time, for example.\n\n' +

				'The tag can be located anywhere in the template. If the tag occurs several times in one template, the one set to cache off or the one with the shortest cache time is used as the cache setting for the resulting page. This is a safety mechanism, whereby content that isn\'t explicitly labeled for caching is never cached.'
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/iscache.html'
		}]
	}, {
		name: 'iselse',
		attributes: [],
		description: {
			kind: 'markdown',
			value: 'Use with `<isif>` to specify what happens if neither the `<isif>` condition nor any `<iselseif>` conditions evaluate to true.'
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/iselse.html'
		}]
	}, {
		name: 'iselseif',
		attributes: [{
			name: 'condition',
			description: {
				kind: 'markdown',
				value: 'evaluates to a boolean value. If the `<isif>` condition is `true`, the system executes the code immediately following the `<isif>` tag, ignoring the enclosed `<iselseif>` and `<iselse>` tags. If the `<isif>` condition is `false`, the system ignores the code immediately following the `<isif>` tag, and then tests each `<iselseif>` condition in order. When the system finds a `true` `<iselseif>` condition, the system executes the code immediately following the `<iselseif>` tag and ignores any remaining `<iselseif>` and `<iselse>` tags. If all `<iselseif>` conditions are `false`, the system executes the code following the `<iselse>` tag.'
			}
		}],
		description: {
			kind: 'markdown',
			value: 'Use with `<iselseif>` to specify a subcondition off an `<isif>` tag.'
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/iselseif.html'
		}]
	}, {
		name: 'isredirect',
		attributes: [{
			name: 'location',
			description: 'specifies a target URL used by the browser to send a new request.'
		}, {
			name: 'permanent',
			valueSet: 'b',
			description: ' causes the system to generate an HTTP 301 response code if set to true or HTTP 302 in case false'
		}],
		description: {
			kind: 'markdown',
			value: 'Use `<isredirect>` to redirect the browser to a specified URL.\n\n' +

				'	*Note*: `<isredirect>` appears before `<iscache>` in templates, because it clears the response created up to that point.'
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/isredirect.html'
		}]
	}, {
		name: 'iscontinue',
		attributes: [],
		description: {
			kind: 'markdown',
			value: 'Stops processing the current item in the loop and starts the next item in loop. The `<iscontinue/>` tag differs from the `<isnext/>` tag in that `isnext` just moves the iterator forward one and continues processing next line of code. `<iscontinue>` breaks out of the processing and then moves to top of loop to start processing again, if there are other items to process.\n\n' +

			'`<iscontinue/>` can be used only within an <isloop>... </isloop> loop structure. It\'s similar to "continue" in Java.'
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/iscontinue.html'
		}]
	}, {
		name: 'ismodule',
		description: '',
		attributes: [{
			name: 'template',
			description: 'Defines a path and a name for the template implementing the tag. Relative paths are expanded from the server\'s template root directory.'
		}, {
			name: 'name',
			description: 'the name of the custom tag. Custom tags are always declared without the is prefix, for example, mytag. However, when using the custom tag in a template, you must include the is prefix like this: <ismytag>. Custom tags can use either case.'

		}, {
			name: 'attribute',
			description: 'Specifies attributes you want your custom tag to have. You can have as many attributes as you want. Attributes are not required.'
		}],
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/ismodule.html'
		}]
	}, {
		name: 'isbreak',
		attributes: [],
		description: {
			kind: 'markdown',
			value: 'Terminating loops unconditionally.\n' +

			'`<isbreak/>` can be used within a loop (defined by an <isloop> tag) to terminate a loop unconditionally. For more information on creating loops see `<isloop>`. If `<isbreak>` is used in a nested loop, it terminates only the inner loop.'
		},
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/isbreak.html'
		}]
	}, {
		name: 'isslot',
		description: {
			kind: 'markdown',
			value: '<isslot> can be used as a placeholder for where the content should appear. The id attribute is used by Business Manager to identify the slot in one or more slot configurations. The context attribute specifies the scope of the slot. The context-object attribute is required when the scope of the context attribute is either category or folder. The context-object attribute is used to lookup the slot configuration for the given slot. Use the description attribute to describe the slot.\n\n' +
			'In Business Manager, slots are grouped by context scope. Global slots are grouped together, category slots are grouped together, and folder slots are grouped together.\n\n' +
			'For *Global* slots, Business Manager shows the following values:\n' +
			' * Slot ID\n' +
			' * Description\n' +
			' * Number of slot configurations created\n\n' +
			'For *Category* slots, Business Manager shows the following values:\n' +
			' * Category (assuming the category\'s configuration specifies a template that includes the <isslot> tag)\n' +
			' * Category name\n' +
			' * Rendering template name\n' +
			' * Slot ID\n' +
			' * Description\n' +
			' * Number of slot configurations created\n\n' +
			'For *Folder* slots, Business Manager shows the following values:\n' +
			' * Folder ID (assuming the folder\'s configuration specifies a template that includes the <isslot> tag)\n' +
			' * Folder name\n'+
			' * Rendering template name\n'+
			' * Slot ID\n'+
			' * Description\n'+
			' * Number of slot configurations created\n\n'+
			'When no slot is defined in the database for a given slot ID, the <isslot> tag does not render any content. An entry is written to the log file to identify this occurrence.'
		},
		attributes: [{
			name: 'id',
			description: 'identifies the slot in a slot configuration.'
		}, {
			name: 'context',
			valueSet: 'sltcontext',
			description: 'Scope of the slot'
		}, {
			name: 'context-object',
			description: 'expression that evaluates to a category or folder object'
		}, {
			name: 'description',
			description: 'describes the slot for the business user who needs to configure it'
		}, {
			name: 'preview-url',
			description: 'identifies the URL used within Business Manager to preview the content slot. It you don\'t specify a value, a default URL is used.'
		}],
		references: [{
			name: 'SFCC Docs',
			url: 'https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/ISML/isslot.html'
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
