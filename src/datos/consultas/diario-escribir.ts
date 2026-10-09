/**
 * consultas/diario-escribir.ts — las ÚNICAS escrituras del diario.
 *
 * TRES REGLAS, LAS MISMAS EN CADA FUNCION
 * ===========================================================================
 * 1. **Todo cambio va en un `batch()` con su fila de auditoría.** `batch` corre
 *    en una transacción implícita (D1 remoto no acepta `BEGIN TRANSACTION`):
 *    o se guardan el cambio y su registro, o ninguno. Un artículo editado sin
 *    rastro es justo lo que la auditoría existe para impedir.
 *
 * 2. **La auditoría va PRIMERO y con el MISMO `WHERE` que el cambio.** Así
 *    `antes` captura la fila tal como estaba, y si el `WHERE` no casa (otra
 *    pestaña guardó antes) no se inserta nada: ni cambio ni registro de un
 *    cambio que no ocurrió.
 *
 * 3. **La concurrencia se decide en el `WHERE`, con `version`** (patrón 3 de
 *    A.6, B.1). `UPDATE ... WHERE id = ? AND version = ?` y luego se mira
 *    `changes`: 0 significa que alguien guardó entre que se abrió el
 *    formulario y ahora. Comprobarlo en JavaScript leyendo antes dejaría una
 *    ventana; en el `WHERE` no la hay. Es la prueba obligatoria 12.
 *
 * `cuerpo_html` llega YA SANEADO desde la página (`cuerpoAHtml`). Esta capa no
 * renderiza: guarda. Que la conversión viva en `src/admin/` y no aquí es lo
 * que mantiene el saneador como dependencia del panel y no del sitio público.
 */

import type { BaseAdmin, ResultadoEscritura } from '../../admin/base';
import type { ValoresArticulo } from '../../admin/diario-validar';
import { conPrefijo } from './diario-panel';

/** El estado anterior que se guarda en `auditoria.antes`. Incluye el cuerpo:
    es lo que permite recuperar un texto que se borró por error. */
const ANTES = `json_object(
  'handle', handle, 'titulo', titulo, 'fecha', fecha, 'autor', autor,
  'resumen', resumen, 'cuerpo_md', cuerpo_md, 'imagen', imagen,
  'categoria', categoria, 'publicado', publicado, 'archivado_en', archivado_en,
  'version', version)`;

export type Resultado =
  | { ok: true; id: number }
  | { ok: false; motivo: 'conflicto' | 'handle' };

function lote(db: BaseAdmin, sentencias: unknown[]): Promise<ResultadoEscritura[]> {
  if (!db.batch) throw new Error('La base no ofrece batch(): no se puede guardar sin transacción.');
  return db.batch(sentencias);
}

/** ¿Es este fallo el UNIQUE de `articulos.handle`? (Dos pestañas creando a la vez.) */
function esHandleRepetido(fallo: unknown): boolean {
  const m = fallo instanceof Error ? fallo.message : String(fallo);
  return /UNIQUE/i.test(m) && /handle/i.test(m);
}

/**
 * Crea un artículo. La nota de auditoría dice si nació como borrador: es lo
 * que luego permite cambiarle la dirección mientras no se publique (ver
 * `articuloParaEditar`).
 */
export async function crearArticulo(
  db: BaseAdmin,
  v: ValoresArticulo,
  cuerpoHtml: string,
): Promise<Resultado> {
  try {
    const r = await lote(db, [
      db
        .prepare(
          `INSERT INTO articulos
             (handle, titulo, fecha, autor, resumen, cuerpo_md, cuerpo_html, imagen, categoria, publicado)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          v.handle, v.titulo, v.fecha, v.autor, v.resumen, v.cuerpoMd, cuerpoHtml,
          v.imagen || null, conPrefijo(v.categoria), v.publicado ? 1 : 0,
        ),
      db
        .prepare(
          `INSERT INTO auditoria (entidad, entidad_id, accion, nota)
           SELECT 'articulo', CAST(id AS TEXT), 'crear', ? FROM articulos WHERE handle = ?`,
        )
        .bind(v.publicado ? 'publicado' : 'borrador', v.handle),
    ]);
    const id = r[0]?.meta?.last_row_id;
    if (typeof id === 'number' && id > 0) return { ok: true, id };
    /* Sin `last_row_id` (algún entorno no lo da): se busca por la dirección,
       que es única. */
    const fila = await db
      .prepare('SELECT id FROM articulos WHERE handle = ?')
      .bind(v.handle)
      .first<{ id: number }>();
    if (!fila) throw new Error('El artículo no aparece después de crearlo.');
    return { ok: true, id: fila.id };
  } catch (fallo) {
    if (esHandleRepetido(fallo)) return { ok: false, motivo: 'handle' };
    throw fallo;
  }
}

/**
 * Guarda los cambios de un artículo NO archivado, si nadie lo cambió desde
 * `version`. La acción de auditoría la decide la base comparando el estado de
 * antes con el nuevo: pasar a publicado es 'publicar', a borrador
 * 'despublicar' (0003, corrección 1), y lo demás 'editar'.
 */
export async function guardarArticulo(
  db: BaseAdmin,
  id: number,
  v: ValoresArticulo,
  cuerpoHtml: string,
): Promise<Resultado> {
  const publicado = v.publicado ? 1 : 0;
  try {
    const r = await lote(db, [
      db
        .prepare(
          `INSERT INTO auditoria (entidad, entidad_id, accion, antes)
           SELECT 'articulo', CAST(id AS TEXT),
                  CASE WHEN publicado = 0 AND ?1 = 1 THEN 'publicar'
                       WHEN publicado = 1 AND ?1 = 0 THEN 'despublicar'
                       ELSE 'editar' END,
                  ${ANTES}
             FROM articulos WHERE id = ?2 AND version = ?3 AND archivado_en IS NULL`,
        )
        .bind(publicado, id, v.version),
      db
        .prepare(
          `UPDATE articulos SET
             handle = ?1, titulo = ?2, fecha = ?3, autor = ?4, resumen = ?5,
             cuerpo_md = ?6, cuerpo_html = ?7, imagen = ?8, categoria = ?9, publicado = ?10,
             version = version + 1, updated_at = datetime('now')
           WHERE id = ?11 AND version = ?12 AND archivado_en IS NULL`,
        )
        .bind(
          v.handle, v.titulo, v.fecha, v.autor, v.resumen, v.cuerpoMd, cuerpoHtml,
          v.imagen || null, conPrefijo(v.categoria), publicado, id, v.version,
        ),
    ]);
    return r[1]?.meta?.changes === 1 ? { ok: true, id } : { ok: false, motivo: 'conflicto' };
  } catch (fallo) {
    if (esHandleRepetido(fallo)) return { ok: false, motivo: 'handle' };
    throw fallo;
  }
}

/**
 * Archivar (`a = true`) o restaurar. Borrado reversible (B.1): marca
 * `archivado_en`, no borra. Restaurar devuelve el artículo a como estaba —
 * publicado o borrador—, porque deshacer tiene que dejar las cosas igual que
 * antes y no en un tercer estado.
 */
export async function archivarArticulo(
  db: BaseAdmin,
  id: number,
  version: number,
  archivar: boolean,
): Promise<Resultado> {
  const condicion = archivar ? 'archivado_en IS NULL' : 'archivado_en IS NOT NULL';
  const r = await lote(db, [
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion, antes)
         SELECT 'articulo', CAST(id AS TEXT), ?, ${ANTES}
           FROM articulos WHERE id = ? AND version = ? AND ${condicion}`,
      )
      .bind(archivar ? 'archivar' : 'restaurar', id, version),
    db
      .prepare(
        `UPDATE articulos SET
           archivado_en = ${archivar ? "datetime('now')" : 'NULL'},
           version = version + 1, updated_at = datetime('now')
         WHERE id = ? AND version = ? AND ${condicion}`,
      )
      .bind(id, version),
  ]);
  return r[1]?.meta?.changes === 1 ? { ok: true, id } : { ok: false, motivo: 'conflicto' };
}
