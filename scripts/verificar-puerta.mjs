/**
 * verificar-puerta.mjs — demuestra que no se puede llegar a /admin sin pasar
 * por la puerta.
 *
 * POR QUE HACE FALTA UN SCRIPT Y NO BASTA CON PROBARLO EN EL NAVEGADOR
 * ===========================================================================
 * Probar con curl que `/admin` redirige demuestra que HOY está cerrado. No
 * demuestra que seguirá cerrado cuando la fase 5 añada `/admin/productos`, la 6
 * `/admin/fotos` y la 7 `/admin/diario`. Y el modo de fallo es silencioso: una
 * página del panel que se prerenderice por descuido sale como fichero HTML en
 * `dist/` y el borde la sirve **sin ejecutar el Worker**, así que la puerta no
 * se entera y la página queda pública sin que nada dé error.
 *
 * Este script comprueba las cuatro propiedades estructurales de las que depende
 * la puerta. Corre en cada `npm run build` (va enganchado como `postbuild`), así
 * que el día que alguien rompa una, el build falla en vez de publicar un panel
 * abierto.
 *
 * LAS CUATRO COMPROBACIONES
 * ---------------------------------------------------------------------------
 *   1. El middleware llama a la puerta ANTES de `next()`.
 *   2. Toda página de `src/pages/admin/` declara `prerender = false`.
 *   3. No hay NINGUN HTML de `/admin` en `dist/` (la prueba de verdad: si se
 *      colara un asset estático, aquí se ve).
 *   4. El sitemap no menciona `/admin`.
 *
 * Uso: node scripts/verificar-puerta.mjs   (sale con código 1 si algo falla)
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
let fallos = 0;

const comprobar = (nombre, ok, detalle = '') => {
  if (ok) {
    console.log(`OK    ${nombre}`);
  } else {
    fallos++;
    console.log(`FALLA ${nombre}`);
    if (detalle) console.log(`        ${detalle}`);
  }
};

/* --- 1. La puerta está en el middleware, antes de next() ------------------- */

const mw = readFileSync(join(raiz, 'src/middleware.ts'), 'utf8');
const posPuerta = mw.indexOf('pasarPuerta(');
const posNext = mw.indexOf('await next()');

comprobar(
  'el middleware importa la puerta',
  /from\s+'\.\/admin\/puerta'/.test(mw),
  'src/middleware.ts tiene que importar `pasarPuerta` de ./admin/puerta',
);
comprobar(
  'el middleware llama a la puerta ANTES de next()',
  posPuerta > 0 && posNext > 0 && posPuerta < posNext,
  'Si la puerta se llamara después de next(), la página ya se habría renderizado.',
);
comprobar(
  'el resultado de la puerta corta la petición',
  /if\s*\(\s*corte\s*\)\s*return\s+corte/.test(mw),
  'La respuesta de `pasarPuerta` tiene que devolverse tal cual.',
);

/* --- 2. Toda página de /admin declara prerender = false ------------------- */

const dirAdmin = join(raiz, 'src/pages/admin');
const paginas = [];
const recorrer = (d) => {
  if (!existsSync(d)) return;
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) recorrer(p);
    else if (/\.(astro|ts|js)$/.test(e)) paginas.push(p);
  }
};
recorrer(dirAdmin);

comprobar('hay páginas de panel que comprobar', paginas.length > 0, 'No se encontró src/pages/admin/');

for (const p of paginas) {
  const src = readFileSync(p, 'utf8');
  comprobar(
    `${relative(raiz, p)} declara prerender = false`,
    /export\s+const\s+prerender\s*=\s*false/.test(src),
    'Sin esto la página sale como fichero en dist/ y el borde la sirve SIN pasar por el Worker.',
  );
}

/* --- 3. Ningún HTML de /admin en dist/ ------------------------------------ */

const dist = join(raiz, 'dist');
if (!existsSync(dist)) {
  console.log('NOTA  dist/ no existe todavía: la comprobación 3 se salta (corre `npm run build`).');
} else {
  const colados = [];
  const buscar = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        /* `_worker.js` es el Worker compilado: ahí DENTRO sí aparece el código
           del panel, y debe aparecer. Lo que no puede haber es un .html
           servible. */
        if (e === '_worker.js') continue;
        buscar(p);
      } else if (/\.html$/.test(e) && /(^|\/)admin(\/|\.)/.test(p.replace(/\\/g, '/'))) {
        colados.push(relative(raiz, p));
      }
    }
  };
  buscar(dist);
  comprobar(
    'no hay ningún HTML de /admin en dist/',
    colados.length === 0,
    colados.length ? `Servibles sin Worker: ${colados.join(', ')}` : '',
  );

  /* El `_routes.json` que genera el adaptador decide qué va al Worker. Si
     excluyera /admin, el panel se serviría como asset. */
  const rutas = join(dist, '_routes.json');
  if (existsSync(rutas)) {
    const j = JSON.parse(readFileSync(rutas, 'utf8'));
    const excluido = (j.exclude ?? []).some((r) => r.startsWith('/admin'));
    comprobar(
      '_routes.json no excluye /admin del Worker',
      !excluido,
      `exclude: ${JSON.stringify(j.exclude ?? [])}`,
    );
  }
}

/* --- 4. El sitemap no menciona /admin ------------------------------------- */

const sitemap = readFileSync(join(raiz, 'src/pages/sitemap.xml.ts'), 'utf8');
comprobar(
  'el sitemap no incluye /admin',
  !/['"`]\/admin/.test(sitemap),
  'El panel no puede aparecer en el sitemap.',
);

console.log('');
if (fallos) {
  console.log(`${fallos} FALLO(S). La puerta del panel NO está garantizada.`);
  process.exit(1);
}
console.log('La puerta del panel está garantizada: toda ruta /admin pasa por el middleware.');
