/**
 * optimizar-imagenes.mjs — versiones WebP de cada PNG/JPG de public/img.
 *
 *   npm run imagenes           solo lo que cambio
 *   npm run imagenes -- --todo regenera todo
 *
 * POR QUE
 * Las portadas del diario son FOTOS guardadas como PNG (~2 MB cada una); PNG
 * es un formato para graficos, no para fotografia. En WebP pesan una decima
 * parte sin diferencia visible a tamano de pantalla. Y una miniatura de
 * 400 px no necesita descargar la foto de 1600: por eso hay varios anchos.
 *
 * QUE GENERA, junto a cada original <nombre>.png/.jpg:
 *   <nombre>.webp          la version completa, lado mayor <= 1600 px
 *   <nombre>.w320.webp     \
 *   <nombre>.w640.webp      > anchos menores, solo si el original es mas ancho
 *   <nombre>.w960.webp     /
 * y src/datos/imagenes.json con ancho, alto y anchos disponibles de cada una.
 * Imagen.astro lo usa para el srcset y para reservar el hueco (sin saltos).
 *
 * El original NO se toca: sigue sirviendo para Open Graph (las vistas previas
 * de WhatsApp no muestran WebP de forma fiable) y como fuente.
 */
import { readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(RAIZ, 'public');
const DIR = join(PUBLIC, 'img');
const MANIFIESTO = join(RAIZ, 'src', 'datos', 'imagenes.json');

const LADO_MAX = 1600;
export const ANCHOS = [320, 640, 960];
const TODO = process.argv.includes('--todo');

/** Fotos a 80 (donde WebP deja de verse distinto del original a tamano de
 *  pantalla); con transparencia algo mas, porque los bordes recortados
 *  delatan antes la compresion. */
const CALIDAD_FOTO = 80;
const CALIDAD_ALFA = 85;

const recorrer = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? recorrer(join(d, e.name)) : [join(d, e.name)],
  );

const kb = (b) => `${Math.round(b / 1024)} KB`.padStart(8);
const alDia = (salida, fuente) =>
  !TODO && existsSync(salida) && statSync(salida).mtimeMs >= statSync(fuente).mtimeMs;

const manifiesto = {};
let antes = 0;
let despues = 0;
let hechas = 0;

for (const f of recorrer(DIR).sort()) {
  if (!/\.(png|jpe?g)$/i.test(f)) continue;
  const base = f.slice(0, -extname(f).length);
  const completa = `${base}.webp`;

  const meta = await sharp(f).metadata();
  const conAlfa = Boolean(meta.hasAlpha);
  const opciones = {
    quality: conAlfa ? CALIDAD_ALFA : CALIDAD_FOTO,
    alphaQuality: 90,
    effort: 6,
    smartSubsample: true,
  };

  /* Dimensiones de la version completa (tras limitar a 1600). */
  const escala = Math.min(1, LADO_MAX / Math.max(meta.width, meta.height));
  const ancho = Math.round(meta.width * escala);
  const alto = Math.round(meta.height * escala);
  const anchos = ANCHOS.filter((w) => w < ancho);

  const tareas = [[completa, LADO_MAX, true], ...anchos.map((w) => [`${base}.w${w}.webp`, w, false])];
  let regeneradas = 0;
  for (const [salida, w, esCompleta] of tareas) {
    if (alDia(salida, f)) continue;
    await sharp(f)
      .rotate()
      .resize(
        esCompleta
          ? { width: w, height: w, fit: 'inside', withoutEnlargement: true }
          : { width: w, withoutEnlargement: true },
      )
      .webp(opciones)
      .toFile(salida);
    regeneradas++;
  }

  const pesoOriginal = statSync(f).size;
  const pesoWebp = statSync(completa).size;
  antes += pesoOriginal;
  despues += pesoWebp;
  if (regeneradas) {
    hechas++;
    const pct = Math.round((1 - pesoWebp / pesoOriginal) * 100);
    console.log(
      `${kb(pesoOriginal)} -> ${kb(pesoWebp)}  (-${pct}%)  +${anchos.length} anchos  ${relative(DIR, f)}`,
    );
  }

  /* Clave: la ruta tal como la escribe el contenido ("/img/..."). */
  const clave = '/' + relative(PUBLIC, f).split(sep).join('/');
  manifiesto[clave] = { ancho, alto, anchos };
}

writeFileSync(MANIFIESTO, JSON.stringify(manifiesto, null, 2) + '\n');

console.log(
  `\n${hechas} actualizadas, ${Object.keys(manifiesto).length} en el manifiesto.` +
    ` Version completa: ${kb(antes).trim()} -> ${kb(despues).trim()}` +
    ` (-${Math.round((1 - despues / antes) * 100)}%)`,
);
