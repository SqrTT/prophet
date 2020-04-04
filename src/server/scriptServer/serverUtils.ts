export function insertParents(ast: any) {
	(function walk(node, parent) {
		node.parent = parent;

		Object.keys(node).forEach(function (key) {
			if (key === 'parent') return;

			var child = node[key];
			if (Array.isArray(child)) {
				child.forEach(function (c) {
					if (c && typeof c.type === 'string') {
						walk(c, node);
					}
				});
			} else if (child && typeof child.type === 'string') {
				walk(child, node);
			}
		});
	})(ast, undefined);
}

export function removeExt(filename: string) {
	return filename.replace(/\.(js|json)$/, '')
}



export interface ICartridge {
	name: string;
	fsPath: string;
	files: { path: string, fsPath: string }[]
}
export interface IEndpoint {
	name: string,
	mode: 'get' | 'post' | 'append' | 'prepend' | 'use' | 'replace',
	start: number,
	end: number,
	startPosition: {
		line: number,
		character: number
	},
	endPosition: {
		line: number,
		character: number
	},
	endShow: {
		line: number,
		character: number
	},
	startShow: {
		line: number,
		character: number
	}
}
export interface IController {
	name: string,
	fsPath: string,
	endpoints: IEndpoint[]
}

export interface ICartridgeControllers {
	name: string;
	fsPath: string,
	controllers: IController[]
}

export interface IPropertyRecord {
	startPosition: {
		line: number,
		character: number,
	},
	endPosition: {
		line: number,
		character: number
	},
	value: string
}
export interface IProperty {
	name: string;
	linesCount: number;
	fsPath: string,
	records: Map<string, IPropertyRecord>
}
export interface ICartridgeProperties {
	name: string;
	fsPath: string,
	properties: Map<string, IProperty>
}
