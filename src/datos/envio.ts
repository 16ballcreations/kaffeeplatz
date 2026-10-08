/**
 * Reglas de envio de KaffeePlatz, en un solo sitio.
 *
 * Fase 1 del plan `planes/kaffeeplatz-carrito-bold.md`: el carrito ya calcula
 * el envio para mostrarlo, pero todavia NO se cobra nada en linea. La fase 2
 * (checkout con Bold) RECALCULA esto en el servidor: lo de aqui es solo lo que
 * se le ensena a la persona, nunca la fuente de verdad del cobro.
 *
 * Los plazos NO se inventan: salen literalmente de
 * `contenido-original/datos/politicas/shipping-policy.md` y ya viven en
 * `ENVIOS` (src/datos/guias.ts), que es de donde los lee el carrito.
 */

/**
 * ⚠️ PENDIENTE DE CONFIRMAR POR LA DUENA (Andreina Morales).
 *
 * Tarifa plana nacional, en COP. El valor de 15.000 es una ESTIMACION puesta
 * por encargo del cliente para poder construir la fase 1; NO sale del material
 * de `contenido-original/`. La politica de envios real dice que el costo "se
 * calcula al momento de la compra segun el destino y el peso del pedido", es
 * decir que hoy no hay tarifa publicada.
 *
 * Antes de cobrar de verdad (fase 2) hay que confirmar este numero con la
 * dueña. Es el UNICO sitio donde vive: cambiarlo aqui lo cambia en el carrito,
 * en el resumen y en el mensaje de WhatsApp.
 */
export const TARIFA_PLANA_ENVIO = 15000;

/**
 * Monto desde el que el envio es gratis, en COP.
 *
 * Este SI esta verificado: es el umbral que ya usaba el Shopify y el que
 * aparece en el contenido del sitio.
 */
export const ENVIO_GRATIS_DESDE = 200000;

/** Formatea un entero en COP con el mismo formato del catalogo: "$315.000". */
export function formatearPesos(valor: number): string {
  return `$${Math.round(valor).toLocaleString('es-CO', { useGrouping: true }).replace(/,/g, '.')}`;
}

export interface ResumenEnvio {
  /** Costo del envio en COP. 0 cuando es gratis. */
  costo: number;
  /** true cuando el subtotal alcanza el umbral de envio gratis. */
  gratis: boolean;
  /** Lo que falta para alcanzar el envio gratis. 0 si ya se alcanzo. */
  faltaParaGratis: number;
}

/**
 * Aplica la regla de envio a un subtotal.
 *
 * Regla (decidida por el cliente): tarifa plana nacional, gratis desde
 * ENVIO_GRATIS_DESDE. Un carrito vacio no tiene envio.
 */
export function calcularEnvio(subtotal: number): ResumenEnvio {
  if (subtotal <= 0) {
    return { costo: 0, gratis: false, faltaParaGratis: ENVIO_GRATIS_DESDE };
  }
  const gratis = subtotal >= ENVIO_GRATIS_DESDE;
  return {
    costo: gratis ? 0 : TARIFA_PLANA_ENVIO,
    gratis,
    faltaParaGratis: gratis ? 0 : ENVIO_GRATIS_DESDE - subtotal,
  };
}
