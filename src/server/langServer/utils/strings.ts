/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function startsWith(haystack: string, needle: string): boolean {
	if (haystack.length < needle.length) {
		return false;
	}

	for (let i = 0; i < needle.length; i++) {
		if (haystack[i] !== needle[i]) {
			return false;
		}
	}

	return true;
}

/**
 * Determines if haystack ends with needle.
 */
export function endsWith(haystack: string, needle: string): boolean {
	const diff = haystack.length - needle.length;
	if (diff > 0) {
		return haystack.lastIndexOf(needle) === diff;
	} else if (diff === 0) {
		return haystack === needle;
	} else {
		return false;
	}
}

/**
 * @returns the length of the common prefix of the two strings.
 */
export function commonPrefixLength(a: string, b: string): number {

	let i: number;
	const len = Math.min(a.length, b.length);

	for (i = 0; i < len; i++) {
		if (a.charCodeAt(i) !== b.charCodeAt(i)) {
			return i;
		}
	}

	return len;
}

export function repeat(value: string, count: number) {
	let s = '';
	while (count > 0) {
		if ((count & 1) === 1) {
			s += value;
		}
		value += value;
		count = count >>> 1;
	}
	return s;
}

const _a = 'a'.charCodeAt(0);
const _z = 'z'.charCodeAt(0);
const _A = 'A'.charCodeAt(0);
const _Z = 'Z'.charCodeAt(0);
const _0 = '0'.charCodeAt(0);
const _9 = '9'.charCodeAt(0);

export function isLetterOrDigit(text: string, index: number) {
	const c = text.charCodeAt(index);
	return (_a <= c && c <= _z) || (_A <= c && c <= _Z) || (_0 <= c && c <= _9);
}

function isInsideTag(str: string, pos : number) {
	if (pos < 1) {
		return false;
	} else {
		const openingExternalPos = str.lastIndexOf('<', pos - 1);
		if (openingExternalPos !== -1) {
			const closingInternal = str.indexOf('>', openingExternalPos);

			if (closingInternal > pos) {
				const closingExternal = str.indexOf('>', closingInternal + 1);

				const openingSecPos = str.lastIndexOf('<', closingExternal);
				return openingSecPos === pos;
			} else {
				return false;
			}
		} else {
			return false;
		}
	}
}

export function replaceIsPrintAttr (str: string, placeholder = '_') {
	let currentPos = -1;

	while ((currentPos = str.indexOf('<isprint', currentPos + 1)) !== -1) {
		if (isInsideTag(str, currentPos)) {
			const closingTag = str.indexOf('>', currentPos);
			const content = str.substr(currentPos, closingTag - currentPos + 1);
			str = str.substr(0, currentPos) + content.replace(/[^\n^\r]/ig, placeholder) + str.substr(closingTag + 1);
			currentPos = -1; // reset pos since content may shift
		}
	};
	return str;
}
