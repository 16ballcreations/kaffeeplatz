/**
 * consultas/inventario-formas.ts — el vocabulario del inventario.
 * ===========================================================================
 * Los tipos, los motivos del libro y las dos lecturas de `ajustes`. Nada que
 * ejecute SQL de stock: eso está en `inventario-leer.ts` (consultas) y
 * `inventario-escribir.ts` (cambios).
 *
 * POR QUÉ EL INVENTARIO SON TRES FICHEROS Y NO UNO
 * ---------------------------------------------------------------------------
 * Mismo criterio que partió `catalogo.ts` de `consultas/productos.ts`: por
 * RESPONSABILIDAD, no por tamaño, y para que cada uno se pueda leer entero sin
 * tener los otros en la cabeza. Aquí el corte natural es el que ya impone el
 * diseño (G.2): **las lecturas no escriben nunca**, y las escrituras llevan su
 * condición en el `WHERE`. Son dos conjuntos de reglas distintas, así que son
 * dos ficheros distintos, más este con lo que ambos comparten.
 *
 * Diseño completo y justificaciones en la sección G de
 * `planes/kaffeeplatz-panel-admin.md`.
 */

import type { BaseD1 } from './productos';

/* ------------------------------------------------------------------ tipos D1 */

/**
 * El binding con lo que hace falta para ESCRIBIR, que `BaseD1` no declara.
 *
 * `BaseD1` (consultas/productos.ts) está tipado al mínimo que usan las
 * lecturas: `all` y `first`. El inventario necesita además `run()` —para leer
 * `meta.changes`, que es toda la protección contra la carrera— y `batch()`,
 * que en D1 es una transacción implícita. Se extiende en vez de modificar
 * `BaseD1` para no obligar a las consultas públicas a conocer lo que no usan.
 */
export interface BaseD1Escritura extends BaseD1 {
  prepare(sql: string): SentenciaD1;
  batch(sentencias: SentenciaPreparada[]): Promise<ResultadoD1<unknown>[]>;
}

export interface SentenciaD1 {
  bind(...valores: unknown[]): SentenciaPreparada;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<ResultadoD1<unknown>>;
}

export interface SentenciaPreparada {
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<ResultadoD1<unknown>>;
}

export interface ResultadoD1<T> {
  results?: T[];
  success: boolean;
  /** `changes` es lo que decide si una escritura condicional ganó o no. */
  meta: { changes?: number; last_row_id?: number; [k: string]: unknown };
}

/* ------------------------------------------------------------------- vocabulario */

/** Los motivos del libro. Es el `CHECK` cerrado de 0004, como tipo. */
export type MotivoMovimiento =
  | 'entrada'
  | 'venta_bold'
  | 'venta_whatsapp'
  | 'reserva'
  | 'reserva_confirmada'
  | 'reserva_caducada'
  | 'reserva_liberada'
  | 'devolucion'
  | 'ajuste'
  | 'despacho';

/** Sobre qué cantidad actúa un movimiento. Una fila dice UNA sola cosa. */
export type AfectaA = 'fisico' | 'reservado';

/** Quién lo hizo. El panel no tiene identidad (A.2): son estos tres. */
export type Autor = 'panel' | 'webhook' | 'cron';

/** El stock de una variante, con lo vendible ya resuelto. */
export interface StockVariante {
  varianteId: number;
  /** El id que ve el carrito (`id_externo`, o el título si no hay). */
  idPublico: string;
  productoHandle: string;
  varianteTitulo: string;
  /** Lo que hay en la estantería. Puede ser negativo (ver cabecera). */
  fisico: number;
  /** Caché transaccional de la suma de reservas activas. */
  reservado: number;
  /**
   * Lo que se puede vender AHORA: físico menos las reservas REALMENTE
   * vigentes (`vence_en > now`), no `reservado` a secas. Ver `stockExacto`.
   */
  vendible: number;
  /** El interruptor manual de la dueña: "A la venta / Retirado". */
  aLaVenta: boolean;
}

/**
 * Cuántos minutos vive una reserva. Sale de `ajustes`, no de una constante:
 * es un número que se va a querer ajustar viendo la tienda real, y pedir un
 * despliegue para pasar de 30 a 45 es la clase de cosa que no se hace (G.2).
 */
export const RESERVA_MINUTOS_POR_DEFECTO = 30;

/* --------------------------------------------------------------- los ajustes */

/**
 * ¿Está el inventario activo? Es la mitigación de R13 y la vuelta atrás.
 *
 * Con esto en `false`, `vendible` es exactamente `disponible` y el sitio se
 * comporta como antes de la migración, con el stock ya cargándose en segundo
 * plano. Apagarlo devuelve el sitio al comportamiento de hoy en un toque, con
 * el stock intacto (G.6, "el día del cambio", paso 5).
 *
 * SI LA LECTURA FALLA, DEVUELVE `false`. Es la decisión importante de esta
 * función: ante la duda, el sitio se comporta como hoy. Si la tabla `ajustes`
 * no existiera (base a medio migrar) o la consulta fallara, activar el stock
 * dejaría las 30 variantes en 0 y el catálogo entero en "Agotado" — que es
 * exactamente el desastre que el interruptor existe para evitar. El modo
 * seguro del fallo es "como hoy", nunca "tienda apagada".
 */
export async function inventarioActivo(db: BaseD1): Promise<boolean> {
  try {
    const fila = await db
      .prepare("SELECT valor FROM ajustes WHERE clave = 'inventario_activo'")
      .first<{ valor: string }>();
    return fila?.valor === '1';
  } catch (fallo) {
    console.error(
      '[inventario] no se pudo leer el interruptor `inventario_activo`; se asume APAGADO ' +
        '(el sitio se comporta como antes del inventario):',
      fallo instanceof Error ? fallo.message : fallo,
    );
    return false;
  }
}

/** Los minutos de vida de una reserva, de `ajustes`, con respaldo de 30. */
export async function reservaMinutos(db: BaseD1): Promise<number> {
  try {
    const fila = await db
      .prepare("SELECT valor FROM ajustes WHERE clave = 'reserva_minutos'")
      .first<{ valor: string }>();
    const n = Number(fila?.valor);
    /* Un ajuste editado a mano puede traer basura ('treinta', '', '-5'). Un
       número no entero o no positivo volvería a los 30 en vez de crear
       reservas que caducan en el pasado (o que no caducan nunca). */
    return Number.isInteger(n) && n > 0 ? n : RESERVA_MINUTOS_POR_DEFECTO;
  } catch {
    return RESERVA_MINUTOS_POR_DEFECTO;
  }
}

export interface FilaInventario extends StockVariante {
  productoTitulo: string;
  productoArchivado: boolean;
}

export interface FilaMovimiento {
  id: number;
  created_at: string;
  cantidad: number;
  afecta: AfectaA;
  motivo: MotivoMovimiento;
  quien: string;
  pedido_id: string | null;
  reserva_id: number | null;
  despacho_id: number | null;
  nota: string | null;
}

export interface FilaCuadre {
  variante_id: number;
  titulo: string;
  producto_titulo: string;
  stock_fisico: number;
  segun_libro: number;
  stock_reservado: number;
  reservas_activas: number;
}


export interface FilaDespacho {
  id: number;
  creadoEn: string;
  origen: 'bold' | 'whatsapp';
  pedidoId: string | null;
  cliente: string | null;
  nota: string | null;
  sinStock: boolean;
  items: number;
}

export interface ResultadoReserva {
  ok: boolean;
  reservas: { reservaId: number; varianteId: number; cantidad: number }[];
  /** Qué faltó, para decírselo al cliente ANTES de pagar (G.4.1). */
  faltantes: { varianteId: number; titulo: string; pedidas: number; vendibles: number }[];
}

export interface ResultadoConfirmacion {
  /** `repetido` es el webhook duplicado: no se tocó nada. */
  estado: 'ok' | 'repetido' | 'sin-stock';
  despachoId: number | null;
  sinStock: { varianteId: number; cantidad: number }[];
}

export interface ResultadoVentaWhatsapp {
  ok: boolean;
  /** Por qué no se pudo, para que el panel PREGUNTE en vez de fallar (G.4.2). */
  motivo: 'reservado' | 'sin-stock' | 'no-existe' | null;
  despachoId: number | null;
  fisico?: number;
  reservado?: number;
  vendible?: number;
  /** Cuándo vence la reserva que lo bloquea: «le quedan 23 minutos». */
  reservaVenceEn?: string | null;
  forzado?: boolean;
}
