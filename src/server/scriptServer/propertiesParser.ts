
const EQS = '='.charCodeAt(0);
const COM = '#'.charCodeAt(0);
const NWL = '\n'.charCodeAt(0);
const CAR = '\r'.charCodeAt(0);
const LFD = '\f'.charCodeAt(0);
const WSP = ' '.charCodeAt(0);
const TAB = '\t'.charCodeAt(0);

interface IScannerRecord {
	recordName: string;
	startPos: number;
	endPos: number;
	value: string;
}

class Scanner {
	private position: number;
	private len: number;
	advance(n: number) {
		this.position += n;
	};
	constructor(private content: string) {
		this.len = content.length;
		this.position = 0;
	}
	public advanceWhileChar(condition: (ch: number) => boolean): number {
		const posNow = this.position;
		while (this.position < this.len && condition(this.content.charCodeAt(this.position))) {
			this.position++;
		}
		return this.position - posNow;
	}
	advanceUntilChar(ch: number): boolean {
		while (this.position < this.content.length) {
			if (this.content.charCodeAt(this.position) === ch) {
				return true;
			}
			this.advance(1);
		}
		return false;
	}
	eos() {
		return this.len <= this.position;
	}
	skipWhitespace(): boolean {
		const n = this.advanceWhileChar(ch => {
			return ch === WSP || ch === TAB || ch === NWL || ch === LFD || ch === CAR;
		});
		return n > 0;
	}
	getNextRecord() {
		this.skipWhitespace();
		if (!this.eos()) {
			if (this.content.charCodeAt(this.position) === COM) {
				// skip code till the end
				this.advanceUntilChar(NWL);
				this.skipWhitespace();
			}
			const startPos = this.position;
			if (this.advanceUntilChar(EQS)) {
				const endPos = this.position;
				const recordName = this.content.substring(startPos, endPos);
				this.advance(1);
				this.advanceUntilChar(NWL);
				return {
					recordName,
					startPos,
					endPos,
					value: this.content.substring(endPos + 1, this.position)
				}
			};
		}
	}
}

export function parse(content: string) {
	const scanner = new Scanner(content);
	const records: IScannerRecord[] = [];

	let value = scanner.getNextRecord();

	while (value) {
		records.push(value);
		value = scanner.getNextRecord();
	}

	return records;
}
