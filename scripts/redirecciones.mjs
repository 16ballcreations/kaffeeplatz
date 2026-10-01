/**
 * redirecciones.mjs — genera public/_redirects: las URL de Shopify llevan con
 * 301 a su equivalente en el sitio nuevo.
 *
 *   npm run redirecciones
 *
 * Fuente: el respaldo de Shopify en contenido-original/ (productos, diario y
 * colecciones reales) y el contenido actual de src/content/. Cada URL vieja
 * con equivalente directo va a su pagina; el resto, a la seccion mas cercana.
 * Asi no se pierden enlaces compartidos ni el posicionamiento en buscadores.
 *
 * Cloudflare (Workers static assets) aplica public/_redirects. GitHub Pages
 * lo ignora. Limites: 2.000 estaticas + 100 dinamicas; aqui hay ~60.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => JSON.parse(readFileSync(join(RAIZ, p), 'utf8'));
const lista = (dir, ext) =>
  readdirSync(join(RAIZ, dir))
    .filter((f) => f.endsWith(ext))
    .map((f) => f.slice(0, -ext.length));

/* Handles que la normalizacion corrigio (ver scripts/normalizar.mjs). */
const RENOMBRADOS = {
  'sin-nombre-2jul_23-46': 'hario-v60-mugen',
  'fitro-de-acero-chemex-3-tazas': 'filtro-de-acero-chemex-3-tazas',
};

/* Colecciones de Shopify -> vista del catalogo nuevo. */
const COLECCIONES = {
  metodos: '/catalogo/?categoria=metodos',
  grameras: '/catalogo/?categoria=medicion',
  accesorios: '/catalogo/',
  frontpage: '/catalogo/',
  'todos-los-productos': '/catalogo/',
  'ultimos-lanzamientos': '/catalogo/',
  all: '/catalogo/',
};

const crudos = leer('contenido-original/datos/products-raw.json');
const productosViejos = (crudos.products ?? crudos).map((p) => p.handle);
const productosNuevos = new Set(lista('src/content/productos', '.json'));
const articulosViejos = leer('contenido-original/datos/blog-index.json').map((a) => a.handle);
const articulosNuevos = new Set(lista('src/content/diario', '.md'));

const lineas = [];
const errores = [];
const r = (desde, hacia) => lineas.push(`${desde} ${hacia} 301`);

lineas.push('# Generado por npm run redirecciones (scripts/redirecciones.mjs). No editar a mano.', '');

lineas.push('# Productos: /products/<handle> -> /producto/<handle>/');
for (const h of productosViejos) {
  const nuevo = RENOMBRADOS[h] ?? h;
  if (!productosNuevos.has(nuevo)) {
    errores.push(`producto sin destino: ${h}`);
    continue;
  }
  r(`/products/${h}`, `/producto/${nuevo}/`);
}

lineas.push('', '# Diario: /blogs/noticias/<handle> -> /diario/<handle>/');
for (const h of articulosViejos) {
  if (!articulosNuevos.has(h)) {
    errores.push(`articulo sin destino: ${h}`);
    continue;
  }
  r(`/blogs/noticias/${h}`, `/diario/${h}/`);
}
r('/blogs/noticias', '/diario/');
r('/blogs', '/diario/');

lineas.push('', '# Colecciones -> catalogo (con filtro cuando hay categoria equivalente)');
for (const [c, destino] of Object.entries(COLECCIONES)) r(`/collections/${c}`, destino);
r('/collections', '/catalogo/');

lineas.push('', '# Paginas fijas de Shopify');
r('/pages/contact', '/contacto/');
r('/pages/contacto', '/contacto/');
r('/pages/about', '/nosotros/');
r('/pages/sobre-nosotros', '/nosotros/');
r('/cart', '/catalogo/');
r('/search', '/catalogo/');
r('/account', '/');
/* Politicas: el sitio nuevo no tiene paginas propias de politicas todavia.
   Contacto recoge envios y canales. Cambiar cuando existan. */
r('/policies/shipping-policy', '/contacto/');
r('/policies/contact-information', '/contacto/');
r('/policies/refund-policy', '/contacto/');
r('/policies/privacy-policy', '/contacto/');
r('/policies/terms-of-service', '/contacto/');

lineas.push('', '# Dinamicas (al final: las estaticas tienen prioridad)');
/* Producto visto dentro de una coleccion: /collections/metodos/products/x */
lineas.push(
  ...productosViejos
    .filter((h) => RENOMBRADOS[h])
    .map((h) => `/collections/*/products/${h} /producto/${RENOMBRADOS[h]}/ 301`),
);
lineas.push('/collections/:coleccion/products/:handle /producto/:handle/ 301');
lineas.push('/blogs/noticias/tagged/* /diario/ 301');
lineas.push('/blogs/:blog/:handle /diario/:handle/ 301');
lineas.push('/pages/* / 301');
lineas.push('/policies/* /contacto/ 301');
lineas.push('/account/* / 301');

if (errores.length) {
  console.error(errores.join('\n'));
  process.exit(1);
}

writeFileSync(join(RAIZ, 'public', '_redirects'), lineas.join('\n') + '\n');
const n = lineas.filter((l) => l && !l.startsWith('#')).length;
console.log(`public/_redirects: ${n} redirecciones (${productosViejos.length} productos, ${articulosViejos.length} articulos).`);
