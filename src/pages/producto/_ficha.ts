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
import { MARCA_PRODUCTO } from '../../datos/seo';
import { plazo } from '../../scripts/encargo';

/** El nombre de la opción en mayúscula inicial: «Color», «Tamaño», o «Opción». */
export function nombreDeOpcionFicha(d: Producto): string {
  return d.opciones[0]?.nombre
    ? d.opciones[0].nombre.charAt(0).toUpperCase() + d.opciones[0].nombre.slice(1).toLowerCase()
    : 'Opción';
}

/**
 * Los mensajes de WhatsApp de la ficha: el de una variante, el de «avísame» y
 * el de una versión POR ENCARGO (migrations/0011), que no pregunta si está
 * disponible —ya se sabe que no hay— sino que pide el encargo con su plazo.
 * `titulo` null: el producto no tiene versiones que nombrar.
 */
export function mensajesFicha(d: Producto) {
  return {
    mensajeVariante: (titulo: string, precio: string) =>
      `Hola KaffeePlatz, me interesa ${d.titulo} (${titulo}, ${precio}). ¿Está disponible?`,
    mensajeEncargo: (titulo: string | null, precio: string) =>
      `Hola KaffeePlatz, quiero encargar ${d.titulo} (${titulo ? `${titulo}, ` : ''}${precio}), ` +
      `con entrega en ${plazo(d.diasEncargo ?? 15)}.`,
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

/**
 * La disponibilidad de una oferta para schema.org.
 *
 * POR ENCARGO ES `BackOrder`, NO `PreOrder`. `PreOrder` es para algo que
 * todavía no ha salido al mercado (un lanzamiento); `BackOrder` es «ahora no
 * hay, se puede pedir y llega cuando entre», que es exactamente el encargo:
 * un producto de catálogo que se pide al proveedor. Google acepta las dos y
 * con `BackOrder` no promete una fecha de lanzamiento que no existe. El plazo
 * va aparte, en `deliveryLeadTime` de la oferta.
 */
function disponibilidad(disponible: boolean, encargo: boolean): string {
  if (!disponible) return 'https://schema.org/OutOfStock';
  return encargo ? 'https://schema.org/BackOrder' : 'https://schema.org/InStock';
}

/** El JSON-LD de Product: una oferta, o un rango si hay varias variantes. */
export function jsonLdFicha(d: Producto, url: string, site: URL | undefined) {
  /* Por encargo cuando NINGUNA versión vendible tiene unidades: si alguna las
     tiene, el producto está «en existencia» (la ficha abre con esa). */
  const vendibles = d.variantes.filter((v) => v.disponible);
  const encargo = vendibles.length > 0 && vendibles.every((v) => v.encargo);
  /* El plazo, solo en el encargo: sin él, el JSON-LD es el de siempre. */
  const plazoEncargo = encargo
    ? {
        deliveryLeadTime: {
          '@type': 'QuantitativeValue',
          value: d.diasEncargo ?? 15,
          unitCode: 'DAY',
        },
      }
    : {};
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: d.titulo,
    description: d.descripcionTexto,
    sku: d.handle,
    /* La marca solo cuando se conoce de verdad (SEO fase 1): `vendor` era la
       tienda de Shopify, no el fabricante, y Google lo leia como marca. */
    ...(MARCA_PRODUCTO[d.handle] && { brand: { '@type': 'Brand', name: MARCA_PRODUCTO[d.handle] } }),
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
            availability: disponibilidad(d.disponible, encargo),
            ...plazoEncargo,
            url,
            seller: { '@type': 'Organization', name: SITIO.nombre },
          }
        : {
            '@type': 'Offer',
            priceCurrency: 'COP',
            price: d.precio,
            availability: disponibilidad(d.disponible, encargo),
            ...plazoEncargo,
            url,
            seller: { '@type': 'Organization', name: SITIO.nombre },
          },
  };
}
