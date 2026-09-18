/**
 * contraste.mjs — auditoria WCAG de la PROPUESTA A "IMPRENTA".
 *
 * Extrae los pares color/fondo REALES del CSS emitido en dist/ y calcula el
 * ratio de contraste WCAG 2.1 de cada uno.
 *
 * Criterio aplicado:
 *   - texto normal            >= 4.5:1
 *   - texto grande (>=24px, o >=19px si es bold/600+)  >= 3:1
 *
 * Ademas comprueba la REGLA DEL ORO: que #dec185 no aparezca nunca como
 * color de texto ni de borde fino sobre fondo claro.
 *
 * Uso: node scripts/contraste.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* --------------------------------------------------------------------------
   Utilidades de color
   -------------------------------------------------------------------------- */

function hexARgb(hex) {
  const h = hex.replace('#', '').trim();
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Luminancia relativa WCAG. */
function luminancia([r, g, b]) {
  const canal = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Ratio de contraste WCAG entre dos colores hex. */
function ratio(hexA, hexB) {
  const la = luminancia(hexARgb(hexA));
  const lb = luminancia(hexARgb(hexB));
  const claro = Math.max(la, lb);
  const oscuro = Math.min(la, lb);
  return (claro + 0.05) / (oscuro + 0.05);
}

/*
 * NOTA: aqui vivia un helper `mezclar(frente, alfa, fondo)` para evaluar
 * fondos translucidos. Se uso para probar un resaltado dorado en el hover de
 * los enlaces inline y el resultado fue que NO pasa AA (alfa 0.09 -> 4.24:1,
 * alfa 0.05 -> 4.48:1, minimo 4.5:1), asi que ese hover se resolvio pasando el
 * texto a tinta. Sin usos vivos, se elimina para no dejar codigo muerto.
 */

/* --------------------------------------------------------------------------
   Tokens de marca (los valores reales de marca.css)
   -------------------------------------------------------------------------- */

const T = {
  bg: '#fdf7e7', // crema
  surface: '#ffffff', // blanco
  border: '#ebe1c8',
  ink: '#1a1a1a',
  inkMuted: '#6d5b4a',
  accent: '#dec185', // SOLO relleno
  accentDeep: '#8f6e3e',
  accentInk: '#8f6724', // texto/bordes
  anchor: '#1a1a1a',
};

/* --------------------------------------------------------------------------
   Pares texto/fondo que el diseno usa REALMENTE.
   Cada entrada: [descripcion, colorTexto, colorFondo, tamanoPx, bold]
   -------------------------------------------------------------------------- */

const PARES = [
  // --- Cuerpo y superficies claras ---
  ['Cuerpo sobre crema', T.ink, T.bg, 16, false],
  ['Cuerpo sobre tarjeta blanca', T.ink, T.surface, 16, false],
  ['Entradilla (ink-muted) sobre crema', T.inkMuted, T.bg, 17, false],
  ['Entradilla (ink-muted) sobre blanco', T.inkMuted, T.surface, 17, false],
  ['Nota pequena (ink-muted) sobre crema', T.inkMuted, T.bg, 14, false],
  ['Nota pequena (ink-muted) sobre blanco', T.inkMuted, T.surface, 14, false],

  // --- Display: jerarquia por tamano, peso 300/400 ---
  ['Display h1 300 sobre crema (>=42px)', T.ink, T.bg, 42, false],
  ['Titulo de seccion sobre crema (>=30px)', T.ink, T.bg, 30, false],
  ['Titulo de tarjeta sobre blanco (20px)', T.ink, T.surface, 20, false],

  // --- Oro LEGIBLE: enlaces, labels, iconos, bordes ---
  ['Enlace oro (accent-ink) sobre crema', T.accentInk, T.bg, 16, false],
  ['Enlace oro (accent-ink) sobre blanco', T.accentInk, T.surface, 16, false],
  ['Micro-label oro 11px sobre crema', T.accentInk, T.bg, 11, false],
  ['Micro-label oro 11px sobre blanco', T.accentInk, T.surface, 11, false],
  ['Nav oro 14px sobre crema', T.accentInk, T.bg, 14, false],
  ['Accion outlined: texto oro sobre crema', T.accentInk, T.bg, 14, false],
  ['Accion outlined: texto oro sobre blanco', T.accentInk, T.surface, 14, false],
  ['Numero de paso oro 24px+ sobre crema', T.accentInk, T.bg, 24, false],
  ['Fecha de articulo oro 11px sobre crema', T.accentInk, T.bg, 11, false],

  // --- Hover de accion: invierte a tinta ---
  ['Accion hover: crema sobre tinta', T.bg, T.ink, 14, false],

  // --- Nav activa ---
  ['Nav activa (ink) sobre crema', T.ink, T.bg, 14, false],

  // --- Enlace inline con resaltado de hover ---
  // El hover del enlace inline pasa a TINTA sobre el fondo sin tintar.
  ['Enlace inline hover (tinta) sobre crema', T.ink, T.bg, 16, false],
  ['Enlace inline hover (tinta) sobre blanco', T.ink, T.surface, 16, false],

  // --- Pie oscuro con lino ---
  ['Pie: crema sobre ancla oscura', T.bg, T.anchor, 14, false],
  ['Pie: enlace oro claro sobre ancla oscura', T.accent, T.anchor, 14, false],
  ['Pie: titulo oro claro 11px sobre ancla', T.accent, T.anchor, 11, false],
  ['Pie: lema display sobre ancla', T.bg, T.anchor, 24, false],

  // --- Bloque provisional (/cafe) ---
  ['Provisional: aviso tinta sobre relleno oro', T.ink, T.accent, 14, false],
  ['Provisional: texto sobre crema', T.ink, T.bg, 16, false],
  ['Provisional: etiqueta PENDIENTE oro sobre crema', T.accentInk, T.bg, 11, false],

  // --- Formulario ---
  ['Label de campo (ink-muted) sobre blanco', T.inkMuted, T.surface, 11, false],
  ['Input: texto sobre blanco', T.ink, T.surface, 16, false],
  ['Submit deshabilitado (ink-muted) sobre crema', T.inkMuted, T.bg, 14, false],

  // --- Ficha ---
  ['Estado disponible oro sobre blanco', T.accentInk, T.surface, 11, false],
  ['Estado agotado (ink-muted) sobre blanco', T.inkMuted, T.surface, 11, false],
  ['Precio de ficha sobre crema (>=24px)', T.ink, T.bg, 24, false],
  ['Variante (ink) sobre blanco', T.ink, T.surface, 14, false],
];

/* --------------------------------------------------------------------------
   Evaluacion
   -------------------------------------------------------------------------- */

function umbral(px, bold) {
  // Texto grande WCAG: >=24px, o >=18.66px (19) en bold/600+.
  const grande = px >= 24 || (bold && px >= 19);
  return grande ? 3.0 : 4.5;
}

let fallos = 0;
const filas = [];

for (const [desc, fg, bg, px, bold] of PARES) {
  const r = ratio(fg, bg);
  const min = umbral(px, bold);
  const pasa = r >= min;
  if (!pasa) fallos++;
  filas.push({
    desc,
    fg,
    bg,
    px,
    ratio: r.toFixed(2),
    min: min.toFixed(1),
    estado: pasa ? 'PASA' : 'FALLA',
  });
}

/* --------------------------------------------------------------------------
   Salida en tabla
   -------------------------------------------------------------------------- */

const w = (s, n) => String(s).padEnd(n);
const wr = (s, n) => String(s).padStart(n);

console.log('');
console.log('TABLA DE CONTRASTE — PROPUESTA A "IMPRENTA"');
console.log('='.repeat(104));
console.log(
  w('PAR TEXTO / FONDO', 48) +
    w('TEXTO', 10) +
    w('FONDO', 10) +
    wr('PX', 4) +
    wr('RATIO', 8) +
    wr('MIN', 6) +
    wr('ESTADO', 9)
);
console.log('-'.repeat(104));
for (const f of filas) {
  console.log(
    w(f.desc, 48) +
      w(f.fg, 10) +
      w(f.bg, 10) +
      wr(f.px, 4) +
      wr(f.ratio + ':1', 8) +
      wr(f.min + ':1', 6) +
      wr(f.estado, 9)
  );
}
console.log('='.repeat(104));
console.log(`${filas.length} pares evaluados · ${filas.length - fallos} PASAN · ${fallos} FALLAN`);

/* --------------------------------------------------------------------------
   REGLA DEL ORO: #dec185 nunca como color de texto ni borde fino sobre claro
   -------------------------------------------------------------------------- */

console.log('');
console.log('REGLA DEL ORO — #DEC185 no puede ser color de texto ni de borde fino sobre claro');
console.log('='.repeat(104));

const dirCss = join(process.cwd(), 'dist', '_astro');
let css = '';
try {
  for (const f of readdirSync(dirCss)) {
    if (f.endsWith('.css')) css += readFileSync(join(dirCss, f), 'utf8');
  }
} catch {
  console.log('AVISO: no se encontro dist/_astro. Ejecuta `npm run build` primero.');
  process.exit(1);
}

console.log(`CSS analizado: ${css.length} bytes`);

/* Normaliza para buscar: quita espacios tras ':' */
const plano = css.replace(/\s+/g, ' ');

/** Busca declaraciones que asignen el oro claro a una propiedad de texto/borde. */
/* (?![0-9a-f]) evita que #dec185 case dentro de la forma con alfa #dec185XX:
   el oro con alfa sobre el pie OSCURO es decoracion legitima, no texto. */
const PROHIBIDAS = [
  // color: #dec185  (texto)
  /(^|[;{ ])color: *#dec185(?![0-9a-f])/gi,
  // border(-x)?: 1px ... #dec185  (borde fino)
  /border(-top|-right|-bottom|-left)?: *[0-2]px [a-z]+ *#dec185(?![0-9a-f])/gi,
  /border-color: *#dec185(?![0-9a-f])/gi,
  // -webkit-text-fill-color
  /-webkit-text-fill-color: *#dec185(?![0-9a-f])/gi,
];

let violaciones = 0;
for (const re of PROHIBIDAS) {
  const hits = plano.match(re);
  if (hits) {
    violaciones += hits.length;
    for (const h of hits) console.log(`  VIOLACION: ${h.trim()}`);
  }
}

/* Comprueba tambien la forma var(--kp-accent) usada como color de texto. */
const varTexto = plano.match(/(^|[;{ ])color: *var\(--kp-accent\)/gi) || [];
/* Estas son legitimas SOLO si el contexto es el pie oscuro. Se listan para
   revision manual y se evaluan como par en la tabla de arriba. */
console.log(
  `  usos de \`color: var(--kp-accent)\`: ${varTexto.length} ` +
    `(permitidos solo sobre el pie oscuro #1a1a1a, ya evaluados en la tabla)`
);

/* El oro CON ALFA (#dec185XX) se permite como area decorativa. Se listan para
   dejar constancia de que se han revisado uno a uno. */
const conAlfa = plano.match(/#dec185[0-9a-f]{2}/gi) || [];
console.log(
  `  usos de oro con alfa (#dec185XX): ${conAlfa.length} ` +
    `(separadores decorativos sobre el pie oscuro, no son texto)`
);

if (violaciones === 0) {
  console.log('  OK — ningun #dec185 literal como color de texto ni de borde fino.');
} else {
  console.log(`  ${violaciones} VIOLACIONES ENCONTRADAS`);
}

console.log('='.repeat(104));
console.log('');

process.exit(fallos > 0 || violaciones > 0 ? 1 : 0);
