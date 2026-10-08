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

export const GET: APIRoute = ({ site }) => {
  const cuerpo = esProduccion(site)
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL(ruta('/sitemap.xml'), site).toString()}\n`
    : `# Entorno de desarrollo: no indexar.\n# El sitio publico es https://kaffeeplatz.co\nUser-agent: *\nDisallow: /\n`;

  return new Response(cuerpo, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
