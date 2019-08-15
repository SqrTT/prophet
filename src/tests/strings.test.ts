import * as assert from 'assert';

import { replaceIsPrintAttr } from '../server/langServer/utils/strings';

suite('Strings', () => {
	test('Simple isprint', () => {
		const a = `<input value="<isprint value="" encoding="on" />" />`;
		const expected = `<input value="__________________________________" />`;

		assert.equal(replaceIsPrintAttr(a), expected);
	});

	test('Simple unclosed isprint', () => {
		const a = `<input value="<isprint value="" encoding="on"  />`;
		const expected = a;

		assert.equal(replaceIsPrintAttr(a), expected, 'Should not change unclosed tags');
	});

	test('no isprint', () => {
		const a = `<input value="sdfsdf" />`;
		const expected = `<input value="sdfsdf" />`;

		assert.equal(replaceIsPrintAttr(a), expected);
	});

	test('multiline isprint', () => {
		const a = `<input value="
			<isprint value="" encoding="on" />" />`;
		const expected = `<input value="
			__________________________________" />`;

		assert.equal(replaceIsPrintAttr(a), expected);
	});

	test('aside isprint', () => {
		const a = `<input value="dd" /><isprint value="" encoding="on" />`;
		const expected = `<input value="dd" /><isprint value="" encoding="on" />`;

		assert.equal(replaceIsPrintAttr(a), expected);
	});

	test('singe isprint', () => {
		const a = `<isprint value="" encoding="on" />`;
		const expected = `<isprint value="" encoding="on" />`;

		assert.equal(replaceIsPrintAttr(a), expected);
	});
});
