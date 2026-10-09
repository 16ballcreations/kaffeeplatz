/**
 * consultas/imagenes-escribir.ts — lo que el panel de fotos ESCRIBE en D1.
 *
 * TODO VA EN UN `batch()`, NUNCA CON BEGIN/COMMIT
 * ===========================================================================
 * D1 remoto no acepta `BEGIN TRANSACTION`, y `batch()` corre las sentencias
 * juntas en una transacción implícita (patrón 2 de A.6). Cada operación de
 * este fichero es UN batch: el cambio, la auditoría y el recálculo de
 * portadas pasan juntos o no pasa ninguno. Una foto reordenada sin su línea de
 * auditoría, o con la portada vieja apuntando a otra, no puede quedar a medias.
 *
 * LAS PORTADAS SE RECALCULAN SIEMPRE AL FINAL
 * ---------------------------------------------------------------------------
 * `sincronizarPortadas` va detrás de TODA escritura. La razón está en
 * `src/admin/fotos-orden.ts`: la portada es «la primera», y guardarla en
 * `portada_id` es solo dejarlo escrito para quien lo lea. Recalcularla en un
 * sitio, siempre, es más barato que razonar en cada operación cuál cambió.
 *
 * LA AUDITORIA GUARDA EL ANTES ENTERO
 * ---------------------------------------------------------------------------
 * Sobre todo al quitar una foto: la fila desaparece, pero el objeto en R2 se
 * conserva (B.7, punto 9: «borrado reversible también aquí») y la línea de
 * `auditoria` con `antes` es lo que permite devolverla a su sitio o, pasado un
 * tiempo, saber qué claves de R2 ya no usa nadie y limpiarlas.
 */
import type { BaseAdmin, ResultadoEscritura } from '../../admin/base';
import type { FotoPanel } from './imagenes-panel';

type Sentencia = ReturnType<ReturnType<BaseAdmin['prepare']>['bind']>;

function lote(db: BaseAdmin, sentencias: Sentencia[]): Promise<ResultadoEscritura[]> {
  if (!db.batch) throw new Error('Este binding de D1 no ofrece batch(): no se escribe a medias.');
  return db.batch(sentencias);
}

/**
 * Las dos portadas, recalculadas desde el orden. Ver la cabecera.
 *
 * Las dos SOLO con fotos publicadas (`por_revisar = 0`). Desde que las fotos
 * viven dentro de la ficha del producto, una foto subida en la tarjeta
 * «Verde» ya tiene `variante_id` y espera, `por_revisar`, a que se pulse
 * «Guardar esta versión»: hasta entonces la tienda no la enseña
 * (consultas/productos.ts filtra igual), y una portada que la tienda no
 * enseña sería una portada rota.
 */
export function sincronizarPortadas(db: BaseAdmin, productoId: number): Sentencia[] {
  return [
    db
      .prepare(
        `UPDATE productos SET portada_id =
           (SELECT id FROM imagenes WHERE producto_id = ?1 AND por_revisar = 0
             ORDER BY orden, id LIMIT 1)
         WHERE id = ?1`,
      )
      .bind(productoId),
    db
      .prepare(
        `UPDATE variantes SET portada_id =
           (SELECT i.id FROM imagenes i
             WHERE i.variante_id = variantes.id AND i.por_revisar = 0
             ORDER BY i.orden, i.id LIMIT 1)
         WHERE producto_id = ?1`,
      )
      .bind(productoId),
  ];
}

function auditar(
  db: BaseAdmin,
  entidadId: number | string,
  accion: 'crear' | 'editar' | 'reordenar' | 'borrar',
  antes: unknown,
  nota: string,
): Sentencia {
  return db
    .prepare(`INSERT INTO auditoria (entidad, entidad_id, accion, antes, nota) VALUES ('imagen', ?, ?, ?, ?)`)
    .bind(String(entidadId), accion, antes === null ? null : JSON.stringify(antes), nota);
}

export interface FotoNueva {
  clave: string;
  alt: string;
  ancho: number;
  alto: number;
  nombreOriginal: string;
  /** La versión donde se subió (o la que sugirió el nombre). `null` = del producto. */
  varianteId: number | null;
  /** La toma que sugirió el nombre, si la hay. */
  rol: string | null;
}

/**
 * Una foto recién subida: al final de la lista, en la sección donde se subió
 * (o la que sugirió su nombre en «Subir varias») y marcada `por_revisar`.
 *
 * `por_revisar` ya no significa «sin variante»: significa «todavía no
 * publicada». Se publica cuando se guarda el bloque donde está, que es el
 * momento en que la dueña la ha visto en su sitio. Un nombre mal escrito no
 * publica nada en el color equivocado: deja la foto, sin publicar, en una
 * tarjeta donde salta a la vista. Devuelve su id.
 */
export async function insertarFoto(db: BaseAdmin, productoId: number, f: FotoNueva): Promise<number> {
  const r = await lote(db, [
    db
      .prepare(
        `INSERT INTO imagenes (producto_id, variante_id, rol, clave, alt, ancho, alto, orden, nombre_original, por_revisar)
         VALUES (?1,
                 (SELECT id FROM variantes WHERE id = ?7 AND producto_id = ?1),
                 (SELECT id FROM roles_imagen WHERE id = ?8),
                 ?2, ?3, ?4, ?5,
                 (SELECT COALESCE(MAX(orden) + 1, 0) FROM imagenes WHERE producto_id = ?1), ?6, 1)`,
      )
      /* Variante y rol pasan por un SELECT: si la versión se quitó entre la
         lectura y la subida, la foto cae en el producto en vez de fallar. */
      .bind(productoId, f.clave, f.alt, f.ancho, f.alto, f.nombreOriginal, f.varianteId, f.rol),
    /* `last_insert_rowid()` es el de la sentencia anterior: el batch corre en
       orden sobre la misma conexión. */
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion, antes, nota)
         VALUES ('imagen', CAST(last_insert_rowid() AS TEXT), 'crear', NULL, ?)`,
      )
      .bind(`subida: ${f.nombreOriginal}`),
    ...sincronizarPortadas(db, productoId),
  ]);
  const id = r[0]?.meta?.last_row_id;
  if (!id) throw new Error('D1 no devolvió el id de la foto nueva.');
  return id;
}

export interface Asignacion {
  id: number;
  varianteId: number | null;
  rol: string | null;
  alt: string;
}

/**
 * Las sentencias que guardan versión, rol y alt de las fotos de UN bloque, y
 * las dan por publicadas. No las ejecuta: van dentro del `batch()` del bloque
 * (consultas/productos-escribir.ts), DETRÁS de su cerrojo, para que un
 * conflicto no deje las fotos guardadas y los datos no, ni al revés.
 *
 * Solo escribe (y audita) las que cambian de verdad, más las que esperaban
 * publicarse: guardar el bloque ES publicarlas, aunque nada más cambie. La
 * validación (que la versión sea de este producto, que el rol exista, que el
 * alt no esté vacío) la hace quien llama, contra los datos que acaba de leer.
 */
export function sentenciasAsignaciones(
  db: BaseAdmin,
  productoId: number,
  actuales: FotoPanel[],
  cambios: Asignacion[],
): { sentencias: Sentencia[]; cambiadas: number; publicadas: number } {
  const porId = new Map(actuales.map((f) => [f.id, f]));
  const sentencias: Sentencia[] = [];
  let cambiadas = 0;
  let publicadas = 0;
  for (const c of cambios) {
    const a = porId.get(c.id);
    if (!a) continue;
    const igual = a.varianteId === c.varianteId && a.rol === c.rol && a.alt === c.alt;
    if (igual && !a.porRevisar) continue;
    if (a.porRevisar) publicadas++;
    else cambiadas++;
    sentencias.push(
      db
        .prepare(
          `UPDATE imagenes SET variante_id = ?, rol = ?, alt = ?, por_revisar = 0
            WHERE id = ? AND producto_id = ?`,
        )
        .bind(c.varianteId, c.rol, c.alt, c.id, productoId),
      auditar(
        db,
        c.id,
        'editar',
        { variante_id: a.varianteId, rol: a.rol, alt: a.alt, por_revisar: a.porRevisar ? 1 : 0 },
        a.porRevisar ? 'publicada al guardar su bloque' : 'versión, toma o descripción cambiada',
      ),
    );
  }
  return { sentencias, cambiadas, publicadas };
}

/**
 * Escribe un orden nuevo: `ids` es la lista COMPLETA del producto, en el orden
 * deseado (la calcula `src/admin/fotos-orden.ts`). Se renumera 0..n-1 y solo
 * se escriben las filas cuyo número cambia.
 */
export async function guardarOrden(
  db: BaseAdmin,
  productoId: number,
  actuales: FotoPanel[],
  ids: number[],
  nota: string,
): Promise<void> {
  const antes = new Map(actuales.map((f) => [f.id, f.orden]));
  const sentencias: Sentencia[] = [];
  ids.forEach((id, orden) => {
    if (antes.get(id) === orden) return;
    sentencias.push(
      db.prepare('UPDATE imagenes SET orden = ? WHERE id = ? AND producto_id = ?').bind(orden, id, productoId),
    );
  });
  if (!sentencias.length) return;
  sentencias.push(
    auditar(db, ids[0] ?? 0, 'reordenar', actuales.map((f) => [f.id, f.orden]), nota),
  );
  await lote(db, [...sentencias, ...sincronizarPortadas(db, productoId)]);
}

/**
 * Quita una foto del producto. La fila se borra; el fichero en R2 NO (ver la
 * cabecera): la auditoría guarda la fila entera para poder devolverla.
 */
export async function quitarFoto(db: BaseAdmin, productoId: number, foto: FotoPanel): Promise<void> {
  await lote(db, [
    auditar(db, foto.id, 'borrar', foto, 'quitada desde el panel; el fichero se conserva en R2'),
    db.prepare('DELETE FROM imagenes WHERE id = ? AND producto_id = ?').bind(foto.id, productoId),
    ...sincronizarPortadas(db, productoId),
  ]);
}
