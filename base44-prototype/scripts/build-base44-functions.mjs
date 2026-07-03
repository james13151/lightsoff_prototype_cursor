import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const sourceDir = path.resolve('base44/functions');
const outputDir = path.resolve('base44/functions.generated');

function functionNames(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(dir, name, 'entry.ts')))
    .sort();
}

const names = functionNames(sourceDir);
fs.mkdirSync(outputDir, { recursive: true });

for (const name of names) {
  const entryPoint = path.join(sourceDir, name, 'entry.ts');
  const functionOutDir = path.join(outputDir, name);
  fs.mkdirSync(functionOutDir, { recursive: true });

  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    write: false,
    external: ['npm:*'],
    legalComments: 'none',
    banner: {
      js: `// Generated from base44/functions/${name}/entry.ts. Do not edit directly.\n`,
    },
  });

  fs.writeFileSync(path.join(functionOutDir, 'entry.ts'), result.outputFiles[0].text);

  const configPath = path.join(sourceDir, name, 'function.jsonc');
  if (fs.existsSync(configPath)) {
    fs.copyFileSync(configPath, path.join(functionOutDir, 'function.jsonc'));
  }
}

const generatedNames = functionNames(outputDir);
const staleNames = generatedNames.filter((name) => !names.includes(name));
if (staleNames.length) {
  console.error(`Stale generated Base44 functions: ${staleNames.join(', ')}`);
  console.error('Move stale generated directories to Trash, then rerun this script.');
  process.exit(1);
}

console.log(`Generated ${names.length} self-contained Base44 function entries.`);
