<h2 align="center">Debug your Demandware/Salesforce Cloud code</h4>

A VS Code extension to debug your Demandware/Salesforce Cloud code on Sandbox that support the Script Debugger API (SDAPI) 1.0

**Supported features**
* Setting breakpoints
* Stepping
* Change variables values in running threads
* Locals scope variables via the VARIABLES panel
* View variables on hover
* Watches
* Console/evaluate code


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
