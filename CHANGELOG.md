### 1.2.0
 * Controllers list view

### 1.0.18
 * fix expandable variables in watcher
 * add htmlhint option to disable/enable
 * add configuration of isml linter based on `.htmlhintrc`
 * fix activate extension once first cartridge may be created

### 1.0.17
 * fix issue with indentation and closing isbreak

### 1.0.16
* added htmlhing for linting isml
* fix issue with incorrect formating multiline plecaholders

### 1.0.15
* improve isml formatter - formats `isscript` tags and placeholders (`${ }`)

### 1.0.13
* trim path output (thanks to [khaitu](https://github.com/khaitu))
* update js-beatify

### 1.0.11

* add prophet icon on activity bar
* add time on log list
* fix issue when debugger detects wrong cartridges based on .project


### 1.0.10

* fix wrong type detection (now allows expand JS classes instance) #108

### 1.0.9

* `dw.json` `password` field may be omitted, it will be asked for user when needed

### 1.0.8

* fix debuggers hung up in case when thread doesn't stop immediately after start (i.e. breakpoint is set after long running operation or service call) #92
* add upload notification popup

### 1.0.7

* fix pagination issue, now UI shows all properties instead of first 200;

### 1.0.4

* fix issue with watching files on windows (windows emits change event for directory if file is created/removed and the extension tried upload folder in file manner)

### 1.0.1

* add `extension.prophet.ignore.list` for ignoring files/folders during clean
* fix `findFile` in windows (custom tags and includes)


### 1.0.0
* Multi-root Workspaces
* changed cartridge detection logic and debugger configuration

### 0.10.3

* Add cleanup code version folder before upload #60
* Add warning for missed cartridges from `dw.json` #69
* Fix displaying properties of classes in debugger #82 (thanks to [Galen Goforth](https://github.com/ghgofort)

### 0.10.0

* Add support of SDAPI v2
* Add availability to filter log files (thanks to [Lacho Tomov](https://github.com/ltomov))


### 0.9.0

* Add log viewer

### 0.8.0

* Add cartridges overview in explorer. Thanks to [Thomas Theunen](https://github.com/taurgis) Can be enabled/disabled by `extension.prophet.cartridges.view.enabled` (enabled by default)
* improved symbol navigation


### 0.7.0

* fix upload specified cartridges
* Advanced support of ISML syntax
* * Hover information
* * autocomplete tags
* * auto formatting
* * find Symbols
* * highlighting selected tags

### 0.6.3

* Add quick open for custom tags
* Add `extension.prophet.cartridges.path` property that allows quick open don't ask a user to choose the file.
* Add `extension.prophet.ismlServer.activateOn` property that allow activate isml server for non standard (isml) files, ex. `html`
* small refactoring of uploader (not need reload the whole editor for applying settings from `dw.json`)


### 0.6.0

Implemented file/cartridges uploader

### 0.5.0

Quick open local `isinclude` files via Ctrl+Click

### 0.4.0

Add support for opening files trought Storefront Toolkit

### 0.3.6

Add extended html snippets for isml (thanks to [Ahmet Suat ERKEN](https://github.com/suaterken))

### 0.3.5

Add support `ds` files, but marked as deprecated as does not allow use VSCode fully

### 0.3.0

Add common sinppents

### 0.2.0

Add isml syntax support

### 0.1.0

initial veriosn
