/**
 * FORMAS DE DATOS — el contrato entre D1 y los componentes
 * ===========================================================================
 * Estos tipos son EXACTAMENTE lo que hoy devuelve `getCollection('productos')`
 * y `getCollection('diario')` en su campo `.data`, porque eso es lo que los
 * componentes ya esperan.
 *
 * POR QUE IMPORTA TANTO QUE LA FORMA NO CAMBIE
 * ---------------------------------------------------------------------------
 * El plan (B.3, opción B) apuesta a que la migración a D1 sea un cambio de
 * ORIGEN y no de consumo: `TarjetaProducto.astro`, `GaleriaProducto.astro`,
 * `Precio.astro` y `SEO.astro` no deben enterarse. Si esta capa devolviera una
 * forma distinta —aunque fuera "mejor"— habría que tocar los nueve componentes
 * y el riesgo de la migración se multiplicaría por nueve. La forma de hoy no es
 * perfecta, pero es la que está probada en producción.
 *
 * Es la misma previsión que `src/datos/categorias.ts` dejó escrita: "el día que
 * estos productos lleguen por HTTP, solo cambia el ORIGEN, no la forma ni el
 * consumo".
 *
 * DOS CAMPOS QUE SON DERIVADOS Y NO ESTAN EN D1
 * ---------------------------------------------------------------------------
 * `precioFormateado` ('$315.000') NO se guarda: es un valor derivado y
 * guardarlo invita a que se desincronice del precio real (B.1). Se calcula al
 * leer, aquí, con el mismo formato que hoy producen los JSON.
 *
 * `fecha` del diario se devuelve como `Date` porque es lo que los componentes
 * usan (`.getTime()`, `.toISOString()`), aunque en D1 viva como texto
 * 'YYYY-MM-DD'. La conversión se hace en un solo sitio y a mediodía UTC: ver
 * `aFecha`.
 */

/** Una foto de producto, tal como la espera `GaleriaProducto` y `TarjetaProducto`. */
export interface ImagenProducto {
  /** Ruta servida, hoy '/img/productos/...'. En la fase 6 saldrá de R2. */
  src: string;
  alt: string;
  /** TÍTULO de la variante, no su id: es lo que el componente compara. */
  variante?: string;
}

export interface Variante {
  /**
   * El id de Shopify (`variantes.id_externo` en D1), NO la clave primaria.
   *
   * Es deliberado y es importante: `src/scripts/carrito.ts` guarda este valor
   * en localStorage y resuelve por él en cada pintado. Si aquí se devolviera
   * el `id` interino de D1, todo carrito guardado se vaciaría en silencio el
   * día del despliegue (sección D del plan). El id interno no sale de esta
   * capa.
   */
  id: string;
  titulo: string;
  precio: number;
  precioFormateado: string;
  disponible: boolean;
  sku: string | null;
  /**
   * Cuántas unidades se pueden vender AHORA (físico menos lo que alguien está
   * pagando), o `undefined` si el inventario está apagado.
   *
   * OPCIONAL A PROPÓSITO, y es lo que mantiene la promesa del interruptor
   * `inventario_activo` (R13): con el inventario apagado el campo NO EXISTE en
   * el objeto —ni siquiera como `undefined`—, así que los componentes pintan
   * exactamente lo de antes y `topeDe()` cae en su tope de sensatez. Lo
   * rellena `conStock()` de `src/datos/inventario.ts`; ninguna consulta del
   * catálogo lo conoce.
   *
   * Nunca negativo: un stock en −1 es 0 unidades pedibles, no "menos una". El
   * negativo es un aviso para el panel, no un dato para el cliente.
   */
  stockDisponible?: number;
}

export interface Opcion {
  nombre: string;
  valores: string[];
}

export interface Producto {
  handle: string;
  titulo: string;
  vendor: string;
  descripcionHtml: string;
  descripcionTexto: string;
  precio: number;
  precioFormateado: string;
  disponible: boolean;
  variantes: Variante[];
  opciones: Opcion[];
  imagenes: ImagenProducto[];
  coleccion?: string;
  categoria: string;
  destacado?: boolean;
}

export interface Articulo {
  handle: string;
  titulo: string;
  fecha: Date;
  autor: string;
  resumen: string;
  imagen?: string;
  categoria: string;
  /**
   * El cuerpo YA EN HTML, renderizado y saneado al guardar (B.1).
   *
   * Hoy la página del artículo usa `<Content />`, que es el componente que
   * devuelve `render(entry)` de astro:content. Leyendo de D1 no hay `Content`:
   * hay HTML. La página lo pinta con `set:html`, y esa es la ÚNICA excepción
   * junto a `descripcionHtml` — la regla del plan (B.5) es que `set:html` solo
   * se usa con lo que pasó por el saneador.
   */
  cuerpoHtml: string;
}

/** Formato de precio del sitio: '$315.000'. Es el que ya traen los JSON. */
export function formatearPrecio(cop: number): string {
  return `$${cop.toLocaleString('es-CO')}`;
}

/**
 * 'YYYY-MM-DD' → Date a MEDIODÍA UTC.
 *
 * El mediodía y no la medianoche: con 'T00:00:00Z', cualquier formateo en una
 * zona al oeste de Greenwich (y Colombia es UTC-5) devuelve el día ANTERIOR.
 * Las páginas ya pasan `timeZone: 'UTC'` a `toLocaleDateString`, así que hoy no
 * se nota; el mediodía hace que tampoco se note si alguien olvida ese
 * parámetro. Es un seguro de una línea contra un error de un día.
 */
export function aFecha(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}
