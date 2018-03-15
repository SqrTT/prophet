import { Observable, Subscription, Subject } from 'rxjs';
import { window, OutputChannel, ExtensionContext, workspace, commands, WorkspaceFolder } from 'vscode';
import * as uploadServer from "../server/uploadServer";
import { getCartridgesFolder, getDWConfig } from '../lib/FileHelper';

const commandBus = new Subject<'enable.upload' | 'clean.upload' | 'disable.upload'>();

/**
 * Class for handling the server upload integration
 */
export default class Uploader {
	private outputChannel: OutputChannel;
	getCleanUpCodeVersionMode(): "all" | "list" | "none" | "auto" {
		return workspace.getConfiguration('extension.prophet').get('clean.up.code.version.mode') || 'auto';
	}
	//private configuration;
	private prevState;
	private uploaderSubscription: Subscription | null;
	private cleanOnStart: boolean;
	private commandSubs: Subscription;
	private cartridges: Set<string>

	/**
	 *
	 * @param configuration the workspace configuration to use
	 */
	constructor(cartridges: Set<string>) {
		this.outputChannel = window.createOutputChannel(`Prophet Uploader`);
		this.cartridges = cartridges;

		this.cleanOnStart = Boolean(workspace.getConfiguration('extension.prophet').get('clean.on.start'));

		this.commandSubs = commandBus.subscribe(command => {
			if (command === 'clean.upload' || command === 'enable.upload') {
				this.loadUploaderConfig();
			} else if (command === 'disable.upload') {
				if (this.uploaderSubscription) {
					this.outputChannel.appendLine(`Stopping`);
					this.uploaderSubscription!.unsubscribe();
					this.uploaderSubscription = null;
				}
			}
		});
	}

	/**
	 * Returns the enabled status from the configuration
	 */
	isUploadEnabled() {
		return !!workspace.getConfiguration('extension.prophet').get('upload.enabled');
	}

	/**
	 * Loads the uploader configuration and start the server
	 */
	loadUploaderConfig() {
		if (this.uploaderSubscription) {
			this.uploaderSubscription.unsubscribe();
			this.uploaderSubscription = null;
			this.outputChannel.appendLine(`Restarting`);
		} else {
			this.outputChannel.appendLine(`Starting...`);
		}

		this.uploaderSubscription = Observable.fromPromise(getDWConfig(workspace.workspaceFolders))
			.flatMap(dwConf => {
				this.outputChannel.appendLine(`Using config file '${dwConf.configFilename}'`);
				dwConf.cartridge = Array.from(this.cartridges.values())
				dwConf.cleanUpCodeVersionMode = this.getCleanUpCodeVersionMode();

				return uploadServer.init(
					dwConf,
					this.outputChannel,
					{ cleanOnStart: this.cleanOnStart }
				).do(() => {
					this.cleanOnStart = true;
				});
			})
			.subscribe(
				() => {
					// DO NOTHING
				},
				err => {
					this.outputChannel.show();
					this.outputChannel.appendLine(`Error: ${err}`);
					if (err instanceof Error) {
						this.outputChannel.appendLine(`Error: ${err.stack}`);
					}
				},
				() => {
					this.outputChannel.show();
					this.outputChannel.appendLine(`Error: completed!`);
				}
			);
	}
	static initialize(context: ExtensionContext, workspaceFolder$$: Observable<Observable<WorkspaceFolder>>) {
		var subscriptions = context.subscriptions;

		subscriptions.push(commands.registerCommand('extension.prophet.command.enable.upload', () => {
			commandBus.next('enable.upload');
		}));

		subscriptions.push(commands.registerCommand('extension.prophet.command.clean.upload', () => {
			commandBus.next('clean.upload');
		}));

		subscriptions.push(commands.registerCommand('extension.prophet.command.disable.upload', () => {
			commandBus.next('disable.upload');
		}));

		let subs: Subscription | undefined;

		const updateFolders = () => {
			if (subs) {
				subs.unsubscribe();
				subs = undefined;
			}

			if (workspace.workspaceFolders) {
				subs = Observable.of(...workspace.workspaceFolders)
					.flatMap(workspaceFolder => getCartridgesFolder(workspaceFolder))
					.reduce((acc, val) => {
						acc.add(val);
						return acc;
					}, new Set<string>())
					.flatMap(cartridgesList => {
						const uploader = new Uploader(cartridgesList);
						return uploader.start();
					})
					.subscribe();
			}
		};

		workspace.onDidChangeWorkspaceFolders(updateFolders);

		updateFolders();

		// const configuration = workspace.getConfiguration('extension.prophet', workspaceFolder.uri);
		// const uploader = new Uploader(configuration, workspaceFolder);
		// return uploader.start();
		subscriptions.push({
			dispose: () => {
				commandBus.unsubscribe();
				if (subs) {
					subs.unsubscribe();
				}
			}
		})
	}

	/**
	 * Registers commands, creates listeners and starts the uploader
	 *
	 */
	start() {
		return new Observable<string>(observer => {
			const configSubscription = workspace.onDidChangeConfiguration(() => {
				const isProphetUploadEnabled = this.isUploadEnabled();

				if (isProphetUploadEnabled !== this.prevState) {
					this.prevState = isProphetUploadEnabled;
					if (isProphetUploadEnabled) {
						this.loadUploaderConfig();
					} else {
						if (this.uploaderSubscription) {
							this.outputChannel.appendLine(`Stopping`);
							this.uploaderSubscription.unsubscribe();
							this.uploaderSubscription = null;
						}
					}
				}
			});


			const isUploadEnabled = this.isUploadEnabled();
			this.prevState = isUploadEnabled;
			if (isUploadEnabled) {
				this.loadUploaderConfig();
			} else {
				this.outputChannel.appendLine('Uploader disabled via configuration');
			}
			observer.next();
			return () => {
				this.outputChannel.appendLine('Shutting down...');
				configSubscription.dispose();
				this.commandSubs.unsubscribe();

				if (this.uploaderSubscription) {
					this.uploaderSubscription.unsubscribe();
				}
				this.outputChannel.dispose();
			}
		}
		);

	}
}

