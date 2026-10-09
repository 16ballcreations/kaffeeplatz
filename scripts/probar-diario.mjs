/**
 * probar-diario.mjs — las reglas del editor del diario (fase 7), sin base.
 *
 * Tres bloques:
 *   1. Los 16 artículos reales pasan por `cuerpoAHtml` sin perder forma: ni
 *      «#####» literales, ni pasos que se numeran todos «1.», ni separadores
 *      sueltos. Es la prueba de que abrir y guardar un artículo viejo sin
 *      tocarlo no le cambia el aspecto a peor.
 *   2. XSS por el cuerpo del artículo (prueba obligatoria 6): lo que el
 *      saneador ya bloquea tiene que seguir bloqueado DESPUES de la
 *      normalización de este editor.
 *   3. Validación: la dirección se deriva bien, los errores se devuelven y un
 *      borrador se puede guardar a medias.
 *
 * Compila los ficheros REALES con esbuild (como `saneador-util.mjs`).
 * Uso: node scripts/probar-diario.mjs
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

async function cargar(relativo) {
  const { outputFiles } = await build({
    entryPoints: [join(raiz, relativo)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
}

const { cuerpoAHtml, normalizarMarkdown } = await cargar('src/admin/diario-markdown.ts');
const { aHandle, validarArticulo, leerFormulario } = await cargar('src/admin/diario-validar.ts');

let fallos = 0;
let pasadas = 0;
function caso(nombre, ok, detalle = '') {
  if (ok) pasadas++;
  else fallos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${ok || !detalle ? '' : `\n        ${detalle}`}`);
}

/* --------------------------------------------------- 1. los 16 artículos */
console.log('\n=== 1. LOS 16 ARTICULOS DEL DIARIO ===\n');
const dir = join(raiz, 'src/content/diario');
const ficheros = readdirSync(dir).filter((f) => f.endsWith('.md'));
caso('hay 16 artículos de referencia', ficheros.length === 16, `hay ${ficheros.length}`);
for (const f of ficheros) {
  const cuerpo = readFileSync(join(dir, f), 'utf8').replace(/^---[\s\S]*?\n---\n/, '');
  const html = cuerpoAHtml(cuerpo);
  const problemas = [];
  if (/#{2,}\s/.test(html.replace(/<[^>]+>/g, ''))) problemas.push('almohadillas literales');
  if (/<p>-{3,}<\/p>/.test(html)) problemas.push('separador literal');
  /* Ninguna lista numerada de un solo elemento: eso es el «1. 1. 1.». */
  const olSueltas = (html.match(/<ol><li>[^]*?<\/li><\/ol>/g) ?? []).filter((o) => (o.match(/<li>/g) ?? []).length === 1);
  if (olSueltas.length) problemas.push(`${olSueltas.length} listas numeradas de un solo paso`);
  if (!/<h[234]>/.test(html)) problemas.push('sin subtítulos');
  caso(`${f.slice(0, 60)}…`, problemas.length === 0, problemas.join(', '));
}

const pasos = '1. Uno.\n\n2. Dos.\n\n3. Tres.';
caso('lista suelta 1-2-3 → UNA lista de tres', /<ol><li>Uno\.<\/li><li>Dos\.<\/li><li>Tres\.<\/li><\/ol>/.test(cuerpoAHtml(pasos)), cuerpoAHtml(pasos));
const intercalada = '1. Idea.\n\nExplicación.\n\n2. Otra idea.\n\nMás.';
caso(
  'numerada con párrafos en medio → números en negrita, no «1.» repetido',
  cuerpoAHtml(intercalada).includes('<strong>1.</strong>') && cuerpoAHtml(intercalada).includes('<strong>2.</strong>'),
  cuerpoAHtml(intercalada),
);
caso('##### → h4', cuerpoAHtml('##### Ingredientes:') === '<h4>Ingredientes:</h4>', cuerpoAHtml('##### Ingredientes:'));
caso('# → h2 (el h1 es el título)', cuerpoAHtml('# Hola') === '<h2>Hola</h2>', cuerpoAHtml('# Hola'));
caso('viñetas sueltas → una lista', (cuerpoAHtml('- a\n\n- b\n\n- c').match(/<ul>/g) ?? []).length === 1);
caso('normalizar no toca un texto simple', normalizarMarkdown('Hola.\n\nAdiós.') === 'Hola.\n\nAdiós.');

/* --------------------------------------------------------------- 2. XSS */
console.log('\n=== 2. XSS EN EL CUERPO DE UN ARTICULO ===\n');
const ataques = [
  ['<script>alert(1)</script>', ['<script']],
  ['<img src=x onerror=alert(1)>', ['onerror', 'src="x"']],
  ['[pulsa](javascript:alert(1))', ['javascript:']],
  ['<a href="javascript:alert(1)">x</a>', ['javascript:']],
  ['1. <script>alert(1)</script>\n\n2. paso', ['<script']],
  ['##### <img src=x onerror=alert(1)>', ['onerror']],
  ['<svg onload=alert(1)>', ['<svg', 'onload']],
  ['[x](//malo.example)', ['//malo.example']],
];
for (const [md, prohibido] of ataques) {
  const html = cuerpoAHtml(md);
  const hallado = prohibido.filter((p) => html.toLowerCase().includes(p.toLowerCase()));
  caso(`no ejecuta: ${md.slice(0, 50)}`, hallado.length === 0, `salió: ${html}`);
}

/* -------------------------------------------------------- 3. validación */
console.log('\n=== 3. VALIDACION ===\n');
caso('dirección desde el título', aHandle('¿Qué molienda usar? Guía rápida') === 'que-molienda-usar-guia-rapida', aHandle('¿Qué molienda usar? Guía rápida'));
caso('ñ y tildes fuera', aHandle('Año del café: ÑANDÚ') === 'ano-del-cafe-nandu', aHandle('Año del café: ÑANDÚ'));
caso('título sin letras → dirección vacía', aHandle('¡¡¡ ??? !!!') === '');

const ctx = { temas: ['metodos', 'otros'], portadas: new Set(['/img/diario/a.png']) };
const forma = (o) => ({ get: (n) => o[n] ?? null });

const borrador = validarArticulo(leerFormulario(forma({ titulo: 'Mi borrador', fecha: '2026-10-09', categoria: 'otros', estado: 'borrador' })), ctx);
caso('un borrador se guarda sin resumen ni texto', Object.keys(borrador.errores).length === 0, JSON.stringify(borrador.errores));
caso('…y la dirección se deriva sola', borrador.valores.handle === 'mi-borrador');
caso('…y el autor por defecto es Andreina', borrador.valores.autor === 'Andreina Morales');

const publicar = validarArticulo(leerFormulario(forma({ titulo: 'X', fecha: '2026-10-09', categoria: 'otros', estado: 'publicado' })), ctx);
caso('publicar exige resumen y texto', !!publicar.errores.resumen && !!publicar.errores.cuerpoMd, JSON.stringify(publicar.errores));

const largo = 'a'.repeat(200);
const malo = validarArticulo(
  leerFormulario(forma({ titulo: largo, handle: 'Con Espacios', fecha: '2025-02-30', categoria: 'inventado', imagen: '/img/otra.png' })),
  ctx,
);
caso('título largo: error, no se corta', !!malo.errores.titulo && malo.valores.titulo === largo);
caso('dirección con espacios: error', !!malo.errores.handle);
caso('30 de febrero: error', !!malo.errores.fecha);
caso('tema inexistente: error', !!malo.errores.categoria);
caso('portada que no está en la lista: error', !!malo.errores.imagen);
caso('el cuerpo conserva los espacios de ella', leerFormulario(forma({ cuerpo: '  hola\r\n' })).cuerpoMd === '  hola\n');

console.log(`\n${pasadas} pasadas, ${fallos} fallos.\n`);
process.exit(fallos ? 1 : 0);
