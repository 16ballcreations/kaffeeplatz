/**
 * optimizar-imagenes.mjs — genera una copia WebP de cada PNG/JPG de public/img.
 *
 *   npm run imagenes
 *
 * POR QUE
 * Las portadas del diario son FOTOS guardadas como PNG (~2 MB cada una); PNG
 * es un formato para graficos, no para fotografia. Como WebP pesan una decima
 * parte sin diferencia visible a tamano de pantalla.
 *
 * QUE HACE
 * - Crea <nombre>.webp junto a cada <nombre>.png/.jpg. El original NO se toca:
 *   sigue sirviendo para Open Graph (las vistas previas de WhatsApp y algunas
 *   redes no muestran WebP de forma fiable) y como fuente para regenerar.
 * - El sitio pinta siempre la version WebP: ver `optimizada()` en
 *   src/datos/sitio.ts.
 * - Limita el lado mayor a 1600 px: el sitio nunca las muestra mas grandes,
 *   y cubre pantallas retina.
 * - Mantiene la transparencia (productos recortados, emblema, planta).
 * - Es idempotente: solo regenera si el original es mas nuevo que su WebP.
 *   Con --todo regenera todas.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'public', 'img');
const LADO_MAX = 1600;
const TODO = process.argv.includes('--todo');

/** Calidades: fotos a 80 (el punto donde WebP deja de verse distinto del
 *  original a tamano de pantalla); con transparencia algo mas alto, porque
 *  los bordes recortados delatan antes la compresion. */
const CALIDAD_FOTO = 80;
const CALIDAD_ALFA = 85;

const recorrer = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? recorrer(join(d, e.name)) : [join(d, e.name)],
  );

const kb = (b) => `${Math.round(b / 1024)} KB`.padStart(8);

let antes = 0;
let despues = 0;
let hechas = 0;

for (const f of recorrer(DIR)) {
  if (!/\.(png|jpe?g)$/i.test(f)) continue;
  const salida = f.slice(0, -extname(f).length) + '.webp';
  const pesoOriginal = statSync(f).size;

  if (!TODO && existsSync(salida) && statSync(salida).mtimeMs >= statSync(f).mtimeMs) {
    antes += pesoOriginal;
    despues += statSync(salida).size;
    continue;
  }

  const meta = await sharp(f).metadata();
  const conAlfa = Boolean(meta.hasAlpha);
  await sharp(f)
    .rotate()
    .resize({ width: LADO_MAX, height: LADO_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({
      quality: conAlfa ? CALIDAD_ALFA : CALIDAD_FOTO,
      alphaQuality: 90,
      effort: 6,
      smartSubsample: true,
    })
    .toFile(salida);

  const pesoWebp = statSync(salida).size;
  antes += pesoOriginal;
  despues += pesoWebp;
  hechas++;
  const pct = Math.round((1 - pesoWebp / pesoOriginal) * 100);
  console.log(`${kb(pesoOriginal)} -> ${kb(pesoWebp)}  (-${pct}%)  ${relative(DIR, f)}`);
}

console.log(
  `\n${hechas} generadas. Total que carga el sitio: ${kb(antes).trim()} -> ${kb(despues).trim()} ` +
    `(-${Math.round((1 - despues / antes) * 100)}%)`,
);
