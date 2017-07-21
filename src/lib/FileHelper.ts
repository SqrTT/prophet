'use strict';
import * as fs from 'fs';
import * as path from 'path';

export async function getDirectories(srcpath): Promise<string[]> {
    return new Promise<string[]>(resolve => {
        fs.readdir(srcpath, function (err, result: string[]) {
            resolve(result.filter(file => fs.lstatSync(path.join(srcpath, file)).isDirectory()));
        })
    });
}

export function getFiles(srcpath): Promise<string[]> {
    return new Promise<string[]>(resolve => {
        fs.readdir(srcpath, function (err, result: string[]) {
            resolve(result.filter(file => fs.lstatSync(path.join(srcpath, file)).isFile()));
        });
    });
}

export function pathExists(p: string): boolean {
    try {
        fs.accessSync(p);
    } catch (err) {
        return false;
    }

    return true;
}