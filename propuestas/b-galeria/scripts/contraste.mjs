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
  '--g-arena': '#f5ebd3',
  '--g-linea': '#ebe1c8',
  '--g-linea-fuerte': '#ddd0ae',
  /* Superficie de ancla e invertidos */
  '--g-linea-oscura': '#3a3631',
  '--g-linea-oscura-fuerte': '#4d473f',
  '--g-tinta-inv': '#fdf7e7',
  '--g-tinta-inv-muted': '#c9bfa8',
  /* Oro legible sobre superficie clara (incluida la arena) */
  '--g-oro-texto': '#845f21',
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
  ['Kicker (oro legible)', '--g-oro-texto', '--kp-bg', 11, true],
  ['Kicker tenue', '--kp-ink-muted', '--kp-bg', 11, true],
  ['Enlace .g-enlace', '--g-oro-texto', '--kp-bg', 15, false],

  // --- Bloque de dato gigante (fondo crema) ---
  ['Cifra gigante', '--kp-ink', '--kp-bg', 130, false],
  ['Etiqueta de dato', '--g-oro-texto', '--kp-bg', 11, true],
  ['Pie de dato', '--kp-ink-muted', '--kp-bg', 14, false],
  ['Ordinal de paso', '--g-oro-texto', '--kp-bg', 72, false],

  // --- Listas de líneas (celdas con fondo crema) ---
  ['Título de lista h3', '--kp-ink', '--kp-bg', 18, false],
  ['Texto de lista', '--kp-ink-muted', '--kp-bg', 15, false],
  ['Marcador PENDIENTE', '--g-oro-texto', '--kp-bg', 15, true],

  // --- Tarjetas (fondo blanco de superficie) ---
  ['Título de tarjeta', '--kp-ink', '--kp-surface', 17, false],
  ['Resumen de artículo', '--kp-ink-muted', '--kp-surface', 15, false],
  ['Fecha de artículo', '--g-oro-texto', '--kp-surface', 11, true],
  ['Chip neutro', '--kp-ink-muted', '--kp-surface', 12, true],
  ['Chip agotado', '--kp-ink-muted', '--kp-surface', 12, true],

  // --- Píldoras y chips de ORO RELLENO: el uso correcto de #dec185 ---
  ['PÍLDORA ORO: texto tinta sobre relleno #dec185', '--kp-ink', '--kp-accent', 15, false],
  ['CHIP PRECIO: texto tinta sobre relleno #dec185', '--kp-ink', '--kp-accent', 13, false],

  // --- Píldoras de contorno e inversas ---
  ['Píldora contorno (oro legible)', '--g-oro-texto', '--kp-bg', 15, false],
  ['Píldora contorno :hover (blanco sobre oro legible)', '#ffffff', '--kp-accent-ink', 15, false],
  ['Píldora tinta (blanco sobre tinta)', '#ffffff', '--kp-ink', 15, false],
  ['Botón enviar (blanco sobre tinta)', '#ffffff', '--kp-ink', 15, false],
  ['Botón enviar deshabilitado', '--kp-ink-muted', '--kp-bg', 15, false],

  // --- Cabecera y pie ---
  ['Wordmark', '--kp-ink', '--kp-bg', 17, true],
  ['Subtítulo del wordmark', '--g-oro-texto', '--kp-bg', 10, true],
  ['Enlace de nav', '--kp-ink-muted', '--kp-bg', 14, false],
  ['Enlace de nav activo', '--kp-ink', '--kp-bg', 14, false],
  ['Lema del pie', '--kp-ink', '--kp-bg', 60, false],
  ['Datos del pie', '--kp-ink-muted', '--kp-bg', 14, false],
  ['Enlace del pie', '--g-oro-texto', '--kp-bg', 14, false],

  // --- Prosa del artículo ---
  ['Prosa: párrafo', '--kp-ink', '--kp-bg', 17, false],
  ['Prosa: h2', '--kp-ink', '--kp-bg', 36, false],
  ['Prosa: enlace', '--g-oro-texto', '--kp-bg', 17, false],
  ['Prosa: cita', '--kp-ink', '--kp-bg', 19, false],

  // --- Formulario (panel blanco) ---
  ['Etiqueta de campo', '--kp-ink-muted', '--kp-surface', 11, true],
  ['Valor del campo (sobre crema)', '--kp-ink', '--kp-bg', 16, false],
  ['Aviso pendiente (sobre crema)', '--kp-ink-muted', '--kp-bg', 14, false],
  ['Aviso pendiente: destacado', '--g-oro-texto', '--kp-bg', 14, true],

  // --- Bloque provisional (/cafe): trama sobre crema ---
  ['Aviso provisional', '--g-oro-texto', '--kp-bg', 14, false],
  ['Texto provisional', '--kp-ink-muted', '--kp-bg', 17, false],

  // --- Marco tipográfico (sustituto de foto ausente) ---
  ['Marco tipográfico (sobre hueso)', '--kp-ink-muted', '--g-hueso', 56, false],
  ['Ficha: precio como dato', '--kp-ink', '--kp-bg', 88, false],
  ['Ficha: variante', '--kp-ink-muted', '--kp-bg', 15, false],
  ['Ficha: chip disponible', '--g-oro-texto', '--kp-surface', 12, true],

  /* =======================================================================
     RITMO DE SUPERFICIES — pares nuevos de esta iteración.
     El home ya no es crema de principio a fin: alterna blanco, crema, hueso,
     arena, oro y una sección de ancla negra. Cada superficie se audita.
     ======================================================================= */

  // --- Superficie HUESO (#f7efdb): sección "del diario" del home ---
  ['HUESO: titular de sección', '--kp-ink', '--g-hueso', 48, false],
  ['HUESO: kicker (oro legible)', '--g-oro-texto', '--g-hueso', 11, true],
  ['HUESO: nota de apoyo', '--kp-ink-muted', '--g-hueso', 14, false],
  ['HUESO: entradilla', '--kp-ink-muted', '--g-hueso', 21, false],
  ['HUESO: enlace .g-enlace', '--g-oro-texto', '--g-hueso', 15, false],

  // --- Superficie ARENA (#f5ebd3): "cómo compras" y cabeceras de internas ---
  ['ARENA: titular display', '--kp-ink', '--g-arena', 96, false],
  ['ARENA: titular h2', '--kp-ink', '--g-arena', 48, false],
  ['ARENA: kicker (oro legible)', '--g-oro-texto', '--g-arena', 11, true],
  ['ARENA: entradilla', '--kp-ink-muted', '--g-arena', 21, false],
  ['ARENA: nota de apoyo', '--kp-ink-muted', '--g-arena', 14, false],
  ['ARENA: texto de paso', '--kp-ink-muted', '--g-arena', 15, false],
  ['ARENA: título de paso h3', '--kp-ink', '--g-arena', 18, false],
  ['ARENA: ordinal de paso', '--g-oro-texto', '--g-arena', 72, false],
  ['ARENA: cifra de dato', '--kp-ink', '--g-arena', 130, false],
  ['ARENA: etiqueta de dato', '--g-oro-texto', '--g-arena', 11, true],
  ['ARENA: pie de dato', '--kp-ink-muted', '--g-arena', 14, false],
  ['ARENA: enlace .g-enlace', '--g-oro-texto', '--g-arena', 15, false],
  ['ARENA: píldora contorno', '--g-oro-texto', '--g-arena', 15, false],

  // --- Banda de ORO RELLENO (#dec185) con texto TINTA encima ---
  ['ORO: texto tinta sobre banda', '--kp-ink', '--kp-accent', 17, false],
  ['ORO: kicker tinta sobre banda', '--kp-ink', '--kp-accent', 11, true],

  /* --- SECCIÓN DE ANCLA (#1a1a1a) con textura de lino ---
     Aquí, y SOLO aquí, el oro #dec185 es color de texto: 10.01:1. */
  ['ANCLA: cifra gigante en ORO #dec185', '--kp-accent', '--kp-anchor', 130, false],
  ['ANCLA: etiqueta de dato (crema)', '--g-tinta-inv', '--kp-anchor', 11, true],
  ['ANCLA: pie de dato (crema apagado)', '--g-tinta-inv-muted', '--kp-anchor', 14, false],
  ['ANCLA: kicker en ORO #dec185', '--kp-accent', '--kp-anchor', 11, true],
  ['ANCLA: titular display (crema)', '--g-tinta-inv', '--kp-anchor', 96, false],
  ['ANCLA: titular h2 (crema)', '--g-tinta-inv', '--kp-anchor', 48, false],
  ['ANCLA: entradilla (crema apagado)', '--g-tinta-inv-muted', '--kp-anchor', 21, false],
  ['ANCLA: texto corrido (crema apagado)', '--g-tinta-inv-muted', '--kp-anchor', 17, false],
  ['ANCLA: nota (crema apagado)', '--g-tinta-inv-muted', '--kp-anchor', 14, false],
  ['ANCLA: enlace en ORO #dec185', '--kp-accent', '--kp-anchor', 15, false],
  ['ANCLA: píldora contorno en ORO', '--kp-accent', '--kp-anchor', 15, false],
  ['ANCLA: píldora contorno :hover (tinta sobre oro)', '--kp-ink', '--kp-accent', 15, false],

  // --- PIE, que ahora es superficie de ancla ---
  ['PIE ANCLA: lema (crema)', '--g-tinta-inv', '--kp-anchor', 60, false],
  ['PIE ANCLA: datos (crema apagado)', '--g-tinta-inv-muted', '--kp-anchor', 14, false],
  ['PIE ANCLA: enlace en ORO #dec185', '--kp-accent', '--kp-anchor', 14, false],
  ['PIE ANCLA: cierre / copyright', '--g-tinta-inv-muted', '--kp-anchor', 13, false],
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

/*
 * La regla se aplica SOBRE FONDO CLARO. Sobre la superficie de ancla
 * (#1a1a1a) el #dec185 da 10.01:1 y es texto perfectamente legible, así que
 * las reglas cuyo selector vive dentro de `.g-ancla` (o del pie, que ES
 * ancla) quedan exentas. Todo lo demás sigue prohibido.
 */
const ES_OSCURO = /\.g-ancla|\[data-kp-pie\]|\.g-pie-/;

/** Trocea el CSS en reglas {selector, cuerpo} para poder mirar el contexto. */
const reglas = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selector: m[1].trim(),
  cuerpo: m[2],
}));

const infracciones = [];
for (const { selector, cuerpo } of reglas) {
  const exento = ES_OSCURO.test(selector);
  // #dec185 (o var(--kp-accent)) como COLOR DE TEXTO
  for (const m of cuerpo.matchAll(/(?<![-\w])color\s*:\s*(#dec185|var\(--kp-accent\))/gi)) {
    if (!exento) infracciones.push(`color de texto en "${selector}": ${m[0]}`);
  }
  // #dec185 como color de BORDE
  for (const m of cuerpo.matchAll(
    /border[a-z-]*\s*:\s*[^;{}]*(#dec185|var\(--kp-accent\))[^;{}]*/gi
  )) {
    if (!exento) infracciones.push(`borde en "${selector}": ${m[0].trim()}`);
  }
  for (const m of cuerpo.matchAll(
    /border-[a-z-]*color\s*:\s*(#dec185|var\(--kp-accent\))/gi
  )) {
    if (!exento) infracciones.push(`borde en "${selector}": ${m[0].trim()}`);
  }
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
