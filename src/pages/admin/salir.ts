/**
 * POST /admin/salir — cerrar sesión de verdad.
 *
 * DOS COSAS, Y LAS DOS HACEN FALTA
 * ===========================================================================
 *   1. BORRAR LA FILA de `sesiones` en D1. Esto es lo que invalida la sesión:
 *      a partir de aquí, la cookie vieja no vale aunque alguien la haya
 *      copiado. Es la prueba obligatoria 9 del plan («cerrar sesión invalida la
 *      cookie: volver atrás en el navegador no entra») y es lo que Basic Auth
 *      no podía hacer (B.5, razón 2).
 *   2. VACIAR LA COOKIE del navegador, para que no vuelva a mandar un id que ya
 *      no existe.
 *
 * El orden importa: primero la base. Si se vaciara la cookie y luego fallara el
 * borrado, la sesión seguiría viva en D1 con un id que la dueña ya no tiene
 * pero que sigue siendo válido para quien lo tuviera. Al revés, lo peor que
 * pasa es que el navegador conserve una cookie que ya no sirve para nada.
 *
 * SOLO POST
 * ---------------------------------------------------------------------------
 * `GET /admin/salir` NO cierra la sesión. Un GET que cambia estado se puede
 * provocar desde fuera con un `<img src="...">` en cualquier página, y aunque
 * aquí el daño sería pequeño (una molestia, no un robo), no hay motivo para
 * dejarlo. Además, al ser POST pasa por la comprobación de `Origin` de la
 * puerta, igual que cualquier otra escritura del panel.
 *
 * Y exige sesión: `/admin/salir` NO está en la lista `SIN_SESION` de la puerta.
 */
import type { APIRoute } from 'astro';
import { ruta } from '../../datos/sitio';
import { baseAdmin } from '../../admin/base';
import { idDeLaPeticion, cerrarSesion, cabeceraCookieVacia } from '../../admin/sesion';
import { cabecerasPanel, PREFIJO } from '../../admin/puerta';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const id = idDeLaPeticion(request);

  try {
    /* `cerrarSesion` no lanza: registra y sigue. Si el borrado falla, la
       cookie se vacía igual y queda constancia en el log. */
    await cerrarSesion(baseAdmin(locals), id);
  } catch (fallo) {
    console.error('[admin] salir sin base:', fallo instanceof Error ? fallo.message : fallo);
  }

  /* 303 al formulario de entrada. Con POST-redirect-GET, recargar la página de
     destino no reenvía nada. */
  return new Response(null, {
    status: 303,
    headers: cabecerasPanel({
      Location: ruta(`${PREFIJO}/entrar`),
      'Set-Cookie': cabeceraCookieVacia(),
    }),
  });
};

/**
 * Un GET aquí no cierra nada: redirige al panel.
 *
 * Sin este handler, un GET daría 404 y parecería que la ruta no existe, lo que
 * confunde a quien lo pruebe. Con él, el mensaje es claro: la ruta existe y
 * solo responde a POST.
 */
export const GET: APIRoute = () =>
  new Response(null, {
    status: 303,
    headers: cabecerasPanel({ Location: ruta(PREFIJO) }),
  });
