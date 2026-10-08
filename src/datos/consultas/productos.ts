/**
 * consultas/productos.ts — el SQL del catálogo y la ficha, y nada más.
 *
 * Este fichero SOLO sabe de SQL y de cómo convertir filas en las formas de
 * `src/datos/formas.ts`. No sabe de caché, ni de respaldos, ni de qué hacer si
 * D1 falla: eso es `src/datos/catalogo.ts`, que es la cara pública. Separarlo
 * así es lo que mantiene los dos ficheros por debajo de las 300 líneas y, sobre
 * todo, lo que permite leer el SQL sin el ruido de la resiliencia alrededor.
 *
 * TRES CONSULTAS EN VEZ DE UN JOIN GRANDE
 * ===========================================================================
 * El catálogo necesita 25 productos con sus variantes y sus imágenes. Un solo
 * JOIN devolvería una fila por combinación (25 productos × variantes ×
 * imágenes) y habría que deshacer la multiplicación en memoria, pagando filas
 * leídas por cada duplicado — y en D1 las filas leídas se pagan de verdad (R4).
 *
 * Tres consultas planas (productos, variantes, imágenes) devuelven 25 + 30 + 30
 * = 85 filas, cada dato una sola vez, y se cosen por `producto_id` con un Map.
 * Es más código y menos filas; en una base que cobra por filas, gana.
 *
 * EL ORDEN LO PONE SIEMPRE EL SQL, Y SIEMPRE ES TOTAL
 * ---------------------------------------------------------------------------
 * Todos los ORDER BY acaban en una columna única (`handle` o `id`). Sin eso,
 * SQLite puede devolver dos filas empatadas en cualquier orden y la página
 * cambiaría entre peticiones sin que cambiara ningún dato. Es el mismo
 * problema que se arregló en los `sort()` de las páginas, y hay que arreglarlo
 * en los dos sitios: aquí para que la consulta sea estable, y allí para que el
 * criterio de negocio no dependa del orden de llegada.
 */

import type { Producto, Variante, Opcion, ImagenProducto } from '../formas';
import { formatearPrecio } from '../formas';

/** Lo que el Worker recibe como binding. Tipado al mínimo que se usa. */
export interface BaseD1 {
  prepare(sql: string): {
    bind(...valores: unknown[]): {
      all<T = unknown>(): Promise<{ results: T[] }>;
      first<T = unknown>(): Promise<T | null>;
    };
    all<T = unknown>(): Promise<{ results: T[] }>;
  };
}

/* Solo lo vivo: `archivado_en IS NULL`. Un producto archivado desaparece del
   catálogo, y su URL la trata aparte `src/datos/catalogo.ts` (R3: 301 a su
   categoría, nunca un 404 silencioso ni un 200 vacío). */
const CAMPOS = `handle, titulo, vendor, descripcion_html, descripcion_texto,
  precio, disponible, categoria, coleccion, destacado, id`;

interface FilaProducto {
  id: number;
  handle: string;
  titulo: string;
  vendor: string;
  descripcion_html: string;
  descripcion_texto: string;
  precio: number;
  disponible: number;
  categoria: string;
  coleccion: string | null;
  destacado: number;
}

interface FilaVariante {
  producto_id: number;
  id_externo: string | null;
  titulo: string;
  precio: number;
  disponible: number;
  sku: string | null;
}

interface FilaImagen {
  producto_id: number;
  clave: string;
  alt: string;
  variante_titulo: string | null;
}

interface FilaOpcion {
  producto_id: number;
  nombre: string;
  valores: string;
}

/** Todos los productos vivos, con todo lo que cuelga de ellos. */
export async function todosLosProductos(db: BaseD1): Promise<Producto[]> {
  const productos = await db
    .prepare(`SELECT ${CAMPOS} FROM productos WHERE archivado_en IS NULL ORDER BY handle`)
    .all<FilaProducto>();

  const ids = productos.results.map((p) => p.id);
  if (!ids.length) return [];

  /* `IN (?, ?, ...)` con tantos marcadores como ids. Se construye la lista de
     marcadores, nunca los valores: los valores van siempre por `bind`. */
  const marcas = ids.map(() => '?').join(', ');
  const [variantes, opciones, imagenes] = await Promise.all([
    db
      .prepare(
        `SELECT producto_id, id_externo, titulo, precio, disponible, sku
           FROM variantes WHERE producto_id IN (${marcas}) ORDER BY producto_id, orden, id`,
      )
      .bind(...ids)
      .all<FilaVariante>(),
    db
      .prepare(
        `SELECT producto_id, nombre, valores
           FROM opciones WHERE producto_id IN (${marcas}) ORDER BY producto_id, orden, id`,
      )
      .bind(...ids)
      .all<FilaOpcion>(),
    db
      .prepare(
        `SELECT i.producto_id, i.clave, i.alt, v.titulo AS variante_titulo
           FROM imagenes i LEFT JOIN variantes v ON v.id = i.variante_id
          WHERE i.producto_id IN (${marcas})
          ORDER BY i.producto_id, i.orden, i.id`,
      )
      .bind(...ids)
      .all<FilaImagen>(),
  ]);

  return coser(productos.results, variantes.results, opciones.results, imagenes.results);
}

/** Un producto por su handle, o `null` si no existe o está archivado. */
export async function productoPorHandle(db: BaseD1, handle: string): Promise<Producto | null> {
  const fila = await db
    .prepare(`SELECT ${CAMPOS} FROM productos WHERE handle = ? AND archivado_en IS NULL`)
    .bind(handle)
    .first<FilaProducto>();
  if (!fila) return null;

  const [variantes, opciones, imagenes] = await Promise.all([
    db
      .prepare(
        `SELECT producto_id, id_externo, titulo, precio, disponible, sku
           FROM variantes WHERE producto_id = ? ORDER BY orden, id`,
      )
      .bind(fila.id)
      .all<FilaVariante>(),
    db
      .prepare(
        `SELECT producto_id, nombre, valores FROM opciones WHERE producto_id = ? ORDER BY orden, id`,
      )
      .bind(fila.id)
      .all<FilaOpcion>(),
    db
      .prepare(
        `SELECT i.producto_id, i.clave, i.alt, v.titulo AS variante_titulo
           FROM imagenes i LEFT JOIN variantes v ON v.id = i.variante_id
          WHERE i.producto_id = ? ORDER BY i.orden, i.id`,
      )
      .bind(fila.id)
      .all<FilaImagen>(),
  ]);

  return (
    coser([fila], variantes.results, opciones.results, imagenes.results)[0] ?? null
  );
}

/**
 * ¿Existe este handle aunque esté archivado?
 *
 * Lo necesita la ficha para distinguir dos casos que NO son el mismo (R3):
 * un handle que nunca existió es un 404 legítimo; uno archivado es una URL que
 * Google ya indexó y que debe redirigir a su categoría, no desaparecer.
 */
export async function handleArchivado(
  db: BaseD1,
  handle: string,
): Promise<{ categoria: string } | null> {
  return db
    .prepare('SELECT categoria FROM productos WHERE handle = ? AND archivado_en IS NOT NULL')
    .bind(handle)
    .first<{ categoria: string }>();
}

/** Las filas planas, cosidas en la forma que esperan los componentes. */
function coser(
  productos: FilaProducto[],
  variantes: FilaVariante[],
  opciones: FilaOpcion[],
  imagenes: FilaImagen[],
): Producto[] {
  const porProducto = <T extends { producto_id: number }>(filas: T[]) => {
    const m = new Map<number, T[]>();
    for (const f of filas) {
      const lista = m.get(f.producto_id);
      if (lista) lista.push(f);
      else m.set(f.producto_id, [f]);
    }
    return m;
  };
  const vs = porProducto(variantes);
  const os = porProducto(opciones);
  const is = porProducto(imagenes);

  return productos.map((p) => ({
    handle: p.handle,
    titulo: p.titulo,
    vendor: p.vendor,
    descripcionHtml: p.descripcion_html,
    descripcionTexto: p.descripcion_texto,
    precio: p.precio,
    precioFormateado: formatearPrecio(p.precio),
    disponible: p.disponible === 1,
    variantes: (vs.get(p.id) ?? []).map(aVariante),
    opciones: (os.get(p.id) ?? []).map(aOpcion),
    imagenes: (is.get(p.id) ?? []).map(aImagen),
    /* `undefined` y no `null`: el tipo de hoy es `coleccion?: string` y los
       componentes comprueban con `?.`. Un `null` pasaría los `if` y rompería
       el `.slice()` de algún sitio. */
    ...(p.coleccion ? { coleccion: p.coleccion } : {}),
    categoria: p.categoria,
    ...(p.destacado === 1 ? { destacado: true } : {}),
  }));
}

function aVariante(v: FilaVariante): Variante {
  return {
    /* El id de Shopify. Si falta (variante creada desde el panel, sin
       respaldo), se cae al título: es estable dentro del producto por el
       UNIQUE (producto_id, titulo) y nunca vacío, que es lo que el selector de
       la ficha necesita para funcionar. */
    id: v.id_externo ?? v.titulo,
    titulo: v.titulo,
    precio: v.precio,
    precioFormateado: formatearPrecio(v.precio),
    disponible: v.disponible === 1,
    sku: v.sku,
  };
}

function aOpcion(o: FilaOpcion): Opcion {
  /* `valores` es un JSON array y el orden importa (B.1). Si viniera corrupto,
     una opción vacía degrada a "sin resumen de opciones" en la tarjeta, que es
     preferible a que reviente la página entera del catálogo. */
  let valores: string[] = [];
  try {
    const leido = JSON.parse(o.valores);
    if (Array.isArray(leido)) valores = leido.filter((v): v is string => typeof v === 'string');
  } catch {
    /* se queda vacía a propósito */
  }
  return { nombre: o.nombre, valores };
}

function aImagen(i: FilaImagen): ImagenProducto {
  return {
    src: i.clave,
    alt: i.alt,
    /* El componente compara contra TÍTULOS de variante, así que la capa
       devuelve el título ya resuelto desde `variante_id`. Que el vínculo se
       guarde por id (y no por título) es lo que hace que renombrar un color no
       deje fotos huérfanas; que se LEA como título es lo que hace que
       `GaleriaProducto` siga funcionando sin cambios. */
    ...(i.variante_titulo ? { variante: i.variante_titulo } : {}),
  };
}
