/**
 * puerta.ts — LA UNICA PUERTA DEL PANEL.
 *
 * Es el patrón 1 de A.6 («una sola puerta de autenticación lo más arriba
 * posible, y falla cerrado si falta el secreto»), que es lo mejor que hace 16bc
 * y lo que el plan dice copiar tal cual. En 16bc es la línea 260, antes de
 * cualquier ramificación del router.
 *
 * DONDE ESTA LA PUERTA, Y POR QUE AHI Y NO EN CADA PAGINA
 * ===========================================================================
 * Esta función se llama desde `src/middleware.ts`, que Astro ejecuta **para
 * toda petición** antes de resolver la ruta. No es «la comprobación que cada
 * página del panel debe acordarse de hacer»: es un sitio por el que la petición
 * pasa obligatoriamente, y la página ni se renderiza si la puerta no deja.
 *
 * La diferencia importa. Una comprobación por página es correcta hasta que
 * alguien añade la página número once y se la olvida —y esa página no da error,
 * simplemente queda abierta—. La fase 5 va a añadir `/admin/productos`, la 6
 * `/admin/imagenes`, la 7 `/admin/diario`: ninguna de ellas tiene que escribir
 * una línea de autenticación, y ninguna puede quedarse abierta por descuido.
 * Eso es lo que hace que esto siga siendo seguro dentro de dos años.
 *
 * COMO SE DEMUESTRA QUE NO SE PUEDE SALTAR
 * ---------------------------------------------------------------------------
 * Tres propiedades, y las tres son verificables:
 *
 *   1. El criterio es por PREFIJO de ruta (`/admin`), no una lista de rutas.
 *      Una subruta nueva está cubierta el día que se crea, y una que no exista
 *      también (da el mismo redirigir a entrar, no un 404 que revele el mapa
 *      del panel).
 *   2. Las páginas del panel llevan `prerender = false`. Si alguna se
 *      prerenderizara, saldría como fichero en `dist/` y el borde la serviría
 *      como asset SIN ejecutar el Worker: la puerta no se enteraría. Por eso
 *      `verificar-puerta.mjs` falla el build si aparece un HTML de `/admin` en
 *      `dist/`.
 *   3. Solo hay DOS rutas públicas bajo `/admin`, y están escritas aquí abajo
 *      en una constante: el formulario de entrada y el envío del formulario.
 *      Todo lo demás exige sesión.
 *
 * QUE PASA SI FALTA EL SECRETO: FALLA CERRADO
 * ---------------------------------------------------------------------------
 * Sin `ADMIN_CLAVE_HASH` el panel no se abre: responde 503 con la instrucción
 * en pantalla, igual que la línea 257 de 16bc. Es la diferencia entre un panel
 * que no se puede usar y un panel que se puede usar sin clave; un despliegue al
 * que se le olvidó el secreto tiene que ser lo primero.
 */

import { baseAdmin, secreto } from './base';
import { idDeLaPeticion, sesionValida, renovarSiHaceFalta, type Sesion } from './sesion';
import { origenValido, respuestaOrigenAjeno } from './origen';

/** El prefijo que protege la puerta. */
export const PREFIJO = '/admin';

/** El nombre del secreto, uno solo y en un sitio. */
export const SECRETO = 'ADMIN_CLAVE_HASH';

/**
 * Las ÚNICAS rutas de `/admin` que no exigen sesión.
 *
 * Es una lista cerrada y corta a propósito, y tiene que seguir siéndolo: cada
 * entrada aquí es un agujero en la puerta, así que añadir una debería costar
 * una discusión. Hoy son el formulario de entrada y su POST, que por definición
 * no pueden exigir lo que sirven para conseguir.
 *
 * `/admin/salir` NO está aquí: cerrar sesión exige tener una (y comprobación de
 * `Origin`), porque si no, cualquier página podría cerrarle la sesión a la
 * dueña desde fuera. Es una molestia, no un robo, pero no hay razón para
 * permitirla.
 */
const SIN_SESION = new Set(['/admin/entrar']);

/** ¿Es esta ruta del panel? Normaliza la barra final para que `/admin/` cuente. */
export function esRutaDelPanel(camino: string): boolean {
  return camino === PREFIJO || camino.startsWith(`${PREFIJO}/`);
}

const sinBarra = (camino: string) =>
  camino.length > 1 && camino.endsWith('/') ? camino.slice(0, -1) : camino;

/** Cabeceras de toda respuesta del panel. Ver `noindex` más abajo. */
export function cabecerasPanel(extra?: Record<string, string>): Record<string, string> {
  return {
    /* El panel no se cachea NUNCA. Una página del panel en una caché
       compartida es una fuga de datos de la tienda, y en la del navegador es
       lo que hace que «atrás» muestre el panel después de salir. */
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    /* `noindex` en TODO /admin, como pide el encargo. Va en la cabecera HTTP y
       no solo en un `<meta>` porque así cubre también lo que no es HTML (un
       403 de texto plano, una redirección) y porque un buscador que no
       ejecute el HTML lo ve igual. El `<meta>` también está, en el layout:
       las dos capas son baratas. */
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'same-origin',
    ...extra,
  };
}

/** Lo que la puerta deja en `locals` para que las páginas del panel lo usen. */
export interface ContextoPanel {
  sesion: Sesion;
}

/**
 * La redirección a entrar, conservando a dónde iba.
 *
 * `?volver=` se valida AL USARLO (en `/admin/entrar`) contra redirección
 * abierta, igual que la línea 268 de 16bc. Aquí solo se construye desde
 * `url.pathname`, que es de nuestro propio sitio por definición.
 */
function aEntrar(url: URL): Response {
  const destino = new URL(`${PREFIJO}/entrar`, url.origin);
  const volver = url.pathname + url.search;
  if (volver !== `${PREFIJO}/entrar` && volver.startsWith(PREFIJO)) {
    destino.searchParams.set('volver', volver);
  }
  return new Response(null, {
    status: 303,
    headers: cabecerasPanel({ Location: destino.toString() }),
  });
}

/** 503 cuando no hay secreto declarado. Falla cerrado. */
function faltaElSecreto(): Response {
  console.error(`[admin] ${SECRETO} no está declarado: el panel NO se abre.`);
  return new Response(
    'El panel no está configurado todavía.\n\n' +
      `Falta el secreto ${SECRETO}. Para declararlo:\n` +
      `  node scripts/hash-clave.mjs            (genera el hash de la clave)\n` +
      `  npx wrangler secret put ${SECRETO}     (en produccion)\n` +
      `  echo '${SECRETO}=...' >> .dev.vars     (en local)\n`,
    {
      status: 503,
      headers: cabecerasPanel({
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': '300',
      }),
    },
  );
}

/**
 * LA PUERTA. Devuelve una `Response` para cortar, o `null` para dejar pasar.
 *
 * El orden de las comprobaciones es deliberado y es el de 16bc: lo más barato y
 * lo más general primero, de modo que nada que vaya a ser rechazado llegue a
 * costar una consulta.
 *
 *   1. ¿Es del panel?        → si no, no es asunto de esta función.
 *   2. ¿Hay secreto?         → si no, 503. Antes de tocar la base.
 *   3. ¿POST con Origin malo? → 403. ANTES de comprobar la sesión, porque se
 *                               aplica también a `/admin/entrar`, que no tiene
 *                               sesión que comprobar.
 *   4. ¿Ruta pública?        → pasa (solo el formulario de entrada).
 *   5. ¿Sesión válida?       → si no, 303 a entrar.
 */
export async function pasarPuerta(
  peticion: Request,
  url: URL,
  locals: unknown,
): Promise<Response | null> {
  if (!esRutaDelPanel(url.pathname)) return null;

  if (!secreto(locals, SECRETO)) return faltaElSecreto();

  /* CSRF: todo POST del panel, sin excepción, incluido el de entrar. Que cubra
     también la entrada no es simetría gratuita: sin ello, otro sitio podría
     enviar el formulario de entrada con una clave que conozca y dejar a la
     dueña con una sesión que no abrió. */
  if (peticion.method === 'POST' && !origenValido(peticion, url)) {
    console.warn(`[admin] POST rechazado por Origin ajeno en ${url.pathname}.`);
    return respuestaOrigenAjeno();
  }

  /* Los métodos que no son GET/HEAD/POST no tienen nada que hacer en el panel.
     Rechazarlos aquí evita que una ruta futura tenga que pensar en PUT o
     DELETE y en si su comprobación de Origin aplica. */
  if (!['GET', 'HEAD', 'POST'].includes(peticion.method)) {
    return new Response('Método no permitido.\n', {
      status: 405,
      headers: cabecerasPanel({ 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD, POST' }),
    });
  }

  if (SIN_SESION.has(sinBarra(url.pathname))) return null;

  /* Y aquí la sesión. `baseAdmin` lanza si no hay binding, y eso NO puede
     abrir el panel: se captura y se trata como «no hay sesión». */
  let sesion: Sesion | null = null;
  try {
    const db = baseAdmin(locals);
    sesion = await sesionValida(db, idDeLaPeticion(peticion));
    if (sesion) {
      const cookie = await renovarSiHaceFalta(db, sesion);
      (locals as { panel?: ContextoPanel; cookieRenovada?: string }).panel = { sesion };
      if (cookie) (locals as { cookieRenovada?: string }).cookieRenovada = cookie;
      return null;
    }
  } catch (fallo) {
    console.error('[admin] la puerta no pudo comprobar la sesión:', fallo instanceof Error ? fallo.message : fallo);
  }

  return aEntrar(url);
}
