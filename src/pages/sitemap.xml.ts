/**
 * /sitemap.xml — todas las URL publicas, para Search Console.
 *
 * Se arma con `site` de astro.config (SITE_URL), asi que en kaffeeplatz.co
 * apunta al dominio y en las copias de prueba a su propia direccion.
 * Las URL llevan barra final: es la forma que sirve Cloudflare sin redirigir.
 *
 * FASE 3: LEE DE D1 Y DEJA DE PRERENDERIZARSE
 * ===========================================================================
 * Es el caso mas claro de toda la tabla de reparto de B.3: un producto nuevo
 * tiene que entrar en el sitemap SIN un despliegue, o Google no lo descubre
 * hasta que alguien recuerde publicar. El sitemap prerenderizado seria una
 * lista de lo que habia el dia del ultimo build.
 *
 * R3: EL SITEMAP ES DONDE UN ERROR DE SEO SE PAGA MAS CARO
 * ---------------------------------------------------------------------------
 * Las 47 paginas de hoy ya estan indexadas. Tres reglas que este fichero
 * cumple y que conviene no romper:
 *
 *   1. LISTA LO PUBLICADO Y NADA ARCHIVADO. Las dos consultas filtran por
 *      `archivado_en IS NULL` (y los articulos tambien por `publicado = 1`), asi
 *      que un producto archivado desaparece del sitemap — que es lo correcto:
 *      su URL redirige 301 a su categoria, y anunciar en el sitemap una URL que
 *      redirige es decirle a Google que el sitemap esta desactualizado.
 *
 *   2. SI D1 FALLA, NO DEVUELVE UN SITEMAP A MEDIAS. Un sitemap con 6 URLs en
 *      vez de 47 le dice a Google "estas 41 paginas ya no existen", y eso
 *      desindexa de verdad. Ante un fallo, 503 con `Retry-After`: Google vuelve
 *      luego y conserva lo que ya tenia. Es el mismo criterio que R1 aplicado a
 *      un fichero que no es HTML, y es mas importante aqui que en una pagina.
 *
 *   3. LAS URLs NO CAMBIAN: ni una. `/producto/<handle>/` y `/diario/<handle>/`
 *      con el mismo handle que ya era la clave en los JSON y ahora es la clave
 *      unica en D1.
 */
import type { APIRoute } from 'astro';
import { ruta } from '../datos/sitio';
import { obtenerProductos } from '../datos/catalogo';
import { obtenerArticulos } from '../datos/diario';
import { SEGUNDOS_CACHE } from '../datos/resiliencia';

export const prerender = false;

const FIJAS = ['/', '/catalogo/', '/diario/', '/nosotros/', '/contacto/', '/cafe/'];

export const GET: APIRoute = async ({ site, locals }) => {
  const [productos, articulos] = await Promise.all([
    obtenerProductos(locals),
    obtenerArticulos(locals),
  ]);

  /* Regla 2 de la cabecera: antes un sitemap incompleto, un 503. */
  if (
    productos.estado !== 'ok' ||
    !productos.datos ||
    articulos.estado !== 'ok' ||
    !articulos.datos
  ) {
    console.error('[sitemap] D1 no respondio: 503 en vez de un sitemap incompleto.');
    return new Response('El sitemap no esta disponible en este momento.\n', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '120' },
    });
  }

  const abs = (camino: string) => new URL(ruta(camino), site).toString();

  /* EL ORDEN DE LAS ENTRADAS CAMBIO RESPECTO AL SITEMAP DE ANTES, A PROPOSITO.
   *
   * Antes el orden lo ponia `getCollection`, que devuelve las entradas por su
   * id interno: por eso 'aeropress-clear' salia ANTES de 'aeropress', que no es
   * alfabetico ni nada en particular. Era un orden heredado del cargador, no una
   * decision.
   *
   * Ahora es explicito: productos por handle, articulos por fecha descendente
   * (lo que ya devuelve la consulta). El conjunto de URLs y los `lastmod` son
   * EXACTAMENTE los mismos —47 y 47, comprobado— y el orden dentro de un
   * sitemap no significa nada para los buscadores: no es una jerarquia ni una
   * prioridad (para eso existia `<priority>`, que Google ignora desde hace
   * anos). Lo que importa es que esten todas, que es lo que se verifica.
   *
   * Se deja explicito en vez de imitar el orden viejo porque un orden
   * reproducible que alguien eligio vale mas que uno que salia solo. */
  const entradas = [
    ...FIJAS.map((c) => ({ loc: abs(c) })),
    ...[...productos.datos]
      .sort((a, b) => a.handle.localeCompare(b.handle, 'es'))
      .map((p) => ({ loc: abs(`/producto/${p.handle}/`) })),
    ...articulos.datos.map((a) => ({
      loc: abs(`/diario/${a.handle}/`),
      lastmod: a.fecha.toISOString().slice(0, 10),
    })),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entradas
      .map(
        (e) =>
          `  <url><loc>${e.loc}</loc>${'lastmod' in e && e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`,
      )
      .join('\n') +
    '\n</urlset>\n';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      /* Se cachea en el borde como las paginas. No pasa por el middleware
         (que solo toca HTML), asi que la cabecera va aqui. */
      'Cache-Control': `public, max-age=0, s-maxage=${SEGUNDOS_CACHE}, stale-while-revalidate=60`,
      'Cache-Tag': 'sitemap,catalogo,diario',
    },
  });
};
