/**
 * carrito-tipos.ts — las formas del carrito, sin comportamiento.
 *
 * Salieron de `carrito.ts` al partirlo (iba por 661 lineas). Viven aparte
 * porque las usan los cuatro modulos del carrito y la pagina /carrito, y un
 * fichero solo de tipos no arrastra nada al navegador: TypeScript los borra.
 * Se siguen importando desde `./carrito`, que los reexporta; nadie de fuera
 * tiene que saber que existe este fichero.
 */

/** Una linea tal como se GUARDA: lo minimo, sin titulo ni precio. */
export interface LineaGuardada {
  handle: string;
  varianteId: string;
  cantidad: number;
}

/** Una variante del catalogo, con lo que el carrito necesita de ella. */
export interface VarianteCatalogo {
  id: string;
  titulo: string;
  precio: number;
  precioFormateado: string;
  disponible: boolean;
  /** Solo con el inventario encendido: unidades que se pueden vender. */
  stockDisponible?: number;
}

/** Un producto del catalogo, reducido a lo que el carrito necesita. */
export interface ProductoCatalogo {
  handle: string;
  titulo: string;
  disponible: boolean;
  variantes: VarianteCatalogo[];
  /** Primera imagen, si la hay: la miniatura de la linea. */
  imagen?: { src: string; alt: string };
  /** true cuando el producto tiene mas de una variante (se muestra el nombre). */
  conVariantes: boolean;
}

/** El catalogo indexado por handle, tal como lo serializa /carrito. */
export type Catalogo = Record<string, ProductoCatalogo>;

/** Una linea ya RESUELTA contra el catalogo: lista para pintar. */
export interface LineaResuelta {
  handle: string;
  varianteId: string;
  cantidad: number;
  titulo: string;
  /** Titulo de la variante, o null si el producto no tiene variantes reales. */
  varianteTitulo: string | null;
  precioUnitario: number;
  precioUnitarioFormateado: string;
  /** precioUnitario * cantidad */
  subtotal: number;
  subtotalFormateado: string;
  disponible: boolean;
  imagen?: { src: string; alt: string };
  url: string;
}

/** El carrito completo, resuelto. */
export interface CarritoResuelto {
  lineas: LineaResuelta[];
  /** Suma de cantidades (lo que muestra el contador). */
  unidades: number;
  subtotal: number;
}

/** Lo que viaja en `detail` del evento. */
export interface DetalleEvento {
  lineas: LineaGuardada[];
  unidades: number;
}

/**
 * QUE PASO al intentar agregar o cambiar una cantidad.
 *
 * Existe porque un limite que falla en silencio es peor que no tenerlo: las
 * tres vias necesitan poder decir «se quedo en 10» en vez de no hacer nada.
 * `pedidas` contra `agregadas` es la unica forma de que quien llama sepa si
 * hubo recorte sin volver a leer el carrito y restar.
 */
export interface Resultado {
  /** El carrito guardado resultante. Lo que devolvia antes esta API. */
  lineas: LineaGuardada[];
  /** Cuantas unidades se pidieron. */
  pedidas: number;
  /** Cuantas entraron de verdad. 0 si ya estaba en el tope. */
  agregadas: number;
  /** En cuantas unidades quedo la linea de esa variante. */
  total: number;
  /** El tope vigente de esa variante. */
  tope: number;
  /** true si entro menos de lo pedido: la interfaz tiene que avisar. */
  recortado: boolean;
}
