/**
 * productos/leer.ts — lo que el panel lee de un producto, que no es lo que lee
 * la tienda.
 *
 * POR QUE NO SE REUTILIZA `productoPorHandle` DEL SITIO PUBLICO
 * ===========================================================================
 * Esa consulta devuelve la forma de `formas.ts`, que es el contrato con los
 * componentes públicos y por diseño ESCONDE justo lo que el panel necesita: el
 * id interno de cada variante (el vínculo con las fotos y el inventario), la
 * `version` (el control de concurrencia), `archivado_en` (el panel enseña los
 * archivados; la tienda no) y la columna `disponible` TAL CUAL, no el
 * `vendible` calculado con el stock. Ensanchar aquella forma obligaría a los
 * nueve componentes a cargar con campos que no usan. Son dos lectores con dos
 * necesidades, así que son dos consultas.
 */

import type { BaseAdmin } from '../base';

/** Una fila del listado del panel. */
export interface FilaListado {
  id: number;
  handle: string;
  titulo: string;
  categoria: string;
  precio: number;
  disponible: boolean;
  destacado: boolean;
  archivado: boolean;
  variantes: number;
  fotos: number;
}

/**
 * Todos los productos, archivados incluidos, con lo que el listado enseña.
 *
 * SIN FILTRO EN EL SQL, Y ES A PROPOSITO
 * ---------------------------------------------------------------------------
 * El buscador filtra en memoria (ver `filtrar` en la página). Son 25 productos
 * hoy y serán decenas, no miles: una lectura de ~25 filas por visita al
 * panel. A cambio, la búsqueda ignora tildes y mayúsculas («termometro»
 * encuentra «Termómetro»), que con `LIKE` en SQLite no se puede hacer sin
 * una columna normalizada, y D1 además rechaza los patrones LIKE complejos.
 * Andreina escribe desde el teléfono, sin tildes: que encuentre lo que busca
 * importa más que ahorrar diez filas.
 */
export async function listarProductos(db: BaseAdmin): Promise<FilaListado[]> {
  const r = await db
    .prepare(
      `SELECT p.id, p.handle, p.titulo, p.categoria, p.precio, p.disponible, p.destacado,
              p.archivado_en IS NOT NULL AS archivado,
              (SELECT COUNT(*) FROM variantes v WHERE v.producto_id = p.id) AS variantes,
              (SELECT COUNT(*) FROM imagenes i WHERE i.producto_id = p.id) AS fotos
         FROM productos p
        ORDER BY p.titulo COLLATE NOCASE, p.id`,
    )
    .all<{
      id: number;
      handle: string;
      titulo: string;
      categoria: string;
      precio: number;
      disponible: number;
      destacado: number;
      archivado: number;
      variantes: number;
      fotos: number;
    }>();
  return r.results.map((f) => ({
    ...f,
    disponible: f.disponible === 1,
    destacado: f.destacado === 1,
    archivado: f.archivado === 1,
  }));
}

/** Una variante como la ve el panel: con su id y lo que impide quitarla. */
export interface VariantePanel {
  id: number;
  titulo: string;
  precio: number;
  disponible: boolean;
  orden: number;
  /** Fotos vinculadas a ESTA variante. Al quitarla pasan al producto. */
  fotos: number;
  /**
   * ¿Tiene historia de inventario? Movimientos, reservas o paquetes. Si la
   * tiene, NO se puede quitar: el RESTRICT de 0004 lo impediría, y con razón
   * —borrarla se llevaría el libro por delante (G.4.6)—. Se lee aquí para que
   * el formulario lo diga ANTES de que Andreina lo intente.
   */
  conHistorial: boolean;
}

export interface ProductoPanel {
  id: number;
  handle: string;
  titulo: string;
  descripcionHtml: string;
  categoria: string;
  destacado: boolean;
  precio: number;
  disponible: boolean;
  archivadoEn: string | null;
  version: number;
  updatedAt: string;
  variantes: VariantePanel[];
  /** El nombre de la opción ('Color'), o '' si no tiene. */
  opcionNombre: string;
  fotos: number;
}

/** Un producto por id, archivado o no. `null` si no existe. */
export async function productoParaEditar(db: BaseAdmin, id: number): Promise<ProductoPanel | null> {
  const p = await db
    .prepare(
      `SELECT id, handle, titulo, descripcion_html, categoria, destacado, precio, disponible,
              archivado_en, version, updated_at,
              (SELECT COUNT(*) FROM imagenes i WHERE i.producto_id = productos.id) AS fotos
         FROM productos WHERE id = ?1`,
    )
    .bind(id)
    .first<{
      id: number;
      handle: string;
      titulo: string;
      descripcion_html: string;
      categoria: string;
      destacado: number;
      precio: number;
      disponible: number;
      archivado_en: string | null;
      version: number;
      updated_at: string;
      fotos: number;
    }>();
  if (!p) return null;

  const [vs, op] = await Promise.all([
    db
      .prepare(
        `SELECT v.id, v.titulo, v.precio, v.disponible, v.orden,
                (SELECT COUNT(*) FROM imagenes i WHERE i.variante_id = v.id) AS fotos,
                (EXISTS (SELECT 1 FROM movimientos m WHERE m.variante_id = v.id)
                 OR EXISTS (SELECT 1 FROM reservas r WHERE r.variante_id = v.id)
                 OR EXISTS (SELECT 1 FROM despacho_items d WHERE d.variante_id = v.id)
                 OR v.stock_fisico <> 0 OR v.stock_reservado <> 0) AS con_historial
           FROM variantes v WHERE v.producto_id = ?1 ORDER BY v.orden, v.id`,
      )
      .bind(id)
      .all<{
        id: number;
        titulo: string;
        precio: number;
        disponible: number;
        orden: number;
        fotos: number;
        con_historial: number;
      }>(),
    db
      .prepare('SELECT nombre FROM opciones WHERE producto_id = ?1 ORDER BY orden, id LIMIT 1')
      .bind(id)
      .first<{ nombre: string }>(),
  ]);

  return {
    id: p.id,
    handle: p.handle,
    titulo: p.titulo,
    descripcionHtml: p.descripcion_html,
    categoria: p.categoria,
    destacado: p.destacado === 1,
    precio: p.precio,
    disponible: p.disponible === 1,
    archivadoEn: p.archivado_en,
    version: p.version,
    updatedAt: p.updated_at,
    fotos: p.fotos,
    opcionNombre: op?.nombre ?? '',
    variantes: vs.results.map((v) => ({
      id: v.id,
      titulo: v.titulo,
      precio: v.precio,
      disponible: v.disponible === 1,
      orden: v.orden,
      fotos: v.fotos,
      conHistorial: v.con_historial === 1,
    })),
  };
}

/** Las categorías de producto, en su orden. Salen de D1: son la FK. */
export async function categoriasDeProducto(
  db: BaseAdmin,
): Promise<{ id: string; nombre: string }[]> {
  const r = await db
    .prepare(
      `SELECT id, nombre FROM categorias WHERE ambito = 'producto' ORDER BY orden, nombre, id`,
    )
    .all<{ id: string; nombre: string }>();
  return r.results;
}

/** ¿Está libre esta dirección? Incluye archivados: el handle es único para siempre. */
export async function handleLibre(db: BaseAdmin, handle: string): Promise<boolean> {
  const f = await db.prepare('SELECT 1 AS x FROM productos WHERE handle = ?1').bind(handle).first();
  return !f;
}

/** Una línea del historial de un producto, para la pantalla de edición. */
export interface CambioReciente {
  fecha: string;
  accion: string;
  nota: string | null;
}

/**
 * Los últimos cambios de un producto (y de sus variantes nuevas o quitadas).
 *
 * Es la respuesta corta a «¿qué le pasó a la Chemex el martes?» sin salir de
 * la pantalla. La auditoría completa, con el JSON de `antes`, sigue en D1.
 */
export async function cambiosRecientes(db: BaseAdmin, id: number): Promise<CambioReciente[]> {
  const r = await db
    .prepare(
      `SELECT created_at AS fecha, accion, nota FROM auditoria
        WHERE entidad = 'producto' AND entidad_id = ?1
        ORDER BY created_at DESC, id DESC LIMIT 6`,
    )
    .bind(String(id))
    .all<CambioReciente>();
  return r.results;
}
