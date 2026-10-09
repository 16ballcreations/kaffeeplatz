/**
 * POST /admin/despachos/accion — «Ya salió», «Anular», volver a la lista y
 * ponerle nombre a un paquete. Hace el cambio y responde 303 (PRG): recargar
 * la lista con el pulgar no puede marcar dos veces un paquete.
 *
 * La puerta ya comprobó la sesión y el `Origin` (ver `src/admin/puerta.ts`).
 */
import type { APIRoute } from 'astro';
import { ruta } from '../../../datos/sitio';
import { cabecerasPanel } from '../../../admin/puerta';
import { accionDespacho } from '../../../admin/inventario-acciones';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    form = new FormData();
  }
  const destino = await accionDespacho(form, locals);
  return new Response(null, { status: 303, headers: cabecerasPanel({ Location: ruta(destino) }) });
};

export const GET: APIRoute = () =>
  new Response(null, { status: 303, headers: cabecerasPanel({ Location: ruta('/admin/despachos') }) });
