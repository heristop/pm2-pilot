const fs = require('node:fs');
const path = require('node:path');
const packageJson = require(path.resolve(process.cwd(), 'package.json'));

const version = packageJson.version;
const content = `export const VERSION = '${version}';\n`;
const outputPath = path.resolve(process.cwd(), 'src/version.ts');

fs.writeFileSync(outputPath, content);

console.log(`✅ Version ${version} written to src/version.ts`);