export function getLineOffsets(text: string) {
	var lineOffsets: number[] = [];
	var isLineStart = true;
	for (var i = 0; i < text.length; i++) {
		if (isLineStart) {
			lineOffsets.push(i);
			isLineStart = false;
		}
		var ch = text.charAt(i);
		isLineStart = (ch === '\r' || ch === '\n');
		if (ch === '\r' && i + 1 < text.length && text.charAt(i + 1) === '\n') {
			i++;
		}
	}
	if (isLineStart && text.length > 0) {
		lineOffsets.push(text.length);
	}
	return lineOffsets;
}
;
export function positionAt(offset: number, content: string) {
	offset = Math.max(Math.min(offset, content.length), 0);
	var lineOffsets = getLineOffsets(content);
	var low = 0, high = lineOffsets.length;
	if (high === 0) {
		return { line: 0, character: offset };
	}
	while (low < high) {
		var mid = Math.floor((low + high) / 2);
		if (lineOffsets[mid] > offset) {
			high = mid;
		}
		else {
			low = mid + 1;
		}
	}
	// low is the least x for which the line offset is larger than the current offset
	// or array.length if no line offset is larger than the current offset
	var line = low - 1;
	return {
		line: line, character: offset - lineOffsets[line]
	};
}
