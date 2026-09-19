/**
 * paneles.mjs — invariante critico de OBSIDIANA.
 *
 * Verifica que NINGUNA imagen de contenido quede directamente sobre el canvas
 * negro. Toda foto debe vivir dentro de un contenedor de superficie clara
 * (el passe-partout), porque ~60% de las fotos son recortes sobre fondo BLANCO
 * y sobre negro crearian un parche brillante flotante.
 *
 * Unica excepcion permitida: el emblema de marca, que es un medallon con su
 * propio fondo de lino OSCURO y por tanto no produce parche.
 *
 * Recorre el HTML construido en dist/ y comprueba, para cada <img>, que
 * alguno de sus ancestros sea un contenedor con panel claro.
 *
 * Uso: node scripts/paneles.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;

/** Selectores que en obsidiana.css llevan fondo claro (crema o blanco). */
const CONTENEDORES_PANEL = [
  'data-kp-tarjeta-media',
  'data-kp-articulo-media',
  'data-kp-ficha-galeria',
  // Galeria seleccionable: el visor y CADA miniatura son paneles claros.
  'data-kp-galeria-principal',
  'data-kp-galeria-mini',
  'data-kp-articulo-portada',
  'data-kp-prosa',
  'data-kp-ficha-descripcion',
  'c-panel',
];

/** Imagenes exentas: llevan su propio fondo oscuro de marca. */
/* `emblema-sm.png` es la variante pequena del mismo medallon (la usa la
   cabecera fija en todas las paginas). Lleva el mismo fondo de lino oscuro,
   asi que esta exenta por el mismo motivo que `emblema.png`: el patron
   anterior pedia un `.png` literal detras de "emblema" y no la cubria. */
const EXENTAS = [/\/img\/marca\/emblema(-[a-z]+)?\.png/, /\/img\/marca\/wordmark\.png/];

/** @param {string} dir @returns {AsyncGenerator<string>} */
async function* html(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* html(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}

/**
 * Para una posicion de <img>, devuelve true si algun ancestro abierto lleva
 * uno de los ganchos de panel. Se resuelve contando apertura/cierre de tags
 * hacia atras desde la imagen.
 */
/** @param {string} doc @param {number} posImg @returns {boolean} */
function dentroDePanel(doc, posImg) {
  const antes = doc.slice(0, posImg);
  // Pila de elementos abiertos hasta este punto.
  /** @type {{tag: string, attrs: string}[]} */
  const pila = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(antes)) !== null) {
    const [, cierre, tag, attrs, autoCierre] = m;
    const t = tag.toLowerCase();
    if (['img', 'br', 'hr', 'meta', 'link', 'input', 'source'].includes(t)) continue;
    if (autoCierre) continue;
    if (cierre) {
      const i = pila.map((x) => x.tag).lastIndexOf(t);
      if (i >= 0) pila.splice(i);
    } else {
      pila.push({ tag: t, attrs });
    }
  }
  return pila.some((el) => CONTENEDORES_PANEL.some((c) => el.attrs.includes(c)));
}

let total = 0;
let exentas = 0;
let enPanel = 0;
/** @type {{pagina: string, src: string}[]} */
const fallos = [];

for await (const f of html(DIST)) {
  const doc = await readFile(f, 'utf8');
  const re = /<img\b[^>]*>/g;
  let m;
  while ((m = re.exec(doc)) !== null) {
    const tag = m[0];
    const src = (tag.match(/src="([^"]*)"/) || [])[1] || '(sin src)';
    total++;
    if (EXENTAS.some((r) => r.test(src))) {
      exentas++;
      continue;
    }
    if (dentroDePanel(doc, m.index)) enPanel++;
    else fallos.push({ pagina: f.replace(DIST, ''), src });
  }
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OBSIDIANA — invariante del passe-partout');
console.log('  "ninguna imagen directamente sobre el canvas negro"');
console.log('══════════════════════════════════════════════════════════════════\n');
console.log(`  <img> encontradas en dist/ ............ ${total}`);
console.log(`  exentas (emblema/wordmark, fondo propio) ${exentas}`);
console.log(`  dentro de un panel claro .............. ${enPanel}`);
console.log(`  SOBRE EL NEGRO SIN PANEL ............... ${fallos.length}`);

if (fallos.length) {
  console.log('\n  ✗ FALLOS:');
  for (const f of fallos.slice(0, 25)) console.log(`      ${f.pagina}  ->  ${f.src}`);
  if (fallos.length > 25) console.log(`      ... y ${fallos.length - 25} más`);
  console.log('');
  process.exit(1);
}

console.log('\n  ✓ Invariante satisfecho: toda foto de contenido va en panel claro.\n');
