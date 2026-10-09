/**
 * productos/cache.ts — que la tienda vea lo que Andreina acaba de guardar (R9).
 *
 * QUE SE PUEDE INVALIDAR DESDE AQUI, Y QUE NO
 * ===========================================================================
 * Hay dos cachés y solo una se puede tocar desde el Worker sin más:
 *
 *   1. LA COPIA DE RESPALDO de la Cache API (`guardarCopia` en
 *      `src/datos/resiliencia.ts`): la que se sirve si D1 se cae. Esa SÍ se
 *      borra aquí, con `caches.default.delete`, que funciona en cualquier plan.
 *      Importa más de lo que parece: sin borrarla, si D1 fallara justo después
 *      de archivar un producto, la tienda serviría durante horas la copia de
 *      la ficha con el producto todavía a la venta.
 *   2. LA CACHE DEL BORDE gobernada por `Cache-Control: s-maxage=300`. Purgarla
 *      por etiqueta (`Cache-Tag`) exige la API de Cloudflare con un token, que
 *      este proyecto no tiene declarado como secreto. Su techo son 5 minutos
 *      (`SEGUNDOS_CACHE`), que es la red que R9 pide.
 *
 * Para que la dueña vea su cambio AL INSTANTE pese a (2), el enlace «Ver en la
 * tienda» del panel lleva `?v=<version>`: una URL nueva no está en ninguna
 * caché. Es la segunda mitad de R9 («que el panel enlace a la página pública
 * con un parámetro que salte la caché»). El `?v=` no crea copias de respaldo
 * de más: `claveDeCache` ignora la query.
 *
 * NUNCA LANZA. Un fallo al invalidar no puede convertir un guardado bueno en
 * un error en pantalla: lo guardado está guardado, y la caché caduca sola.
 */

import { claveDeCache } from '../../datos/resiliencia';
import { ruta } from '../../datos/sitio';

/** Las páginas públicas que enseñan un producto. */
function paginasDe(handle: string): string[] {
  return [
    `/producto/${handle}`,
    /* El catálogo y la portada (destacados) listan productos; el carrito
       serializa el catálogo entero; el sitemap lista las fichas. */
    '/catalogo',
    '/',
    '/carrito',
    '/sitemap.xml',
  ];
}

/** Borra las copias de respaldo de todo lo que enseña este producto. */
export async function invalidarProducto(origen: string, handle: string): Promise<void> {
  try {
    const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    if (!cache) return;
    await Promise.all(
      paginasDe(handle).map((p) =>
        cache.delete(claveDeCache(new URL(ruta(p), origen))).catch(() => false),
      ),
    );
  } catch (fallo) {
    console.warn('[admin] no se pudo invalidar la caché:', fallo instanceof Error ? fallo.message : fallo);
  }
}

/** El enlace a la ficha pública que salta cualquier caché. */
export function enlaceFicha(handle: string, version: number): string {
  return ruta(`/producto/${handle}?v=${version}`);
}
