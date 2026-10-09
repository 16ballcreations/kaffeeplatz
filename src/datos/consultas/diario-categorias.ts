/**
 * consultas/diario-categorias.ts — categorías (de producto y del diario) y
 * roles de foto: leerlas y editarlas desde el panel.
 *
 * Vive junto al diario porque es la misma fase (7) y la misma pantalla, no
 * porque las categorías de producto sean del diario. Si algún día crece, se
 * parte por tabla.
 *
 * CONCURRENCIA SIN COLUMNA `version`
 * ===========================================================================
 * `categorias` y `roles_imagen` no tienen `version` (0001), y añadirla sería
 * una migración para tablas de cinco filas que se tocan una vez al mes. Se usa
 * el mismo patrón con lo que ya hay: el `WHERE` exige que la fila siga teniendo
 * los valores que la dueña VIO al abrir la página (van ocultos en el
 * formulario). Si otra pestaña los cambió, `changes` es 0 y se avisa en vez de
 * pisar. Es control optimista igual que con `version`, solo que la «versión»
 * es la fila entera.
 *
 * Auditoría: misma regla que los artículos — primero, en el mismo `batch()` y
 * con el mismo `WHERE`.
 */

import type { BaseAdmin, ResultadoEscritura } from '../../admin/base';
import type { BaseD1 } from './productos';

export interface FilaCategoria {
  /** Tal cual en la base: los temas del diario llevan 'diario:'. */
  id: string;
  nombre: string;
  orden: number;
  descripcion: string | null;
  ambito: 'producto' | 'diario';
  /** Cuántos productos o artículos la usan. Solo informativo. */
  uso: number;
}

export interface FilaRol {
  id: string;
  nombre: string;
  orden: number;
  /** Cuántas fotos la usan. Con uso > 0 no se puede borrar. */
  uso: number;
}

/** Las categorías de los dos ámbitos, con su uso, en su orden. */
export async function categoriasDelPanel(db: BaseD1): Promise<FilaCategoria[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.nombre, c.orden, c.descripcion, c.ambito,
              CASE WHEN c.ambito = 'diario'
                   THEN (SELECT COUNT(*) FROM articulos a WHERE a.categoria = c.id AND a.archivado_en IS NULL)
                   ELSE (SELECT COUNT(*) FROM productos p WHERE p.categoria = c.id AND p.archivado_en IS NULL)
              END AS uso
         FROM categorias c ORDER BY c.ambito, c.orden, c.nombre`,
    )
    .all<FilaCategoria>();
  return results;
}

/** Los roles de foto con cuántas fotos los usan. */
export async function rolesDelPanel(db: BaseD1): Promise<FilaRol[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.nombre, r.orden,
              (SELECT COUNT(*) FROM imagenes i WHERE i.rol = r.id) AS uso
         FROM roles_imagen r ORDER BY r.orden, r.nombre`,
    )
    .all<FilaRol>();
  return results;
}

/** Lo editable de una fila: lo que se escribe y lo que se vio. */
export interface Edicion {
  nombre: string;
  orden: number;
  descripcion: string;
}

function lote(db: BaseAdmin, s: unknown[]): Promise<ResultadoEscritura[]> {
  if (!db.batch) throw new Error('La base no ofrece batch(): no se puede guardar sin transacción.');
  return db.batch(s);
}

/** `true` si se guardó; `false` si la fila ya no es la que se vio. */
export async function guardarCategoria(
  db: BaseAdmin,
  id: string,
  nuevo: Edicion,
  visto: Edicion,
): Promise<boolean> {
  /* La descripción vacía se guarda como NULL (la columna lo admite y así se
     guardó la semilla); se compara con COALESCE para que '' y NULL cuenten
     como lo mismo. */
  const donde = `id = ? AND nombre = ? AND orden = ? AND COALESCE(descripcion, '') = ?`;
  const claves = [id, visto.nombre, visto.orden, visto.descripcion];
  const r = await lote(db, [
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion, antes)
         SELECT 'categoria', id, 'editar',
                json_object('nombre', nombre, 'orden', orden, 'descripcion', descripcion)
           FROM categorias WHERE ${donde}`,
      )
      .bind(...claves),
    db
      .prepare(`UPDATE categorias SET nombre = ?, orden = ?, descripcion = ? WHERE ${donde}`)
      .bind(nuevo.nombre, nuevo.orden, nuevo.descripcion || null, ...claves),
  ]);
  return r[1]?.meta?.changes === 1;
}

/** Igual que `guardarCategoria`, para un rol (sin descripción). */
export async function guardarRol(
  db: BaseAdmin,
  id: string,
  nuevo: Edicion,
  visto: Edicion,
): Promise<boolean> {
  const donde = 'id = ? AND nombre = ? AND orden = ?';
  const claves = [id, visto.nombre, visto.orden];
  const r = await lote(db, [
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion, antes)
         SELECT 'rol', id, 'editar', json_object('nombre', nombre, 'orden', orden)
           FROM roles_imagen WHERE ${donde}`,
      )
      .bind(...claves),
    db.prepare(`UPDATE roles_imagen SET nombre = ?, orden = ? WHERE ${donde}`).bind(nuevo.nombre, nuevo.orden, ...claves),
  ]);
  return r[1]?.meta?.changes === 1;
}

/** Crea un rol. `false` si ya existe uno con ese id. */
export async function crearRol(db: BaseAdmin, id: string, nombre: string, orden: number): Promise<boolean> {
  const r = await lote(db, [
    /* La auditoría PRIMERO y solo si el id está libre: con INSERT OR IGNORE
       sobre un id existente no hay nada que registrar. */
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion)
         SELECT 'rol', ?, 'crear' WHERE NOT EXISTS (SELECT 1 FROM roles_imagen WHERE id = ?)`,
      )
      .bind(id, id),
    db.prepare('INSERT OR IGNORE INTO roles_imagen (id, nombre, orden) VALUES (?, ?, ?)').bind(id, nombre, orden),
  ]);
  return r[1]?.meta?.changes === 1;
}

/**
 * Borra un rol SOLO si ninguna foto lo usa. La condición va en el `WHERE` y
 * no en una lectura previa: si una foto lo toma entre que se pintó la página y
 * ahora, el borrado no ocurre. (La FK de `imagenes.rol` no tiene ON DELETE, así
 * que sin esta condición el borrado fallaría o, con las FK apagadas, dejaría
 * fotos apuntando a un rol que no existe.)
 */
export async function borrarRol(db: BaseAdmin, id: string): Promise<boolean> {
  const libre = 'id = ? AND NOT EXISTS (SELECT 1 FROM imagenes WHERE rol = ?)';
  const r = await lote(db, [
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion, antes)
         SELECT 'rol', id, 'borrar', json_object('nombre', nombre, 'orden', orden)
           FROM roles_imagen WHERE ${libre}`,
      )
      .bind(id, id),
    db.prepare(`DELETE FROM roles_imagen WHERE ${libre}`).bind(id, id),
  ]);
  return r[1]?.meta?.changes === 1;
}

/**
 * Los handles de las fichas que pintan el nombre de una categoría: para
 * invalidar sus copias al renombrarla.
 *
 * No son solo los productos de la categoría. Desde que la tienda lee los
 * nombres de D1, cada ficha pinta también la categoría de sus «También te
 * puede servir», y esos relacionados cruzan categorías (`relacionadosDe`
 * prefiere la misma, pero rellena con otras). Calcular en SQL qué fichas
 * enseñan qué tarjeta sería repetir aquí ese orden; con ~25 fichas y una
 * edición al mes, borrar las copias de todas es más barato que equivocarse.
 * Si la categoría no la usa ningún producto, no se pinta en ninguna ficha y
 * no se devuelve nada.
 */
export async function productosDeCategoria(db: BaseD1, id: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT handle FROM productos
        WHERE EXISTS (SELECT 1 FROM productos u WHERE u.categoria = ?)`,
    )
    .bind(id)
    .all<{ handle: string }>();
  return results.map((f) => f.handle);
}
