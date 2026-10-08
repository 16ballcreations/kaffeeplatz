/**
 * diario.ts — LA ÚNICA FRONTERA CON D1 PARA EL DIARIO
 * ===========================================================================
 * Separado de `catalogo.ts` y no metido en él, por dos razones:
 *
 *   1. Son dos dominios que no se tocan. El diario no tiene variantes, ni
 *      precios, ni disponibilidad; el catálogo no tiene cuerpo en Markdown ni
 *      borradores. Un solo fichero con las dos cosas sería un fichero en el que
 *      hay que buscar.
 *   2. El cliente pidió que los ficheros no crezcan sin control. Con el diario
 *      dentro, `catalogo.ts` pasaría de ~170 a ~270 líneas y seguiría creciendo
 *      en la fase 7 (edición de artículos). Partir por dominio ahora es gratis;
 *      partirlo cuando ya tiene 400 líneas, no.
 *
 * La resiliencia (`leer`, `respuestaDeEmergencia`) se comparte: vive en
 * `resiliencia.ts` y `catalogo.ts`, y aquí solo se usa. Un fallo de D1 en el
 * diario se trata exactamente igual que en el catálogo, que es lo correcto —el
 * visitante no tiene por qué notar en qué sección estaba.
 */

import type { Articulo } from './formas';
import type { BaseD1 } from './consultas/productos';
import { listaDeArticulos, articuloPorHandle, handleRetirado } from './consultas/diario';
import { leer, type Lectura } from './resiliencia';

export type { Articulo };

/**
 * El binding de D1. Duplica tres líneas de `catalogo.ts` a propósito: hacer un
 * módulo compartido de tres líneas obligaría a que los dos ficheros dependieran
 * de un tercero para algo que no es una decisión, es una ruta de acceso.
 */
function base(locals: unknown): BaseD1 {
  const env = (locals as { runtime?: { env?: Record<string, unknown> } })?.runtime?.env;
  const db = env?.DB as BaseD1 | undefined;
  if (!db?.prepare) {
    throw new Error(
      'El binding DB no está disponible. Comprueba `d1_databases` en wrangler.jsonc ' +
        'y que la base local exista (npm run d1:migrar && npm run d1:sembrar).',
    );
  }
  return db;
}

/**
 * Todos los artículos publicados, SIN su cuerpo, ya ordenados por fecha
 * descendente con `handle` como desempate.
 *
 * El orden lo pone el SQL y no la página porque es el orden natural del diario
 * y no hay ninguna vista que quiera otro. Si apareciera una, se ordena en la
 * página como hace el catálogo; mientras no aparezca, ordenar una vez en la
 * consulta ahorra repetirlo en las tres vistas que lo usan.
 */
export function obtenerArticulos(locals: unknown): Promise<Lectura<Articulo[]>> {
  return leer(() => listaDeArticulos(base(locals)));
}

/** Un artículo con su cuerpo en HTML. `datos: null` con 'ok' = no existe. */
export function obtenerArticulo(
  locals: unknown,
  handle: string,
): Promise<Lectura<Articulo | null>> {
  return leer(() => articuloPorHandle(base(locals), handle));
}

/**
 * ¿Este handle existió y ya no está publicado?
 *
 * Igual que con los productos archivados (R3): una URL del diario que Google ya
 * indexó no puede volverse un 404 silencioso porque la dueña la pasó a
 * borrador. Redirige al índice del diario, que es el sitio útil más cercano.
 */
export function articuloRetirado(locals: unknown, handle: string): Promise<Lectura<boolean>> {
  return leer(() => handleRetirado(base(locals), handle));
}
