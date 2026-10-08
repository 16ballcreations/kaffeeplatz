/**
 * /robots.txt
 *
 * En PRODUCCION (kaffeeplatz.co) permite todo y anuncia el sitemap.
 * En DESARROLLO (GitHub Pages) prohibe todo: ese entorno no debe aparecer
 * en buscadores compitiendo con el sitio real. Ver src/datos/entorno.ts.
 */
import type { APIRoute } from 'astro';
import { ruta } from '../datos/sitio';
import { esProduccion } from '../datos/entorno';

/* FASE 1 (plan del panel, B.3): sigue prerenderizandose en el build.
   Este fichero es fijo (no depende del catalogo), asi que puede quedarse
   prerenderizado tambien despues de la fase 3.

   Y debe seguir siendolo: `site` se fija en el build con SITE_URL, que es
   justo lo que distingue desarrollo de produccion. Prerenderizado, cada
   entorno hornea su propio robots.txt y no hay forma de que el de pruebas
   acabe sirviendo el de produccion. */
export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const cuerpo = esProduccion(site)
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL(ruta('/sitemap.xml'), site).toString()}\n`
    : `# Entorno de desarrollo: no indexar.\n# El sitio publico es https://kaffeeplatz.co\nUser-agent: *\nDisallow: /\n`;

  return new Response(cuerpo, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
