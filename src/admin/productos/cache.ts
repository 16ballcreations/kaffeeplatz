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
 * tienda» del panel lleva `?v=<sello>`: una URL nueva no está en ninguna
 * caché. El sello es la hora de pintar la ficha (y la ficha lo renueva con JS
 * tras cada guardado sin recargar): desde que cada bloque tiene su cerrojo
 * (migrations/0009), `productos.version` ya no cambia al guardar una versión,
 * y no serviría. Es la segunda mitad de R9 («que el panel enlace a la página pública
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
    /* El catálogo reducido que pide el carrito emergente: desde que las
       copias se sirven como página fresca, sin esto mostraría el precio
       viejo hasta 5 minutos. */
    '/api/carrito/catalogo.json',
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
export function enlaceFicha(handle: string, sello: string = Date.now().toString(36)): string {
  return ruta(`/producto/${handle}?v=${sello}`);
}

/**
 * Tras un movimiento de inventario: borra las copias de lo que cambió.
 *
 * Desde que la tienda sirve las copias frescas del borde (nov 2026), un
 * «Vendí 1» o una carga no se verían hasta 5 minutos después. Con `varianteId`
 * se borra solo ese producto (y las páginas comunes); sin él —interruptor,
 * anular un paquete— todos, porque puede haber cambiado cualquiera. Nunca
 * lanza: un fallo aquí no puede deshacer un movimiento ya guardado.
 */
export async function invalidarInventario(
  origen: string,
  db: { prepare(sql: string): { bind(...v: unknown[]): { all<T>(): Promise<{ results: T[] }> }; all<T>(): Promise<{ results: T[] }> } },
  varianteId: number | null,
): Promise<void> {
  try {
    const filas = varianteId
      ? await db
          .prepare('SELECT p.handle FROM variantes v JOIN productos p ON p.id = v.producto_id WHERE v.id = ?')
          .bind(varianteId)
          .all<{ handle: string }>()
      : await db.prepare('SELECT handle FROM productos WHERE archivado_en IS NULL').all<{ handle: string }>();
    await Promise.all(filas.results.map((f) => invalidarProducto(origen, f.handle)));
  } catch (fallo) {
    console.warn('[admin] no se pudo invalidar tras el inventario:', fallo instanceof Error ? fallo.message : fallo);
  }
}
