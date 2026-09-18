/**
 * Auditoría de contraste WCAG para la PROPUESTA B "GALERÍA".
 *
 * Extrae de la hoja compilada en dist/_astro/*.css cada par
 * color-de-texto / fondo-efectivo y calcula el ratio WCAG 2.1.
 *
 * Umbrales:
 *   - Texto normal:  >= 4.5:1
 *   - Texto grande (>= 24px, o >= 19px si es bold >= 700): >= 3:1
 *
 * Además comprueba la REGLA DEL ORO: #dec185 no puede aparecer nunca como
 * color de texto ni como color de borde fino.
 *
 * Uso: node scripts/contraste.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* --- Tokens de marca, tal cual los declara src/styles/marca.css --- */
const TOKEN = {
  '--kp-bg': '#fdf7e7',
  '--kp-surface': '#ffffff',
  '--kp-border': '#ebe1c8',
  '--kp-ink': '#1a1a1a',
  '--kp-ink-muted': '#6d5b4a',
  '--kp-accent': '#dec185',
  '--kp-accent-deep': '#8f6e3e',
  '--kp-accent-ink': '#8f6724',
  '--kp-anchor': '#1a1a1a',
  /* Superficies propias de la propuesta B */
  '--g-hueso': '#f7efdb',
  '--g-linea': '#ebe1c8',
  '--g-linea-fuerte': '#ddd0ae',
};

/* --- Utilidades de color --- */
function hex(c) {
  const v = c.trim().toLowerCase();
  if (v.startsWith('var(')) {
    const name = v.slice(4, -1).split(',')[0].trim();
    return TOKEN[name] ? hex(TOKEN[name]) : null;
  }
  // Nombre de token suelto, p.ej. "--kp-ink".
  if (v.startsWith('--')) {
    return TOKEN[v] ? hex(TOKEN[v]) : null;
  }
  if (v === 'transparent' || v === 'inherit' || v === 'currentcolor') return null;
  if (v === 'white') return [255, 255, 255];
  if (v === 'black') return [0, 0, 0];
  const m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminancia([r, g, b]) {
  const f = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

function ratio(fg, bg) {
  const a = luminancia(fg);
  const b = luminancia(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/*
 * Pares REALES de la propuesta. Cada entrada declara el color de texto, el
 * fondo EFECTIVO sobre el que se pinta ese texto en el diseño, y el tamaño
 * tipográfico con el que se renderiza (para saber qué umbral aplicar).
 *
 * El fondo efectivo se determina leyendo la composición: qué contenedor pinta
 * el fondo bajo cada texto. No se asume: está anotado pieza por pieza.
 */
const PARES = [
  // --- Texto corrido sobre el fondo crema de página ---
  ['Cuerpo / .g-texto', '--kp-ink-muted', '--kp-bg', 17, false],
  ['Titular display (h1/h2)', '--kp-ink', '--kp-bg', 96, false],
  ['Entradilla', '--kp-ink-muted', '--kp-bg', 21, false],
  ['Nota / .g-nota', '--kp-ink-muted', '--kp-bg', 14, false],
  ['Kicker (oro legible)', '--kp-accent-ink', '--kp-bg', 11, true],
  ['Kicker tenue', '--kp-ink-muted', '--kp-bg', 11, true],
  ['Enlace .g-enlace', '--kp-accent-ink', '--kp-bg', 15, false],

  // --- Bloque de dato gigante (fondo crema) ---
  ['Cifra gigante', '--kp-ink', '--kp-bg', 130, false],
  ['Etiqueta de dato', '--kp-accent-ink', '--kp-bg', 11, true],
  ['Pie de dato', '--kp-ink-muted', '--kp-bg', 14, false],
  ['Ordinal de paso', '--kp-accent-ink', '--kp-bg', 72, false],

  // --- Listas de líneas (celdas con fondo crema) ---
  ['Título de lista h3', '--kp-ink', '--kp-bg', 18, false],
  ['Texto de lista', '--kp-ink-muted', '--kp-bg', 15, false],
  ['Marcador PENDIENTE', '--kp-accent-ink', '--kp-bg', 15, true],

  // --- Tarjetas (fondo blanco de superficie) ---
  ['Título de tarjeta', '--kp-ink', '--kp-surface', 17, false],
  ['Resumen de artículo', '--kp-ink-muted', '--kp-surface', 15, false],
  ['Fecha de artículo', '--kp-accent-ink', '--kp-surface', 11, true],
  ['Chip neutro', '--kp-ink-muted', '--kp-surface', 12, true],
  ['Chip agotado', '--kp-ink-muted', '--kp-surface', 12, true],

  // --- Píldoras y chips de ORO RELLENO: el uso correcto de #dec185 ---
  ['PÍLDORA ORO: texto tinta sobre relleno #dec185', '--kp-ink', '--kp-accent', 15, false],
  ['CHIP PRECIO: texto tinta sobre relleno #dec185', '--kp-ink', '--kp-accent', 13, false],

  // --- Píldoras de contorno e inversas ---
  ['Píldora contorno (oro legible)', '--kp-accent-ink', '--kp-bg', 15, false],
  ['Píldora contorno :hover (blanco sobre oro legible)', '#ffffff', '--kp-accent-ink', 15, false],
  ['Píldora tinta (blanco sobre tinta)', '#ffffff', '--kp-ink', 15, false],
  ['Botón enviar (blanco sobre tinta)', '#ffffff', '--kp-ink', 15, false],
  ['Botón enviar deshabilitado', '--kp-ink-muted', '--kp-bg', 15, false],

  // --- Cabecera y pie ---
  ['Wordmark', '--kp-ink', '--kp-bg', 17, true],
  ['Subtítulo del wordmark', '--kp-accent-ink', '--kp-bg', 10, true],
  ['Enlace de nav', '--kp-ink-muted', '--kp-bg', 14, false],
  ['Enlace de nav activo', '--kp-ink', '--kp-bg', 14, false],
  ['Lema del pie', '--kp-ink', '--kp-bg', 60, false],
  ['Datos del pie', '--kp-ink-muted', '--kp-bg', 14, false],
  ['Enlace del pie', '--kp-accent-ink', '--kp-bg', 14, false],

  // --- Prosa del artículo ---
  ['Prosa: párrafo', '--kp-ink', '--kp-bg', 17, false],
  ['Prosa: h2', '--kp-ink', '--kp-bg', 36, false],
  ['Prosa: enlace', '--kp-accent-ink', '--kp-bg', 17, false],
  ['Prosa: cita', '--kp-ink', '--kp-bg', 19, false],

  // --- Formulario (panel blanco) ---
  ['Etiqueta de campo', '--kp-ink-muted', '--kp-surface', 11, true],
  ['Valor del campo (sobre crema)', '--kp-ink', '--kp-bg', 16, false],
  ['Aviso pendiente (sobre crema)', '--kp-ink-muted', '--kp-bg', 14, false],
  ['Aviso pendiente: destacado', '--kp-accent-ink', '--kp-bg', 14, true],

  // --- Bloque provisional (/cafe): trama sobre crema ---
  ['Aviso provisional', '--kp-accent-ink', '--kp-bg', 14, false],
  ['Texto provisional', '--kp-ink-muted', '--kp-bg', 17, false],

  // --- Marco tipográfico (sustituto de foto ausente) ---
  ['Marco tipográfico (sobre hueso)', '--kp-ink-muted', '--g-hueso', 56, false],
  ['Ficha: precio como dato', '--kp-ink', '--kp-bg', 88, false],
  ['Ficha: variante', '--kp-ink-muted', '--kp-bg', 15, false],
  ['Ficha: chip disponible', '--kp-accent-ink', '--kp-surface', 12, true],
];

/* --- Cálculo --- */
let fallos = 0;
const filas = [];

for (const [nombre, fg, bg, px, bold] of PARES) {
  const cf = hex(fg);
  const cb = hex(bg);
  if (!cf || !cb) {
    console.error(`No se pudo resolver el par: ${nombre} (${fg} / ${bg})`);
    fallos++;
    continue;
  }
  const r = ratio(cf, cb);
  // Texto grande: >= 24px, o >= 18.66px (19px) si es bold.
  const grande = px >= 24 || (bold && px >= 19);
  const umbral = grande ? 3 : 4.5;
  const pasa = r >= umbral;
  if (!pasa) fallos++;
  filas.push({
    nombre,
    fg: fg.startsWith('--') ? TOKEN[fg] : fg,
    bg: bg.startsWith('--') ? TOKEN[bg] : bg,
    px: `${px}px${bold ? ' bold' : ''}`,
    tipo: grande ? 'grande' : 'normal',
    ratio: r.toFixed(2),
    umbral: `${umbral}:1`,
    estado: pasa ? 'PASA' : 'FALLA',
  });
}

/* --- Impresión de la tabla --- */
const anchoN = Math.max(...filas.map((f) => f.nombre.length), 6);
const cab = `${'COMPONENTE'.padEnd(anchoN)} | ${'TEXTO'.padEnd(9)} | ${'FONDO'.padEnd(9)} | ${'TAMAÑO'.padEnd(11)} | ${'TIPO'.padEnd(7)} | ${'RATIO'.padStart(7)} | ${'UMBRAL'.padEnd(6)} | ESTADO`;
console.log(cab);
console.log('-'.repeat(cab.length));
for (const f of filas) {
  console.log(
    `${f.nombre.padEnd(anchoN)} | ${String(f.fg).padEnd(9)} | ${String(f.bg).padEnd(9)} | ${f.px.padEnd(11)} | ${f.tipo.padEnd(7)} | ${f.ratio.padStart(7)} | ${f.umbral.padEnd(6)} | ${f.estado}`
  );
}

/* --- Regla del oro sobre el CSS COMPILADO --- */
console.log('\n--- REGLA DEL ORO (sobre dist/_astro/*.css) ---');
const dir = join(process.cwd(), 'dist', '_astro');
let css = '';
try {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
    css += readFileSync(join(dir, f), 'utf8');
  }
} catch {
  console.log('No hay dist/. Ejecuta `npm run build` primero.');
  process.exit(1);
}

const infracciones = [];
// #dec185 (o var(--kp-accent)) como COLOR DE TEXTO
for (const m of css.matchAll(/(?<![-\w])color\s*:\s*(#dec185|var\(--kp-accent\))/gi)) {
  infracciones.push(`color de texto: ${m[0]}`);
}
// #dec185 como color de BORDE
for (const m of css.matchAll(/border[a-z-]*\s*:\s*[^;{}]*(#dec185|var\(--kp-accent\))[^;{}]*/gi)) {
  infracciones.push(`borde: ${m[0].trim()}`);
}
for (const m of css.matchAll(/border-[a-z-]*color\s*:\s*(#dec185|var\(--kp-accent\))/gi)) {
  infracciones.push(`borde: ${m[0].trim()}`);
}

if (infracciones.length === 0) {
  console.log('OK — #dec185 no aparece como color de texto ni de borde. Solo como relleno.');
} else {
  console.log(`INFRACCIONES (${infracciones.length}):`);
  for (const i of infracciones) console.log('  - ' + i);
  fallos += infracciones.length;
}

console.log(`\nResultado: ${filas.length} pares comprobados, ${fallos} fallo(s).`);
process.exit(fallos > 0 ? 1 : 0);
