
import * as request from 'request';
import {relative, sep, resolve, join} from 'path';
import {Observable} from 'rxjs/Observable';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/filter';

interface DavOptions {
    hostname: string,
    username: string,
    password: string,
    version: string,
    root: string
}

export default class WebDav {
    config:DavOptions;
    log: (...string) => any;
    constructor (config, log = (() => {})) {
        this.config = Object.assign({}, {
            hostname: 'some.demandware.net',
            username: 'username',
            password: 'password',
            version: 'version1',
            root: '.'
        }, config);
        this.log = log;
    }
    dirList (filePath = '.', root = this.config.root) {
        const uriPath = relative(root, filePath);

        return Observable.create(observer => {
            const req = request(Object.assign(this.getOptions(), {
                uri: '/' + uriPath,
                headers: {
                    Depth: 1
                },
                method: 'PROPFIND'
            }), (err, res, body) => {
                if (err) {
                    observer.error(err);
                } else if (res.statusCode >= 400) {
                    observer.error(new Error(res.statusMessage));
                } else {
                    observer.next(body);
                }

                observer.complete();
            });

            return () => req.destroy();
        });
    }
    getOptions () {
        return {
            baseUrl: 'https://' + this.config.hostname + '/on/demandware.servlet/webdav/Sites/Cartridges/' +
                this.config.version,
            uri: '/',
            auth: {
                user: this.config.username,
                password: this.config.password
            },
            strictSSL: false
        };
    }
    makeRequest (options) {
        return Observable.create(observer => {
            this.log('request', options, this.getOptions());

            const req = request(
                Object.assign(this.getOptions(), options),
                (err, res, body) => {
                    this.log('response', body);
                    if (err) {
                        observer.error(err);
                    } else if (res.statusCode >= 400) {
                        observer.error(new Error(res.statusMessage));
                    } else {
                        observer.next(body);
                    }

                    observer.complete();
                }
            );
            return () => {
                req.destroy();
            };
        });
    }
    post (filePath, root = this.config.root) {
        const uriPath = relative(root, filePath),
            fs = require('fs');

        this.log('post', uriPath);
        return Observable.create(observer => {
           const req = request(Object.assign(this.getOptions(), {
                uri: '/' + uriPath,
                method: 'PUT'
            }), (err, res, body) => {
                this.log('post-response', uriPath, body);
                if (err) {
                    observer.error(err);
                } else if (res.statusCode >= 400) {
                    observer.error(new Error(res.statusMessage));
                } else {
                    observer.next(body);
                }

                observer.complete();
            });

            const outputStream = fs.createReadStream(filePath);

            outputStream.once('error', error => {
                observer.error(error);
            });

            outputStream.pipe(req);

            return () => {
                if (outputStream) {
                    outputStream.unpipe(req);
                    outputStream.close();
                    req.end();
                }
                req.destroy()
            };
        });
    }
    unzip (filePath, root = this.config.root) {
        const uriPath = relative(root, filePath);

        this.log('unzip', uriPath);
        return this.makeRequest({
            uri: '/' + uriPath,
            method: 'POST',
            form: {
                method: 'UNZIP'
            }
        }).do(data => {
            this.log('unzip-response', data);
        });
    }
    postAndUnzip (filePath) {
        return this.post(filePath).flatMap(() => this.unzip(filePath));
    }
    delete(filePath, optionalRoot) {
        const uriPath = relative(optionalRoot || this.config.root, filePath);

        return Observable.create(observer => {
            this.log('delete', uriPath);
            const req = request(Object.assign(this.getOptions(), {
                uri: '/' + uriPath,
                method: 'DELETE'
            }), (err, res, body) => {
                this.log('delete-response', uriPath, body);
                if (err) {
                    observer.error(err);
                } else if (res.statusCode >= 400 && res.statusCode !== 404) {
                    // it's ok to ignore 404 error if the file is not found
                    observer.error(new Error(res.statusMessage));
                } else {
                    observer.next(body);
                }

                observer.complete();
            });

            return () => req.destroy();
        });
    }
    getFileList(pathToCartridgesDir, options) {
        const walk = require('walk');
        const {isCartridge = false} = options;
        const {isDirectory = false} = options;
        const {ignoreList = ['node_modules', '\\.git']} = options;
        const processingFolder = pathToCartridgesDir.split(sep).pop();

        return Observable.create(observer => {

            let walker = walk.walk(pathToCartridgesDir, {
                filters: ignoreList,
                followLinks: false
            });

            function dispose() {
                if (walker) {
                    walker.removeAllListeners();
                    walker.pause();
                    walker = null;
                }
            }

            /**
             * When we have an empty Directory(eg, newly created cartridge), walking on "file" doesn't work.
             * So, we walk on "directories" and call function "addEmptyDirectory" to add
             * EMPTY DIRS to ZIP
             */
            if (isDirectory) {
                walker.on('directories', function (root, stats, next) {
                    stats.forEach(function (stat) {
                        const toFile = relative(isCartridge ?
                            pathToCartridgesDir.replace(processingFolder, '') :
                            pathToCartridgesDir, resolve(root, stat.name));

                        observer.next([toFile])
                    });
                    next();
                });
            } else {
                walker.on('file', (root, fileStat, next) => {
                    const file = resolve(root, fileStat.name);
                    const toFile = relative(isCartridge ?
                        pathToCartridgesDir.replace(processingFolder, '') :
                        pathToCartridgesDir, resolve(root, fileStat.name));

                    //this.log('adding to zip:', file);

                    observer.next([file, toFile])

                    next();
                });
            }

            walker.on('end', () => {
                observer.complete();
            });

            walker.on('nodeError', (__, {error}) => {
                observer.error(error);
                dispose();
            });
            walker.on('directoryError', (__, {error}) => {
                observer.error(error);
                dispose();
            });

            return dispose;
        });
    }
    deleteLocalFile(fileName) {
        const rimraf = require('rimraf');

        return Observable.create(observer => {
            let isCanceled = false;

            rimraf(fileName, () => {
                if (!isCanceled) {
                    observer.next();
                    observer.complete();
                }
            });
            // setTimeout(() => {
            //         observer.next();
            //         observer.complete();
            // });


            return () => {isCanceled = true}
        });
    }
    zipFiles(pathToCartridgesDir, cartridgesPackagePath, options) {
        const yazl = require('yazl');
        const fs = require('fs');

        return Observable.create(observer => {
            const zipFile = new yazl.ZipFile();
            var inputStream, outputStream;

            const subscription = this.getFileList(pathToCartridgesDir, options).subscribe(
                // next
                files => {
                    if (files.length === 1) {
                        zipFile.addEmptyDirectory(files[0]);
                    } else if (files.length === 2) {
                        zipFile.addFile(files[0], files[1]);
                    } else {
                        observer.error(new Error('Unexpected argument'));
                    }
                },
                // error
                err => {
                    observer.error(err);
                },
                // complite
                () => {
                    zipFile.end();
                    inputStream = fs.createWriteStream(cartridgesPackagePath);
                    outputStream = zipFile.outputStream;

                    zipFile.outputStream
                        .pipe(inputStream)
                        .once('close', () => {observer.next(); observer.complete()})
                        .once('error', err => observer.error(err));
                }
            );

            return () => {
                if (outputStream && inputStream) {
                    outputStream.unpipe(inputStream);
                    inputStream.end();
                }

                subscription.unsubscribe()
            }
        });
    }
    uploadCartridges (
        pathToCartridgesDir,
        notify = (string) => {},
        options = {}
    ) {


        const processingFolder = pathToCartridgesDir.split(sep).pop();
        const cartridgesZipFileName = join(pathToCartridgesDir, processingFolder + '_cartridge.zip');


        return this.deleteLocalFile(cartridgesZipFileName)
            .do(() => {
                notify(`[${processingFolder}] Deleting local zip`);
            })
            .flatMap(() => {
                notify(`[${processingFolder}] Zipping`);
                return this.zipFiles(pathToCartridgesDir, cartridgesZipFileName, options)
            })
            .flatMap(() => {
                notify(`[${processingFolder}] Deleting remote zip`);
                return this.delete(cartridgesZipFileName, pathToCartridgesDir)
            })
            .flatMap(() => {
                notify(`[${processingFolder}] Sending zip to remote`);
                return this.post(cartridgesZipFileName, pathToCartridgesDir)
            })
            .flatMap(() => {
                notify(`[${processingFolder}] Deleting local zip...`);
                return this.deleteLocalFile(cartridgesZipFileName);
            })
            .flatMap(() => {
                notify(`[${processingFolder}] Unzipping remote zip`);
                return this.unzip(cartridgesZipFileName, pathToCartridgesDir)
            })
            .flatMap(() => {
                notify(`[${processingFolder}] Deleting remote zip...`);
                return this.delete(cartridgesZipFileName, pathToCartridgesDir)
            })
            .filter(() => false);
    }
}

