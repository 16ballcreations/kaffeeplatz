/**
 * consultas/inventario-panel.ts — lo que Andreina hace a mano con el stock.
 * ===========================================================================
 * Cargar mercancía, vender por WhatsApp, corregir la cuenta, deshacer y
 * retirar de la venta. Diseño en G.3 (flujo 2), G.4 y G.6 de
 * `planes/kaffeeplatz-panel-admin.md`. Los paquetes («Ya salió», anular) y el
 * interruptor del inventario están en `inventario-despachos.ts`.
 *
 * TODO VA EN UN SOLO `batch()`, Y ASÍ SE RAMIFICA SIN JAVASCRIPT
 * ---------------------------------------------------------------------------
 * `batch()` es una transacción implícita en D1: o pasa todo o no pasa nada.
 * Es lo que hace que un movimiento del libro NUNCA quede sin su cambio de
 * stock ni al revés, que es la promesa del cuadre (G.4.4: «una sola fila es un
 * bug»).
 *
 * El problema conocido de `batch()` es que no se puede mirar el resultado de
 * la sentencia 1 para decidir si se manda la 2 (ver la cabecera de `reservar`
 * en `inventario-escribir.ts`). Aquí se resuelve DENTRO de SQLite: la primera
 * sentencia es el `UPDATE` con la condición en el WHERE (la regla de siempre,
 * G.4.1) y cada sentencia siguiente lleva `WHERE changes() = 1`. `changes()`
 * es la cuenta de filas de la sentencia ANTERIOR en la misma conexión, y el
 * batch corre todas en la misma conexión y en orden. Si la guarda no pasó,
 * todo lo demás se convierte en "insertar cero filas": no hay ventana, no hay
 * compensación, y no hay ninguna rama en JavaScript.
 *
 * Se comprobó en local (workerd) antes de escribir esto, incluido que
 * `last_insert_rowid()` encadena dentro del batch: el despacho recién creado
 * le da su id al artículo, y el artículo al movimiento.
 *
 * Y SIN `LIKE` NI `GLOB`: D1 remoto ya rompió reservas una vez con patrones.
 * Las comparaciones de texto de este fichero son de igualdad exacta.
 */

import type { BaseD1Escritura, ResultadoVentaWhatsapp } from './inventario-formas';
import { stockExacto } from './inventario-leer';
import { TITULO_SQL } from './inventario-panel-leer';

/** Cuánto tiempo se puede deshacer algo. La franja de G.6 dice «unos segundos»;
    15 minutos cubren el «uy, me equivoqué» de quien se dio cuenta al rato. */
export const MINUTOS_PARA_DESHACER = 15;


/** El resultado común de los cambios de cantidad. */
export interface ResultadoAjuste {
  ok: boolean;
  /** Clave del mensaje que el panel enseña si no se pudo. Nunca un error de SQL. */
  error?: 'cero' | 'nota' | 'no-existe' | 'cambio' | 'no-deshacible' | 'paquete-cerrado';
  movimientoId?: number;
  fisico?: number;
}

/** Fila de `SELECT` final de los batch: lo que se acaba de escribir. */
interface Escrito {
  movimiento_id: number | null;
  fisico: number | null;
}

/* ----------------------------------------------------------------- cantidades */

/**
 * Sumar o restar al físico con un motivo: «Llegó mercancía», «Me devolvieron
 * una», «Se rompió o se perdió», «Corregir la cuenta».
 *
 * Sin guarda de `>= 0` a propósito: el negativo es lo que pasó en el mundo
 * (G.4.4) y el panel lo enseña en rojo. La nota es obligatoria para `ajuste` y
 * la exige esta función —no la base—, para poder decir «escribe por qué» en vez
 * de enseñar un error de CHECK.
 */
export async function ajustarFisico(
  db: BaseD1Escritura,
  entrada: {
    varianteId: number;
    delta: number;
    motivo: 'entrada' | 'devolucion' | 'ajuste';
    nota?: string | null;
  },
): Promise<ResultadoAjuste> {
  const delta = Math.trunc(entrada.delta);
  const nota = entrada.nota?.trim() || null;
  if (!delta) return { ok: false, error: 'cero' };
  if (entrada.motivo === 'ajuste' && !nota) return { ok: false, error: 'nota' };

  const r = await db.batch([
    db
      .prepare('UPDATE variantes SET stock_fisico = stock_fisico + ?2 WHERE id = ?1')
      .bind(entrada.varianteId, delta),
    db
      .prepare(
        `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, nota)
         SELECT ?1, ?2, 'fisico', ?3, 'panel', ?4 WHERE changes() = 1`,
      )
      .bind(entrada.varianteId, delta, entrada.motivo, nota),
    db
      .prepare(
        `SELECT last_insert_rowid() AS movimiento_id, stock_fisico AS fisico
           FROM variantes WHERE id = ?1`,
      )
      .bind(entrada.varianteId),
  ]);
  if (!r[0]?.meta.changes) return { ok: false, error: 'no-existe' };
  const e = (r[2]?.results?.[0] ?? null) as Escrito | null;
  return { ok: true, movimientoId: e?.movimiento_id ?? undefined, fisico: e?.fisico ?? undefined };
}

/**
 * «Corregir la cuenta» con el número de verdad: «hay 3, no 4».
 *
 * `anterior` es el número que Andreina VEÍA al abrir el formulario, y va en el
 * WHERE: si alguien vendió una unidad por la tienda entre que abrió y guardó,
 * el UPDATE no casa y se le dice «la cuenta cambió mientras tanto», en vez de
 * pisar una venta con un número viejo. Es la misma regla de G.4.1 (nunca leer,
 * decidir y escribir) aplicada a un formulario.
 */
export async function fijarFisico(
  db: BaseD1Escritura,
  entrada: { varianteId: number; anterior: number; nuevo: number; nota?: string | null },
): Promise<ResultadoAjuste> {
  const anterior = Math.trunc(entrada.anterior);
  const nuevo = Math.trunc(entrada.nuevo);
  const nota = entrada.nota?.trim() || null;
  if (nuevo === anterior) return { ok: false, error: 'cero' };
  if (!nota) return { ok: false, error: 'nota' };

  const r = await db.batch([
    db
      .prepare('UPDATE variantes SET stock_fisico = ?3 WHERE id = ?1 AND stock_fisico = ?2')
      .bind(entrada.varianteId, anterior, nuevo),
    db
      .prepare(
        `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, nota)
         SELECT ?1, ?2, 'fisico', 'ajuste', 'panel', ?3 WHERE changes() = 1`,
      )
      .bind(entrada.varianteId, nuevo - anterior, nota),
    db
      .prepare(
        `SELECT last_insert_rowid() AS movimiento_id, stock_fisico AS fisico
           FROM variantes WHERE id = ?1`,
      )
      .bind(entrada.varianteId),
  ]);
  if (!r[0]?.meta.changes) return { ok: false, error: 'cambio' };
  const e = (r[2]?.results?.[0] ?? null) as Escrito | null;
  return { ok: true, movimientoId: e?.movimiento_id ?? undefined, fisico: e?.fisico ?? undefined };
}

/* ------------------------------------------------------------------- WhatsApp */

/**
 * VENDIDO POR WHATSAPP. El toque de G.3, flujo 2.
 *
 * Crea el paquete (`despachos`, origen 'whatsapp', NACE `pendiente`: muchas
 * veces sale al día siguiente y esa es la lista que pidió el cliente), su
 * artículo, baja el físico y escribe el movimiento. Todo o nada.
 *
 * LA GUARDA RESPETA A QUIEN ESTÁ PAGANDO (G.4.2): descuenta solo si
 * `físico − reservas VIGENTES >= n`. Vigentes y no la columna, para que una
 * reserva que venció hace un minuto no bloquee una venta real. Si no alcanza
 * NO FALLA: devuelve los números para que el panel PREGUNTE («alguien lo está
 * pagando ahora mismo, le quedan 23 minutos»). `forzar` es «Venderlo igual»:
 * deja el stock negativo a propósito y lo anota para revisar.
 *
 * `despachoId` es «Añadir otra cosa al mismo paquete». Solo vale para un
 * paquete de WhatsApp todavía pendiente, y esa condición va en la MISMA guarda
 * del UPDATE: si el paquete ya salió, no se descuenta nada.
 */
export async function venderPorWhatsapp(
  db: BaseD1Escritura,
  entrada: {
    varianteId: number;
    cantidad?: number;
    cliente?: string | null;
    despachoId?: number | null;
    forzar?: boolean;
  },
): Promise<ResultadoVentaWhatsapp> {
  const n = Math.max(1, Math.trunc(entrada.cantidad ?? 1));
  const paquete = entrada.despachoId ?? null;
  const forzar = entrada.forzar ? 1 : 0;
  const cliente = entrada.cliente?.trim() || null;

  const guarda = db
    .prepare(
      `UPDATE variantes SET stock_fisico = stock_fisico - ?2
        WHERE id = ?1
          AND (?3 = 1 OR stock_fisico - COALESCE((
                SELECT SUM(r.cantidad) FROM reservas r
                 WHERE r.variante_id = ?1 AND r.estado = 'activa'
                   AND r.vence_en > datetime('now')), 0) >= ?2)
          AND (?4 IS NULL OR EXISTS (
                SELECT 1 FROM despachos d
                 WHERE d.id = ?4 AND d.estado = 'pendiente' AND d.origen = 'whatsapp'))`,
    )
    .bind(entrada.varianteId, n, forzar, paquete);

  /* El paquete: nuevo, o el que ya estaba abierto. `last_insert_rowid()` del
     INSERT del despacho es lo que recibe el artículo. */
  const sentencias = paquete
    ? [
        guarda,
        db
          .prepare(
            `INSERT INTO despacho_items (despacho_id, variante_id, cantidad, titulo)
             SELECT ?3, v.id, ?2, ${TITULO_SQL}
               FROM variantes v JOIN productos p ON p.id = v.producto_id
              WHERE v.id = ?1 AND changes() = 1`,
          )
          .bind(entrada.varianteId, n, paquete),
      ]
    : [
        guarda,
        db
          .prepare(
            `INSERT INTO despachos (origen, pedido_id, cliente, estado)
             SELECT 'whatsapp', NULL, ?1, 'pendiente' WHERE changes() = 1`,
          )
          .bind(cliente),
        db
          .prepare(
            `INSERT INTO despacho_items (despacho_id, variante_id, cantidad, titulo)
             SELECT last_insert_rowid(), v.id, ?2, ${TITULO_SQL}
               FROM variantes v JOIN productos p ON p.id = v.producto_id
              WHERE v.id = ?1 AND changes() = 1`,
          )
          .bind(entrada.varianteId, n),
      ];

  sentencias.push(
    /* El movimiento cuelga del despacho a través del artículo recién creado:
       así el libro sabe a qué paquete pertenece cada unidad, y anular el
       paquete puede devolver exactamente lo que salió (ver `cerrarDespacho`). */
    db
      .prepare(
        `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, despacho_id, nota)
         SELECT ?1, -?2, 'fisico', 'venta_whatsapp', 'panel', di.despacho_id, ?3
           FROM despacho_items di WHERE di.id = last_insert_rowid() AND changes() = 1`,
      )
      .bind(
        entrada.varianteId,
        n,
        forzar ? 'vendido igual aunque alguien lo estaba pagando: revisar' : null,
      ),
    db.prepare(
      `SELECT m.id AS movimiento_id, m.despacho_id FROM movimientos m
        WHERE m.id = last_insert_rowid() AND changes() = 1`,
    ),
  );

  const r = await db.batch(sentencias);
  const escrito = r[r.length - 1]?.results?.[0] as
    | { movimiento_id: number; despacho_id: number }
    | undefined;

  if (r[0]?.meta.changes && escrito) {
    return {
      ok: true,
      motivo: null,
      despachoId: escrito.despacho_id,
      movimientoId: escrito.movimiento_id,
      forzado: Boolean(forzar),
    };
  }

  /* No se descontó. NO es un error: se averigua por qué, para preguntar. */
  const s = (await stockExacto(db, [entrada.varianteId])).get(entrada.varianteId);
  if (!s) return { ok: false, motivo: 'no-existe', despachoId: null };
  if (paquete && s.vendible >= n) {
    return { ok: false, motivo: 'paquete-cerrado', despachoId: paquete };
  }
  const proxima = await db
    .prepare(
      `SELECT MIN(vence_en) AS proxima FROM reservas
        WHERE variante_id = ? AND estado = 'activa' AND vence_en > datetime('now')`,
    )
    .bind(entrada.varianteId)
    .first<{ proxima: string | null }>();
  return {
    ok: false,
    motivo: s.fisico - s.vendible > 0 ? 'reservado' : 'sin-stock',
    despachoId: null,
    fisico: s.fisico,
    reservado: s.fisico - s.vendible,
    vendible: s.vendible,
    reservaVenceEn: proxima?.proxima ?? null,
  };
}

/* -------------------------------------------------------------------- deshacer */

/**
 * DESHACER un movimiento del panel. Escribe el CONTRARIO; nunca borra (G.6:
 * «el libro cuenta lo que pasó, incluidos los errores»).
 *
 * Solo lo reciente (`MINUTOS_PARA_DESHACER`), solo lo del panel y solo sobre
 * el físico. Las ventas de la tienda y las reservas no se deshacen desde aquí:
 * tienen un pago detrás.
 *
 * Que no se pueda deshacer DOS VECES lo impide la base, no la pantalla: el
 * contrario lleva la nota `deshecho #<id>` y la propia guarda del UPDATE
 * comprueba que no exista. Dos toques nerviosos son dos batch en serie; el
 * segundo ya ve la marca del primero.
 *
 * Una venta por WhatsApp se deshace como DEVOLUCIÓN del mismo paquete (así la
 * suma del libro por paquete vuelve a 0 y anular no devolvería dos veces), se
 * retira su artículo del paquete, y si el paquete se queda vacío se anula: un
 * paquete sin nada dentro en la lista de despachos sería un paquete fantasma.
 * El artículo SÍ se borra: `despacho_items` es la lista de qué meter en la
 * caja, no el libro. El libro es `movimientos`, y ahí queda todo.
 */
export async function deshacerMovimiento(
  db: BaseD1Escritura,
  movimientoId: number,
): Promise<ResultadoAjuste> {
  const m = await db
    .prepare(
      `SELECT id, variante_id, cantidad, motivo, despacho_id FROM movimientos
        WHERE id = ?1 AND quien = 'panel' AND afecta = 'fisico'
          AND motivo IN ('entrada', 'devolucion', 'ajuste', 'venta_whatsapp')
          -- Lo que cuelga de un paquete solo se deshace si es la venta misma:
          -- la devolución de un paquete ANULADO no se "des-devuelve" desde aquí.
          AND (motivo = 'venta_whatsapp' OR despacho_id IS NULL)
          AND created_at >= datetime('now', ?2)`,
    )
    .bind(movimientoId, `-${MINUTOS_PARA_DESHACER} minutes`)
    .first<{
      id: number;
      variante_id: number;
      cantidad: number;
      motivo: string;
      despacho_id: number | null;
    }>();
  if (!m) return { ok: false, error: 'no-deshacible' };

  const marca = `deshecho #${m.id}`;
  const esVenta = m.motivo === 'venta_whatsapp';
  const sentencias = [
    db
      .prepare(
        `UPDATE variantes SET stock_fisico = stock_fisico - ?2
          WHERE id = ?1
            AND NOT EXISTS (SELECT 1 FROM movimientos
                             WHERE variante_id = ?1 AND nota = ?3)
            AND (?4 IS NULL OR EXISTS (SELECT 1 FROM despachos
                                        WHERE id = ?4 AND estado = 'pendiente'))`,
      )
      .bind(m.variante_id, m.cantidad, marca, esVenta ? m.despacho_id : null),
    db
      .prepare(
        `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, despacho_id, nota)
         SELECT ?1, ?2, 'fisico', ?3, 'panel', ?4, ?5 WHERE changes() = 1`,
      )
      .bind(
        m.variante_id,
        -m.cantidad,
        esVenta ? 'devolucion' : 'ajuste',
        esVenta ? m.despacho_id : null,
        marca,
      ),
  ];
  if (esVenta && m.despacho_id) {
    sentencias.push(
      db
        .prepare(
          `DELETE FROM despacho_items
            WHERE id = (SELECT MAX(id) FROM despacho_items
                         WHERE despacho_id = ?1 AND variante_id = ?2 AND cantidad = ?3)
              AND changes() = 1`,
        )
        .bind(m.despacho_id, m.variante_id, -m.cantidad),
      db
        .prepare(
          `UPDATE despachos SET estado = 'anulado'
            WHERE id = ?1 AND estado = 'pendiente'
              AND NOT EXISTS (SELECT 1 FROM despacho_items WHERE despacho_id = ?1)`,
        )
        .bind(m.despacho_id),
    );
  }
  const r = await db.batch(sentencias);
  if (!r[0]?.meta.changes) {
    /* Solo para elegir la FRASE: la decisión ya la tomó la guarda. */
    const yaEstaba = await db
      .prepare('SELECT 1 AS si FROM movimientos WHERE variante_id = ?1 AND nota = ?2 LIMIT 1')
      .bind(m.variante_id, marca)
      .first<{ si: number }>();
    return { ok: false, error: esVenta && !yaEstaba ? 'paquete-cerrado' : 'no-deshacible' };
  }
  return { ok: true };
}

/* SOBRE `entidad_id` EN LA AUDITORÍA: se pasa como `String(id)` y no con
   `CAST(? AS TEXT)`. D1 enlaza los números de JavaScript como REAL, y el CAST
   de un REAL da '4.0': el historial de «¿qué le pasó al paquete 4?» no lo
   encontraría buscando '4'. Comprobado en local. */

/* ------------------------------------------------------------------ a la venta */

/**
 * El interruptor manual «A la venta / Retirado» (G.1). NO toca el stock.
 *
 * Con auditoría (`variante`/`editar`), porque «¿por qué no sale la Chemex?»
 * tiene que tener respuesta. `productos.disponible` se rederiva en el mismo
 * batch: es la columna DERIVADA de 0001 («mantenida al guardar»), y es la que
 * lee el sitio con el inventario apagado.
 */
export async function ponerALaVenta(
  db: BaseD1Escritura,
  varianteId: number,
  aLaVenta: boolean,
): Promise<boolean> {
  const valor = aLaVenta ? 1 : 0;
  const r = await db.batch([
    db
      .prepare('UPDATE variantes SET disponible = ?2 WHERE id = ?1 AND disponible <> ?2')
      .bind(varianteId, valor),
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion, antes, nota)
         SELECT 'variante', ?1, 'editar', json_object('disponible', CAST(1 - ?2 AS INTEGER)), ?3
          WHERE changes() = 1`,
      )
      .bind(String(varianteId), valor, aLaVenta ? 'puesta a la venta' : 'retirada de la venta'),
    db
      .prepare(
        `UPDATE productos SET disponible = COALESCE(
                  (SELECT MAX(v.disponible) FROM variantes v WHERE v.producto_id = productos.id), 0),
                updated_at = datetime('now')
          WHERE id = (SELECT producto_id FROM variantes WHERE id = ?1)`,
      )
      .bind(varianteId),
  ]);
  return Boolean(r[0]?.meta.changes);
}
