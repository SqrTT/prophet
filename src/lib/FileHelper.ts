'use strict';
import * as fs from 'fs';
import * as path from 'path';

export function getDirectories(srcpath) {
    return fs.readdirSync(srcpath)
        .filter(file => fs.lstatSync(path.join(srcpath, file)).isDirectory())
}

export function getFiles(srcpath) {
    return fs.readdirSync(srcpath)
        .filter(file => fs.lstatSync(path.join(srcpath, file)).isFile())
}

export function pathExists(p: string): boolean {
    try {
        fs.accessSync(p);
    } catch (err) {
        return false;
    }

    return true;
}