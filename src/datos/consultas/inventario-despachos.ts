/**
 * consultas/inventario-despachos.ts — la lista de «Productos a despachar» y el
 * interruptor del inventario. Lo que hace Andreina con los PAQUETES, no con
 * las cantidades.
 * ===========================================================================
 * Separado de `inventario-panel.ts` por el límite de tamaño del repo, con el
 * corte natural: aquello cambia cuántas unidades hay; esto cambia en qué
 * estado está un paquete (y la única cantidad que toca, al anular, la saca del
 * libro). Mismas reglas: todo en un `batch()` encadenado con `changes()`, la
 * condición en el WHERE, y sin `LIKE`. Ver la cabecera de `inventario-panel.ts`.
 */

import type { BaseD1Escritura } from './inventario-formas';
import { MINUTOS_PARA_DESHACER } from './inventario-panel';

/* SOBRE `entidad_id` EN LA AUDITORÍA: se pasa como `String(id)` y no con
   `CAST(? AS TEXT)`. D1 enlaza los números de JavaScript como REAL, y el CAST
   de un REAL da '4.0': el historial de «¿qué le pasó al paquete 4?» no lo
   encontraría buscando '4'. Comprobado en local. */

/* ------------------------------------------------------------------ despachos */

/**
 * «Ya salió» o «Anular». Condicional (`AND estado = 'pendiente'`): el doble
 * toque de un dedo nervioso no lo hace dos veces.
 *
 * «Ya salió» no toca el stock: bajó al cobrar o al vender (G.3, paso 5). Deja
 * auditoría, que es lo único que responde «¿cuándo salió el de Marcela?».
 *
 * «Anular» DEVUELVE A LA ESTANTERÍA LO QUE ESE PAQUETE SACÓ (G.4.3), y lo
 * calcula DEL LIBRO: la suma de los movimientos de físico con ese
 * `despacho_id`. Vale igual para los dos orígenes —`venta_bold` y
 * `venta_whatsapp` escriben su `despacho_id`— sin depender de `pedido_items`,
 * que todavía no existe. Y es exacto en los casos raros: una línea de Bold
 * que se cobró SIN unidad (caso 5, `sin_stock`) nunca bajó el físico, así que
 * no se devuelve; una venta de WhatsApp ya deshecha suma 0 y tampoco.
 *
 * Orden de las sentencias, que importa: primero el stock (leyendo el libro tal
 * como está) y DESPUÉS los movimientos de devolución; al revés, la suma ya
 * incluiría la devolución y daría 0.
 */
export async function cerrarDespacho(
  db: BaseD1Escritura,
  despachoId: number,
  accion: 'despachado' | 'anulado',
  nota?: string | null,
): Promise<boolean> {
  if (accion === 'despachado') {
    const r = await db.batch([
      db
        .prepare(
          `UPDATE despachos SET estado = 'despachado', despachado_en = datetime('now')
            WHERE id = ?1 AND estado = 'pendiente'`,
        )
        .bind(despachoId),
      db
        .prepare(
          `INSERT INTO auditoria (entidad, entidad_id, accion, nota)
           SELECT 'despacho', ?1, 'despachar', ?2 WHERE changes() = 1`,
        )
        .bind(String(despachoId), nota?.trim() || null),
    ]);
    return Boolean(r[0]?.meta.changes);
  }

  const libro = `SELECT variante_id, SUM(cantidad) AS neto FROM movimientos
                  WHERE despacho_id = ?1 AND afecta = 'fisico'
                  GROUP BY variante_id HAVING SUM(cantidad) < 0`;
  const r = await db.batch([
    db
      .prepare(`UPDATE despachos SET estado = 'anulado' WHERE id = ?1 AND estado = 'pendiente'`)
      .bind(despachoId),
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion, nota)
         SELECT 'despacho', ?1, 'anular', ?2 WHERE changes() = 1`,
      )
      .bind(String(despachoId), nota?.trim() || null),
    /* `changes() = 1` aquí mira la auditoría, que solo se escribió si el
       paquete se anuló de verdad en esta llamada. */
    db
      .prepare(
        `UPDATE variantes
            SET stock_fisico = stock_fisico - (SELECT l.neto FROM (${libro}) l
                                                WHERE l.variante_id = variantes.id)
          WHERE changes() = 1 AND id IN (SELECT variante_id FROM (${libro}))`,
      )
      .bind(despachoId),
    db
      .prepare(
        `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, despacho_id, nota)
         SELECT l.variante_id, -l.neto, 'fisico', 'devolucion', 'panel', ?1, ?2
           FROM (${libro}) l WHERE changes() > 0`,
      )
      .bind(despachoId, nota?.trim() || 'paquete anulado: vuelve a la estantería'),
  ]);
  return Boolean(r[0]?.meta.changes);
}

/** Deshacer «Ya salió» poco después: el paquete vuelve a la lista. */
export async function reabrirDespacho(db: BaseD1Escritura, despachoId: number): Promise<boolean> {
  const r = await db.batch([
    db
      .prepare(
        `UPDATE despachos SET estado = 'pendiente', despachado_en = NULL
          WHERE id = ?1 AND estado = 'despachado' AND despachado_en >= datetime('now', ?2)`,
      )
      .bind(despachoId, `-${MINUTOS_PARA_DESHACER} minutes`),
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion)
         SELECT 'despacho', ?1, 'reabrir' WHERE changes() = 1`,
      )
      .bind(String(despachoId)),
  ]);
  return Boolean(r[0]?.meta.changes);
}

/** «Ponerle nombre»: para que el paquete diga «Para Marcela». Solo WhatsApp. */
export async function nombrarDespacho(
  db: BaseD1Escritura,
  despachoId: number,
  cliente: string,
): Promise<boolean> {
  const limpio = cliente.trim().slice(0, 80) || null;
  const r = await db
    .prepare(
      `UPDATE despachos SET cliente = ?2
        WHERE id = ?1 AND origen = 'whatsapp' AND estado = 'pendiente'`,
    )
    .bind(despachoId, limpio)
    .run();
  return Boolean(r.meta.changes);
}

/* ------------------------------------------------------------ el interruptor */

/**
 * Encender o apagar el inventario (`ajustes.inventario_activo`). R13.
 *
 * UPSERT y no UPDATE: si la fila faltara (base a medio migrar), apagar tiene
 * que funcionar igual —es la vuelta atrás—. El `WHERE` del `DO UPDATE` hace
 * que pulsar dos veces no escriba dos auditorías.
 */
export async function cambiarInterruptor(db: BaseD1Escritura, activo: boolean): Promise<boolean> {
  const valor = activo ? '1' : '0';
  const r = await db.batch([
    db
      .prepare(
        `INSERT INTO ajustes (clave, valor, updated_at) VALUES ('inventario_activo', ?1, datetime('now'))
         ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at
          WHERE ajustes.valor <> excluded.valor`,
      )
      .bind(valor),
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion, antes)
         SELECT 'ajuste', 'inventario_activo', ?1, json_object('valor', ?2) WHERE changes() = 1`,
      )
      .bind(activo ? 'activar' : 'desactivar', activo ? '0' : '1'),
  ]);
  return Boolean(r[0]?.meta.changes);
}
