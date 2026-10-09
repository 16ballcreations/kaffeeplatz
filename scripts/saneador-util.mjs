/**
 * saneador-util.mjs — lo compartido por las pruebas del saneador.
 *
 * Carga los tres ficheros del saneador compilándolos de verdad (no una copia)
 * y ofrece el `caso()` y los comprobadores. Está aparte porque las pruebas se
 * partieron en dos ficheros por el límite de 300 líneas del encargo, y lo que
 * no puede duplicarse entre ellos es la forma de cargar el código bajo prueba:
 * dos cargas distintas serían dos cosas distintas probadas.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/* El saneador vive en TRES ficheros, por el límite de 300 líneas del encargo:
 *   escapar.ts   convertir texto en texto (la frontera que nunca des-escapa)
 *   sanear.ts    qué HTML puede existir (la lista blanca)
 *   markdown.ts  qué escribe la dueña y cómo se convierte
 *
 * Se compilan de verdad para que la prueba corra contra LOS FICHEROS REALES.
 * `write: false` deja el resultado en memoria: no se escribe al disco. */
async function cargar(relativo) {
  const { outputFiles } = await build({
    entryPoints: [join(raiz, relativo)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`
  );
}

export const { escapar } = await cargar('src/admin/escapar.ts');
export const { sanearHtml } = await cargar('src/admin/sanear.ts');
export const { markdownASanado } = await cargar('src/admin/markdown.ts');

export const cuenta = { fallos: 0, pasadas: 0 };

/** Afirma que `fn(entrada)` cumple la condición. */
export function caso(nombre, entrada, comprobar, fn = sanearHtml) {
  const salida = fn(entrada);
  const r = comprobar(salida);
  const ok = r === true;
  if (ok) cuenta.pasadas++;
  else cuenta.fallos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}`);
  if (!ok) {
    console.log(`        entrada: ${JSON.stringify(entrada)}`);
    console.log(`        salida : ${JSON.stringify(salida)}`);
    if (typeof r === 'string') console.log(`        motivo : ${r}`);
  }
}

/** La salida no puede contener NADA de esto, en ninguna forma. */
export const sinNadaDe = (...prohibidos) => (salida) => {
  const bajo = salida.toLowerCase();
  for (const p of prohibidos) {
    if (bajo.includes(p.toLowerCase())) return `aparece ${JSON.stringify(p)}`;
  }
  return true;
};

export const contiene = (...esperados) => (salida) => {
  for (const e of esperados) {
    if (!salida.includes(e)) return `falta ${JSON.stringify(e)}`;
  }
  return true;
};

export const y = (...cs) => (salida) => {
  for (const c of cs) {
    const r = c(salida);
    if (r !== true) return r;
  }
  return true;
};

/** Cierra una tanda: imprime el recuento y decide el código de salida. */
export function resumir() {
  const total = cuenta.pasadas + cuenta.fallos;
  console.log(`\n${cuenta.pasadas}/${total} pruebas pasan.`);
  if (cuenta.fallos) {
    console.log(`\n${cuenta.fallos} FALLO(S). El saneador no es seguro todavía.`);
  }
  process.exit(cuenta.fallos ? 1 : 0);
}
