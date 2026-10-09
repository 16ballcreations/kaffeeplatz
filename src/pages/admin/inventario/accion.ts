/**
 * POST /admin/inventario/accion — todos los botones de la pantalla de
 * inventario y del interruptor. Hace el cambio y responde 303 (PRG).
 *
 * Un solo punto de entrada y no una ruta por botón: son siete acciones sobre
 * la misma cosa (una variante), y la lista de qué hace cada una se lee entera
 * en `src/admin/inventario-acciones.ts`. Lo que aquí queda es el transporte.
 *
 * La puerta ya comprobó la sesión y el `Origin` antes de llegar aquí (ver
 * `src/admin/puerta.ts`); este fichero no lo repite a propósito.
 */
import type { APIRoute } from 'astro';
import { ruta } from '../../../datos/sitio';
import { cabecerasPanel } from '../../../admin/puerta';
import { accionInventario } from '../../../admin/inventario-acciones';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    form = new FormData();
  }
  const destino = await accionInventario(form, locals);
  return new Response(null, { status: 303, headers: cabecerasPanel({ Location: ruta(destino) }) });
};

/** Un GET aquí no hace nada: vuelve a la pantalla. Igual que `/admin/salir`. */
export const GET: APIRoute = () =>
  new Response(null, { status: 303, headers: cabecerasPanel({ Location: ruta('/admin/inventario') }) });
