/**
 * consultas/inventario-leer.ts — las consultas del stock. NO ESCRIBEN NUNCA.
 * ===========================================================================
 * Diseño completo en la sección G de `planes/kaffeeplatz-panel-admin.md`.
 *
 * LAS LECTURAS NO ESCRIBEN. NUNCA. ES LA REGLA DE ESTE FICHERO.
 * ---------------------------------------------------------------------------
 * Caducar reservas al leer significaría que una visita a /catalogo haga
 * `UPDATE`, y eso rompe tres cosas de golpe (G.2): una respuesta de caché no
 * ejecuta nada, un GET que escribe impide cachear, y una ráfaga de visitas se
 * vuelve una ráfaga de escrituras que se pagan (R4). La lectura es exacta SIN
 * escribir porque mira `vence_en`, no `stock_reservado`. El cron escribe
 * (`inventario-escribir.ts`); la lectura solo lee.
 *
 * LAS TRES CANTIDADES, Y LA QUE NO SE GUARDA
 * ---------------------------------------------------------------------------
 * `stock_fisico` y `stock_reservado` son columnas de `variantes`. Lo vendible
 * NO se guarda: es la resta. Guardarlo sería un tercer número capaz de
 * contradecir a los otros dos, y habría que decidir cuál manda (G.1).
 *
 * EL STOCK NEGATIVO SE PERMITE A PROPÓSITO — NO LO "ARREGLES"
 * ---------------------------------------------------------------------------
 * `stock_fisico` puede quedar negativo y la migración 0004 NO le pone `CHECK`.
 * Está razonado en G.4.4: el negativo es lo que YA PASÓ en el mundo real
 * (contó cuatro y había tres), y una base que lo prohíbe convierte "la dueña
 * se equivocó" en "el guardado falla con un error de base de datos". Un
 * contador que no puede representar el error no puede ayudar a encontrarlo.
 * El negativo NUNCA llega al cliente: `vendible` exige `> 0`, así que el
 * producto sale "Agotado" en el sitio y el error se ve solo en el panel.
 */

import type { BaseD1 } from './productos';
import type {
  StockVariante,
  FilaInventario,
  FilaMovimiento,
  FilaCuadre,
  FilaDespacho,
} from './inventario-formas';

/* ------------------------------------------------------------------ lecturas */

/**
 * El stock EXACTO de unas variantes, por su id interno.
 *
 * Es la consulta de precisión de G.2: descuenta solo las reservas con
 * `vence_en > now`, no `stock_reservado` a secas. Así una reserva que venció
 * hace un minuto NO bloquea la venta aunque el cron todavía no haya pasado: el
 * peor retraso visible es cero, no cinco minutos (R12).
 *
 * Se usa donde la precisión importa —la ficha, el checkout, el tope de
 * cantidad— y NO en /catalogo, que sigue restando las dos columnas porque
 * hacerlo así es lo que lo mantiene barato (R4). Ese reparto es deliberado.
 *
 * NO ESCRIBE NADA. Ver la cabecera del fichero.
 */
export async function stockExacto(
  db: BaseD1,
  varianteIds: number[],
): Promise<Map<number, StockVariante>> {
  const mapa = new Map<number, StockVariante>();
  if (!varianteIds.length) return mapa;

  /* `IN (?, ?, ...)` con tantos marcadores como ids. Se construye la lista de
     marcadores, nunca los valores: los valores van siempre por `bind`. Mismo
     patrón que `todosLosProductos`. */
  const marcas = varianteIds.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT v.id, v.id_externo, v.titulo, v.disponible, v.stock_fisico, v.stock_reservado,
              p.handle AS producto_handle,
              COALESCE((SELECT SUM(r.cantidad) FROM reservas r
                         WHERE r.variante_id = v.id AND r.estado = 'activa'
                           AND r.vence_en > datetime('now')), 0) AS reservado_vigente
         FROM variantes v JOIN productos p ON p.id = v.producto_id
        WHERE v.id IN (${marcas})
        ORDER BY v.id`,
    )
    .bind(...varianteIds)
    .all<FilaStock>();

  for (const f of results) mapa.set(f.id, aStock(f));
  return mapa;
}

/**
 * El stock exacto de las variantes de UN producto, por su handle.
 *
 * Es la forma que necesita la ficha: la página tiene el handle, no los ids
 * internos (que no salen de la capa de datos a propósito, ver `formas.ts`).
 * La clave del mapa es el id PÚBLICO de la variante —el mismo `id` que trae
 * `Variante` de `formas.ts`—, así que la página puede cruzarlo con lo que ya
 * tiene sin conocer ningún id de D1.
 */
export async function stockDeProducto(
  db: BaseD1,
  handle: string,
): Promise<Map<string, StockVariante>> {
  const { results } = await db
    .prepare(
      `SELECT v.id, v.id_externo, v.titulo, v.disponible, v.stock_fisico, v.stock_reservado,
              p.handle AS producto_handle,
              COALESCE((SELECT SUM(r.cantidad) FROM reservas r
                         WHERE r.variante_id = v.id AND r.estado = 'activa'
                           AND r.vence_en > datetime('now')), 0) AS reservado_vigente
         FROM variantes v JOIN productos p ON p.id = v.producto_id
        WHERE p.handle = ? AND p.archivado_en IS NULL
        ORDER BY v.orden, v.id`,
    )
    .bind(handle)
    .all<FilaStock>();

  const mapa = new Map<string, StockVariante>();
  for (const f of results) {
    const s = aStock(f);
    mapa.set(s.idPublico, s);
  }
  return mapa;
}

/**
 * Todas las variantes con su stock, para la pantalla de inventario.
 *
 * Ordenadas por producto y por el orden de la variante, que es como se
 * agrupan en pantalla (G.6). Trae el título del producto para no obligar al
 * panel a una segunda consulta.
 */
export async function stockDeTodo(db: BaseD1): Promise<FilaInventario[]> {
  const { results } = await db
    .prepare(
      `SELECT v.id, v.id_externo, v.titulo, v.disponible, v.stock_fisico, v.stock_reservado,
              p.handle AS producto_handle, p.titulo AS producto_titulo,
              p.archivado_en IS NOT NULL AS producto_archivado,
              COALESCE((SELECT SUM(r.cantidad) FROM reservas r
                         WHERE r.variante_id = v.id AND r.estado = 'activa'
                           AND r.vence_en > datetime('now')), 0) AS reservado_vigente
         FROM variantes v JOIN productos p ON p.id = v.producto_id
        ORDER BY p.titulo, p.handle, v.orden, v.id`,
    )
    .all<FilaStock & { producto_titulo: string; producto_archivado: number }>();

  return results.map((f) => ({
    ...aStock(f),
    productoTitulo: f.producto_titulo,
    productoArchivado: f.producto_archivado === 1,
  }));
}

/**
 * El historial de una variante: la pantalla "Qué pasó" (G.6).
 *
 * `limite` acotado en la propia consulta y no en quien llama: un historial sin
 * techo son filas leídas que se pagan (R4), y la pantalla muestra una página.
 */
export async function movimientosDeVariante(
  db: BaseD1,
  varianteId: number,
  limite = 50,
): Promise<FilaMovimiento[]> {
  const tope = Math.min(Math.max(1, Math.trunc(limite)), 200);
  const { results } = await db
    .prepare(
      `SELECT id, created_at, cantidad, afecta, motivo, quien, pedido_id, reserva_id,
              despacho_id, nota
         FROM movimientos WHERE variante_id = ?
        ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(varianteId, tope)
    .all<FilaMovimiento>();
  return results;
}

/**
 * EL CUADRE: ¿coincide el contador con el libro? (G.4, caso 4)
 *
 * Compara, por variante, `stock_fisico` contra la suma de los movimientos de
 * tipo `fisico`, y `stock_reservado` contra la suma de reservas activas.
 *
 * **Si devuelve una sola fila, hay un BUG** —no un error de Andreina—, porque
 * todo movimiento se escribe en el mismo `batch()` que el cambio de columna.
 * Es la diferencia entre "el stock no cuadra" y "sé exactamente dónde".
 *
 * Nota sobre el SQL: el plan escribe `WHERE v.stock_fisico <> segun_libro`,
 * usando en el WHERE un alias definido en el SELECT. SQLite NO lo admite
 * (el alias no existe todavía al evaluar el WHERE), así que se envuelve en
 * una subconsulta y se filtra fuera. Mismo resultado, y sí corre.
 */
export async function cuadre(db: BaseD1): Promise<FilaCuadre[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM (
         SELECT v.id AS variante_id, v.titulo, p.titulo AS producto_titulo,
                v.stock_fisico,
                COALESCE((SELECT SUM(m.cantidad) FROM movimientos m
                           WHERE m.variante_id = v.id AND m.afecta = 'fisico'), 0) AS segun_libro,
                v.stock_reservado,
                COALESCE((SELECT SUM(r.cantidad) FROM reservas r
                           WHERE r.variante_id = v.id AND r.estado = 'activa'), 0) AS reservas_activas
           FROM variantes v JOIN productos p ON p.id = v.producto_id
       )
       WHERE stock_fisico <> segun_libro OR stock_reservado <> reservas_activas
       ORDER BY producto_titulo, titulo`,
    )
    .all<FilaCuadre>();
  return results;
}

/** Las variantes en negativo, para el mosaico de avisos de /admin (G.4.4). */
export async function variantesEnNegativo(db: BaseD1): Promise<FilaInventario[]> {
  const todo = await stockDeTodo(db);
  return todo.filter((v) => v.fisico < 0);
}

/** La lista de "productos a despachar": lo roto primero, lo viejo después. */
export async function despachosPendientes(db: BaseD1): Promise<FilaDespacho[]> {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.created_at, d.origen, d.pedido_id, d.cliente, d.nota, d.sin_stock,
              (SELECT COUNT(*) FROM despacho_items di WHERE di.despacho_id = d.id) AS items
         FROM despachos d
        WHERE d.estado = 'pendiente'
        ORDER BY d.sin_stock DESC, d.created_at, d.id`,
    )
    .all<FilaDespachoCruda>();
  return results.map((d) => ({
    id: d.id,
    creadoEn: d.created_at,
    origen: d.origen,
    pedidoId: d.pedido_id,
    cliente: d.cliente,
    nota: d.nota,
    sinStock: d.sin_stock === 1,
    items: d.items,
  }));
}

/** Los artículos de un despacho de WhatsApp. Los de Bold salen del pedido. */
export async function itemsDeDespacho(
  db: BaseD1,
  despachoId: number,
): Promise<{ varianteId: number; cantidad: number; titulo: string; precioUnitario: number | null }[]> {
  const { results } = await db
    .prepare(
      `SELECT variante_id, cantidad, titulo, precio_unitario
         FROM despacho_items WHERE despacho_id = ? ORDER BY id`,
    )
    .bind(despachoId)
    .all<{
      variante_id: number;
      cantidad: number;
      titulo: string;
      precio_unitario: number | null;
    }>();
  return results.map((i) => ({
    varianteId: i.variante_id,
    cantidad: i.cantidad,
    titulo: i.titulo,
    precioUnitario: i.precio_unitario,
  }));
}

/**
 * Cuántas reservas activas y despachos pendientes tiene un producto.
 *
 * Es el aviso previo a archivar de G.4.6: «tiene 1 unidad que alguien está
 * pagando y 2 paquetes sin despachar». Con los dos números, porque Andreina no
 * puede saberlo y sin el aviso archivar se siente como cancelar, y no lo es.
 */
export async function compromisosDeProducto(
  db: BaseD1,
  handle: string,
): Promise<{ reservasActivas: number; despachosPendientes: number }> {
  const fila = await db
    .prepare(
      `SELECT
         COALESCE((SELECT SUM(r.cantidad) FROM reservas r
                     JOIN variantes v ON v.id = r.variante_id
                     JOIN productos p ON p.id = v.producto_id
                    WHERE p.handle = ?1 AND r.estado = 'activa'
                      AND r.vence_en > datetime('now')), 0) AS reservas_activas,
         COALESCE((SELECT COUNT(DISTINCT d.id) FROM despachos d
                     JOIN despacho_items di ON di.despacho_id = d.id
                     JOIN variantes v2 ON v2.id = di.variante_id
                     JOIN productos p2 ON p2.id = v2.producto_id
                    WHERE p2.handle = ?1 AND d.estado = 'pendiente'), 0) AS despachos_pendientes`,
    )
    .bind(handle)
    .first<{ reservas_activas: number; despachos_pendientes: number }>();
  return {
    reservasActivas: fila?.reservas_activas ?? 0,
    despachosPendientes: fila?.despachos_pendientes ?? 0,
  };
}

/* ------------------------------------------------------------------ internos */

/** Fila cruda de stock → la forma con lo vendible resuelto. */
function aStock(f: FilaStock): StockVariante {
  const fisico = f.stock_fisico;
  const aLaVenta = f.disponible === 1;
  return {
    varianteId: f.id,
    /* El mismo criterio que `aVariante` en consultas/productos.ts: el id de
       Shopify, y si falta el título. Tiene que coincidir, porque es la clave
       con la que la ficha cruza este stock con la variante que ya tiene. */
    idPublico: f.id_externo ?? f.titulo,
    productoHandle: f.producto_handle,
    varianteTitulo: f.titulo,
    fisico,
    reservado: f.stock_reservado,
    /* Con las reservas VIGENTES, no con la columna: es lo que hace que una
       reserva vencida no bloquee la venta aunque el cron no haya pasado. */
    vendible: fisico - f.reservado_vigente,
    aLaVenta,
  };
}

interface FilaStock {
  id: number;
  id_externo: string | null;
  titulo: string;
  disponible: number;
  stock_fisico: number;
  stock_reservado: number;
  producto_handle: string;
  reservado_vigente: number;
}

/** La fila cruda de `despachos`, antes de pasarla a `FilaDespacho`. */
interface FilaDespachoCruda {
  id: number;
  created_at: string;
  origen: 'bold' | 'whatsapp';
  pedido_id: string | null;
  cliente: string | null;
  nota: string | null;
  sin_stock: number;
  items: number;
}
