/**
 * carrito-topes.ts — cuantas unidades admite cada variante, en esta pagina.
 *
 * Salio de `carrito.ts` al partirlo (iba por 661 lineas). Es la parte del
 * carrito que no toca el almacenamiento: un registro en memoria que llenan las
 * paginas y que `tope()` consulta. QUIEN DECIDE el tope sigue siendo `topeDe()`
 * de `./topes`; esto solo recuerda lo que cada pagina le dijo.
 */

import { topeDe } from './topes';
import { recordarTopes, topeRecordado } from './topes-recordados';

/* ===========================================================================
   LOS TOPES POR VARIANTE

   Este modulo corre en el navegador y NO conoce el catalogo: no puede
   preguntarle a nadie cuanto admite una variante. Asi que cada pagina le pasa
   los topes de lo que ha pintado (`registrarTopes()`), y lo que no esta
   registrado usa el tope de sensatez, que hoy es el valor de CUALQUIER
   variante disponible.

   Por que el valor de reserva es el tope y no «sin limite»: si una pagina se
   olvidara de registrar, el agujero volveria a abrirse en silencio. Caer del
   lado del limite deja, como peor caso, un tope correcto para el dato de hoy.

   La clave es `handle\u0000varianteId`: el tope es POR VARIANTE, no por
   producto. Dos colores del mismo producto no comparten tope.
   =========================================================================== */

/** Topes conocidos de esta pagina. Clave `handle\u0000varianteId`. */
const topes = new Map<string, number>();

/** La clave compuesta. El \0 no puede aparecer en un handle ni en un id. */
function clave(handle: string, varianteId: string): string {
  return `${handle}\u0000${varianteId}`;
}

/**
 * Da a conocer los topes de las variantes que esta pagina ha pintado.
 *
 * Lo llaman /carrito (con su catalogo serializado) y la ficha de producto (con
 * sus variantes). Se puede llamar varias veces: lo registrado se acumula.
 */
export function registrarTopes(
  entradas: Iterable<{ handle: string; varianteId: string; tope: number }>,
): void {
  for (const e of entradas) {
    const n = Math.floor(e.tope);
    if (Number.isFinite(n) && n >= 0) topes.set(clave(e.handle, e.varianteId), n);
  }
}

/**
 * Lo mismo que `registrarTopes`, para las paginas que LEEN DE D1 (la ficha y
 * las tarjetas): ademas apunta los topes que vienen del stock, para que
 * /carrito —que no lee de D1— no deje pasar de ahi. Ver `topes-recordados.ts`.
 */
export function registrarTopesVivos(
  entradas: Iterable<{ handle: string; varianteId: string; tope: number; deStock: boolean }>,
): void {
  const lista = Array.from(entradas);
  registrarTopes(lista);
  recordarTopes(lista);
}

/**
 * El tope de una variante: lo registrado, o el de sensatez si no se registro,
 * y nunca por encima del stock que vio la ficha (fase 9).
 *
 * Es la funcion que la interfaz consulta para pintar (desactivar el `+`, decir
 * cuanto queda). El limite de verdad lo aplican `agregar()` y
 * `cambiarCantidad()`, no quien pinta.
 */
export function tope(handle: string, varianteId: string): number {
  /* Sin registro no se sabe si la variante esta disponible, asi que se asume
     que si: es el caso normal (lo agotado no se puede agregar de todas formas,
     porque el boton que lo haria esta desactivado) y da el tope de sensatez.
     Pasa por `topeDe()` y no por la constante para que no quede un camino que
     devuelva un numero que `topeDe()` ya no daria. */
  const registrado = topes.get(clave(handle, varianteId)) ?? topeDe({ disponible: true });
  /* El stock que apunto la ficha o la tarjeta. Sin inventario no hay apuntes y
     esto es exactamente lo de antes. */
  const recordado = topeRecordado(handle, varianteId);
  return recordado === undefined ? registrado : Math.min(registrado, recordado);
}
