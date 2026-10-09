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
 * El inventario esta DISEÑADO y NO CONSTRUIDO: no existen `stock_fisico` ni
 * `stock_reservado` en ninguna migracion y `src/datos/formas.ts` no tiene
 * cantidades. Es la fase 9 del plan (`planes/kaffeeplatz-panel-admin.md`,
 * seccion G), 14-19 h, y el cliente decidio hacerla DESPUES.
 *
 * Asi que hoy el tope NO es una afirmacion sobre el stock: es un limite de
 * sensatez para que nadie pida 400 prensas por un teclazo. Quien pida mas de
 * lo que hay se entera igual que hoy: al confirmar por WhatsApp.
 *
 * CUANDO EXISTA EL STOCK, SE CAMBIA UNA SOLA LINEA: el `return` de `topeDe()`,
 * mas abajo, marcado con `CAMBIAR AQUI`. Pasa a ser algo como:
 *
 *   return Math.max(0, Math.min(TOPE_SENSATEZ, v.stockDisponible));
 *
 * ...donde `stockDisponible` es el `stock_fisico - stock_reservado` que la
 * seccion G.1 del plan calcula en `src/datos/catalogo.ts`. Para que ese dato
 * llegue hasta aqui hay que añadirlo al tipo `Variante` de
 * `src/datos/formas.ts` (hoy tiene id, titulo, precio, precioFormateado,
 * disponible y sku) y rellenarlo en la capa de datos. Nada mas de esta cadena
 * cambia: el selector ya imprime un tope POR VARIANTE, /carrito ya lo
 * serializa por variante y `carrito.ts` ya lo aplica por variante.
 */

/**
 * Lo minimo que hace falta para decidir el tope de una variante.
 *
 * No es `Variante` de src/datos/formas.ts a proposito: asi este modulo no
 * depende de la forma completa del catalogo, y /carrito puede pasarle lo poco
 * que serializa en la pagina. El dia que llegue el stock, aqui se añade
 * `stockDisponible?: number` y se lee en `topeDe()`.
 */
export interface VarianteTopable {
  disponible: boolean;
}

/**
 * TOPE DE SENSATEZ — maximo de unidades de una misma variante por pedido.
 *
 * Diez porque es mas de lo que nadie pide de una cafetera en una tienda que
 * vende por WhatsApp, y lo bastante poco para que un teclazo no genere un
 * pedido absurdo que haya que deshacer en la conversacion.
 *
 * Cuando exista el stock esta constante NO desaparece: se queda como techo por
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
 * CAMBIAR AQUI cuando `Variante` traiga su cantidad disponible. Ver la
 * cabecera de este fichero: es la unica linea que hay que tocar.
 */
export function topeDe(v: VarianteTopable): number {
  if (!v.disponible) return 0;
  return TOPE_SENSATEZ;
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
