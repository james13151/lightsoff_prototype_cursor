import fs from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';

const functionsDir = path.resolve('base44/functions');
const sharedDir = path.resolve('base44/shared');
const generatedDir = path.resolve('base44/functions.generated');
const looseFunctionFiles = fs.readdirSync(functionsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(ts|js)$/.test(entry.name));
if (looseFunctionFiles.length) {
  console.error('Base44 function helpers must not live directly in base44/functions/:');
  for (const file of looseFunctionFiles) console.error(`- ${file.name}`);
  console.error('Put shared backend utilities under base44/shared/ instead.');
  process.exit(1);
}

function functionEntryFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name, 'entry.ts'))
    .filter((file) => fs.existsSync(file))
    .sort();
}

function functionNames(dir) {
  return functionEntryFiles(dir).map((file) => path.basename(path.dirname(file)));
}

const sourceNames = functionNames(functionsDir);
const generatedNames = functionNames(generatedDir);
const missingGenerated = sourceNames.filter((name) => !generatedNames.includes(name));
const staleGenerated = generatedNames.filter((name) => !sourceNames.includes(name));
if (missingGenerated.length || staleGenerated.length) {
  if (missingGenerated.length) console.error(`Missing generated Base44 functions: ${missingGenerated.join(', ')}`);
  if (staleGenerated.length) console.error(`Stale generated Base44 functions: ${staleGenerated.join(', ')}`);
  console.error('Run npm run functions:build and keep base44/functions.generated in sync.');
  process.exit(1);
}

const files = [
  path.join(sharedDir, 'omniShared.ts'),
  ...functionEntryFiles(functionsDir),
  ...functionEntryFiles(generatedDir),
];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  if (file.includes(`${path.sep}functions.generated${path.sep}`) && source.includes('../../shared/omniShared.ts')) {
    console.error(`Generated function contains a local shared import: ${path.relative(process.cwd(), file)}`);
    process.exit(1);
  }
  transformSync(source, {
    loader: 'ts',
    format: 'esm',
    target: 'es2022',
    sourcemap: false,
  });
}

console.log(`Parsed ${files.length} Base44 function files.`);
