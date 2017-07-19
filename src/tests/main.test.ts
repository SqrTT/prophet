
import {createScanner, TokenType} from '../server/langServer/parser/htmlScanner'

const testScannerStr = `
<isscript> some comment
</isscript>

<ul>
0000
</ul>
`;

suite('Node Debug Adapter', () => {
    const scanner = createScanner(testScannerStr);

    let token = scanner.scan();
    while(token !== TokenType.EOS) {
        token = scanner.scan();
    }

});