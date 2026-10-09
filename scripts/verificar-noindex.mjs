/**
 * verificar-noindex.mjs — el entorno de pruebas NO se indexa. Comprobado,
 * no supuesto.
 *
 * Corre en `npm run deploy:dev` ENTRE el build y la subida. Si dist/ salio
 * construido como produccion, aborta y no se sube nada.
 *
 * POR QUE EXISTE: el 9 oct 2026 se encontro el Worker de pruebas sirviendo el
 * robots.txt de produccion ("Allow: /") y sin `noindex`. `deploy:dev` no le
 * pasaba SITE_URL al build, asi que `site` caia en su valor por defecto
 * (kaffeeplatz.co) y `esProduccion()` respondia que si. La deteccion por
 * dominio de src/datos/entorno.ts era correcta; lo que fallaba era el dato.
 *
 * No basta con arreglar el script: robots.txt y las paginas prerenderizadas
 * las sirve Cloudflare desde ASSETS sin pasar por el Worker, asi que nada en
 * tiempo de ejecucion puede corregirlas. La unica defensa es mirar dist/
 * antes de subirlo.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const fallos = [];

const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8');
if (!/^Disallow:\s*\/\s*$/m.test(robots)) {
  fallos.push('robots.txt no contiene "Disallow: /"');
}

/* Toda pagina HTML prerenderizada debe llevar noindex. */
function htmls(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '_worker.js' ? [] : htmls(p);
    return n.endsWith('.html') ? [p] : [];
  });
}
const paginas = htmls(DIST);
const sinNoindex = paginas.filter(
  (p) => !/<meta name="robots" content="[^"]*noindex/.test(readFileSync(p, 'utf8')),
);
if (sinNoindex.length) {
  fallos.push(`${sinNoindex.length} de ${paginas.length} paginas sin noindex (p. ej. ${sinNoindex[0]})`);
}

if (fallos.length) {
  console.error('\nNO SE DESPLIEGA: este build se podria indexar.\n');
  for (const f of fallos) console.error(`  FALLO  ${f}`);
  console.error('\n¿Falta SITE_URL del entorno de pruebas en el build?\n');
  process.exit(1);
}
console.log(`OK    entorno de pruebas sin indexar (robots.txt + ${paginas.length} paginas con noindex)`);
