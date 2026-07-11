// Copia el motor de tesseract.js (worker + core WASM) desde node_modules a
// public/tesseract para servirlo desde el propio servidor. Así el OCR NO depende
// de descargar el motor desde un CDN de internet en tiempo de ejecución —que es
// lo que fallaba en la red del puerto/celular y dejaba el OCR sin leer nada.
//
// El idioma (public/tesseract/lang/eng.traineddata) se versiona en git aparte,
// porque no viene en node_modules.
//
// Se ejecuta en `predev` y `prebuild` (ver package.json). Es idempotente.
import { mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = join(root, 'public', 'tesseract');
const outCore = join(outDir, 'core');

const workerSrc = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
const coreDir = join(root, 'node_modules', 'tesseract.js-core');

if (!existsSync(workerSrc) || !existsSync(coreDir)) {
  console.error('[copy-tesseract] node_modules de tesseract.js no encontrado; corre `npm install` primero.');
  process.exit(0); // no romper el arranque si aún no se instaló
}

mkdirSync(outCore, { recursive: true });

copyFileSync(workerSrc, join(outDir, 'worker.min.js'));

let n = 0;
for (const f of readdirSync(coreDir)) {
  if (/^tesseract-core.*\.(wasm\.js|wasm|js)$/.test(f)) {
    copyFileSync(join(coreDir, f), join(outCore, f));
    n++;
  }
}

console.log(`[copy-tesseract] worker.min.js + ${n} archivos de core -> public/tesseract`);
