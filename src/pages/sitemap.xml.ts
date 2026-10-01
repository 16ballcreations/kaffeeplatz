/**
 * /sitemap.xml — todas las URL publicas, para Search Console.
 *
 * Se arma con `site` de astro.config (SITE_URL), asi que en kaffeeplatz.co
 * apunta al dominio y en las copias de prueba a su propia direccion.
 * Las URL llevan barra final: es la forma que sirve Cloudflare sin redirigir.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { ruta } from '../datos/sitio';

const FIJAS = ['/', '/catalogo/', '/diario/', '/nosotros/', '/contacto/', '/cafe/'];

export const GET: APIRoute = async ({ site }) => {
  const productos = await getCollection('productos');
  const articulos = await getCollection('diario');

  const abs = (camino: string) => new URL(ruta(camino), site).toString();
  const entradas = [
    ...FIJAS.map((c) => ({ loc: abs(c) })),
    ...productos.map((p) => ({ loc: abs(`/producto/${p.data.handle}/`) })),
    ...articulos.map((a) => ({
      loc: abs(`/diario/${a.data.handle}/`),
      lastmod: a.data.fecha.toISOString().slice(0, 10),
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

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
