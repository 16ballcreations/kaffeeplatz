/**
 * /admin/fotos/<handle> — redirige a la ficha del producto, donde viven ahora
 * sus fotos (ver /admin/fotos). El handle se traduce a id leyendo la base; si
 * ya no existe, a la lista. `#bloque-producto` deja la pantalla donde están
 * las fotos generales y, debajo, las de cada versión.
 */
import type { APIRoute } from 'astro';
import { ruta } from '../../../datos/sitio';
import { baseAdmin } from '../../../admin/base';
import { cabecerasPanel } from '../../../admin/puerta';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  let destino = '/admin/productos';
  try {
    const p = await baseAdmin(locals)
      .prepare('SELECT id FROM productos WHERE handle = ?1')
      .bind(String(params.handle ?? ''))
      .first<{ id: number }>();
    if (p) destino = `/admin/productos/${p.id}#bloque-producto`;
  } catch (e) {
    console.error('[admin] redirigir fotos:', e instanceof Error ? e.message : e);
  }
  /* 303 y no 301: el destino depende de la base (un producto archivado, una
     base resembrada), así que el navegador no debe recordarlo para siempre. */
  return new Response(null, { status: 303, headers: cabecerasPanel({ Location: ruta(destino) }) });
};
