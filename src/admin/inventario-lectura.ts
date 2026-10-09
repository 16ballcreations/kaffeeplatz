/**
 * inventario-lectura.ts — qué dice una pantalla DESPUÉS de un toque de
 * inventario, leído de la URL de vuelta (PRG) y de la base.
 *
 * Antes vivía en la cabecera de /admin/inventario. Desde que el inventario se
 * integró en la ficha de cada producto (pedido del cliente, 9 oct 2026: «la
 * parte de inventario … integrarla a la misma vista de productos»), lo usan
 * la ficha, la lista de productos y la pantalla de contar: una sola lectura
 * para que las tres digan lo mismo con las mismas palabras.
 *
 * LO QUE VIAJA EN LA URL SON CLAVES, NUNCA TEXTOS (ver inventario-acciones.ts):
 * `?hecho=m&m=123` hace releer el movimiento 123 y escribir la frase aquí.
 */
import {
  MINUTOS_PARA_DESHACER,
  type FilaInventario,
  type InventarioDelPanel,
} from '../datos/inventario';
import { ERRORES, textoHecho, nombreCompleto, minutosHasta, minutosDesde } from './inventario-textos';

export interface Franja {
  texto: string;
  /** Movimiento que se puede deshacer, y la variante (para volver a su fila). */
  deshacer?: { m: number; v: number };
  /** Paquete de WhatsApp recién creado: «Añadir otra cosa» y «Ponerle nombre». */
  paquete?: { d: number; cliente: string | null };
}

export interface Pregunta {
  motivo: 'reservado' | 'sin-stock';
  titulo: string;
  v: number;
  n: number;
  fisico: number;
  minutos: number | null;
}

type Paquete = Awaited<ReturnType<InventarioDelPanel['paquete']>>['datos'];

export interface RespuestaInventario {
  franja: Franja | null;
  pregunta: Pregunta | null;
  error: string | null;
  /** El paquete de WhatsApp abierto («Añadir otra cosa»), si sigue pendiente. */
  paquete: Paquete;
}

/** Las frases de `?hecho=` que no son un movimiento. */
const HECHOS: Record<string, string> = {
  deshecho: 'Listo, deshecho. La cuenta volvió a como estaba.',
  nombrado: 'Listo: el paquete ya lleva el nombre en «Para despachar».',
  encendido: 'Inventario encendido: la tienda ya usa estas cantidades.',
  apagado: 'Inventario apagado: la tienda vende como antes. Las cantidades se conservan.',
};

const id = (q: URLSearchParams, k: string) => {
  const n = Number(q.get(k));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Lee franja, pregunta, error y paquete. `filas` son las variantes que la
 * pantalla enseña: una pregunta sobre una variante que no está aquí no se
 * pinta (no habría botón al que volver).
 */
export async function respuestaDeInventario(
  inv: InventarioDelPanel,
  q: URLSearchParams,
  filas: FilaInventario[],
): Promise<RespuestaInventario> {
  /* El paquete abierto: solo si sigue pendiente y es de WhatsApp. Un enlace
     viejo a un paquete que ya salió no puede dejar los botones apuntando a él. */
  let paquete: Paquete = null;
  if (id(q, 'paquete')) {
    const p = (await inv.paquete(id(q, 'paquete')!)).datos;
    if (p && p.estado === 'pendiente' && p.origen === 'whatsapp') paquete = p;
  }

  /* LA FRANJA: se relee el movimiento y se dice lo que de verdad pasó. */
  let franja: Franja | null = null;
  if (q.get('hecho') === 'm' && id(q, 'm')) {
    const m = (await inv.movimiento(id(q, 'm')!)).datos;
    if (m) {
      const reciente = minutosDesde(m.creadoEn) < MINUTOS_PARA_DESHACER;
      const deshecho = (await inv.yaDeshecho({ id: m.id, varianteId: m.varianteId })).datos;
      franja = {
        texto: textoHecho(m),
        deshacer: reciente && !deshecho ? { m: m.id, v: m.varianteId } : undefined,
        paquete:
          m.motivo === 'venta_whatsapp' && m.despachoId
            ? { d: m.despachoId, cliente: paquete?.id === m.despachoId ? paquete.cliente : null }
            : undefined,
      };
    }
  } else if (HECHOS[q.get('hecho') ?? '']) {
    franja = { texto: HECHOS[q.get('hecho')!]! };
  }

  /* LA PREGUNTA de G.4.2, con los números de AHORA (no los de la URL). */
  let pregunta: Pregunta | null = null;
  const motivo = q.get('pregunta');
  if ((motivo === 'reservado' || motivo === 'sin-stock') && id(q, 'v')) {
    const f = filas.find((x) => x.varianteId === id(q, 'v'));
    if (f) {
      const vence = motivo === 'reservado' ? (await inv.proximaReserva(f.varianteId)).datos : null;
      pregunta = {
        motivo,
        titulo: nombreCompleto(f.productoTitulo, f.varianteTitulo),
        v: f.varianteId,
        n: Math.min(999, id(q, 'n') ?? 1),
        fisico: f.fisico,
        minutos: vence ? minutosHasta(vence) : null,
      };
    }
  }

  return { franja, pregunta, error: ERRORES[q.get('error') ?? ''] ?? null, paquete };
}
