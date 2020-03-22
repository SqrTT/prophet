

export var HTMLHint: Verifier;

export interface Verifier {
	verify(text: string): Error[];
}

export interface Error {
	type: 'warn' | 'error' | 'info' | 'hint',
	message: string,
	raw: string,
	evidence: string,
	line: number,
	col: number,
	rule: Rule
}

export interface Rule {
	id: string,
	description: string,
	link: string
}


