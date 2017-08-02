'use strict';

export function filterAsync<T>(array: T[], filter) {
	return Promise.all(array.map(entry => filter(entry)))
		.then(bits => array.filter(entry => bits.shift()));
}
