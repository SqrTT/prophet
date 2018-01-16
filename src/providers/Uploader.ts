import { Observable, Subscription,  Subject} from 'rxjs';
import { window, OutputChannel, ExtensionContext, workspace, commands, RelativePattern, WorkspaceFolder } from 'vscode';
import * as uploadServer from "../server/uploadServer";
import { setTimeout } from 'timers';



const commandBus = new Subject<'enable.upload' | 'clean.upload' | 'disable.upload'>();

/**
 * Class for handling the server upload integration
 */
export default class Uploader {
	private outputChannel: OutputChannel;
	private configuration;
	private prevState;
	private uploaderSubscription: Subscription | null;
	private cleanOnStart: boolean;
	private workspaceFolder: string;
	private commandSubs: Subscription;

	/**
	 *
	 * @param configuration the workspace configuration to use
	 */
	constructor(configuration, workspaceFolder: WorkspaceFolder) {
		this.outputChannel = window.createOutputChannel(`Prophet Uploader: ${workspaceFolder.name}`);
		this.configuration = configuration;
		this.workspaceFolder = workspaceFolder.uri.fsPath;
		this.cleanOnStart = Boolean(this.configuration.get('clean.on.start'));

		this.commandSubs = commandBus.subscribe(command => {
			if (command === 'clean.upload' || command === 'enable.upload') {
				this.loadUploaderConfig(this.workspaceFolder);
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
		return !!this.configuration.get('upload.enabled');
	}

	/**
	 * Loads the uploader configuration and start the server
	 *
	 * @param rootPath
	 * @param context
	 */
	loadUploaderConfig(rootPath: string) {
		if (this.uploaderSubscription) {
			this.uploaderSubscription.unsubscribe();
			this.uploaderSubscription = null;
			this.outputChannel.appendLine(`Restarting`);
		} else {
			this.outputChannel.appendLine(`Starting...`);
		}

		this.uploaderSubscription = Observable.create(observer => {
			let subscription;

			workspace
				.findFiles(new RelativePattern(rootPath, 'dw.json'), '{node_modules,.git}', 1)
				.then(files => {
					if (files.length && files[0].scheme === 'file') {
						const configFilename = files[0].fsPath;
						this.outputChannel.appendLine(`Using config file '${configFilename}'`);

						subscription = uploadServer.init(
							configFilename,
							this.outputChannel,
							{
								cleanOnStart: this.cleanOnStart
							})
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
						// after first run set to true
						this.cleanOnStart = true;

					} else {
						observer.error('Unable to find "dw.json", cartridge upload disabled. Please re-enable the upload in the command menu when ready.');
					}
				}, err => {
					observer.error(err);
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

		const subs = workspaceFolder$$.map(workspaceFolder$ => {
			const end$ = new Subject();
			return workspaceFolder$
			.do(() => {}, undefined, () => {end$.next();end$.complete()})
			.flatMap(workspaceFolder => {
				const configuration = workspace.getConfiguration('extension.prophet', workspaceFolder.uri);
				const uploader = new Uploader(configuration, workspaceFolder);
				return uploader.start();
			}).takeUntil(end$);
		})
		.mergeAll()
		.subscribe();

		subscriptions.push({
			dispose: () => {
				commandBus.unsubscribe();
				subs.unsubscribe();
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
						this.loadUploaderConfig(this.workspaceFolder);
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
				this.loadUploaderConfig(this.workspaceFolder);
			} else {
				this.outputChannel.appendLine('Uploader disabled via configuration');
			}
			observer.next(this.workspaceFolder);
			return () => {
					this.outputChannel.appendLine('Shutting down...');
					configSubscription.dispose();
					this.commandSubs.unsubscribe();

					if (this.uploaderSubscription) {
						this.uploaderSubscription.unsubscribe();
					}
					setTimeout(() => {
						this.outputChannel.dispose();
					}, 60 * 1000);// 
				}
			}
		);

	}
}

