/**
 * /robots.txt — permite todo y anuncia el sitemap del dominio en que se
 * publique. Lo que decide si se indexa o no, mientras el sitio este en
 * evaluacion, es la cabecera X-Robots-Tag de public/_headers.
 */
import type { APIRoute } from 'astro';
import { ruta } from '../datos/sitio';

export const GET: APIRoute = ({ site }) =>
  new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${new URL(ruta('/sitemap.xml'), site).toString()}\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
