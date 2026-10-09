/**
 * consultas/categorias.ts — las categorías de producto que pinta la tienda.
 *
 * Mismo criterio que `consultas/productos.ts`: solo SQL y conversión de filas.
 * La resiliencia (try/catch, respaldo a `CATEGORIAS`) vive en
 * `src/datos/catalogo.ts`.
 *
 * POR QUE NO SE REUTILIZA `categoriasDelPanel`
 * ===========================================================================
 * La del panel trae los dos ámbitos y, por cada fila, una subconsulta que
 * cuenta cuántos productos o artículos la usan. Eso lo necesita la dueña para
 * saber qué está tocando; la tienda no lo pinta nunca (el catálogo cuenta sus
 * productos con lo que ya tiene en memoria). Pagar esos recuentos en cada
 * render de la portada y de cada ficha sería gastar filas leídas (R4) en un
 * dato que se tira. Esta es la misma tabla, el mismo orden y nada más.
 *
 * Solo el ámbito `producto`: los temas del diario llevan `diario:` delante
 * (ver `PREFIJO_DIARIO`) y comparten ids con estas ('metodos', 'otros'), así
 * que mezclarlas haría que 'metodos' saliera dos veces.
 */

import type { Categoria } from '../categorias';
import type { BaseD1 } from './productos';

interface FilaCategoria {
  id: string;
  nombre: string;
  orden: number;
  descripcion: string | null;
}

/** Las categorías de producto en el orden de la barra de filtros. */
export async function categoriasDeProducto(db: BaseD1): Promise<Categoria[]> {
  const { results } = await db
    .prepare(
      `SELECT id, nombre, orden, descripcion FROM categorias
        WHERE ambito = 'producto' ORDER BY orden, id`,
    )
    .all<FilaCategoria>();
  /* `descripcion` NULL pasa a `undefined`, que es como la declara `Categoria`
     (opcional) y como la deja `CATEGORIAS` cuando no la hay: así las páginas
     no distinguen de dónde vino la lista. */
  return results.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    orden: f.orden,
    ...(f.descripcion ? { descripcion: f.descripcion } : {}),
  }));
}
