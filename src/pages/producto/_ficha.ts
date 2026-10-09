/**
 * _ficha.ts — lo que la ficha de producto CALCULA, separado de lo que PINTA.
 *
 * Salió de `[handle].astro`, que iba por 378 líneas con el límite del repo en
 * ~300. El corte es el natural: aquí no hay marcado, solo decisiones sobre los
 * datos (qué relacionados, qué mensajes de WhatsApp, qué JSON-LD), y se pueden
 * leer sin tener la maqueta delante. El guion bajo del nombre es lo que hace
 * que Astro NO lo trate como una ruta: no existe `/producto/_ficha`.
 *
 * Todo es PURO: recibe el producto y devuelve valores. Así la página sigue
 * siendo la única que habla con D1 y con `Astro`.
 */
import type { Producto } from '../../datos/formas';
import { SITIO, ruta } from '../../datos/sitio';

/** El nombre de la opción en mayúscula inicial: «Color», «Tamaño», o «Opción». */
export function nombreDeOpcionFicha(d: Producto): string {
  return d.opciones[0]?.nombre
    ? d.opciones[0].nombre.charAt(0).toUpperCase() + d.opciones[0].nombre.slice(1).toLowerCase()
    : 'Opción';
}

/** Los dos mensajes de WhatsApp de la ficha: el de una variante y el de «avísame». */
export function mensajesFicha(d: Producto) {
  return {
    mensajeVariante: (titulo: string, precio: string) =>
      `Hola KaffeePlatz, me interesa ${d.titulo} (${titulo}, ${precio}). ¿Está disponible?`,
    mensajeAviso: `Hola KaffeePlatz, me interesa ${d.titulo}. ¿Me avisan cuando vuelva a estar disponible?`,
  };
}

/** Relacionados: misma categoria primero, luego cercania de precio. */
export function relacionadosDe(d: Producto, todos: Producto[]): Producto[] {
  return todos
    .filter((p) => p.handle !== d.handle && p.imagenes.length > 0)
    .sort((a, b) => {
      const ca = a.categoria === d.categoria ? 0 : 1;
      const cb = b.categoria === d.categoria ? 0 : 1;
      if (ca !== cb) return ca - cb;
      if (a.disponible !== b.disponible) return a.disponible ? -1 : 1;
      const da = Math.abs(a.precio - d.precio);
      const db = Math.abs(b.precio - d.precio);
      if (da !== db) return da - db;
      /* DESEMPATE POR `handle`. Sin esto el orden de dos productos igual de
         "cercanos" lo decide el orden de llegada, y como aqui hay un
         `.slice(0, 4)` justo despues, un empate en la cuarta posicion hace que
         un producto entre o salga de la fila segun quien llegue antes. Son 6
         fichas con un empate exacto en ese corte. Al leer de D1 el orden de
         llegada lo decide la base, no el disco, asi que sin desempate la pagina
         cambiaria sin que cambiara ningun dato. */
      return a.handle.localeCompare(b.handle, 'es');
    })
    .slice(0, 4);
}

/** El JSON-LD de Product: una oferta, o un rango si hay varias variantes. */
export function jsonLdFicha(d: Producto, url: string, site: URL | undefined) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: d.titulo,
    description: d.descripcionTexto,
    sku: d.handle,
    brand: { '@type': 'Brand', name: d.vendor },
    image: d.imagenes.map((i) => new URL(ruta(i.src), site).toString()),
    url,
    offers:
      d.variantes.length > 1
        ? {
            '@type': 'AggregateOffer',
            priceCurrency: 'COP',
            lowPrice: Math.min(...d.variantes.map((v) => v.precio)),
            highPrice: Math.max(...d.variantes.map((v) => v.precio)),
            offerCount: d.variantes.length,
            availability: d.disponible
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            url,
            seller: { '@type': 'Organization', name: SITIO.nombre },
          }
        : {
            '@type': 'Offer',
            priceCurrency: 'COP',
            price: d.precio,
            availability: d.disponible
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            url,
            seller: { '@type': 'Organization', name: SITIO.nombre },
          },
  };
}
