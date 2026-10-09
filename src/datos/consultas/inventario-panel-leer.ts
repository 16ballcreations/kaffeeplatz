/**
 * consultas/inventario-panel-leer.ts — lo que leen las pantallas del panel.
 * ===========================================================================
 * Aparte de `inventario-leer.ts` porque aquel es lo que necesita el SITIO (y
 * el checkout), y esto es lo que necesita una persona mirando una pantalla:
 * títulos para pintar, el paquete con lo que lleva dentro, el último cambio
 * del interruptor. Mismas reglas: no escribe nunca, y sin `LIKE`.
 */

import type { BaseD1 } from './productos';
import type { FilaInventario, MotivoMovimiento } from './inventario-formas';
import { stockDeTodo } from './inventario-leer';

/** Un paquete de la lista de «Productos a despachar», con lo que lleva. */
export interface PaqueteDespacho {
  id: number;
  creadoEn: string;
  despachadoEn: string | null;
  origen: 'bold' | 'whatsapp';
  pedidoId: string | null;
  cliente: string | null;
  nota: string | null;
  estado: 'pendiente' | 'despachado' | 'anulado';
  /** Pagado en la tienda y sin unidad (G.4.5): va primero y en rojo. */
  sinStock: boolean;
  articulos: { cantidad: number; titulo: string }[];
}

/** Un movimiento con lo necesario para contarlo en una frase. */
export interface MovimientoContado {
  id: number;
  creadoEn: string;
  varianteId: number;
  cantidad: number;
  motivo: MotivoMovimiento;
  despachoId: number | null;
  nota: string | null;
  titulo: string;
}

interface FilaPaquete {
  id: number;
  created_at: string;
  despachado_en: string | null;
  origen: 'bold' | 'whatsapp';
  pedido_id: string | null;
  cliente: string | null;
  nota: string | null;
  estado: 'pendiente' | 'despachado' | 'anulado';
  sin_stock: number;
}

/**
 * Los paquetes pendientes (lo roto primero, lo viejo después) y los que
 * salieron en las últimas 48 h, para poder deshacer un «Ya salió» o responder
 * «¿salió ya lo de Juan?» sin buscar.
 */
export async function paquetes(db: BaseD1): Promise<{
  pendientes: PaqueteDespacho[];
  recientes: PaqueteDespacho[];
}> {
  const { results } = await db
    .prepare(
      `SELECT id, created_at, despachado_en, origen, pedido_id, cliente, nota, estado, sin_stock
         FROM despachos
        WHERE estado = 'pendiente'
           OR (estado = 'despachado' AND despachado_en >= datetime('now', '-2 days'))
        ORDER BY sin_stock DESC, created_at, id`,
    )
    .all<FilaPaquete>();
  if (!results.length) return { pendientes: [], recientes: [] };

  const articulos = await articulosDe(
    db,
    results.map((r) => r.id),
  );
  const todos = results.map((r) => aPaquete(r, articulos.get(r.id) ?? []));
  return {
    pendientes: todos.filter((p) => p.estado === 'pendiente'),
    /* Lo último que salió, primero: es lo que se quiere ver para deshacer. */
    recientes: todos
      .filter((p) => p.estado === 'despachado')
      .sort((a, b) => (b.despachadoEn ?? '').localeCompare(a.despachadoEn ?? '')),
  };
}

/** Un paquete suelto, en cualquier estado. Para la franja de «Añadir otra cosa». */
export async function paquete(db: BaseD1, id: number): Promise<PaqueteDespacho | null> {
  const fila = await db
    .prepare(
      `SELECT id, created_at, despachado_en, origen, pedido_id, cliente, nota, estado, sin_stock
         FROM despachos WHERE id = ?`,
    )
    .bind(id)
    .first<FilaPaquete>();
  if (!fila) return null;
  return aPaquete(fila, (await articulosDe(db, [id])).get(id) ?? []);
}

/**
 * Lo que lleva cada paquete.
 *
 * WhatsApp: `despacho_items`, que es donde vive. Bold: las líneas viven en
 * `pedido_items`, que es de la migración del carrito y TODAVÍA NO EXISTE; hasta
 * entonces se leen del LIBRO —los `venta_bold` de ese despacho—, que dice
 * exactamente qué unidades salieron de la estantería por ese pedido. Cuando
 * exista `pedido_items`, esta rama debe pasar a leerla (incluye las líneas
 * `sin_stock`, que el libro no ve porque no bajaron nada).
 */
async function articulosDe(
  db: BaseD1,
  ids: number[],
): Promise<Map<number, { cantidad: number; titulo: string }[]>> {
  const marcas = ids.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT di.despacho_id, di.cantidad, di.titulo, di.id AS orden
         FROM despacho_items di WHERE di.despacho_id IN (${marcas})
       UNION ALL
       SELECT m.despacho_id, -SUM(m.cantidad),
              CASE WHEN v.titulo = 'Default Title' THEN p.titulo
                   ELSE p.titulo || ' — ' || v.titulo END,
              MIN(m.id)
         FROM movimientos m
         JOIN variantes v ON v.id = m.variante_id
         JOIN productos p ON p.id = v.producto_id
        WHERE m.despacho_id IN (${marcas}) AND m.motivo = 'venta_bold'
        GROUP BY m.despacho_id, m.variante_id
       ORDER BY 1, 4`,
    )
    .bind(...ids, ...ids)
    .all<{ despacho_id: number; cantidad: number; titulo: string }>();
  const mapa = new Map<number, { cantidad: number; titulo: string }[]>();
  for (const f of results) {
    if (f.cantidad <= 0) continue;
    const lista = mapa.get(f.despacho_id) ?? [];
    lista.push({ cantidad: f.cantidad, titulo: f.titulo });
    mapa.set(f.despacho_id, lista);
  }
  return mapa;
}

function aPaquete(r: FilaPaquete, articulos: PaqueteDespacho['articulos']): PaqueteDespacho {
  return {
    id: r.id,
    creadoEn: r.created_at,
    despachadoEn: r.despachado_en,
    origen: r.origen,
    pedidoId: r.pedido_id,
    cliente: r.cliente,
    nota: r.nota,
    estado: r.estado,
    sinStock: r.sin_stock === 1,
    articulos,
  };
}

/** Un movimiento por id, con el título de su variante. La franja de «Deshacer». */
export async function movimientoContado(
  db: BaseD1,
  id: number,
): Promise<MovimientoContado | null> {
  const f = await db
    .prepare(
      `SELECT m.id, m.created_at, m.variante_id, m.cantidad, m.motivo, m.despacho_id, m.nota,
              CASE WHEN v.titulo = 'Default Title' THEN p.titulo
                   ELSE p.titulo || ' — ' || v.titulo END AS titulo
         FROM movimientos m
         JOIN variantes v ON v.id = m.variante_id
         JOIN productos p ON p.id = v.producto_id
        WHERE m.id = ?`,
    )
    .bind(id)
    .first<{
      id: number;
      created_at: string;
      variante_id: number;
      cantidad: number;
      motivo: MotivoMovimiento;
      despacho_id: number | null;
      nota: string | null;
      titulo: string;
    }>();
  if (!f) return null;
  return {
    id: f.id,
    creadoEn: f.created_at,
    varianteId: f.variante_id,
    cantidad: f.cantidad,
    motivo: f.motivo,
    despachoId: f.despacho_id,
    nota: f.nota,
    titulo: f.titulo,
  };
}

/** ¿Ya se deshizo este movimiento? Igualdad exacta sobre la marca, sin LIKE. */
export async function yaDeshecho(db: BaseD1, m: { id: number; varianteId: number }): Promise<boolean> {
  const f = await db
    .prepare('SELECT 1 AS si FROM movimientos WHERE variante_id = ? AND nota = ? LIMIT 1')
    .bind(m.varianteId, `deshecho #${m.id}`)
    .first<{ si: number }>();
  return Boolean(f);
}

/**
 * Una variante con su stock, para la cabecera de «Qué pasó».
 *
 * Reutiliza `stockDeTodo` y filtra: son 30 filas, y tener UNA consulta de
 * stock para el panel en vez de dos casi iguales vale más que las 29 filas.
 */
export async function varianteDelPanel(db: BaseD1, id: number): Promise<FilaInventario | null> {
  return (await stockDeTodo(db)).find((v) => v.varianteId === id) ?? null;
}

/**
 * Cuándo vence la próxima reserva VIGENTE de una variante: el «le quedan 23
 * minutos» de la pregunta de G.4.2. `null` si nadie la está pagando.
 */
export async function proximaReserva(db: BaseD1, varianteId: number): Promise<string | null> {
  const f = await db
    .prepare(
      `SELECT MIN(vence_en) AS proxima FROM reservas
        WHERE variante_id = ? AND estado = 'activa' AND vence_en > datetime('now')`,
    )
    .bind(varianteId)
    .first<{ proxima: string | null }>();
  return f?.proxima ?? null;
}

/** El último cambio del interruptor, de la auditoría: «lo encendiste el 9 oct». */
export async function ultimoCambioDelInterruptor(
  db: BaseD1,
): Promise<{ cuando: string; accion: string } | null> {
  try {
    return await db
      .prepare(
        `SELECT created_at AS cuando, accion FROM auditoria
          WHERE entidad = 'ajuste' AND entidad_id = 'inventario_activo'
          ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .first<{ cuando: string; accion: string }>();
  } catch {
    /* Sin 0008 aplicada, la consulta funciona pero no hay filas; si fallara
       por otra cosa, la pantalla se pinta igual sin esta línea. */
    return null;
  }
}
