import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'www');
if (path.dirname(webDir) !== root || path.basename(webDir) !== 'www') {
  throw new Error('Refusing to clean an unexpected native web directory');
}

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

for (const name of ['css', 'icons', 'js']) {
  await cp(path.join(root, name), path.join(webDir, name), { recursive: true });
}
for (const name of ['manifest.json', 'sw.js']) {
  await cp(path.join(root, name), path.join(webDir, name));
}

let html = await readFile(path.join(root, 'index.html'), 'utf8');
html = html.replace(
  '<script type="module" src="js/app.js"></script>',
  '<script type="module" src="js/native-runtime.js"></script>\n  <script type="module" src="js/app.js"></script>'
);
await writeFile(path.join(webDir, 'index.html'), html);

await build({
  absWorkingDir: root,
  entryPoints: ['./native/native-runtime-entry.js'],
  outfile: './www/js/native-runtime.js',
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['chrome120'],
  sourcemap: false,
  legalComments: 'none'
});

console.log(`Native web assets built in ${webDir}`);
