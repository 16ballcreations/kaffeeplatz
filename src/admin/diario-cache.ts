/**
 * diario-cache.ts — después de guardar, que la tienda no enseñe lo de antes.
 *
 * QUE SE BORRA, Y POR QUE ESO ES LO QUE HAY QUE BORRAR
 * ===========================================================================
 * El middleware guarda en la Cache API una copia de cada página buena
 * (`guardarCopia`, `src/datos/resiliencia.ts`), y esa copia es la que se sirve
 * si D1 falla — aunque esté vencida, hasta un día. Si la dueña pasa un
 * artículo a borrador y la base tiene un mal rato esa tarde, la copia
 * guardada seguiría enseñando el artículo en /diario: justo lo que acaba de
 * retirar. Borrar las copias afectadas al guardar cierra esa puerta.
 *
 * Se borra por RUTA (la clave de `claveDeCache`) y no por etiqueta: la purga
 * por `Cache-Tag` es solo de planes Enterprise, y borrar claves de la Cache
 * API funciona en cualquiera (es lo que anticipa `cabecerasOk`). Cada ruta se
 * borra con y sin barra final, porque `claveDeCache` usa el `pathname` tal
 * cual llegó y la tienda se visita de las dos formas.
 *
 * LO QUE ESTO NO HACE
 * ---------------------------------------------------------------------------
 * No purga la caché de borde gobernada por `Cache-Control: s-maxage` (eso
 * requiere la API de purga con un token). Ese techo es de 5 minutos
 * (`SEGUNDOS_CACHE`) y es la red de R9; para que la dueña vea su cambio al
 * instante, el panel enlaza a la tienda con un parámetro que salta la caché
 * (`enlaceSinCache`).
 *
 * NUNCA LANZA. Lo guardado ya está guardado: que no se pueda borrar una copia
 * no puede convertir un guardado bueno en un error para la dueña. Se registra.
 */

import { claveDeCache } from '../datos/resiliencia';
import { ruta } from '../datos/sitio';

function cacheDelBorde(): Cache | null {
  try {
    return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

/** Borra las copias de respaldo de estas rutas públicas ('/diario', '/'). */
export async function invalidarRutas(origen: URL, caminos: string[]): Promise<void> {
  const cache = cacheDelBorde();
  if (!cache) return;
  const claves = new Set<string>();
  for (const c of caminos) {
    const r = ruta(c).replace(/\/+$/, '') || '/';
    claves.add(r);
    if (r !== '/') claves.add(`${r}/`);
  }
  await Promise.all(
    [...claves].map((c) =>
      cache.delete(claveDeCache(new URL(c, origen.origin))).catch((e) => {
        console.error('[cache] no se pudo invalidar', c, e instanceof Error ? e.message : e);
        return false;
      }),
    ),
  );
}

/** Las rutas que cambian cuando cambia un artículo (o su dirección). */
export function rutasDeArticulo(...handles: (string | undefined)[]): string[] {
  const propias = handles.filter((h): h is string => !!h).map((h) => `/diario/${h}`);
  /* La portada lista los últimos artículos, y el sitemap los lista todos. */
  return ['/', '/diario', '/sitemap.xml', ...propias];
}

/**
 * Un enlace a la tienda que no sale de una caché: un parámetro distinto en
 * cada guardado. R9: «que el panel enlace a la página pública con un parámetro
 * que salte la caché para que la dueña vea su cambio al instante».
 */
export function enlaceSinCache(camino: string): string {
  return `${ruta(camino)}?v=${Date.now().toString(36)}`;
}
