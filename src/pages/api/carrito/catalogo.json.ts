/**
 * GET /api/carrito/catalogo.json — el catalogo reducido, para el mini carrito.
 * ===========================================================================
 *
 * POR QUE UN ENDPOINT Y NO EL CATALOGO EN CADA PAGINA
 * ---------------------------------------------------------------------------
 * El panel que abre el boton flotante necesita precio, nombre, foto y tope de
 * lo que hay en el carrito, en CUALQUIER pagina. /carrito lo serializa en su
 * HTML, pero hacerlo en todas las paginas engordaria cada una con unos 30
 * productos que la mayoria de visitas nunca abre. El panel lo pide la primera
 * vez que se abre (o al pasar el raton por el boton), y el borde lo sirve.
 *
 * Es EXACTAMENTE lo que /carrito serializa: los dos salen de
 * `leerCatalogoCarrito` (src/datos/catalogo-carrito.ts).
 *
 * LA RUTA LLEVA EXTENSION, A PROPOSITO
 * ---------------------------------------------------------------------------
 * El middleware manda a la version con barra final toda pagina sin extension
 * (SEO fase 1). Un `.json` es un fichero: no se redirige, y el `fetch` del
 * panel no paga un 301 en cada apertura. Y vive fuera de /admin, asi que la
 * puerta no lo toca (verificar-puerta.mjs solo mira src/pages/admin).
 *
 * CACHE DE BORDE: LA DE SIEMPRE
 * ---------------------------------------------------------------------------
 * `marcarEtiquetas(['catalogo'])`, como /carrito: el middleware pone las
 * cabeceras y guarda la copia de respaldo. Con el inventario encendido los
 * topes salen del stock, que caduca rapido (alguien compra la ultima por
 * WhatsApp), asi que se usa la cache corta, igual que la ficha con «Queda».
 *
 * SI D1 FALLA
 * ---------------------------------------------------------------------------
 * Primero la copia guardada (vencida pero util: el precio se confirma por
 * WhatsApp). Si no hay, 503 con un JSON minimo: el panel lo traduce en un
 * mensaje y un enlace a /carrito/, que tiene su propia pagina de cortesia.
 * Nunca un 200 con el catalogo vacio: `resolver()` descartaria todas las
 * lineas y la persona veria su carrito borrado sin motivo.
 */
import type { APIRoute } from 'astro';
import { marcarEtiquetas, marcarCacheCorta } from '../../../datos/catalogo';
import { leerCatalogoCarrito } from '../../../datos/catalogo-carrito';
import { cabecerasVencida, copiaGuardada } from '../../../datos/resiliencia';

export const prerender = false;

const JSON_UTF8 = 'application/json; charset=utf-8';

export const GET: APIRoute = async ({ locals, url }) => {
  const { datos } = await leerCatalogoCarrito(locals);

  if (!datos) {
    const copia = await copiaGuardada(url);
    if (copia) {
      console.warn(`[r1] ${url.pathname}: D1 no respondió, se sirve la copia de caché (vencida).`);
      return new Response(copia, {
        status: 200,
        headers: { ...cabecerasVencida(), 'Content-Type': JSON_UTF8 },
      });
    }
    console.error(`[r1] ${url.pathname}: D1 no respondió y no hay copia. 503.`);
    return new Response(JSON.stringify({ error: 'sin-datos' }), {
      status: 503,
      headers: { 'Content-Type': JSON_UTF8, 'Cache-Control': 'no-store', 'Retry-After': '60' },
    });
  }

  marcarEtiquetas(locals, ['catalogo']);
  if (datos.conInventario) marcarCacheCorta(locals);

  return new Response(JSON.stringify(datos.catalogo), {
    status: 200,
    headers: { 'Content-Type': JSON_UTF8 },
  });
};
