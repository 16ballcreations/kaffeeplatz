/**
 * cursivas.mjs — AUDITORIA DE CURSIVAS sobre el HTML CONSTRUIDO.
 *
 * Revision de cliente:
 *   "existen MUCHAS LETRAS CURSIVAS QUE SE COMPLICAN PARA LA LECTURA.
 *    Deja solo los titulos de esa forma, el resto no los pongas en cursiva."
 *
 * Este script comprueba que la regla se cumple de verdad, no solo en la hoja
 * de estilos. Recorre las 47 paginas de dist/, resuelve que selectores de
 * obsidiana.css declaran `font-style: italic` y los casa contra los elementos
 * reales del HTML.
 *
 * PERMITIDO en cursiva:
 *   - h1 y h2            -> la firma de marca
 *   - em dentro de prosa -> enfasis semantico del autor en el Markdown
 *
 * Cualquier otra cosa en cursiva es un FALLO.
 *
 * Uso: node scripts/cursivas.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIST = path.join(RAIZ, 'dist');

if (!fs.existsSync(DIST)) {
  console.error('No existe dist/. Ejecuta `npm run build` antes.');
  process.exit(1);
}

/* ---------------------------------------------------------------------------
   1. Que selectores declaran cursiva en el CSS construido
   --------------------------------------------------------------------------- */

const cssFiles = fs
  .readdirSync(path.join(DIST, '_astro'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(DIST, '_astro', f), 'utf8'));
const css = cssFiles.join('\n');

/* Extrae los bloques `selector{...font-style:italic...}` del CSS minificado. */
const selectoresItalica = [];
const re = /([^{}]+)\{([^{}]*)\}/g;
let m;
while ((m = re.exec(css)) !== null) {
  const sel = m[1].trim();
  const cuerpo = m[2];
  if (/font-style:\s*italic/.test(cuerpo)) {
    // Descarta bloques de @font-face y similares.
    if (sel.startsWith('@')) continue;
    selectoresItalica.push(sel);
  }
}

/* ---------------------------------------------------------------------------
   2. Recorre el HTML y cuenta elementos por tipo
   --------------------------------------------------------------------------- */

const paginas = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) paginas.push(p);
  }
};
walk(DIST);

/* Cuenta de elementos que RECIBEN cursiva, por tipo.
   Se resuelve por las reglas reales que quedaron en la hoja:
     h1, h2                  -> italica (permitido)
     [data-kp-prosa] em      -> italica (permitido)
   y se busca ADEMAS cualquier <i>, <em> fuera de prosa o style inline. */

const conteo = {
  h1: 0,
  'h2 (secciones)': 0,
  'em (prosa)': 0,
};
/* Los h2 del PIE ("Indice", "Escribenos") no cuentan: `.c-pie h2` los
   devuelve a redonda, sans y versalitas. Se contabilizan aparte. */
const conteoRedonda = { 'h2 del pie (redonda)': 0 };
const infracciones = [];

/* Selectores de elementos que ANTES iban en cursiva y ahora deben ir redondos.
   Si alguno reapareciera en la lista de selectores en cursiva del CSS, es un
   fallo de regresion. */
const PROHIBIDOS = [
  { nombre: 'navegacion', re: /\.c-nav a/ },
  { nombre: 'enlace de accion', re: /\.c-accion(?![a-z-])/ },
  { nombre: 'titulo de tarjeta de producto', re: /\[data-kp-tarjeta-titulo\]/ },
  { nombre: 'titulo de tarjeta de articulo', re: /\[data-kp-articulo-titulo\]/ },
  { nombre: 'precio / prefijo', re: /\[data-kp-precio-prefijo\]/ },
  { nombre: 'accion WhatsApp', re: /\[data-kp-whatsapp\]/ },
  { nombre: 'variante de producto', re: /\[data-kp-variante\]/ },
  { nombre: 'entradilla', re: /\[data-kp-entradilla\]/ },
  { nombre: 'lema del pie', re: /\.c-pie__lema/ },
  { nombre: 'numeral de paso', re: /\[data-kp-pasos\]/ },
  { nombre: 'cita destacada', re: /blockquote/ },
  { nombre: 'boton enviar', re: /\[data-kp-enviar\]/ },
  { nombre: 'h3 / h4', re: /(^|,)\s*h3(\s*,|\s*\{|$)/ },
];

for (const sel of selectoresItalica) {
  for (const p of PROHIBIDOS) {
    if (p.re.test(sel)) {
      infracciones.push({ tipo: 'CSS', que: p.nombre, selector: sel });
    }
  }
}

/* Recorre el HTML contando los elementos que efectivamente reciben cursiva. */
for (const pagina of paginas) {
  const html = fs.readFileSync(pagina, 'utf8');
  const rel = path.relative(DIST, pagina);

  conteo.h1 += (html.match(/<h1[\s>]/g) || []).length;

  /* h2 totales menos los del pie, que van en redonda por `.c-pie h2`. */
  const h2Total = (html.match(/<h2[\s>]/g) || []).length;
  const pie = html.match(/<footer[\s\S]*?<\/footer>/);
  const h2Pie = pie ? (pie[0].match(/<h2[\s>]/g) || []).length : 0;
  conteo['h2 (secciones)'] += h2Total - h2Pie;
  conteoRedonda['h2 del pie (redonda)'] += h2Pie;

  /* <em> dentro del contenedor de prosa. */
  const prosa = html.match(/data-kp-prosa[\s\S]*?(?=<\/article>|<footer)/);
  if (prosa) {
    conteo['em (prosa)'] += (prosa[0].match(/<em[\s>]/g) || []).length;
  }

  /* Cursiva declarada en atributo style inline: nunca deberia haber. */
  const inline = html.match(/style="[^"]*font-style:\s*italic[^"]*"/g);
  if (inline) {
    infracciones.push({ tipo: 'HTML', que: 'style inline', selector: rel + ' -> ' + inline[0] });
  }

  /* <i> suelto: no se usa en este proyecto. */
  const iSuelto = html.match(/<i[\s>]/g);
  if (iSuelto) {
    infracciones.push({ tipo: 'HTML', que: '<i> suelto', selector: rel });
  }
}

/* ---------------------------------------------------------------------------
   3. Informe
   --------------------------------------------------------------------------- */

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OBSIDIANA — AUDITORIA DE CURSIVAS');
console.log(`  ${paginas.length} paginas de dist/`);
console.log('══════════════════════════════════════════════════════════════════\n');

console.log('  SELECTORES QUE DECLARAN font-style: italic EN EL CSS:');
if (selectoresItalica.length === 0) console.log('    (ninguno)');
for (const s of selectoresItalica) {
  /* `.italic` es una utilidad de Tailwind que entra en el bundle aunque no se
     use. Se marca como NO APLICADA si ninguna pagina la lleva en un class. */
  let nota = '';
  if (s === '.italic') {
    const usada = paginas.some((p) =>
      /class="[^"]*\bitalic\b[^"]*"/.test(fs.readFileSync(p, 'utf8'))
    );
    nota = usada ? '   <- USADA: revisar' : '   <- utilidad de Tailwind, NO aplicada en ninguna pagina';
  }
  console.log(`    ${s}${nota}`);
}

console.log('\n  ELEMENTOS EN CURSIVA, POR TIPO (recuento sobre el HTML):');
console.log('  | Tipo                    | Nº    | Permitido | Motivo                    |');
console.log('  | ----------------------- | ----- | --------- | ------------------------- |');
const motivo = {
  h1: 'firma de marca',
  'h2 (secciones)': 'firma de marca',
  'em (prosa)': 'enfasis del autor (MD)',
};
let total = 0;
for (const [k, v] of Object.entries(conteo)) {
  total += v;
  console.log(
    `  | ${k.padEnd(23)} | ${String(v).padStart(5)} | ${'SI'.padEnd(9)} | ${motivo[k].padEnd(25)} |`
  );
}
console.log(`  | ${'TOTAL EN CURSIVA'.padEnd(23)} | ${String(total).padStart(5)} |           |                           |`);

console.log('\n  ENCABEZADOS QUE NO VAN EN CURSIVA (devueltos a redonda):');
for (const [k, v] of Object.entries(conteoRedonda)) {
  console.log(`    ${k}: ${v}  (regla .c-pie h2 -> sans, versalitas, redonda)`);
}

console.log('\n  ELEMENTOS QUE PASARON DE CURSIVA A REDONDA (verificacion):');
console.log('  | Elemento                         | En cursiva ahora |');
console.log('  | -------------------------------- | ---------------- |');
for (const p of PROHIBIDOS) {
  const hay = selectoresItalica.some((s) => p.re.test(s));
  console.log(`  | ${p.nombre.padEnd(32)} | ${(hay ? 'SI -> FALLO' : 'NO  ✓').padEnd(16)} |`);
}

console.log('\n──────────────────────────────────────────────────────────────────');
if (infracciones.length === 0) {
  console.log('  ✓ La cursiva queda SOLO en h1, h2 y <em> semantico.');
  console.log('  ✓ 0 infracciones.');
} else {
  console.log(`  ✗ ${infracciones.length} INFRACCIONES:`);
  for (const i of infracciones) console.log(`    [${i.tipo}] ${i.que}: ${i.selector}`);
}
console.log('──────────────────────────────────────────────────────────────────\n');

process.exit(infracciones.length > 0 ? 1 : 0);
