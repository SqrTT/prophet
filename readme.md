<h2 align="center">Work your Demandware/Salesforce Cloud code</h2>

A VS Code extension to work with Demandware/Salesforce Cloud code on Sandbox that support the Script Debugger API (SDAPI) 2.0

**Supported features**
* Upload cartridges and watch changes
* Syntax highlight for `isml` and `ds` files
* Validate isml files (based on htmlhint plugin, configurable by `.htmlhintrc`)
* Advanced support of ISML syntax
  * hover information
  * autocomplete tags
  * auto formatting
  * find Symbols
  * highlighting selected tags
  * rename tag (via F2)
* Setting breakpoints
* Stepping
* Change variables values in running threads
* Locals scope variables via the VARIABLES panel
* View variables on hover
* Variable watches
* Console/evaluate code
* Open files trough Storefront Toolkit
* Quick open `isinclude` templates and custom tags via Ctrl+Click (as links)
* Cartridges overview in explorer
* Server logs viewer with syntax highlight
* [Multi-root Workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) (allows to work with different repo in same time).
* Override template and JS file in another cartridge (via context menu).
* enhanced autocompletion and goto for `Resource.msg/msgf` (js files and isml)
* autocompletion and goto for `URLUtils.url/http/https/abs` (js files and isml)
* Added autocompletion for `server.append/prepend/replace`
* autocompletion for `require('dw/')`
* autocompletion and goto for `require('~/...')` & `require('*/...')` (correct resolving based on cartridge path)
* autocompletion and goto for `res.render` & `isinclude` & `isdecorate` & `ismodule` (`template=""` attribute) (correct resolving based on cartridge path)
* quick find controllers (via Ctrl-F7)
* Download SOAP WebService API from Server. This feature is similar to Eclipse/UXStudio feature to download & generate SOAP web-service documentation.

> WARNING: Some users had reported that debugger completely halts sandbox. Currently, this issue is not fixed and no known steps to reproduce. If you have some info about it please share. So please, before debugger usage make sure that you have availability to restart sandbox for the case if extension halts yours.


## Getting Started
To use this extension, you must first open the folder containing the cartridges you want to work on or one of subfolders contain folder `cartridges`.

## Using the debugger

When your launch config is set up, you can debug your project! Pick a launch config from the dropdown on the Debug pane in Code. Press the play button or F5 to start.


### Configuration

The extension operates in one mode - it launch an adapter that connects to sandbox. Just like when using the other debugger, you configure with a `.vscode/launch.json` file in the root directory of your project. You can create this file manually, or Code will create one for you if you try to run your project, and it doesn't exist yet.

### Launch
Example `launch.json` configs with `"request": "launch"`. You must not specify hostname and other credentials. Since they will be loaded from corresponding `dw.json` or `dw.js` file.

```json
{
    "version": "0.1.0",
    "configurations": [
      {
          "type": "prophet",
          "request": "launch",
          "name": "Attach to Sandbox"
      }
    ]
}
```


### Other optional launch config fields
* `trace`: When true, the adapter logs its own diagnostic info to console. This is often useful info to include when filing an issue on GitHub.


## Using the uploader

Example of file:
```json
{
    "hostname": "example.demandware.net",
    "username": "user",
    "password": "password",
    "cartridge": ["cartridgeA", "cartridgeB"],// optional
    "cartridgePath": "cartridgeA:cartridgeB",// optional
    "code-version": "version2"
}
```
The second step: enabling the uploader in workspace preferences. Open preferences, switch to workspace preferences and set value to `true` for `"extension.prophet.upload.enabled"`. Detailed log information is written in output channel `Prophet Uploader`. (Note: once you change `dw.json` or `dw.js` you should run 'Clean Project/Upload all' from command menu to apply it).

You can temporarily disable watching or force upload cartridges (i.e. clean project) via commands.

* Prophet: Enable Upload
* Prophet: Disable Upload
* Prophet: Clean Project/Upload all

(press F1 and select command)

> Note: the extension relies on the `.project` files to detect cartridge so it must not be added to `files.exclude`

#### Other configuration

* `extension.prophet.cartridges.path` - List of cartridges separated by colon. Allows quick open - don't ask a user to choose the file. Automatically open file that match first cartridge in list.
* `extension.prophet.ismlServer.activateOn` - allow activate isml server for non standatd (isml) files, ex. `html`
* `extension.prophet.clean.on.start` - allows to enable/disable code upload on editor startup (enabled by default)
* `extension.prophet.ignore.list` - list of regexp for files/folders should be excludes from zipping during clean (not from watching)
* `extension.prophet.htmlhint.enabled` - enable/disable linting of isml files
* `extension.prophet.sandbox.filesystem.enabled` - Enable Sandbox File System Workspace

### Improve experience

Experience can be improved by using follow `jsconfig.json` in the folder with cartridges. It allows resolve absolute paths in scripts correctly, (except it starts with `~` or `*`).

> Note: client side JS files must have their own `jsconfig.json` files and each workspace should have it's own configuration.

Code assistance can be improved even more by adding `d.ts` definition for the project. Definitions for Commerce Cloud objects can be downloaded from [repo](https://github.com/SalesforceCommerceCloud/dw-api-types)

```json
{
    "compilerOptions": {
        "noLib": true,
        "target": "es5",
        "baseUrl": "./",
        "paths": {
            "*" : ["./*", "modules/*", "../types/*"]
        }
    },
    "typeAcquisition": {
        "enable": false
    },
    "include": [
        "../types/*.d.ts",
        "../types/**/*.d.ts",
        "./cartridge1/**/*.js",
        "./cartridge2/**/*.js",
        "./cartridgeN/**/*.js"
    ]
}
```
> * Replace cartridge1...cartridgeN for your real cartriges
> * Replace ../types/ to path where you are unpacked type definitions

To help VSCode determine the type of variable/argument JSDoc can be used. For instance:

```javascript
// local variable

/**
/ @type {dw.catalog.Product}
/*
var product = someMethod();

// arguments types

/**
/ @param {dw.util.Iterator<dw.catalog.Product>} products
/ @param {dw.order.Basket} basket
/ @returns {Array<dw.catalog.Product>}
/*
function doSomething(product, basket) {
...
}

```

### Download SOAP WebService API from Server

This feature works similarly to the UXStudio feature. One can download the SOAP API files from server & generate documentation for it.

**Steps:**

1. Navigate to the WSDL file in vscode file explorer.
2. Right click file to open context menu.
3. From context menu, select "Download SOAP Web Service API...".
4. An input-box will prompt asking location of the directory where documentation should be downloaded.
5. Enter an appropriate folder location & hit Enter
6. Documentation will be generated under entered folder.
7. Use log channel `SOAP WebService Docs(Prophet)` to check the status/progress for this operation.

**Note:**

UXStudio & this feature both internally uses `javadoc` to generate the relevant documentation. So, make sure `javadoc` is accessible from your shell/terminal/cmd.exe.

If `javadoc` is not added to your OS path, vscode will still download the compiled `java` files from server to local file-system but while generating the documentation it will show an error message. So, one can always manually run the `javadoc` to generate the documentation.

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

If you have made or wish to make some features/fixes, please, make a fork of this repo, do your changes, and send your pull request to this repo into `master` branch. After review it will be merged to `master` and during some time it will be available in extension itself. Before making pull request, please, make that it doesn't break anything. (currently there no tests, so test that covers current functionality are welcomed)



### Contributors

* [Thomas Theunen](https://github.com/taurgis)
* [SGD](https://github.com/SGD1953)
* [Dmytro Katashev](https://github.com/ufnd)
* and special thanks to [Astound Commerce](https://astoundcommerce.com/)

