/**
 * carrito-resolver.ts — del carrito guardado a lo que se pinta y se envia.
 *
 * Salio de `carrito.ts` al partirlo (iba por 661 lineas). Cruza las lineas
 * guardadas con el catalogo de la pagina (precio y titulo SIEMPRE de ahi, ver
 * la cabecera de `carrito.ts`) y arma el mensaje de WhatsApp del pedido. Solo
 * lo usa /carrito.
 */

import { escribir } from './carrito-almacen';
import type { Catalogo, CarritoResuelto, LineaGuardada, LineaResuelta } from './carrito-tipos';

/* ===========================================================================
   RESOLUCION CONTRA EL CATALOGO
   =========================================================================== */

/** Prefija una ruta con el `base` del sitio, igual que `ruta()` del servidor. */
function conBase(camino: string): string {
  const base = document.documentElement.dataset.kpBase ?? '';
  const limpio = camino.startsWith('/') ? camino : `/${camino}`;
  return `${base.replace(/\/$/, '')}${limpio}` || '/';
}

/**
 * Cruza las lineas guardadas con el catalogo.
 *
 * Lo que ya no existe (handle retirado, variante retirada) se DESCARTA EN
 * SILENCIO: no es un error del que avisar a la persona, es un catalogo que
 * cambio. Si al descartar cambia el contenido, se reescribe el almacen para
 * que la basura no se arrastre en la siguiente visita.
 */
export function resolver(guardadas: LineaGuardada[], catalogo: Catalogo): CarritoResuelto {
  const lineas: LineaResuelta[] = [];
  let descartadas = false;

  for (const l of guardadas) {
    const p = catalogo[l.handle];
    if (!p) {
      descartadas = true;
      continue;
    }
    const v = p.variantes.find((x) => x.id === l.varianteId);
    if (!v) {
      descartadas = true;
      continue;
    }
    const subtotal = v.precio * l.cantidad;
    lineas.push({
      handle: l.handle,
      varianteId: l.varianteId,
      cantidad: l.cantidad,
      titulo: p.titulo,
      varianteTitulo: p.conVariantes ? v.titulo : null,
      precioUnitario: v.precio,
      precioUnitarioFormateado: v.precioFormateado,
      subtotal,
      subtotalFormateado: pesos(subtotal),
      disponible: p.disponible && v.disponible,
      imagen: p.imagen,
      url: conBase(`/producto/${l.handle}`),
    });
  }

  if (descartadas) {
    escribir(lineas.map(({ handle, varianteId, cantidad }) => ({ handle, varianteId, cantidad })));
  }

  return {
    lineas,
    unidades: lineas.reduce((n, l) => n + l.cantidad, 0),
    subtotal: lineas.reduce((n, l) => n + l.subtotal, 0),
  };
}

/**
 * Formatea un entero en COP: "$315.000".
 *
 * Mismo formato que `precioFormateado` del catalogo. Se repite aqui (y no se
 * importa de src/datos/envio.ts) porque este modulo corre en el navegador y
 * conviene que no arrastre dependencias.
 */
export function pesos(valor: number): string {
  const entero = Math.round(valor);
  return `$${entero.toLocaleString('es-CO', { useGrouping: true }).replace(/,/g, '.')}`;
}

/* ===========================================================================
   MENSAJE DE WHATSAPP
   =========================================================================== */

/**
 * Arma el mensaje del pedido completo.
 *
 * Va con saltos de linea reales: `encodeURIComponent` los convierte en %0A,
 * que es lo que wa.me entiende como linea nueva. Las tildes y la ñ salen en
 * UTF-8 percent-encoded, igual que en BotonWhatsApp.astro.
 */
export function mensajePedido(
  carrito: CarritoResuelto,
  envio: { costo: number; gratis: boolean },
): string {
  const lineas = carrito.lineas.map((l) => {
    const nombre = l.varianteTitulo ? `${l.titulo} (${l.varianteTitulo})` : l.titulo;
    return `• ${l.cantidad} × ${nombre} — ${l.precioUnitarioFormateado} c/u = ${l.subtotalFormateado}`;
  });
  const total = carrito.subtotal + envio.costo;
  return [
    'Hola KaffeePlatz, quiero pedir:',
    '',
    ...lineas,
    '',
    `Subtotal: ${pesos(carrito.subtotal)}`,
    `Envío: ${envio.gratis ? 'gratis' : pesos(envio.costo)}`,
    `Total: ${pesos(total)}`,
    '',
    '¿Me confirman disponibilidad y envío?',
  ].join('\n');
}

/** Enlace de wa.me ya codificado, para el pedido completo. */
export function enlaceWhatsApp(numero: string, mensaje: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
