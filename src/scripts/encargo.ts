/**
 * encargo.ts — los textos de «por encargo», decididos en un sitio.
 * ===========================================================================
 * Pedido del cliente (2 nov 2026): productos que se pueden pedir por encargo,
 * con entrega en 15 días (los días los pone la dueña por producto). Cuándo una
 * versión está por encargo lo decide el SQL del catálogo
 * (`consultas/productos.ts`); esto solo dice CÓMO se nombra.
 *
 * TypeScript puro y sin DOM, como `queda.ts` y `topes.ts`: lo pintan el
 * servidor (ficha, tarjeta) y el navegador (la línea del carrito y el mensaje
 * de WhatsApp), y los dos tienen que decir exactamente lo mismo.
 */

/** «15 días» / «1 día». */
export function plazo(dias: number): string {
  return `${dias} ${dias === 1 ? 'día' : 'días'}`;
}

/** «Por encargo · entrega en 15 días»: junto al precio y en la línea del carrito. */
export function textoEncargo(dias: number): string {
  return `Por encargo · entrega en ${plazo(dias)}`;
}

/** «(por encargo, entrega en 15 días)»: la marca de la línea en el mensaje de WhatsApp. */
export function marcaEncargoMensaje(dias: number): string {
  return `(por encargo, entrega en ${plazo(dias)})`;
}
