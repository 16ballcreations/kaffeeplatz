/**
 * middleware.ts — la caché de borde de las páginas dinámicas, en un solo sitio.
 *
 * POR QUE ESTO EXISTE
 * ===========================================================================
 * Las páginas que leen de D1 necesitan dos cosas que no pueden hacer solas:
 *
 *   1. CABECERAS DE CACHÉ, para que el borde sirva la página sin despertar al
 *      Worker ni tocar la base. Es la mitigación de R2 (el TTFB sube al pasar
 *      de asset estático a consulta + render): con la caché caliente, la mayoría
 *      de las visitas no tocan D1, y el coste en filas leídas se vuelve
 *      despreciable (R4).
 *
 *   2. UNA COPIA LEGIBLE DESDE EL CÓDIGO, en la Cache API, para poder servirla
 *      si D1 falla (capa 2 de R1). `Cache-Control` no sirve para esto: el borde
 *      guarda la respuesta pero el Worker no puede leerla.
 *
 * Ninguna de las dos se puede hacer desde el frontmatter de un `.astro`, porque
 * una página no se ve a sí misma renderizada. El middleware sí: recibe la
 * `Response` completa de `next()`.
 *
 * Y hacerlo aquí en vez de en cada página no es solo comodidad. Si cada página
 * tuviera que acordarse de guardar su copia, la que se olvide no tendría
 * respaldo — y eso no se descubre hasta que D1 se cae, que es el peor momento
 * para descubrirlo.
 *
 * QUE NO HACE
 * ---------------------------------------------------------------------------
 * No lee de la caché para responder. Eso lo hace el borde de Cloudflare con las
 * cabeceras, que es más rápido que cualquier cosa que el Worker pueda hacer
 * (responde sin ejecutar el Worker). La Cache API aquí es SOLO el respaldo de
 * emergencia, y se lee únicamente desde `respuestaDeEmergencia` cuando ya se
 * sabe que la base falló.
 *
 * No toca las páginas prerenderizadas: esas salen como ficheros del build y las
 * sirve el borde como assets. `context.isPrerendered` las identifica.
 *
 * Y DESDE LA FASE 4, LA PUERTA DEL PANEL
 * ===========================================================================
 * Este fichero es el único sitio por el que pasa TODA petición antes de que se
 * resuelva la ruta, así que es donde tiene que estar la autenticación del panel
 * (patrón 1 de A.6: una sola puerta, lo más arriba posible). Está ANTES de
 * `next()`: si la puerta no deja pasar, la página del panel no se renderiza
 * siquiera. Ver `src/admin/puerta.ts`, que explica cómo se demuestra que no se
 * puede saltar.
 */

import { defineMiddleware } from 'astro:middleware';
import { cabecerasOk, guardarCopia } from './datos/resiliencia';
import { pasarPuerta, esRutaDelPanel, cabecerasPanel } from './admin/puerta';

export const onRequest = defineMiddleware(async (context, next) => {
  /* LA PUERTA DEL PANEL, lo primero de todo y antes de `next()`.
     Para cualquier ruta que no empiece por /admin devuelve `null` al instante
     y no cuesta nada. */
  const corte = await pasarPuerta(context.request, context.url, context.locals);
  if (corte) return corte;

  const respuesta = await next();

  /* Las respuestas del panel: nunca se cachean, siempre `noindex`, y aquí se
     entrega la cookie si la puerta decidió renovar la sesión. Se hace sobre la
     respuesta ya hecha para que ninguna página del panel tenga que acordarse
     de ponerlo — el mismo motivo por el que la caché pública se gobierna aquí
     y no en cada página. */
  if (esRutaDelPanel(context.url.pathname)) {
    const cabeceras = new Headers(respuesta.headers);
    for (const [k, v] of Object.entries(cabecerasPanel())) cabeceras.set(k, v);
    const renovada = (context.locals as { cookieRenovada?: string }).cookieRenovada;
    if (renovada) cabeceras.append('Set-Cookie', renovada);
    return new Response(respuesta.body, {
      status: respuesta.status,
      statusText: respuesta.statusText,
      headers: cabeceras,
    });
  }

  /* Lo prerenderizado se sirve como asset: ni cabeceras ni copia. */
  if (context.isPrerendered) return respuesta;

  /* Solo se cachea lo que la página declaró explícitamente con
     `marcarEtiquetas`. Una página dinámica que no lo haga (porque no lee de
     D1, o porque es del panel) no se cachea, que es el valor por defecto
     seguro: cachear algo que no debía es peor que no cachear algo que podía. */
  const etiquetas = (context.locals as { etiquetasCache?: string[] }).etiquetasCache;
  if (!etiquetas?.length) return respuesta;

  /* Solo las respuestas BUENAS. Una copia de un 503 o de un 404 no sirve de
     respaldo: serviría el error para siempre. Y una respuesta de emergencia ya
     trae su propia `X-KP-Origen`, así que tampoco se vuelve a guardar. */
  if (respuesta.status !== 200) return respuesta;
  if (respuesta.headers.has('X-KP-Origen')) return respuesta;

  const html = await respuesta.text();

  /* `waitUntil` deja salir la respuesta sin esperar a que se escriba la copia:
     el visitante no paga el guardado. Si el runtime no lo ofrece, `guardarCopia`
     espera (más lento, igual de correcto). */
  const esperar = context.locals.runtime?.ctx?.waitUntil?.bind(context.locals.runtime.ctx);
  await guardarCopia(context.url, html, etiquetas, esperar);

  const cabeceras = new Headers(respuesta.headers);
  for (const [k, v] of Object.entries(cabecerasOk(etiquetas))) cabeceras.set(k, v);
  return new Response(html, { status: 200, headers: cabeceras });
});
