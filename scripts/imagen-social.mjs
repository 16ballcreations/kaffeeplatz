/**
 * imagen-social.mjs — genera la imagen que se ve al compartir el sitio.
 *
 *   npm run imagen-social
 *
 * Salida: public/img/marca/compartir.jpg (1200x630, el formato que esperan
 * WhatsApp, Facebook, X y LinkedIn). El emblema oficial centrado sobre el
 * negro de la marca con el lino oscuro, igual que el hero del sitio.
 *
 * JPG y no PNG: el emblema es transparente y cada app lo pintaba sobre un
 * fondo distinto; ademas WhatsApp descarta imagenes pesadas, y el PNG pesaba
 * 1,6 MB. Este queda en ~100 KB.
 */
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARCA = join(RAIZ, 'public', 'img', 'marca');
const ANCHO = 1200;
const ALTO = 630;
const LADO_EMBLEMA = 500;

/* Lino oscuro a mosaico, apagado como en el hero (82% de negro encima). */
const tile = await sharp(join(MARCA, 'lino-tile.png')).resize(320, 320).toBuffer();
const lino = await sharp({
  create: { width: ANCHO, height: ALTO, channels: 4, background: '#0f0e0d' },
})
  .composite([{ input: tile, tile: true, blend: 'over' }])
  .png()
  .toBuffer();

const capas = Buffer.from(`
<svg width="${ANCHO}" height="${ALTO}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="brillo" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#dec185" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#dec185" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="#0f0e0d" fill-opacity="0.82"/>
  <rect width="100%" height="100%" fill="url(#brillo)"/>
</svg>`);

const emblema = await sharp(join(MARCA, 'emblema.png'))
  .resize(LADO_EMBLEMA, LADO_EMBLEMA)
  .toBuffer();

const salida = join(MARCA, 'compartir.jpg');
const info = await sharp(lino)
  .composite([
    { input: capas, top: 0, left: 0 },
    { input: emblema, top: (ALTO - LADO_EMBLEMA) / 2, left: (ANCHO - LADO_EMBLEMA) / 2 },
  ])
  .flatten({ background: '#0f0e0d' })
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(salida);

console.log(`public/img/marca/compartir.jpg: ${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB`);
