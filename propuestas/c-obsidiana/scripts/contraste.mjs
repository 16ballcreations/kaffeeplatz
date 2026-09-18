/**
 * contraste.mjs — verifica el ratio WCAG 2.1 de todos los pares texto/fondo
 * del sistema visual "Obsidiana".
 *
 * Los hairlines se declaran en rgba sobre el canvas: se componen contra su
 * fondo real antes de medir, porque el ojo ve el color COMPUESTO, no el alfa.
 *
 * Uso: node scripts/contraste.mjs
 */

const hex = (h) => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};

/** Compone un rgba sobre un fondo opaco. */
const sobre = (rgba, fondoHex) => {
  const [r, g, b, a] = rgba;
  const f = hex(fondoHex);
  return [0, 1, 2].map((i) => Math.round(rgba[i] * a + f[i] * (1 - a)));
};

const canal = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const lum = (rgb) => 0.2126 * canal(rgb[0]) + 0.7152 * canal(rgb[1]) + 0.0722 * canal(rgb[2]);

const ratio = (a, b) => {
  const la = lum(Array.isArray(a) ? a : hex(a));
  const lb = lum(Array.isArray(b) ? b : hex(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

// --- ESCALONADO DE SUPERFICIES (revision: la pagina se veia plana) ---------
const ABISMO = '#111111';        // pie, hero, encabezados interiores
const CANVAS = '#1a1a1a';        // base de pagina
const ELEVADO = '#232320';       // tarjetas
const ELEVADO_HOVER = '#2e2b28'; // tarjeta en hover
const PANEL_OSCURO = '#2a2724';  // bloque de cierre, el escalon mas alto
const HONDO = '#151514';         // cabecera fija e inputs
const PANEL = '#fdf7e7';         // crema: paneles de imagen Y franja clara
const PANEL_BLANCO = '#ffffff';

// --- Tintas -----------------------------------------------------------------
const TINTA = '#fdf7e7';
const TENUE = '#b3ab9c';
const SUTIL = '#96907f';
const ORO = '#dec185';
const ORO_LEGIBLE = '#8f6724';
const INK = '#1a1a1a';
const INK_MUTED = '#6d5b4a';
// Tinta secundaria de las franjas CLARAS nuevas.
const INK_CREMA_TENUE = '#5c4c3e';

/**
 * @typedef {[uso: string, fg: string, bg: string, tipo: string, umbral: number]} Par
 * @typedef {[uso: string, rgba: number[], bg: string, nota: string]} Hair
 */

/**
 * Cada par: [donde, color de texto, fondo, tamano, umbral]
 * Umbral 4.5 = texto normal AA. 3.0 = texto grande AA (>=18.66px bold o >=24px)
 * y componentes no textuales (bordes, iconos) segun 1.4.11.
 */
/** @type {Par[]} */
const PARES = [
  // ---- Texto sobre el canvas -------------------------------------------
  ['Cuerpo / titulares (crema)', TINTA, CANVAS, 'normal', 4.5],
  ['Texto atenuado (entradilla, prosa)', TENUE, CANVAS, 'normal', 4.5],
  ['Texto sutil (folio, legal 12px)', SUTIL, CANVAS, 'normal', 4.5],
  ['Oro como texto — enlaces y acciones', ORO, CANVAS, 'normal', 4.5],

  // ---- Texto sobre superficie elevada (tarjetas) ------------------------
  ['Título de tarjeta (crema)', TINTA, ELEVADO, 'normal', 4.5],
  ['Precio en píldora (oro)', ORO, ELEVADO, 'normal', 4.5],
  ['Agotado / meta (atenuado)', TENUE, ELEVADO, 'normal', 4.5],
  ['Acción WhatsApp de tarjeta (oro)', ORO, ELEVADO, 'normal', 4.5],
  ['Título de tarjeta en hover', TINTA, ELEVADO_HOVER, 'normal', 4.5],
  ['Oro en tarjeta en hover', ORO, ELEVADO_HOVER, 'normal', 4.5],

  // ---- Texto sobre superficie honda (pie, cierre, inputs) ---------------
  ['Pie: enlaces (crema)', TINTA, HONDO, 'normal', 4.5],
  ['Pie: texto secundario', TENUE, HONDO, 'normal', 4.5],
  ['Pie: legal 12px (sutil)', SUTIL, HONDO, 'normal', 4.5],
  ['Pie: lema (oro)', ORO, HONDO, 'normal', 4.5],
  ['Input: texto escrito', TINTA, HONDO, 'normal', 4.5],
  ['Botón enviar deshabilitado', SUTIL, HONDO, 'normal', 4.5],

  // ---- Texto sobre panel CLARO (aquí vuelve la regla del oro) ----------
  ['Panel: texto oscuro sobre crema', INK, PANEL, 'normal', 4.5],
  ['Panel: texto secundario sobre crema', INK_MUTED, PANEL, 'normal', 4.5],
  ['Panel: oro LEGIBLE sobre crema', ORO_LEGIBLE, PANEL, 'normal', 4.5],
  ['Panel blanco: texto oscuro', INK, PANEL_BLANCO, 'normal', 4.5],
  ['Salto al contenido (crema/oscuro)', INK, PANEL, 'grande', 3.0],

  // ---- ESCALONADO NUEVO: texto sobre cada nivel de superficie ----------
  ['Abismo #111: cuerpo (crema)', TINTA, ABISMO, 'normal', 4.5],
  ['Abismo #111: atenuado', TENUE, ABISMO, 'normal', 4.5],
  ['Abismo #111: sutil 12px', SUTIL, ABISMO, 'normal', 4.5],
  ['Abismo #111: oro (titulares hero)', ORO, ABISMO, 'normal', 4.5],
  ['Panel oscuro #2A2724: cuerpo', TINTA, PANEL_OSCURO, 'normal', 4.5],
  ['Panel oscuro #2A2724: atenuado', TENUE, PANEL_OSCURO, 'normal', 4.5],
  ['Panel oscuro #2A2724: oro', ORO, PANEL_OSCURO, 'normal', 4.5],
  ['Elevado #232320: sutil 12px', SUTIL, ELEVADO, 'normal', 4.5],

  // ---- FRANJA CLARA a sangre (seccion de contraste nueva) --------------
  ['Franja crema: titulares h2', INK, PANEL, 'normal', 4.5],
  ['Franja crema: h3 de paso', INK, PANEL, 'normal', 4.5],
  ['Franja crema: prosa secundaria', INK_CREMA_TENUE, PANEL, 'normal', 4.5],
  ['Franja crema: nota / kicker', ORO_LEGIBLE, PANEL, 'normal', 4.5],
  ['Franja crema: folio de seccion', ORO_LEGIBLE, PANEL, 'normal', 4.5],
  ['Franja crema: numeral de paso', ORO_LEGIBLE, PANEL, 'normal', 4.5],
  ['Franja crema: enlace de accion', ORO_LEGIBLE, PANEL, 'normal', 4.5],
  ['Franja crema: enlace en hover', INK, PANEL, 'normal', 4.5],
  ['Franja crema: foco (oro oscuro)', ORO_LEGIBLE, PANEL, 'no-texto', 3.0],

  // ---- /cafe provisional ------------------------------------------------
  ['Provisional: aviso (oro)', ORO, CANVAS, 'normal', 4.5],
  ['Provisional: prosa atenuada', TENUE, CANVAS, 'normal', 4.5],

  // ---- Componentes no textuales (1.4.11, umbral 3.0) -------------------
  ['Anillo de foco (oro) vs canvas', ORO, CANVAS, 'no-texto', 3.0],
  ['Anillo de foco (oro) vs elevado', ORO, ELEVADO, 'no-texto', 3.0],
  ['Borde de input enfocado (oro)', ORO, HONDO, 'no-texto', 3.0],
  ['Borde del panel claro vs canvas', '#e8ddc2', CANVAS, 'no-texto', 3.0],
];

/** Hairlines: se componen contra su fondo antes de medir. */
/** @type {Hair[]} */
const HAIRLINES = [
  ['Hairline base (14%) vs canvas', [253, 247, 231, 0.14], CANVAS, 'decorativo'],
  ['Hairline fuerte (24%) vs canvas', [253, 247, 231, 0.24], CANVAS, 'decorativo'],
  ['Hairline oro (38%) vs canvas', [222, 193, 133, 0.38], CANVAS, 'decorativo'],
  ['Hairline oro (38%) vs elevado', [222, 193, 133, 0.38], ELEVADO, 'decorativo'],
  ['Hairline base (14%) vs abismo', [253, 247, 231, 0.14], ABISMO, 'decorativo'],
  ['Hairline oro (38%) vs abismo', [222, 193, 133, 0.38], ABISMO, 'decorativo'],
  ['Hairline base (14%) vs panel oscuro', [253, 247, 231, 0.14], PANEL_OSCURO, 'decorativo'],
];

const fmt = (n) => n.toFixed(2).padStart(6);

console.log('\n══════════════════════════════════════════════════════════════════════════════');
console.log('  OBSIDIANA — CONTRASTE WCAG 2.1  (4 niveles de superficie + franja crema)');
console.log('══════════════════════════════════════════════════════════════════════════════\n');
console.log(
  '| Uso                                     | Texto   | Fondo   |  Ratio | Umbral | AA  | AAA |'
);
console.log(
  '| --------------------------------------- | ------- | ------- | ------ | ------ | --- | --- |'
);

let fallos = 0;
for (const [uso, fg, bg, tipo, umbral] of PARES) {
  const r = ratio(fg, bg);
  const pasaAA = r >= umbral;
  // AAA: 7.0 texto normal, 4.5 texto grande. No aplica a no-textuales.
  const umbralAAA = tipo === 'grande' ? 4.5 : 7.0;
  const aaa = tipo === 'no-texto' ? ' — ' : r >= umbralAAA ? ' ✓ ' : ' · ';
  if (!pasaAA) fallos++;
  console.log(
    `| ${uso.padEnd(39)} | ${fg.padEnd(7)} | ${bg.padEnd(7)} | ${fmt(r)} | ${String(umbral).padStart(6)} | ${pasaAA ? ' ✓ ' : 'FALLA'} |${aaa}|`
  );
}

console.log(
  '\n| Hairlines (decorativos, sin umbral)     | compuesto sobre su fondo  |  Ratio |'
);
console.log('| --------------------------------------- | ------------------------- | ------ |');
for (const [uso, rgba, bg] of HAIRLINES) {
  const comp = sobre(rgba, bg);
  const r = ratio(comp, bg);
  const chex = '#' + comp.map((c) => c.toString(16).padStart(2, '0')).join('');
  console.log(`| ${uso.padEnd(39)} | ${chex} sobre ${bg.padEnd(9)} | ${fmt(r)} |`);
}

console.log('\n──────────────────────────────────────────────────────────────────────────────');
console.log(`  Pares evaluados: ${PARES.length}   ·   Fallos AA: ${fallos}`);
console.log('──────────────────────────────────────────────────────────────────────────────\n');

// Comprobacion explicita de la regla del oro reinterpretada.
const oroSobreCrema = ratio(ORO, PANEL);
const oroSobreNegro = ratio(ORO, CANVAS);
console.log('  REGLA DEL ORO — verificación explícita:');
console.log(`    #DEC185 sobre crema #FDF7E7 .... ${oroSobreCrema.toFixed(2)}:1  -> FALLA (prohibido como texto)`);
console.log(`    #DEC185 sobre negro #1A1A1A .... ${oroSobreNegro.toFixed(2)}:1  -> PASA AA y AAA`);
console.log('    La prohibición es relativa al fondo crema, no al color.');
console.log('    En Obsidiana el oro solo se usa como texto SOBRE superficie oscura.\n');

process.exit(fallos > 0 ? 1 : 0);
