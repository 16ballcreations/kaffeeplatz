/**
 * topes.ts — CUANTAS unidades de una variante se pueden pedir. Un solo sitio.
 * ===========================================================================
 *
 * POR QUE EXISTE ESTE FICHERO
 * ---------------------------------------------------------------------------
 * El tope vivia en `src/components/SelectorCantidad.astro`, que es UNA de las
 * tres entradas al carrito. Las otras dos —la tarjeta del catalogo y el `+` de
 * /carrito— no sabian que existia, asi que el limite se podia superar por dos
 * vias sin tocar nada raro: pulsar «Agregar» tres veces con 10 en el selector
 * dejaba 30, y el `+` de /carrito no tenia techo ninguno.
 *
 * El tope no es cosa de un componente: es una regla del PEDIDO. Asi que vive
 * aqui, lo aplica `carrito.ts` (por donde pasan las tres vias) y los
 * componentes solo lo CONSULTAN para pintar.
 *
 * POR QUE AQUI Y NO DENTRO DE carrito.ts
 * ---------------------------------------------------------------------------
 * `SelectorCantidad.astro` necesita el tope en su frontmatter, es decir, EN EL
 * SERVIDOR durante el build, para imprimir `max` y `data-tope` en el HTML.
 * `carrito.ts` toca `window.localStorage` y `document`: importarlo desde un
 * frontmatter arrastraria el navegador al build. Este modulo es TypeScript
 * puro, sin DOM y sin estado, asi que lo pueden importar los dos lados: el
 * .astro en el build y `carrito.ts` en el navegador.
 *
 * ===========================================================================
 * EL ENGANCHE DEL INVENTARIO — AQUI, Y EN NINGUN OTRO SITIO
 * ===========================================================================
 * El inventario YA EXISTE (fase 9, `planes/kaffeeplatz-panel-admin.md`,
 * seccion G) y entra por aqui, por una sola linea: el `return` de `topeDe()`.
 *
 *   return Math.max(0, Math.min(TOPE_SENSATEZ, v.stockDisponible ?? TOPE_SENSATEZ));
 *
 * `stockDisponible` lo rellena `conStock()` de `src/datos/inventario.ts` en las
 * paginas que leen de D1 (ficha y catalogo), y SOLO si el interruptor
 * `inventario_activo` esta encendido. Con el interruptor apagado el campo no
 * existe en la variante, el `?? TOPE_SENSATEZ` decide, y el tope es
 * exactamente el de antes del inventario: es la promesa de R13 («apagarlo
 * devuelve el sitio al comportamiento de hoy en un toque»).
 *
 * EL TOPE DE SENSATEZ NO DESAPARECE con el stock: se queda como techo. Tener
 * 60 en bodega no es razon para ofrecer pedir 60 de una.
 *
 * Y EL TOPE SIGUE SIN SER LA GARANTIA. Una pagina cacheada cinco minutos puede
 * ofrecer una unidad que ya se vendio; la verdad esta en el `WHERE` del
 * `UPDATE` que reserva (G.4, caso 1). Esto evita pedir lo imposible, no lo
 * impide.
 */

/**
 * Lo minimo que hace falta para decidir el tope de una variante.
 *
 * No es `Variante` de src/datos/formas.ts a proposito: asi este modulo no
 * depende de la forma completa del catalogo, y /carrito puede pasarle lo poco
 * que serializa en la pagina.
 */
export interface VarianteTopable {
  disponible: boolean;
  /** Unidades vendibles ahora. Sin dato (inventario apagado) = sin limite de stock. */
  stockDisponible?: number;
}

/**
 * TOPE DE SENSATEZ — maximo de unidades de una misma variante por pedido.
 *
 * Diez porque es mas de lo que nadie pide de una cafetera en una tienda que
 * vende por WhatsApp, y lo bastante poco para que un teclazo no genere un
 * pedido absurdo que haya que deshacer en la conversacion.
 *
 * Con el stock activo esta constante NO desaparece: se queda como techo por
 * encima del stock (ver `topeDe()`). Tener 60 unidades en bodega no es razon
 * para que el selector ofrezca pedir 60 de una.
 */
export const TOPE_SENSATEZ = 10;

/**
 * Techo duro del almacenamiento, por linea guardada.
 *
 * Es OTRA COSA que el tope: no es una regla de negocio sino un seguro contra
 * un `localStorage` manipulado a mano o un numero absurdo por URL. Vale
 * siempre, por encima de cualquier tope, y es el que impide que una linea
 * guardada traiga 10.000 unidades.
 */
export const MAX_POR_LINEA = 99;

/**
 * EL TOPE DE UNA VARIANTE. Unico punto del codigo que lo decide.
 *
 * Una variante agotada da 0: no se puede pedir nada de ella. Esa es la regla
 * de hoy y no cambia (el cliente la confirmo).
 *
 * Con stock, el tope es lo vendible, sin pasar del de sensatez. Sin dato de
 * stock (inventario apagado, o /carrito, que no lee de D1), el de sensatez:
 * el mismo numero que antes del inventario. Ver la cabecera.
 */
export function topeDe(v: VarianteTopable): number {
  if (!v.disponible) return 0;
  return Math.max(0, Math.min(TOPE_SENSATEZ, v.stockDisponible ?? TOPE_SENSATEZ));
}

/**
 * Lo que se puede AÑADIR todavia, sabiendo lo que ya hay en el carrito.
 *
 * Es la cuenta que faltaba en todo el sitio: el selector limitaba lo que se
 * añade DE UNA VEZ y nadie restaba lo que ya estaba guardado. Nunca devuelve
 * negativo: un carrito que ya se pasa del tope (uno guardado de antes, p. ej.)
 * da 0, no un numero en rojo.
 */
export function margen(tope: number, enCarrito: number): number {
  return Math.max(0, Math.min(MAX_POR_LINEA, tope) - enCarrito);
}
