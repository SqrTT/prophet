import {Observable} from 'rxjs/Observable';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/observable/merge';
import 'rxjs/add/operator/concat';
import 'rxjs/add/operator/retry';


import {Disposable, window, OutputChannel, workspace} from 'vscode';
import WebDav from './WebDav';
import {dirname, join} from 'path';
import {readFile, readdirSync, statSync} from 'fs';
import * as chokidar from 'chokidar';

function tryParse(str: string) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}

function getDirectories(srcPath) {
    return readdirSync(srcPath).filter(file => statSync(join(srcPath, file)).isDirectory())
};


function fileWatcher(config, cartRoot : string) {
    return Observable.create(observer => {
        const cartridges = config.cartridge || getDirectories(cartRoot);

        const watcher = chokidar.watch(null, {
            ignored: [
                '**/node_modules/**',
                '**/.git/**',
                `**/cartridge/js/**`,
                `**/cartridge/client/**`
            ],
            persistent: true,
            ignoreInitial: true,
            followSymlinks: false
        });

        watcher.on('change', path => observer.next(['upload', path]));
        watcher.on('add', path => observer.next(['upload', path]));
        watcher.on('unlink', path => observer.next(['delete', path]));
        watcher.on('error', err => observer.error(err));

        cartridges.forEach(cartridge => {
            if (workspace.rootPath) {
                watcher.add(join(cartRoot, cartridge) + '/**/*.*');
            }
        });

        return () => {
            watcher.close();
        }
    });
}

const uploadCartridges = (webdav : WebDav, outputChannel : OutputChannel, config : any, cartRoot: string) => {

    const cartridges = config.cartridge || getDirectories(cartRoot);
    const toUpload = cartridges
        .map(str => str.trim())
        .filter(Boolean)
        .map(cartridge => {
            const notify = (...msgs) => {
                outputChannel.appendLine(msgs.join(' '));
            };
            const dirToUpload = join(cartRoot, cartridge);
            return webdav
                .uploadCartridges(dirToUpload, notify, {isCartridge: true});
        });
    return Observable.merge(...toUpload, 2).concat(Promise.resolve(1));
}


function uploadAndWatch(webdav : WebDav, outputChannel : OutputChannel, config : any, rootDir: string) {
    return Observable.create(observer => {
        const subscription = webdav.dirList(rootDir)
            .do(() => {
                outputChannel.appendLine(`Connection validated successfully`);
            }).flatMap(() => {
                outputChannel.appendLine(`Start uploading cartridges`);
                return uploadCartridges(webdav, outputChannel, config, rootDir);
            }).do(() => {
                outputChannel.appendLine(`Cartridges uploaded successfully`);
            }).flatMap(() => {
                outputChannel.appendLine(`Watching files`);
                return fileWatcher(config, rootDir)
                    .mergeMap(([action, fileName]) => {
                        if (action === 'upload') {
                            outputChannel.appendLine(`Uploading file: "${fileName}"`);

                            return webdav.post(fileName, rootDir);
                        } else if (action === 'delete') {
                            outputChannel.appendLine(`Deleting file: "${fileName}"`);

                            return webdav.delete(fileName, rootDir);
                        } else {
                            throw Error('Unknown action');
                        }
                    }, 10)
            }).subscribe(
                () => {},
                err => {
                    outputChannel.appendLine(`"${err}"`);
                    outputChannel.appendLine(`Trying to re-upload`);
                    observer.error(err);
                },
                () => observer.complete()
            )
        return () => subscription.unsubscribe();
    });
}
export async function init(configFilename: string) {
    const outputChannel = window.createOutputChannel('Prophet Uploader');
    let webdav : WebDav;
    let currentOperation;
    outputChannel.append(`Starting...\n`);
    outputChannel.append(`Using config file "${configFilename}"\n`);

    readFile(configFilename, (err, data) => {
        if (err) {
            outputChannel.show();
            outputChannel.append(`Error: ${err}\n`);
        } else {
            const config = tryParse(data.toString());
            const rootDir = dirname(configFilename);

            if (config) {
                outputChannel.append(`Using directory "${rootDir}" as cartridges root\n`);

                webdav = new WebDav({
                    hostname: config.hostname,
                    username: config.username,
                    password: config.password,
                    version: config['code-version'] || config.version,
                    root: rootDir
                    }, config.debug ?
                        (...msgs) => {outputChannel.appendLine(`${msgs.join(' ')}`)} :
                        () => {}
                );

                currentOperation = uploadAndWatch(webdav, outputChannel, config, rootDir)
                    .retry(4)
                    .subscribe(
                        () => {},
                        err => {
                            outputChannel.show();
                            outputChannel.append(`Error: ${err}\n`);
                        },
                        () => {
                            outputChannel.appendLine(`+++ END!`);
                        }
                    );

            } else {
                outputChannel.show();
                outputChannel.append(`Error: Unable parse cofig\n`);
            }
        }
    });

    return new Disposable(() => {
        outputChannel.dispose();
        if (currentOperation) {
            currentOperation.unsubscribe();
        }
    });
}