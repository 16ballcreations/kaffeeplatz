/**
 * queda.ts — el «Queda 1» de la ficha y de la tarjeta, decidido en un sitio.
 * ===========================================================================
 * Es el único cambio visible del inventario en la tienda (plan, sección G):
 * cuando de una variante quedan 1 o 2 unidades vendibles, se dice. Vende, y es
 * honesto.
 *
 * DOS UMBRALES Y NADA MÁS. Nunca se muestra el número de stock por encima de
 * 2: a un competidor le dice cuánto se vende, y a un cliente que ve «quedan 14»
 * le dice que no corra. Por eso esta función no devuelve un número, devuelve
 * el TEXTO, y solo para 1 y 2; cualquier otro valor es `null` (no se pinta).
 *
 * TypeScript puro y sin DOM, como `topes.ts`. Lo usa solo el servidor: la
 * tarjeta y la ficha lo pintan, y cada radio de variante de la ficha lleva su
 * texto ya hecho en `data-queda`, que es lo que `ficha-producto.ts` copia al
 * elegir. Así el navegador no decide nada y no puede decir otra cosa.
 *
 * CON EL INVENTARIO APAGADO no hay `stockDisponible` en ninguna variante, así
 * que esto devuelve `null` siempre y no se pinta nada: el HTML sale igual que
 * antes (R13).
 */

/** «Queda 1» / «Quedan 2», o `null` si no hay que decir nada. */
export function textoQueda(stockDisponible: number | undefined): string | null {
  if (stockDisponible === 1) return 'Queda 1';
  if (stockDisponible === 2) return 'Quedan 2';
  return null;
}
