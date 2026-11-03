/**
 * consultas/inventario-agotado.ts — lo que se agota sale solo de la venta, y
 * vuelve solo si salió así (migrations/0010).
 * ===========================================================================
 * Pedido del cliente (2 nov 2026): «cuando un producto tiene cantidad de
 * inventario 0, debería pasar a "no a la venta"». Con el inventario ENCENDIDO:
 *
 *   físico <= 0 y a la venta                → no a la venta, `agotada_auto = 1`
 *   físico > 0, no a la venta, agotada_auto → a la venta otra vez, `agotada_auto = 0`
 *
 * Lo que Andreina retiró A MANO (`disponible = 0`, `agotada_auto = 0`) no
 * vuelve nunca solo: cargar unidades no es «quiero volver a venderlo».
 *
 * SON SENTENCIAS, NO UNA FUNCIÓN QUE ESCRIBE
 * ---------------------------------------------------------------------------
 * Cada escritor del stock las AÑADE AL FINAL de su propio `batch()`, después
 * del movimiento: así el retiro va en la misma transacción implícita que lo
 * que lo provocó, y no hay un instante en que el libro diga 0 y la casilla
 * siga marcada (ni al revés si el batch falla). La decisión va en el WHERE,
 * leyendo el físico que acaba de dejar el movimiento: nada de leer en
 * JavaScript y decidir (G.4.1).
 *
 * Son IDEMPOTENTES: solo tocan una fila que está «descuadrada» con su físico,
 * así que da igual si el movimiento no llegó a escribir (su guarda no pasó):
 * entonces no hay nada que retirar y no escriben nada.
 *
 * Con el inventario APAGADO no hacen nada (el `EXISTS` sobre `ajustes`): sin
 * inventario, el físico no significa nada para la tienda.
 *
 * Ojo al encadenar: estas sentencias cambian `changes()` y
 * `last_insert_rowid()`. Van DETRÁS de los `SELECT` con los que cada escritor
 * lee lo que acaba de escribir, nunca entre medias.
 *
 * EL CERROJO DE LA TARJETA (`variantes.version`, 0009) NO SE SUBE
 * ---------------------------------------------------------------------------
 * Subirlo haría que «Vendí 1» le diera un «alguien cambió esto» a la tarjeta
 * de la misma versión abierta con un precio a medio escribir: un 409 falso
 * por algo que ella misma hizo dos centímetros más abajo. Es el mismo
 * razonamiento por el que recalcular el precio «desde» no sube
 * `productos.version` (0009).
 *
 * El precio de no subirlo es que una tarjeta abierta puede llevar la casilla
 * vieja. Lo resuelve la tarjeta, no el cerrojo: manda `venta_antes` (cómo
 * estaba la casilla al pintarse) y el guardado SOLO escribe «A la venta» si
 * ella la cambió (`guardarVariante`). Si no la tocó, se queda lo que diga la
 * base en ese momento, y guardar un precio no revive la venta de algo que se
 * acaba de agotar.
 *
 * LA AUDITORÍA
 * ---------------------------------------------------------------------------
 * Una fila por versión que cambia, con la frase que se lee en el historial:
 * «Se retiró de la venta: se agotó» / «Volvió a la venta: llegaron unidades».
 * `despublicar`/`publicar` ya estaban en el CHECK de 0008. El `entidad_id` se
 * saca de la columna (`CAST(id AS TEXT)` de un INTEGER da '4'; el problema del
 * '4.0' es solo con números enlazados desde JavaScript, ver inventario-panel).
 */

import type { BaseD1Escritura, SentenciaPreparada } from './inventario-formas';

export const NOTA_SE_AGOTO = 'Se retiró de la venta: se agotó';
export const NOTA_VOLVIO = 'Volvió a la venta: llegaron unidades';
export const NOTA_APAGADO = 'Volvió a la venta: se apagó el inventario';

const ACTIVO = `EXISTS (SELECT 1 FROM ajustes WHERE clave = 'inventario_activo' AND valor = '1')`;
const SE_AGOTO = `(disponible = 1 AND stock_fisico <= 0)`;
const VOLVIO = `(disponible = 0 AND agotada_auto = 1 AND stock_fisico > 0)`;
const ANTES = `json_object('disponible', disponible, 'agotada_auto', agotada_auto, 'stock_fisico', stock_fisico)`;

/**
 * El precio «desde» y la disponibilidad del producto: la fórmula de
 * `SQL_DERIVADOS` (productos-escribir.ts), para varios productos a la vez.
 * Sin subir `productos.version`, por la misma razón que allí.
 */
const DERIVADOS = `UPDATE productos SET
    disponible = EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = productos.id AND v.disponible = 1),
    precio = COALESCE(
      (SELECT MIN(v.precio) FROM variantes v WHERE v.producto_id = productos.id AND v.disponible = 1),
      (SELECT MIN(v.precio) FROM variantes v WHERE v.producto_id = productos.id), 0),
    updated_at = datetime('now')`;

/** Qué versiones mirar. `?1` es el único marcador. */
export type CualesVersiones = { variante: number } | { despacho: number } | 'todas';

function filtro(c: CualesVersiones): { sql: string; valor: number | null } {
  if (c === 'todas') return { sql: '1 = 1', valor: null };
  if ('variante' in c) return { sql: 'id = ?1', valor: c.variante };
  /* Las del libro de ese paquete: al anularlo vuelven unidades de varias. */
  return { sql: 'id IN (SELECT variante_id FROM movimientos WHERE despacho_id = ?1)', valor: c.despacho };
}

/**
 * Las cuatro sentencias que ponen «A la venta» de acuerdo con el físico.
 * Para añadir al FINAL del `batch()` de un movimiento (ver la cabecera).
 */
export function sentenciasAgotado(db: BaseD1Escritura, cuales: CualesVersiones): SentenciaPreparada[] {
  const f = filtro(cuales);
  const preparar = (sql: string) => (f.valor === null ? db.prepare(sql) : db.prepare(sql).bind(f.valor));
  return [
    /* La auditoría ANTES del UPDATE: con la misma condición, después ya no
       la cumpliría nadie. */
    preparar(
      `INSERT INTO auditoria (entidad, entidad_id, accion, antes, nota)
       SELECT 'variante', CAST(id AS TEXT), 'despublicar', ${ANTES}, '${NOTA_SE_AGOTO}'
         FROM variantes WHERE ${f.sql} AND ${SE_AGOTO} AND ${ACTIVO}`,
    ),
    preparar(
      `INSERT INTO auditoria (entidad, entidad_id, accion, antes, nota)
       SELECT 'variante', CAST(id AS TEXT), 'publicar', ${ANTES}, '${NOTA_VOLVIO}'
         FROM variantes WHERE ${f.sql} AND ${VOLVIO} AND ${ACTIVO}`,
    ),
    preparar(
      `UPDATE variantes
          SET disponible = CASE WHEN stock_fisico > 0 THEN 1 ELSE 0 END,
              agotada_auto = CASE WHEN stock_fisico > 0 THEN 0 ELSE 1 END
        WHERE ${f.sql} AND (${SE_AGOTO} OR ${VOLVIO}) AND ${ACTIVO}`,
    ),
    /* `changes()` mira el UPDATE de arriba: si no cambió ninguna versión, el
       producto no se toca (ni su `updated_at`, que usa el mapa del sitio). */
    preparar(`${DERIVADOS} WHERE changes() > 0 AND id IN (SELECT producto_id FROM variantes WHERE ${f.sql})`),
  ];
}

/**
 * Al APAGAR el inventario: lo que se retiró SOLO por agotarse vuelve a la
 * venta. Apagar es la vuelta atrás de R13 («la tienda vende como antes»), y
 * antes del inventario esas versiones estaban a la venta: dejarlas retiradas
 * haría que apagar no devolviera la tienda a como estaba. Lo retirado a mano
 * se queda como está. Al volver a encender, `sentenciasAgotado('todas')` las
 * retira otra vez si siguen en 0.
 *
 * Para el `batch()` del interruptor, DESPUÉS de escribir el '0'.
 */
export function sentenciasAlApagar(db: BaseD1Escritura): SentenciaPreparada[] {
  return [
    db.prepare(
      `INSERT INTO auditoria (entidad, entidad_id, accion, antes, nota)
       SELECT 'variante', CAST(id AS TEXT), 'publicar', ${ANTES}, '${NOTA_APAGADO}'
         FROM variantes WHERE agotada_auto = 1 AND NOT ${ACTIVO}`,
    ),
    db.prepare(`UPDATE variantes SET disponible = 1, agotada_auto = 0 WHERE agotada_auto = 1 AND NOT ${ACTIVO}`),
    db.prepare(`${DERIVADOS} WHERE changes() > 0`),
  ];
}
