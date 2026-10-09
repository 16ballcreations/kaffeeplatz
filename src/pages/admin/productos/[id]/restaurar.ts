/**
 * POST /admin/productos/<id>/restaurar — devolver un producto archivado a la
 * tienda.
 *
 * Sin pantalla de confirmación, a diferencia de archivar: restaurar no quita
 * nada a nadie y se deshace archivando otra vez. Pedir confirmación para lo
 * reversible e inofensivo enseña a pulsar «sí» sin leer, y entonces la
 * confirmación que sí importa (archivar) deja de leerse también.
 *
 * Solo POST (pasa por la comprobación de `Origin` de la puerta). Un GET aquí
 * no restaura: lleva a la ficha del panel.
 */
import type { APIRoute } from 'astro';
import { ruta } from '../../../../datos/sitio';
import { baseAdmin } from '../../../../admin/base';
import { cabecerasPanel } from '../../../../admin/puerta';
import { productoParaEditar } from '../../../../admin/productos/leer';
import { baseEscritura, instantanea } from '../../../../admin/productos/guardar';
import { invalidarProducto } from '../../../../admin/productos/cache';
import { cambiarArchivado } from '../../../../datos/consultas/productos-escribir';

export const prerender = false;

const ir = (destino: string) =>
  new Response(null, { status: 303, headers: cabecerasPanel({ Location: ruta(destino) }) });

export const POST: APIRoute = async ({ params, locals, url }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return ir('/admin/productos');
  try {
    const db = baseAdmin(locals);
    const p = await productoParaEditar(db, id);
    if (!p) return ir('/admin/productos');
    if (p.archivadoEn) {
      await cambiarArchivado(baseEscritura(db), id, false, instantanea(p));
      await invalidarProducto(url.origin, p.handle);
    }
    return ir(`/admin/productos/${id}?hecho=restaurado`);
  } catch (fallo) {
    console.error('[admin] restaurar:', fallo instanceof Error ? fallo.message : fallo);
    /* Nunca un 500 en blanco (hallazgo 3 de A.6): de vuelta a la ficha, que
       lo dice y seguirá ofreciendo el botón. */
    return ir(`/admin/productos/${id}?hecho=fallo`);
  }
};

export const GET: APIRoute = ({ params }) => ir(`/admin/productos/${Number(params.id) || ''}`);
