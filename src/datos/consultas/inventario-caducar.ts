/**
 * consultas/inventario-caducar.ts — caducar las reservas que vencieron (G.2).
 * ===========================================================================
 * Separado de `inventario-escribir.ts` por responsabilidad: esto es lo único
 * que corre SIN NADIE DELANTE (lo llama el Cron Trigger desde `barrido.ts`), y
 * su regla de seguridad es una sola: `AND estado = 'activa'` en el WHERE, para
 * que dos pasadas solapadas del cron no resten el reservado dos veces.
 *
 * La otra llamada es la tercera red de G.2: `reservar()` caduca lo vencido de
 * las variantes que va a reservar justo antes de hacerlo.
 */

import type { BaseD1Escritura } from './inventario-formas';

/**
 * EL BARRIDO: caducar las reservas vencidas. Lo llama el Cron Trigger (G.2).
 *
 * `AND estado = 'activa'` en el WHERE es lo que hace que dos ejecuciones
 * solapadas del cron no resten el reservado dos veces. Es la única protección
 * que no depende de nadie.
 *
 * `limite` acotado porque el cron corre cada 5 minutos y es mejor dejar 200
 * para la vuelta siguiente que agotar el tiempo de una invocación.
 */
export async function caducarVencidas(
  db: BaseD1Escritura,
  limite = 200,
): Promise<number> {
  const tope = Math.min(Math.max(1, Math.trunc(limite)), 1000);
  const { results } = await db
    .prepare(
      `SELECT id, variante_id, cantidad FROM reservas
        WHERE estado = 'activa' AND vence_en <= datetime('now')
        ORDER BY vence_en LIMIT ?`,
    )
    .bind(tope)
    .all<{ id: number; variante_id: number; cantidad: number }>();

  return cerrarCaducadas(db, results);
}

/**
 * Caducar lo vencido SOLO de unas variantes. La tercera red de G.2.
 *
 * La llama `reservar()` justo antes de reservar: dos o tres variantes, no la
 * tabla entera. Cierra el caso de "no puedo comprar porque alguien abandonó un
 * checkout hace 31 minutos y el cron pasa dentro de cuatro".
 */
export async function caducarVencidasDe(
  db: BaseD1Escritura,
  varianteIds: number[],
): Promise<number> {
  if (!varianteIds.length) return 0;
  const marcas = varianteIds.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT id, variante_id, cantidad FROM reservas
        WHERE estado = 'activa' AND vence_en <= datetime('now')
          AND variante_id IN (${marcas})`,
    )
    .bind(...varianteIds)
    .all<{ id: number; variante_id: number; cantidad: number }>();

  return cerrarCaducadas(db, results);
}

/** Cierra un lote de reservas vencidas. Compartido por los dos barridos. */
async function cerrarCaducadas(
  db: BaseD1Escritura,
  filas: { id: number; variante_id: number; cantidad: number }[],
): Promise<number> {
  let caducadas = 0;
  for (const r of filas) {
    /* `AND estado = 'activa'`: dos ejecuciones solapadas del cron no restan el
       reservado dos veces. Es la única protección que no depende de nadie. */
    const cerrada = await db
      .prepare(
        `UPDATE reservas SET estado = 'caducada', cerrada_en = datetime('now')
          WHERE id = ?1 AND estado = 'activa'`,
      )
      .bind(r.id)
      .run();
    if (!cerrada.meta.changes) continue;

    const bajada = await db
      .prepare(
        `UPDATE variantes SET stock_reservado = stock_reservado - ?2
          WHERE id = ?1 AND stock_reservado >= ?2`,
      )
      .bind(r.variante_id, r.cantidad)
      .run();
    if (!bajada.meta.changes) {
      console.error(
        `[inventario] BUG: reservado insuficiente al caducar la reserva ${r.id} ` +
          `(variante ${r.variante_id}, ${r.cantidad} ud). Revisar el cuadre.`,
      );
      continue;
    }

    await db
      .prepare(
        `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, reserva_id)
         VALUES (?1, ?2, 'reservado', 'reserva_caducada', 'cron', ?3)`,
      )
      .bind(r.variante_id, -r.cantidad, r.id)
      .run();
    caducadas += 1;
  }
  return caducadas;
}