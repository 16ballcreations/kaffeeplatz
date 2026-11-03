/**
 * probar-fotos-cuadrar.mjs — la decisión de cómo se cuadra una foto al subir.
 *
 * La parte de canvas (fotos-cuadrar-canvas.ts) solo pinta lo que decide
 * fotos-cuadrar.ts; esto prueba la decisión con píxeles hechos a mano, sin
 * navegador:
 *   1. vertical con fondo blanco      → se completa con blanco, a los lados
 *   2. horizontal con fondo de color  → se completa arriba y abajo, con ese color
 *   3. fondo con ruido (ambiente)     → desenfoque, con fundido en los lados
 *   4. casi cuadrada (≤1 %)           → no se toca
 * y dos bordes finos: el ruido de JPG sobre blanco sigue siendo «plano», y dos
 * lados lisos pero de distinto color no lo son.
 *
 * Compila el fichero REAL con esbuild (como probar-diario.mjs).
 * Uso: node scripts/probar-fotos-cuadrar.mjs
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const { outputFiles } = await build({
  entryPoints: [join(raiz, 'src/admin/fotos-cuadrar.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
});
const { planear, yaCuadrada, cubrir, FUNDIDO } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`
);

let fallos = 0;
let pasadas = 0;
function caso(nombre, ok, detalle = '') {
  if (ok) pasadas++;
  else fallos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${ok || !detalle ? '' : `\n        ${detalle}`}`);
}

/** Generador pseudoaleatorio fijo: la prueba da lo mismo cada vez. */
function azar(semilla) {
  let s = semilla >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * Una «foto» de ancho×alto: fondo `fondo(x, y)` y un producto oscuro en el
 * centro (un rectángulo que NO toca los bordes, como en una foto de estudio).
 */
function foto(ancho, alto, fondo) {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++)
    for (let x = 0; x < ancho; x++) {
      const dentro = x > ancho * 0.25 && x < ancho * 0.75 && y > alto * 0.2 && y < alto * 0.8;
      const [r, g, b] = dentro ? [40, 30, 25] : fondo(x, y);
      const i = (y * ancho + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  return { data, width: ancho, height: alto };
}

console.log('\n=== CUADRAR FOTOS AL SUBIR ===\n');

/* 1. Vertical, fondo blanco (con el ruido suave de un JPG: ±3). */
{
  const r = azar(1);
  const p = planear(foto(300, 400, () => [252 + Math.round(r() * 3), 252 + Math.round(r() * 3), 253 + Math.round(r() * 2)]));
  caso('vertical sobre blanco: se completa con color', p.modo === 'color', JSON.stringify(p));
  caso('… y el color es el blanco del fondo', p.modo === 'color' && p.color.every((c) => c >= 252), JSON.stringify(p.color));
  caso('… cuadrado del lado mayor, foto centrada a lo ancho', p.lado === 400 && p.x === 50 && p.y === 0);
  caso('… se completan izquierda y derecha', p.lados?.izquierda && p.lados.derecha && !p.lados.arriba && !p.lados.abajo);
}

/* 2. Horizontal, fondo liso de color (un gris cálido). */
{
  const p = planear(foto(640, 480, () => [200, 190, 180]));
  caso('horizontal sobre color liso: se completa con color', p.modo === 'color' && p.color.join() === '200,190,180', JSON.stringify(p));
  caso('… relleno arriba y abajo', p.lado === 640 && p.x === 0 && p.y === 80 && p.lados.arriba && p.lados.abajo && !p.lados.izquierda);
}

/* 3. Fondo con ruido: una foto de ambiente (mesa, cocina). */
{
  const r = azar(7);
  const p = planear(foto(300, 450, () => [Math.round(r() * 255), Math.round(r() * 200), Math.round(r() * 150)]));
  caso('fondo con ruido: desenfoque', p.modo === 'desenfoque', JSON.stringify(p));
  caso('… fundido del 12 % solo a izquierda y derecha', p.fundidoX === Math.round(300 * FUNDIDO) && p.fundidoY === 0);
  const h = planear(foto(450, 300, () => [Math.round(r() * 255), 100, 100]));
  caso('… horizontal: fundido arriba y abajo', h.modo === 'desenfoque' && h.fundidoY === 36 && h.fundidoX === 0);
  const c = cubrir(300, 450, 450);
  caso('… el relleno cubre todo el cuadrado', c.x <= 0 && c.y <= 0 && c.x + c.w >= 450 && c.y + c.h >= 450);
}

/* 4. Casi cuadrada (≤1 %) y cuadrada: no se tocan. */
{
  caso('1000×1008 (0,8 %): no se toca', planear(foto(1000, 1008, () => [255, 255, 255])).modo === 'nada');
  caso('cuadrada: no se toca', planear(foto(500, 500, () => [0, 0, 0])).modo === 'nada');
  caso('1000×1020 (2 %): sí se cuadra', !yaCuadrada(1000, 1020));
}

/* Bordes finos. */
{
  const p = planear(foto(300, 400, (x) => (x < 150 ? [255, 255, 255] : [120, 120, 120])));
  caso('izquierda blanca y derecha gris: no hay un color que sirva → desenfoque', p.modo === 'desenfoque', JSON.stringify(p));
  const r = azar(3);
  const s = planear(foto(400, 300, () => [128 + Math.round((r() - 0.5) * 30), 128, 128]));
  caso('textura suave (±15) en un canal: no es plano', s.modo === 'desenfoque', JSON.stringify(s));
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos.\n`);
process.exit(fallos ? 1 : 0);
