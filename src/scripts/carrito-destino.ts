/**
 * carrito-destino.ts — A DONDE VA el pedido cuando la persona lo cierra.
 * ===========================================================================
 *
 * >>> ESTE ES EL UNICO PUNTO QUE HAY QUE CAMBIAR CUANDO LLEGUE MERCADOLIBRE <<<
 *
 * Hoy no hay pago en linea (Bold se descarto): el pedido se cierra por
 * WhatsApp con el mensaje armado por `mensajePedido()`. Lo usan los DOS
 * botones de cierre del sitio, el «Pedir por WhatsApp» de /carrito y el
 * «Finalizar pedido» del mini carrito, a traves de `carrito-vista.ts`.
 *
 * Por que un fichero para una funcion de una linea: si el destino viviera en
 * cada boton, el dia del checkout se cambiaria uno y el otro seguiria
 * mandando a WhatsApp sin que nada fallase. Aqui se cambia una vez y cambian
 * los dos. Si el nuevo destino necesita otra cosa que un enlace (un POST, un
 * redirect del servidor), se cambia la firma aqui y el compilador señala los
 * dos sitios que la llaman.
 */
import { enlaceWhatsApp, mensajePedido } from './carrito-resolver';
import type { CarritoResuelto } from './carrito-tipos';

/** El enlace al que lleva el boton de cierre del pedido. */
export function destinoDelPedido(
  carrito: CarritoResuelto,
  envio: { costo: number; gratis: boolean },
  numeroWhatsApp: string,
): string {
  return enlaceWhatsApp(numeroWhatsApp, mensajePedido(carrito, envio));
}
