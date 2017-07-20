import * as fs from 'fs';
import * as path from 'path';

export class CartridgeHelper {
    constructor(private workspaceRoot: string) {

    }

    createCartridge(name, directory) {
        this.createMainDirectory(name, directory);
        this.createProjectFiles(name, directory);
        this.createCartridgeDirectories(name, directory);
        this.createPropertiesFile(name, directory);
    }

    createMainDirectory(name, directory) {
        fs.mkdir(path.join(this.workspaceRoot, directory, name));
    }

    createCartridgeDirectories(name, directory) {
        let directoriesToCreate = ['controllers', 'forms', 'pipelines', 'scripts', 'static', 'templates', 'webreferences', 'webreferences2'];

        fs.mkdir(path.join(this.workspaceRoot, directory, name, 'cartridge'));
        for (let i = 0; i < directoriesToCreate.length; i++) {
            fs.mkdir(path.join(this.workspaceRoot, directory, name, 'cartridge', directoriesToCreate[i]));
        }

    }

    createProjectFiles(name, directory) {
        fs.writeFile(path.join(this.workspaceRoot, directory, name, '.project'),
            `<?xml version="1.0" encoding="UTF-8"?>
<projectDescription>
    <name>${name}</name>
    <comment></comment>
    <projects>
    </projects>
    <buildSpec>
        <buildCommand>
            <name>com.demandware.studio.core.beehiveElementBuilder</name>
            <arguments>
            </arguments>
        </buildCommand>
    </buildSpec>
    <natures>
        <nature>com.demandware.studio.core.beehiveNature</nature>
    </natures>
</projectDescription>
`           , function (err) {
                if (err) {
                    return console.log(err);
                }
            });

        fs.writeFile(path.join(this.workspaceRoot, directory, name, '.tern-project'),
            `{
    "ecmaVersion": 5,
    "plugins": {
        "guess-types": {
        
        },
        "outline": {
        
        },
        "demandware": {
        
        }
    }
}'
`      , function (err) {
                if (err) {
                    return console.log(err);
                }
            });
    }

    createPropertiesFile(name, directory) {
        var day = {
            1: 'Mon',
            2: 'Tue',
            3: 'Wed',
            4: 'Thu',
            5: 'Fri',
            6: 'Sat',
            7: 'Sun'
        };

        var month = {
            1: "Jan",
            2: "Feb",
            3: "Mar",
            4: "Apr",
            5: "May",
            6: "Jun",
            7: "Jul",
            8: "Aug",
            9: "Sep",
            10: "Oct",
            11: "Nov",
            12: "Dec",
        };

        let currentDateTime = new Date();
        let timeString = day[currentDateTime.getDay()] + ' '
            + month[currentDateTime.getMonth()] + ' '
            + currentDateTime.getDate() + ' '
            + currentDateTime.getHours() + ':'
            + currentDateTime.getMinutes() + ':'
            + currentDateTime.getSeconds() + ' CEST ' + currentDateTime.getFullYear();

        fs.writeFile(path.join(this.workspaceRoot, directory, name, 'cartridge', name + '.properties'),
            `## cartridge.properties for cartridge ${name}
#${timeString}
demandware.cartridges.${name}.multipleLanguageStorefront=true
demandware.cartridges.${name}.id=${name}`
            , function (err) {
                if (err) {
                    return console.log(err);
                }
            });
    }
}