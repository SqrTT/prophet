/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { getHTML5TagProvider, IHTMLTagProvider, getSFCCProvider } from '../parser/htmlTags';


export let allTagProviders: IHTMLTagProvider[] = [
	getHTML5TagProvider(),
	//getAngularTagProvider(),
	getSFCCProvider()
];
