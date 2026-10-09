/**
 * origen.ts — la comprobación de `Origin` en todo POST del panel.
 *
 * POR QUE, SI YA HAY `SameSite=Strict`
 * ===========================================================================
 * Porque B.5 lo llama «cinturón y tirantes», y son dos defensas con modos de
 * fallo distintos:
 *
 *   - `SameSite=Strict` lo aplica EL NAVEGADOR. Si el navegador no lo respeta,
 *     o si alguien manda la petición sin navegador con una cookie robada, no
 *     protege nada.
 *   - `Origin` lo comprueba EL SERVIDOR, y esta cabecera el JavaScript de una
 *     página no la puede cambiar: la pone el navegador y está en la lista de
 *     cabeceras prohibidas de fetch.
 *
 * Una falla sin la otra. Son dos líneas y cubren el hallazgo que el plan marca
 * como **bloqueante** (hallazgo 1 de A.6): en un panel que edita una tienda en
 * producción, un POST provocado desde otro sitio cambia precios de verdad.
 *
 * SE COMPARA CONTRA EL ORIGEN DE LA PROPIA PETICION, NO CONTRA UNA LISTA
 * ---------------------------------------------------------------------------
 * `url.origin` es el sitio por el que llegó la petición. Compararlo contra eso
 * y no contra `kaffeeplatz.co` escrito a mano hace que funcione igual en
 * `127.0.0.1:8788`, en `kaffeeplatz.16ballcreations.workers.dev` y en el
 * dominio, sin una lista blanca que alguien tenga que acordarse de ampliar —y
 * una lista blanca mal mantenida es la forma habitual de que esta comprobación
 * acabe desactivada «porque en pruebas molestaba».
 *
 * SIN `Origin` SE RECHAZA. Y ESO ES UNA DECISION, NO UN DESCUIDO
 * ---------------------------------------------------------------------------
 * Todo navegador actual manda `Origin` en un POST, incluso en un envío de
 * formulario del mismo sitio. Así que «no hay Origin» significa: un cliente que
 * no es un navegador (curl sin la cabecera), o un navegador tan viejo que no
 * debería administrar una tienda. Aceptar la petición en ese caso dejaría un
 * bypass trivial —basta con no mandar la cabecera—, y eso vaciaría de sentido
 * toda la comprobación.
 *
 * `Referer` NO se usa como respaldo: se puede suprimir con `Referrer-Policy`
 * desde la página atacante, así que un respaldo por `Referer` sería un bypass
 * con pasos extra.
 */

/** ¿Viene este POST de nuestro propio sitio? */
export function origenValido(peticion: Request, url: URL): boolean {
  const origen = peticion.headers.get('Origin');
  if (!origen) return false;
  try {
    /* Se compara el origen NORMALIZADO (esquema + host + puerto), no la cadena:
       `https://kaffeeplatz.co` y `https://kaffeeplatz.co:443` son el mismo
       origen y una comparación de texto diría que no. */
    return new URL(origen).origin === url.origin;
  } catch {
    /* `Origin` no parseable, incluido el literal "null" que manda un iframe
       con sandbox. Se rechaza. */
    return false;
  }
}

/**
 * La respuesta a un POST con origen ajeno.
 *
 * 403 y texto plano, sin pintar el panel: a quien llega así no hay que
 * explicarle nada ni darle una página que pueda leer. Y `no-store` para que no
 * quede cacheada en ningún sitio.
 */
export function respuestaOrigenAjeno(): Response {
  return new Response('Petición rechazada: origen no válido.\n', {
    status: 403,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
