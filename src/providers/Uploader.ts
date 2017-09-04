import { Observable } from 'rxjs/Observable';
import { window, OutputChannel, ExtensionContext, workspace, commands } from 'vscode';
import { join } from "path";
import * as glob from 'glob';
import { LogsView } from "./LogsView";
import * as uploadServer from "../server/uploadServer";
import { Subscription } from "rxjs/Subscription";

let logsView: LogsView | undefined;
const rootPath = workspace.rootPath || '';

/**
 * Class for handling the server upload integration
 */
export default class Uploader {
    private outputChannel : OutputChannel;
    private configuration;
    private prevState;
    private uploaderSubscription : Subscription|null;

    /**
     * 
     * @param configuration the workspace configuration to use
     */
    constructor (configuration){
        this.outputChannel = window.createOutputChannel('Prophet Uploader');
        this.configuration = configuration;
    }

    /**
     * Returns the enabled status from the configuration
     */
    isUploadEnabled() {
        return this.configuration.get('upload.enabled');
    }

    /**
     * Loads the uploader configuration and start the server
     * 
     * @param rootPath 
     * @param context 
     */
    loadUploaderConfig(rootPath: string, context: ExtensionContext) {
        if (this.uploaderSubscription) {
            this.uploaderSubscription!.unsubscribe();
            this.uploaderSubscription = null;
            this.outputChannel.appendLine(`Restarting`);
        } else {
            this.outputChannel.appendLine(`Starting...`);
        }
    
        this.uploaderSubscription = Observable.create(observer => {
            let subscription;
    
            glob('**/dw.json', {
                cwd: rootPath,
                root: rootPath,
                nodir: true,
                follow: false,
                ignore: ['**/node_modules/**', '**/.git/**']
            }, (error, files: string[]) => {
                if (error) {
                    observer.error(error);
                } else if (files.length && workspace.rootPath) {
                    const configFilename = join(rootPath, files.shift() || '');
                    this.outputChannel.appendLine(`Using config file '${configFilename}'`);

                    subscription = uploadServer.init(configFilename, this.outputChannel)
                        .subscribe(
                        () => {
                            // reset counter to zero if success
                        },
                        err => {
                            observer.error(err);
                        },
                        () => {
                            observer.complete();
                        }
                    );

                    if (!logsView) {
                        uploadServer.readConfigFile(configFilename).flatMap(config => {
                            return uploadServer.getWebDavClient(config, this.outputChannel, rootPath);
                        }).subscribe(webdav => {
                            logsView = new LogsView(webdav);
                            context.subscriptions.push(
                                window.registerTreeDataProvider('dwLogsView', logsView)
                            );

                            context.subscriptions.push(commands.registerCommand('extension.prophet.command.refresh.logview', () => {
                                if (logsView) {
                                    logsView.refresh();
                                }
                            }));

                            context.subscriptions.push(commands.registerCommand('extension.prophet.command.log.open', (filename) => {
                                if (logsView) {
                                    logsView.openLog(filename);
                                }
                            }));

                            context.subscriptions.push(commands.registerCommand('extension.prophet.command.clean.log', (logItem) => {
                                if (logsView) {
                                    logsView.cleanLog(logItem);
                                }
                            }));
                        });
                    }
    
                } else {
                    observer.error('Unable to find "dw.json", cartridge upload disabled. Please re-enable the upload in the command menu when ready.');
                }
            });
            return () => {
                subscription.unsubscribe();
            };
        }).subscribe(
            () => {
                // DO NOTHING
            },
            err => {
                this.outputChannel.show();
                this.outputChannel.appendLine(`Error: ${err}`);
            },
            () => {
                this.outputChannel.show();
                this.outputChannel.appendLine(`Error: completed!`);
            }
        );
    }

    /**
     * Registers commands, creates listeners and starts the uploader
     * 
     * @param context the extension context
     */
    start(context) {
        var subscriptions = context.subscriptions;
        
        subscriptions.push(this.outputChannel);

        subscriptions.push(workspace.onDidChangeConfiguration(() => {
			const isProphetUploadEnabled = this.isUploadEnabled();

			if (isProphetUploadEnabled !== this.prevState) {
				this.prevState = isProphetUploadEnabled;
				if (isProphetUploadEnabled) {
					this.loadUploaderConfig(rootPath, context);
				} else {
					if (this.uploaderSubscription) {
						this.outputChannel.appendLine(`Stopping`);
						this.uploaderSubscription!.unsubscribe();
						this.uploaderSubscription = null;
					}
				}
			}

        }));

        subscriptions.push(commands.registerCommand('extension.prophet.command.enable.upload', () => {
			this.loadUploaderConfig(rootPath, context);
        }));
        
        subscriptions.push(commands.registerCommand('extension.prophet.command.clean.upload', () => {
			this.loadUploaderConfig(rootPath, context);
        }));
        
        subscriptions.push(commands.registerCommand('extension.prophet.command.disable.upload', () => {
			if (this.uploaderSubscription) {
				this.outputChannel.appendLine(`Stopping`);
				this.uploaderSubscription!.unsubscribe();
				this.uploaderSubscription = null;
			}
        }));
        
		const isUploadEnabled = this.isUploadEnabled();
		this.prevState = isUploadEnabled;
		if (isUploadEnabled) {
			this.loadUploaderConfig(rootPath, context);
		} else {
			this.outputChannel.appendLine('Uploader disabled in configuration');
		}

    }
}

