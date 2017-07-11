<h2 align="center">Work your Demandware/Salesforce Cloud code</h4>

A VS Code extension to work with Demandware/Salesforce Cloud code on Sandbox that support the Script Debugger API (SDAPI) 1.0

**Supported features**
* Upload cartridges and watch changes
* Syntax highlight for `isml` and `ds` files
* Setting breakpoints
* Stepping
* Change variables values in running threads
* Locals scope variables via the VARIABLES panel
* View variables on hover
* Variable watches
* Console/evaluate code
* Open files trought Storefront Toolkit
* Quick open `isinclude` templates and custom tags via Ctrl+Click (as links)


## Getting Started
To use this extension, you must first open the folder containing the cartridges you want to work on or one of subfolders contain folder `cartridges`.

## Using the debugger

When your launch config is set up, you can debug your project! Pick a launch config from the dropdown on the Debug pane in Code. Press the play button or F5 to start.


### Configuration

The extension operates in one mode - it launch an adapter that connects to sandbox. Just like when using the other debugger, you configure with a `.vscode/launch.json` file in the root directory of your project. You can create this file manually, or Code will create one for you if you try to run your project, and it doesn't exist yet.

### Launch
Example `launch.json` configs with `"request": "launch"`. You must specify hostname and other credentials. `cartridgeroot` could be set to `auto` so extention will try do detect path, othervise please set absolute path to folder that contains cartridges. Note: `workspaceroot` should be set to `${workspaceRoot}` unless you know what you doing.

```json
{
    "version": "0.1.0",
    "configurations": [
      {
          "type": "prophet",
          "request": "launch",
          "name": "Attach to Sandbox",
          "hostname": "*.demandware.net",
          "username": "<username>",
          "password": "<password>",
          "codeversion": "version1",
          "cartridgeroot": "auto",
          "workspaceroot": "${workspaceRoot}"
      }
    ]
}
```

> Note: for windows user `cartridgeroot` should be set as absolute path to cartridges folder, i.e. `C:\\some\\folder\\path\\to\\cartridges`

If you want to use a different sandboxes, you can also setup several configurations.


### Other optional launch config fields
* `trace`: When true, the adapter logs its own diagnostic info to console. This is often useful info to include when filing an issue on GitHub. 


## Using the uploader

Configuration for uploader should live in the file named `dw.json` (similar is used by `dwupload` and is compatible witn the uploader). Configuration should be placed in the directory that contains all cartridges.

```
├── bc_library
├── bm_integrationframework
├── dw.json
├── jsconfig.json
└── modules
```

Example of file:
```json
{
    "hostname": "example.demandware.net",
    "username": "user",
    "password": "password",
    "cartridge": ["cartridgeA", "cartridgeB"],// optional
    "code-version": "version2"
}
```
The second step: enabling the uploader in workspace preferences. Open preferences, switch to workspace preferences and set value to `true` for `"extension.prophet.upload.enabled"`. Detailed log information is written in output channel `Prophet Uploader`. (Note: once you change `dw.json` you should run 'Clean Project/Upload all' from command menu to apply it).

You can temporarily disable watching or force upload cartridges (i.e. clean project) via commands.

* Prophet: Enable Upload
* Prophet: Disable Upload
* Prophet: Clean Project/Upload all

(press F1 and select command)

#### Other configuration

* `extension.prophet.cartridges.path` - List of cartridges separated by colon. Allows  quick open don't ask a user to choose the file. Automatically open file that match first cartridge in list.
* `extension.prophet.ismlServer.activateOn` - allow activate isml server for non standatd (isml) files, ex. `html`


### Improve experience

Experience can be improved by using follow `jsconfig.json` in the folder with cartridges. It allows resolve absolute paths in scripts correctly, (except it starts with `~`).

```json
{
    "compilerOptions": {
        "target": "es5",
        "baseUrl": "./",
        "paths": {
            "*" : ["./*", "modules/*"]
        }
    },
    "typeAcquisition": {
        "enable": true
    }
}
```
### Reporting a bug

To report a bug simply create a new [GitHub Issue](https://github.com/SqrTT/prophet/issues/new) and describe your problem or suggestion. All kinds of feedback are welcome regarding extention including but not limited to:

 * When Prophet doesn't work as expected
 * When you simply want a new option or feature

Before reporting a bug, please look around to see if there are any open or closed tickets that discuss your issue.

### Contribute

There are many ways to contribute to Prophet.

* Submit bugs and help to verify fixes as they are checked in.
* Review the source code changes.
* Engage with other Prophet users and developers.
* Contribute bug fixes.
* Contribute tests.


#### Pull requests

If you have made or wish to make some features/fixes, please, make a fork of this repo, do your changes, and send your pull request to this repo into `develop` branch. After review it will be merged to `develop`, and during some time it will be available in `master` and extention itself. Before making pull request, please, make that it doesn't break anything. (currently there no tests, so test that covers current functionality are welcomed)



