const path = require('path');

const expectedPath = path.join(__dirname, '..');
if (process.cwd() !== expectedPath) {
    console.error('\x1b[31mERROR: Must run build from project root directory!\x1b[0m');
    console.error(`Expected: ${expectedPath}`);
    console.error(`Current:  ${process.cwd()}`);
    process.exit(1);
}