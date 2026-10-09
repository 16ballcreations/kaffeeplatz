/**
 * consultas/inventario-escribir.ts — los cambios de stock. Reservar,
 * confirmar, liberar, caducar, descontar, ajustar, despachar.
 * ===========================================================================
 * Diseño completo en la sección G de `planes/kaffeeplatz-panel-admin.md`.
 *
 * LA REGLA QUE NO SE PUEDE ROMPER: LA CONDICIÓN VA EN EL `WHERE`
 * ---------------------------------------------------------------------------
 * Ninguna función de este fichero lee el stock, decide en JavaScript y después
 * escribe. Entre el `SELECT` y el `UPDATE` cabe otro cliente, y entonces los
 * dos leen 1, los dos deciden que sí, y se vende dos veces la misma unidad
 * (G.4, caso 1). Todas las escrituras de aquí son de la forma:
 *
 *     UPDATE variantes SET ... WHERE id = ? AND <la condición>
 *
 * y la respuesta se decide con `meta.changes`: 1 es "lo consiguió", 0 es "no
 * alcanzó". No hay ventana porque no hay dos operaciones. **Comprobado**: dos
 * reservas simultáneas de la última unidad dan exactamente un ganador.
 *
 * `stock_reservado` NEGATIVO ESTÁ PROHIBIDO, Y CON DOS REDES
 * ---------------------------------------------------------------------------
 * Un reservado negativo no es un error de conteo humano: es un bug del código
 * de reservas. Por eso 0004 le pone `CHECK (stock_reservado >= 0)` Y todo
 * UPDATE que lo baja lleva además `AND stock_reservado >= ?`. La guarda da
 * `changes = 0` sin excepción cuando no alcanza (el camino previsto); el CHECK
 * solo salta si alguien escribe un UPDATE sin guarda, que es el bug a cazar.
 * Un `changes = 0` al bajar reservado se registra como ERROR, no como "no
 * alcanzó": ver los `console.error` de este fichero.
 *
 * `stock_fisico` SÍ puede quedar negativo, a propósito (G.4.4). Ver la
 * cabecera de `inventario-leer.ts`.
 */

import type {
  BaseD1Escritura,
  Autor,
  MotivoMovimiento,
  ResultadoReserva,
  ResultadoConfirmacion,
  ResultadoVentaWhatsapp,
} from './inventario-formas';
import { reservaMinutos } from './inventario-formas';
import { stockExacto } from './inventario-leer';

/* ----------------------------------------------------------------- escrituras */

/**
 * RESERVAR varias líneas de un checkout, o no reservar ninguna.
 *
 * Es el paso 3 del flujo de Bold (G.3) y el sitio donde se resuelve la carrera
 * del caso 1 de G.4. Tres cosas que importan y que no son obvias:
 *
 * 1. **La condición va en el `WHERE`.** Cada línea hace
 *    `UPDATE ... WHERE id = ? AND stock_fisico - stock_reservado >= ?`, y se
 *    comprueba `meta.changes`. Nunca se lee-decide-escribe.
 *
 * 2. **O todas o ninguna.** Si una línea no alcanza, se DESHACE lo que ya se
 *    había reservado en esta misma llamada y se devuelve qué faltó, para que
 *    el cliente lo vea ANTES de pagar. No se deja media reserva puesta.
 *
 * 3. **Antes de reservar, caduca lo vencido DE ESAS VARIANTES.** Es la tercera
 *    red de G.2: dos o tres variantes, no la tabla; una escritura que ya
 *    estaba ocurriendo; y cierra el caso que más duele —no poder comprar
 *    porque alguien abandonó un checkout hace 31 minutos y el cron pasa dentro
 *    de cuatro.
 *
 * SOBRE POR QUÉ ESTO NO ES UN SOLO `batch()`
 * ---------------------------------------------------------------------------
 * El diseño (G.3) pide que el pedido y sus reservas vayan en un `batch()`, que
 * en D1 es una transacción implícita. Pero un `batch()` NO permite ramificar:
 * no se puede "mirar el `changes` de la línea 1 para decidir si mandar la 2",
 * porque todas las sentencias se envían juntas. Y la decisión de la carrera es
 * precisamente esa ramificación.
 *
 * La salida, que es la que el propio plan describe en prosa ("si alguna línea
 * no alcanza, todo el batch se deshace"): las reservas se intentan una a una,
 * con su condición en el WHERE, y si una falla se revierten las anteriores con
 * la MISMA guarda. La compensación es correcta porque solo deshace lo que esta
 * llamada consiguió, y el `WHERE ... >= ?` impide que reste algo que ya no
 * estaba. NO es equivalente a una transacción —otro cliente puede ver el
 * reservado alto durante unos milisegundos—, y eso es inocuo: el efecto de un
 * reservado momentáneamente alto es que alguien vea "agotado" un instante,
 * nunca que se venda de más.
 *
 * Quien escriba el `POST /api/pedidos` de la fase 2 del carrito debe crear el
 * pedido y llamar aquí, y borrar el pedido si esto devuelve `ok: false`.
 */
export async function reservar(
  db: BaseD1Escritura,
  pedidoId: string,
  lineas: { varianteId: number; cantidad: number }[],
  quien: Autor = 'panel',
): Promise<ResultadoReserva> {
  if (!lineas.length) return { ok: true, reservas: [], faltantes: [] };

  /* Tercera red de G.2: lo vencido de ESTAS variantes vuelve al catálogo antes
     de mirar si alcanza. Si falla, no se aborta la reserva: en el peor caso
     alguien ve "agotado" de más, que es el fallo seguro. */
  try {
    await caducarVencidasDe(
      db,
      lineas.map((l) => l.varianteId),
    );
  } catch (fallo) {
    console.error(
      '[inventario] no se pudieron caducar las reservas vencidas antes de reservar; ' +
        'se continúa (el cron las recogerá):',
      fallo instanceof Error ? fallo.message : fallo,
    );
  }

  const minutos = await reservaMinutos(db);
  const puestas: { reservaId: number; varianteId: number; cantidad: number }[] = [];

  for (const linea of lineas) {
    const cantidad = Math.trunc(linea.cantidad);
    if (cantidad <= 0) continue;

    /* LA CONDICIÓN, EN EL WHERE. Nada de SELECT + if. */
    const subida = await db
      .prepare(
        `UPDATE variantes SET stock_reservado = stock_reservado + ?2
          WHERE id = ?1 AND disponible = 1 AND stock_fisico - stock_reservado >= ?2`,
      )
      .bind(linea.varianteId, cantidad)
      .run();

    if (!subida.meta.changes) {
      /* No alcanzó. Se deshace TODO lo de esta llamada y se dice qué faltó. */
      await deshacerReservas(db, puestas);
      const falta = await stockExacto(
        db,
        lineas.map((l) => l.varianteId),
      );
      return {
        ok: false,
        reservas: [],
        faltantes: [
          {
            varianteId: linea.varianteId,
            pedidas: cantidad,
            vendibles: Math.max(0, falta.get(linea.varianteId)?.vendible ?? 0),
            titulo: falta.get(linea.varianteId)?.varianteTitulo ?? '',
          },
        ],
      };
    }

    /* `vence_en` ABSOLUTO (G.1): cambiar los 30 minutos mañana no reinterpreta
       las reservas de hoy. Y con el formato de `datetime()`, que es lo que el
       CHECK de 0004 exige y lo que hace que la comparación de texto funcione. */
    const creada = await db
      .prepare(
        `INSERT INTO reservas (pedido_id, variante_id, cantidad, vence_en, estado)
         VALUES (?1, ?2, ?3, datetime('now', '+' || ?4 || ' minutes'), 'activa')`,
      )
      .bind(pedidoId, linea.varianteId, cantidad, minutos)
      .run();

    const reservaId = Number(creada.meta.last_row_id);
    puestas.push({ reservaId, varianteId: linea.varianteId, cantidad });

    await db
      .prepare(
        `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, pedido_id, reserva_id)
         VALUES (?1, ?2, 'reservado', 'reserva', ?3, ?4, ?5)`,
      )
      .bind(linea.varianteId, cantidad, quien, pedidoId, reservaId)
      .run();
  }

  return { ok: true, reservas: puestas, faltantes: [] };
}

/**
 * CONFIRMAR el pago: baja el físico, cierra las reservas y crea el despacho.
 *
 * Es el paso 5 del flujo de Bold (G.3), y el físico baja AQUÍ y no al
 * despachar: una unidad cobrada y aún en la estantería no se puede vender a
 * nadie más, así que contarla como existencias haría que el sitio la ofreciera.
 *
 * IDEMPOTENCIA — ES LO PRINCIPAL DE ESTA FUNCIÓN
 * ---------------------------------------------------------------------------
 * Un webhook repetido aquí no duplica un correo: DESCUENTA DOS UNIDADES. Las
 * redes, en orden (G.3):
 *
 * 1. **El despacho es la puerta, y la impone la base.** Se inserta primero,
 *    con `INSERT OR IGNORE`, contra el índice único parcial `despachos_un_pedido`
 *    sobre `pedido_id`. Si `changes` es 0, este pedido YA se procesó: se
 *    devuelve `repetido: true` y NO SE TOCA NADA MÁS. Es la red que no depende
 *    de que nadie escriba bien el código.
 * 2. **Las reservas se cierran condicionalmente** (`AND estado = 'activa'`),
 *    así que aunque la puerta 1 se abriera por un bug, el reservado no baja
 *    dos veces.
 * 3. **El físico baja con su condición en el WHERE** (`AND stock_fisico >= ?`).
 *
 * El plan pone la puerta en `UPDATE pedidos ... WHERE estado = 'pendiente'`.
 * Aquí se usa el despacho porque `pedidos` es de la migración del carrito, que
 * NO EXISTE todavía, y el inventario no debe acoplarse a su orden de
 * aplicación (igual que `reservas.pedido_id` no lleva FK). Quien escriba el
 * webhook debe hacer ADEMÁS su `UPDATE pedidos ... WHERE estado = 'pendiente'`:
 * son dos redes, no una sustituyendo a la otra.
 *
 * CASO LÍMITE 5 (G.4): PAGADO Y NO HAY UNIDAD
 * ---------------------------------------------------------------------------
 * Si el físico no alcanza, **el pago NO se rechaza**: el dinero ya entró. El
 * despacho se marca `sin_stock = 1` (sale primero y en rojo, G.6) y el stock
 * **no se deja negativo** — es la asimetría deliberada con el caso 4: aquí no
 * ha salido nada, y poner −1 diría que hay una unidad menos de la que hay.
 */
export async function confirmarPago(
  db: BaseD1Escritura,
  pedidoId: string,
  lineas: { varianteId: number; cantidad: number; titulo?: string }[],
  quien: Autor = 'webhook',
): Promise<ResultadoConfirmacion> {
  /* RED 1: la base decide si este pedido ya se procesó. `OR IGNORE` contra el
     índice único parcial. Nada de "SELECT y si no existe inserta". */
  const despacho = await db
    .prepare(
      `INSERT OR IGNORE INTO despachos (origen, pedido_id, estado) VALUES ('bold', ?1, 'pendiente')`,
    )
    .bind(pedidoId)
    .run();

  if (!despacho.meta.changes) {
    console.warn(
      `[inventario] el pedido ${pedidoId} ya tenía despacho: evento repetido, no se toca el stock.`,
    );
    return { estado: 'repetido', despachoId: null, sinStock: [] };
  }

  const despachoId = Number(despacho.meta.last_row_id);
  const sinStock: { varianteId: number; cantidad: number }[] = [];

  for (const linea of lineas) {
    const cantidad = Math.trunc(linea.cantidad);
    if (cantidad <= 0) continue;

    /* RED 2: las reservas de ESTE pedido y ESTA variante, condicionalmente.
       Lo que se cerró aquí es lo que se puede descontar del reservado. */
    const reservas = await db
      .prepare(
        `SELECT id, cantidad FROM reservas
          WHERE pedido_id = ?1 AND variante_id = ?2 AND estado = 'activa'`,
      )
      .bind(pedidoId, linea.varianteId)
      .all<{ id: number; cantidad: number }>();

    let reservadoCerrado = 0;
    for (const r of reservas.results) {
      const cerrada = await db
        .prepare(
          `UPDATE reservas SET estado = 'confirmada', cerrada_en = datetime('now')
            WHERE id = ?1 AND estado = 'activa'`,
        )
        .bind(r.id)
        .run();
      if (!cerrada.meta.changes) continue; // otro proceso la cerró: no se cuenta dos veces

      /* El reservado baja con su guarda. Un `changes = 0` AQUÍ es un bug del
         código de reservas, no un "no alcanzó": se registra como error. */
      const bajada = await db
        .prepare(
          `UPDATE variantes SET stock_reservado = stock_reservado - ?2
            WHERE id = ?1 AND stock_reservado >= ?2`,
        )
        .bind(linea.varianteId, r.cantidad)
        .run();
      if (!bajada.meta.changes) {
        console.error(
          `[inventario] BUG: no se pudo bajar stock_reservado de la variante ${linea.varianteId} ` +
            `en ${r.cantidad} al confirmar ${pedidoId}: el reservado ya era menor. Revisar el cuadre.`,
        );
      } else {
        reservadoCerrado += r.cantidad;
        await db
          .prepare(
            `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, pedido_id, reserva_id)
             VALUES (?1, ?2, 'reservado', 'reserva_confirmada', ?3, ?4, ?5)`,
          )
          .bind(linea.varianteId, -r.cantidad, quien, pedidoId, r.id)
          .run();
      }
    }

    /* RED 3: el físico, con la condición en el WHERE. */
    const fisico = await db
      .prepare(
        `UPDATE variantes SET stock_fisico = stock_fisico - ?2
          WHERE id = ?1 AND stock_fisico >= ?2`,
      )
      .bind(linea.varianteId, cantidad)
      .run();

    if (fisico.meta.changes) {
      await db
        .prepare(
          `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, pedido_id, despacho_id, nota)
           VALUES (?1, ?2, 'fisico', 'venta_bold', ?3, ?4, ?5, ?6)`,
        )
        .bind(
          linea.varianteId,
          -cantidad,
          quien,
          pedidoId,
          despachoId,
          reservadoCerrado ? null : 'reserva caducada, había stock',
        )
        .run();
    } else {
      /* CASO 5: cobrado y sin unidad. No se deja negativo a propósito. */
      sinStock.push({ varianteId: linea.varianteId, cantidad });
      console.error(
        `[inventario] PAGADO Y SIN UNIDAD: pedido ${pedidoId}, variante ${linea.varianteId}, ` +
          `${cantidad} ud. El despacho ${despachoId} queda marcado sin_stock.`,
      );
    }
  }

  if (sinStock.length) {
    await db
      .prepare(`UPDATE despachos SET sin_stock = 1 WHERE id = ?1`)
      .bind(despachoId)
      .run();
  }

  return {
    estado: sinStock.length ? 'sin-stock' : 'ok',
    despachoId,
    sinStock,
  };
}

/**
 * LIBERAR las reservas de un pedido: rechazo o cancelación explícita.
 *
 * No se espera a que caduque (G.3): liberar en cuanto se sabe devuelve la
 * unidad al catálogo en segundos en vez de en media hora. El físico NO se
 * toca: nunca bajó.
 *
 * Condicional (`AND estado = 'activa'`), así que llamarlo dos veces no baja el
 * reservado dos veces.
 */
export async function liberarReservas(
  db: BaseD1Escritura,
  pedidoId: string,
  quien: Autor = 'webhook',
  nota?: string,
): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT id, variante_id, cantidad FROM reservas
        WHERE pedido_id = ?1 AND estado = 'activa'`,
    )
    .bind(pedidoId)
    .all<{ id: number; variante_id: number; cantidad: number }>();

  let liberadas = 0;
  for (const r of results) {
    const cerrada = await db
      .prepare(
        `UPDATE reservas SET estado = 'liberada', cerrada_en = datetime('now')
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
        `[inventario] BUG: reservado insuficiente al liberar la reserva ${r.id} ` +
          `(variante ${r.variante_id}, ${r.cantidad} ud). Revisar el cuadre.`,
      );
      continue;
    }

    await db
      .prepare(
        `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, pedido_id, reserva_id, nota)
         VALUES (?1, ?2, 'reservado', 'reserva_liberada', ?3, ?4, ?5, ?6)`,
      )
      .bind(r.variante_id, -r.cantidad, quien, pedidoId, r.id, nota ?? null)
      .run();
    liberadas += 1;
  }
  return liberadas;
}

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

/**
 * DESCONTAR UNA UNIDAD por una venta hablada. El `−` de la pantalla (G.3).
 *
 * Crea el despacho (`origen = 'whatsapp'`, NACE `pendiente` porque muchas
 * veces el paquete sale al día siguiente y esa es justo la lista que el
 * cliente pidió), su item, baja el físico y escribe el movimiento.
 *
 * **La guarda respeta las reservas** (`stock_fisico - stock_reservado >= n`),
 * que es el caso límite 2 de G.4 y el más probable de todos: si `changes` es
 * 0, NO HABÍA VENDIBLE y esta función **no falla, informa**. Devuelve
 * `{ ok: false, motivo: 'reservado' | 'sin-stock' }` con los números para que
 * el panel pueda preguntar («alguien lo está pagando ahora mismo, le quedan 23
 * minutos») en vez de mostrar un error.
 *
 * `forzar: true` es «Venderlo igual»: deja el stock NEGATIVO a propósito,
 * escribe el movimiento con nota automática y lo marca para revisar. Existe
 * porque Andreina conoce su negocio y puede tener razones; nunca se toma esa
 * decisión sola, pero tampoco se le impide tomarla.
 *
 * `despachoIdExistente` es el «[Añadir más]» de la franja: añade al mismo
 * paquete en vez de crear otro.
 */
export async function venderPorWhatsapp(
  db: BaseD1Escritura,
  entrada: {
    varianteId: number;
    cantidad?: number;
    cliente?: string | null;
    nota?: string | null;
    precioUnitario?: number | null;
    despachoIdExistente?: number | null;
    forzar?: boolean;
  },
  quien: Autor = 'panel',
): Promise<ResultadoVentaWhatsapp> {
  const cantidad = Math.max(1, Math.trunc(entrada.cantidad ?? 1));

  const titulo = await db
    .prepare(
      `SELECT v.titulo, p.titulo AS producto_titulo FROM variantes v
         JOIN productos p ON p.id = v.producto_id WHERE v.id = ?`,
    )
    .bind(entrada.varianteId)
    .first<{ titulo: string; producto_titulo: string }>();
  if (!titulo) return { ok: false, motivo: 'no-existe', despachoId: null };

  /* LA GUARDA, EN EL WHERE. Con `forzar` se quita la condición de vendible
     (pero NUNCA la de la variante: `WHERE id = ?` sigue estando). */
  const baja = entrada.forzar
    ? await db
        .prepare(`UPDATE variantes SET stock_fisico = stock_fisico - ?2 WHERE id = ?1`)
        .bind(entrada.varianteId, cantidad)
        .run()
    : await db
        .prepare(
          `UPDATE variantes SET stock_fisico = stock_fisico - ?2
            WHERE id = ?1 AND stock_fisico - stock_reservado >= ?2`,
        )
        .bind(entrada.varianteId, cantidad)
        .run();

  if (!baja.meta.changes) {
    /* NO FALLA: informa, con los números para que el panel pregunte. */
    const s = (await stockExacto(db, [entrada.varianteId])).get(entrada.varianteId);
    const vigente = await db
      .prepare(
        `SELECT MIN(vence_en) AS proxima FROM reservas
          WHERE variante_id = ? AND estado = 'activa' AND vence_en > datetime('now')`,
      )
      .bind(entrada.varianteId)
      .first<{ proxima: string | null }>();
    return {
      ok: false,
      motivo: (s?.reservado ?? 0) > 0 ? 'reservado' : 'sin-stock',
      despachoId: null,
      fisico: s?.fisico ?? 0,
      reservado: s?.reservado ?? 0,
      vendible: s?.vendible ?? 0,
      reservaVenceEn: vigente?.proxima ?? null,
    };
  }

  let despachoId = entrada.despachoIdExistente ?? null;
  if (!despachoId) {
    const creado = await db
      .prepare(
        `INSERT INTO despachos (origen, pedido_id, cliente, nota, estado)
         VALUES ('whatsapp', NULL, ?1, ?2, 'pendiente')`,
      )
      .bind(entrada.cliente ?? null, entrada.nota ?? null)
      .run();
    despachoId = Number(creado.meta.last_row_id);
  }

  await db
    .prepare(
      `INSERT INTO despacho_items (despacho_id, variante_id, cantidad, titulo, precio_unitario)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
    .bind(
      despachoId,
      entrada.varianteId,
      cantidad,
      `${titulo.producto_titulo} — ${titulo.titulo}`,
      entrada.precioUnitario ?? null,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, despacho_id, nota)
       VALUES (?1, ?2, 'fisico', 'venta_whatsapp', ?3, ?4, ?5)`,
    )
    .bind(
      entrada.varianteId,
      -cantidad,
      quien,
      despachoId,
      entrada.forzar
        ? 'vendido igual pese a estar reservado — revisar'
        : (entrada.nota ?? null),
    )
    .run();

  return { ok: true, motivo: null, despachoId, forzado: Boolean(entrada.forzar) };
}

/**
 * AJUSTAR el físico: cargar mercancía, devoluciones, correcciones, roturas.
 *
 * Es el `+` y el teclado numérico de la pantalla (G.6), y también el conteo
 * inicial del día del cambio: cada número que Andreina carga deja su
 * movimiento `entrada`.
 *
 * `delta` con signo. No lleva guarda de `>= 0` **a propósito**: un ajuste
 * puede y debe poder dejar el stock negativo (G.4.4), porque eso es lo que ya
 * pasó en el mundo. El motivo `ajuste` exige nota, y eso lo comprueba esta
 * función: es la única regla de datos que el panel no puede saltarse por
 * descuido.
 */
export async function ajustarFisico(
  db: BaseD1Escritura,
  entrada: {
    varianteId: number;
    delta: number;
    motivo: Extract<MotivoMovimiento, 'entrada' | 'devolucion' | 'ajuste'>;
    nota?: string | null;
  },
  quien: Autor = 'panel',
): Promise<{ ok: boolean; error?: string; fisico?: number }> {
  const delta = Math.trunc(entrada.delta);
  /* Un movimiento que no mueve nada es un error de quien lo escribe, y el
     CHECK (cantidad <> 0) de 0004 lo rechazaría con un error de base de datos.
     Se atrapa antes para poder explicarlo. */
  if (delta === 0) return { ok: false, error: 'Un ajuste de 0 no cambia nada.' };

  /* La nota es obligatoria para 'ajuste' y la exige el panel, no la base: un
     CHECK condicional daría un error de base de datos en vez de un mensaje
     que diga "escribe por qué lo estás ajustando" (0004, comentario de `nota`). */
  if (entrada.motivo === 'ajuste' && !entrada.nota?.trim()) {
    return { ok: false, error: 'Escribe por qué lo estás corrigiendo.' };
  }

  const act = await db
    .prepare(`UPDATE variantes SET stock_fisico = stock_fisico + ?2 WHERE id = ?1`)
    .bind(entrada.varianteId, delta)
    .run();
  if (!act.meta.changes) return { ok: false, error: 'Esa variante no existe.' };

  await db
    .prepare(
      `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, nota)
       VALUES (?1, ?2, 'fisico', ?3, ?4, ?5)`,
    )
    .bind(entrada.varianteId, delta, entrada.motivo, quien, entrada.nota?.trim() || null)
    .run();

  const fila = await db
    .prepare('SELECT stock_fisico FROM variantes WHERE id = ?')
    .bind(entrada.varianteId)
    .first<{ stock_fisico: number }>();
  return { ok: true, fisico: fila?.stock_fisico ?? 0 };
}

/**
 * El interruptor manual de la dueña: "A la venta / Retirado" (G.1).
 *
 * NO toca el stock. Es voluntad, no inventario: «esta Chemex está en el
 * escaparate y no la vendo». Es además la forma en que se resuelven las
 * reservas manuales sin escribir una línea de código (G.7).
 */
export async function ponerALaVenta(
  db: BaseD1Escritura,
  varianteId: number,
  aLaVenta: boolean,
): Promise<boolean> {
  const r = await db
    .prepare('UPDATE variantes SET disponible = ?2 WHERE id = ?1')
    .bind(varianteId, aLaVenta ? 1 : 0)
    .run();
  return Boolean(r.meta.changes);
}

/**
 * Marcar un despacho como salido, o anularlo. Las dos acciones de la lista.
 *
 * Condicional (`AND estado = 'pendiente'`), así que el doble toque de un dedo
 * nervioso no lo hace dos veces.
 *
 * **Anular DEVUELVE el físico** (G.4.3, cancelación antes de despachar): el
 * paquete nunca se armó, así que la unidad vuelve al catálogo con un
 * movimiento `devolucion`. El reservado NO se toca: ya se cerró al cobrar.
 * «Ya salió» no toca el stock: bajó al cobrar (paso 5 de G.3).
 */
export async function cerrarDespacho(
  db: BaseD1Escritura,
  despachoId: number,
  accion: 'despachado' | 'anulado',
  quien: Autor = 'panel',
  nota?: string,
): Promise<boolean> {
  const r = await db
    .prepare(
      `UPDATE despachos
          SET estado = ?2,
              despachado_en = CASE WHEN ?2 = 'despachado' THEN datetime('now') ELSE despachado_en END
        WHERE id = ?1 AND estado = 'pendiente'`,
    )
    .bind(despachoId, accion)
    .run();
  if (!r.meta.changes) return false;

  if (accion === 'anulado') {
    /* Devolver el físico de lo que llevaba este paquete. Para 'whatsapp' las
       líneas están en `despacho_items`; para 'bold' viven en `pedido_items`,
       que es de la migración del carrito: cuando exista, quien la escriba debe
       devolver también esas. Hoy se devuelve lo que esta tabla conoce, y el
       libro deja constancia de qué se devolvió. */
    const { results } = await db
      .prepare('SELECT variante_id, cantidad FROM despacho_items WHERE despacho_id = ?')
      .bind(despachoId)
      .all<{ variante_id: number; cantidad: number }>();
    for (const it of results) {
      await db
        .prepare('UPDATE variantes SET stock_fisico = stock_fisico + ?2 WHERE id = ?1')
        .bind(it.variante_id, it.cantidad)
        .run();
      await db
        .prepare(
          `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, despacho_id, nota)
           VALUES (?1, ?2, 'fisico', 'devolucion', ?3, ?4, ?5)`,
        )
        .bind(it.variante_id, it.cantidad, quien, despachoId, nota ?? 'despacho anulado')
        .run();
    }
  }
  return true;
}

/* ------------------------------------------------------------------ internos */

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

/**
 * Deshace las reservas que ESTA llamada había puesto, cuando una línea falla.
 *
 * La compensación de `reservar()`. Solo deshace lo que esta llamada consiguió,
 * y la guarda `>= ?` impide restar algo que ya no estaba. Si algo falla aquí,
 * se registra pero NO se lanza: el cron recogerá lo que quede, y perder la
 * respuesta al cliente por un fallo al limpiar sería peor.
 */
async function deshacerReservas(
  db: BaseD1Escritura,
  puestas: { reservaId: number; varianteId: number; cantidad: number }[],
): Promise<void> {
  for (const p of puestas) {
    try {
      const cerrada = await db
        .prepare(
          `UPDATE reservas SET estado = 'liberada', cerrada_en = datetime('now')
            WHERE id = ?1 AND estado = 'activa'`,
        )
        .bind(p.reservaId)
        .run();
      if (!cerrada.meta.changes) continue;

      const bajada = await db
        .prepare(
          `UPDATE variantes SET stock_reservado = stock_reservado - ?2
            WHERE id = ?1 AND stock_reservado >= ?2`,
        )
        .bind(p.varianteId, p.cantidad)
        .run();
      if (!bajada.meta.changes) {
        console.error(
          `[inventario] BUG: reservado insuficiente al deshacer la reserva ${p.reservaId}.`,
        );
        continue;
      }

      await db
        .prepare(
          `INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, reserva_id, nota)
           VALUES (?1, ?2, 'reservado', 'reserva_liberada', 'panel', ?3,
                   'el pedido no se pudo completar: faltaba otra línea')`,
        )
        .bind(p.varianteId, -p.cantidad, p.reservaId)
        .run();
    } catch (fallo) {
      console.error(
        `[inventario] fallo al deshacer la reserva ${p.reservaId}; el cron la recogerá:`,
        fallo instanceof Error ? fallo.message : fallo,
      );
    }
  }
}
