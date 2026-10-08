/**
 * consultas/diario.ts — el SQL del diario, y nada más.
 *
 * Mismo criterio que `consultas/productos.ts`: aquí solo hay SQL y conversión
 * de filas. La resiliencia (try/catch, caché, respaldo) vive en
 * `src/datos/diario.ts`.
 *
 * EL CUERPO SOLO SE PIDE CUANDO SE VA A PINTAR
 * ===========================================================================
 * `articulos.cuerpo_md` y `articulos.cuerpo_html` son los dos campos grandes de
 * la base: 16 artículos de varios kBytes cada uno. El índice del diario
 * (`/diario`) y los "sigue leyendo" de cada artículo NO los necesitan: pintan
 * título, fecha, resumen y portada.
 *
 * Por eso hay dos consultas. `listaDeArticulos` no pide los cuerpos y
 * `articuloPorHandle` pide solo el HTML del que se va a pintar. Traer los 16
 * cuerpos para enseñar 16 resúmenes es el tipo de gasto que no se nota hasta
 * que la factura de D1 lo cuenta — y aquí no cuesta nada evitarlo.
 *
 * `cuerpo_md` NO sale de esta capa en ningún caso: es para reeditar en el panel
 * (fase 7), no para pintar. Lo que se pinta es `cuerpo_html`, que ya pasó por
 * el saneador al guardarse.
 */

import type { Articulo } from '../formas';
import { aFecha } from '../formas';
import type { BaseD1 } from './productos';
import { PREFIJO_DIARIO } from '../categorias';

/* Solo lo publicado y no archivado. `publicado = 0` es el borrador que pide
   el plan (E.6): un artículo se puede escribir sin que salga al público. */
const VIVOS = 'publicado = 1 AND archivado_en IS NULL';

interface FilaArticulo {
  handle: string;
  titulo: string;
  fecha: string;
  autor: string;
  resumen: string;
  imagen: string | null;
  categoria: string;
  cuerpo_html?: string;
}

/**
 * Todos los artículos publicados, SIN su cuerpo.
 *
 * El orden es por fecha descendente con `handle` como desempate: hay artículos
 * que comparten fecha, y sin el segundo criterio el diario podría reordenarse
 * entre peticiones sin que cambiara ningún dato.
 */
export async function listaDeArticulos(db: BaseD1): Promise<Articulo[]> {
  const { results } = await db
    .prepare(
      `SELECT handle, titulo, fecha, autor, resumen, imagen, categoria
         FROM articulos WHERE ${VIVOS} ORDER BY fecha DESC, handle`,
    )
    .all<FilaArticulo>();
  return results.map(aArticulo);
}

/** Un artículo con su cuerpo en HTML, o `null` si no existe o no está publicado. */
export async function articuloPorHandle(db: BaseD1, handle: string): Promise<Articulo | null> {
  const fila = await db
    .prepare(
      `SELECT handle, titulo, fecha, autor, resumen, imagen, categoria, cuerpo_html
         FROM articulos WHERE handle = ? AND ${VIVOS}`,
    )
    .bind(handle)
    .first<FilaArticulo>();
  return fila ? aArticulo(fila) : null;
}

/**
 * ¿Existe este handle aunque esté archivado o despublicado?
 *
 * Igual que en productos: una URL del diario que Google ya indexó no debe
 * volverse un 404 silencioso cuando la dueña la despublique (R3).
 */
export async function handleRetirado(db: BaseD1, handle: string): Promise<boolean> {
  const fila = await db
    .prepare(`SELECT 1 AS hay FROM articulos WHERE handle = ? AND NOT (${VIVOS})`)
    .bind(handle)
    .first<{ hay: number }>();
  return fila !== null;
}

function aArticulo(f: FilaArticulo): Articulo {
  return {
    handle: f.handle,
    titulo: f.titulo,
    /* Texto 'YYYY-MM-DD' → Date, en un solo sitio. Ver `aFecha`. */
    fecha: aFecha(f.fecha),
    autor: f.autor,
    resumen: f.resumen,
    ...(f.imagen ? { imagen: f.imagen } : {}),
    /* Los temas del diario viven en la misma tabla que las categorías de
       producto y por eso llevan prefijo ('diario:metodos'). El sitio trabaja
       con el id sin prefijar ('metodos'), que es lo que hay en
       CATEGORIAS_DIARIO y lo que comparan los filtros. El prefijo no sale de
       esta capa. */
    categoria: f.categoria.startsWith(PREFIJO_DIARIO)
      ? f.categoria.slice(PREFIJO_DIARIO.length)
      : f.categoria,
    cuerpoHtml: f.cuerpo_html ?? '',
  };
}
