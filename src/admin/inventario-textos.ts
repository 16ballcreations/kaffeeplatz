/**
 * inventario-textos.ts — las palabras del inventario, en un sitio.
 *
 * LA TABLA DE G.6 ES NORMATIVA, NO UNA SUGERENCIA DE ESTILO
 * ===========================================================================
 * Andreina conoce su catálogo al dedillo y no es técnica. Lo que el plan
 * prohíbe que aparezca en pantalla y lo que se dice en su lugar:
 *
 *   stock, inventario (como número)  → «Cuántos tengo»
 *   variante                         → su nombre: «Blanco», «6 tazas»
 *   reservado                        → «Lo está pagando alguien»
 *   disponible / vendible            → «A la venta»
 *   movimiento                       → «Qué pasó»
 *   ajuste                           → «Corregir la cuenta»
 *   caducó / expiró                  → «No llegó a pagar»
 *   id, handle, SKU                  → nada: no se muestran
 *
 * Por eso los textos viven aquí y no repartidos por las páginas: si mañana una
 * palabra no funciona con ella, se cambia en un sitio y cambia en todas las
 * pantallas a la vez. Y quien añada una pantalla tiene la lista delante.
 */

import type { MotivoMovimiento } from '../datos/inventario';

/** El nombre de una variante para una persona: sin "Default Title". */
export function nombreVariante(titulo: string): string | null {
  return titulo === 'Default Title' ? null : titulo;
}

/**
 * «Hervidor mango de madera — Blanco», o solo el producto si la variante no
 * dice nada nuevo («Default Title», o se llama igual que el producto: el
 * Aeropress Original tiene una variante «Aeropress Original»). Misma regla que
 * `TITULO_SQL` de `consultas/inventario-panel-leer.ts`.
 */
export function nombreCompleto(producto: string, variante: string): string {
  const v = nombreVariante(variante);
  return v && v !== producto ? `${producto} — ${v}` : producto;
}

/** «1 unidad», «3 unidades». */
export function unidades(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? 'unidad' : 'unidades'}`;
}

/* ------------------------------------------------------------------- fechas */

/**
 * La hora de Colombia. D1 guarda `datetime('now')`, que es UTC sin zona
 * ('2026-10-09 15:02:11'); aquí se lee como UTC y se pinta en Bogotá. Colombia
 * no tiene horario de verano, pero se usa la zona con nombre y no un −5 a mano
 * para que el código diga lo que hace.
 */
const ZONA = 'America/Bogota';

function aFecha(utc: string): Date {
  return new Date(`${utc.replace(' ', 'T')}Z`);
}

function diaEnBogota(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: ZONA });
}

/**
 * «hoy 11:02», «ayer 16:20», «3 oct». Fechas relativas, como pide G.6: lo que
 * Andreina necesita es ubicar el momento, no leer un timestamp.
 */
export function cuando(utc: string, ahora: Date = new Date()): string {
  const d = aFecha(utc);
  if (Number.isNaN(d.getTime())) return '';
  const hora = d.toLocaleTimeString('es-CO', {
    timeZone: ZONA,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  const hoy = diaEnBogota(ahora);
  const ayer = diaEnBogota(new Date(ahora.getTime() - 86_400_000));
  const dia = diaEnBogota(d);
  if (dia === hoy) return `hoy ${hora}`;
  if (dia === ayer) return `ayer ${hora}`;
  return d
    .toLocaleDateString('es-CO', { timeZone: ZONA, day: 'numeric', month: 'short' })
    .replace('.', '');
}

/** Minutos que faltan hasta una fecha UTC de D1. Nunca negativo. */
export function minutosHasta(utc: string, ahora: Date = new Date()): number {
  const d = aFecha(utc);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.ceil((d.getTime() - ahora.getTime()) / 60_000));
}

/** Minutos que han pasado desde una fecha UTC de D1. */
export function minutosDesde(utc: string, ahora: Date = new Date()): number {
  const d = aFecha(utc);
  if (Number.isNaN(d.getTime())) return Infinity;
  return (ahora.getTime() - d.getTime()) / 60_000;
}

/* ------------------------------------------------------------- qué pasó */

/**
 * El motivo de un movimiento, en español de persona. Es la columna «Qué pasó»
 * del historial. Los del reservado (`reserva*`) se pintan más tenues en la
 * pantalla: no cambian cuántos hay en la estantería, solo cuántos se pueden
 * vender en ese momento.
 */
export function motivoLegible(motivo: MotivoMovimiento, nota: string | null): string {
  if (nota?.startsWith('deshecho #')) return 'Deshecho: se corrigió un toque anterior';
  if (motivo === 'ajuste' && nota === NOTA_ROTURA) return NOTA_ROTURA;
  switch (motivo) {
    case 'entrada':
      return 'Llegó mercancía';
    case 'venta_bold':
      return 'Se vendió en la tienda';
    case 'venta_whatsapp':
      return 'Vendido por WhatsApp';
    case 'reserva':
      return 'Alguien empezó a pagarlo';
    case 'reserva_confirmada':
      return 'Pagado';
    case 'reserva_caducada':
      return 'No llegó a pagar · vuelve a estar a la venta';
    case 'reserva_liberada':
      return 'El pago no siguió · vuelve a estar a la venta';
    case 'devolucion':
      return 'Volvió a la estantería';
    case 'ajuste':
      return 'Corregir la cuenta';
    case 'despacho':
      return 'Salió el paquete';
  }
}

/**
 * La nota con la que «Se rompió o se perdió» se guarda como `ajuste`. No es un
 * motivo propio a propósito: el CHECK de 0004 es una lista cerrada y una rotura
 * ES corregir la cuenta, con el porqué ya escrito.
 */
export const NOTA_ROTURA = 'Se rompió o se perdió';

/** ¿La nota ya la dice el motivo? Entonces no se repite debajo. */
export function notaVisible(nota: string | null): string | null {
  return !nota || nota.startsWith('deshecho #') || nota === NOTA_ROTURA ? null : nota;
}

/** ¿Este movimiento toca lo apartado y no la estantería? (se pinta tenue) */
export function esDeLoApartado(motivo: MotivoMovimiento): boolean {
  return motivo.startsWith('reserva');
}

/* ---------------------------------------------------------- mensajes */

/**
 * Los errores que vuelven por `?error=` tras un POST (PRG). Solo claves: el
 * texto vive aquí y no viaja en la URL, así que nadie puede fabricar un enlace
 * que pinte un mensaje inventado en el panel.
 */
export const ERRORES: Record<string, string> = {
  nota: 'Para corregir la cuenta escribe por qué: es lo que te va a explicar el número dentro de un mes.',
  cero: 'Ese cambio no mueve nada: el número ya era ese.',
  cantidad: 'La cantidad tiene que ser un número entero, de 1 en adelante.',
  cambio:
    'La cuenta cambió mientras la estabas corrigiendo (seguramente una venta). Mira el número nuevo y vuelve a corregirla.',
  'no-existe': 'Eso ya no está en el catálogo.',
  'no-deshacible':
    'Eso ya no se puede deshacer desde aquí (pasó hace rato, o ya estaba deshecho). Si hace falta, corrige la cuenta.',
  'paquete-cerrado':
    'Ese paquete ya salió o se anuló, así que no se le puede añadir ni quitar nada. Haz una venta nueva.',
  confirmar: 'Marca la casilla para confirmar: es lo que evita hacerlo por un toque sin querer.',
  fallo: 'No se pudo guardar. No se cambió nada: inténtalo otra vez en un momento.',
};

/** Lo que dice la franja tras un cambio de cantidad. */
export function textoHecho(m: {
  motivo: MotivoMovimiento;
  cantidad: number;
  titulo: string;
  nota?: string | null;
}): string {
  const n = Math.abs(m.cantidad);
  switch (m.motivo) {
    case 'venta_whatsapp':
      return `−${n} ${m.titulo} · vendido por WhatsApp`;
    case 'entrada':
      return `Cargaste ${unidades(n)} · ${m.titulo}`;
    case 'devolucion':
      return `+${n} ${m.titulo} · volvió a la estantería`;
    case 'ajuste':
      if (m.nota === NOTA_ROTURA) return `−${n} ${m.titulo} · se rompió o se perdió`;
      return m.cantidad > 0
        ? `+${n} ${m.titulo} · cuenta corregida`
        : `−${n} ${m.titulo} · cuenta corregida`;
    default:
      return `${m.cantidad > 0 ? '+' : '−'}${n} ${m.titulo}`;
  }
}
