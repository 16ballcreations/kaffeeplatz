/**
 * barrido.ts — lo que hace el Cron Trigger. Sin Astro y sin `locals`.
 * ===========================================================================
 * El barrido de reservas vencidas de G.2, y el cuadre diario de G.4.4.
 *
 * POR QUÉ ESTE FICHERO NO RECIBE `Astro.locals`
 * ---------------------------------------------------------------------------
 * Un Cron Trigger NO es una petición: el runtime invoca `scheduled(evento,
 * env, ctx)` y ahí no hay `Astro`, ni `locals`, ni URL. Así que estas
 * funciones reciben el binding `DB` directamente, que es lo único que
 * necesitan. `src/datos/inventario.ts` sigue siendo la frontera para todo lo
 * que SÍ viene de una petición.
 *
 * DÓNDE SE ENGANCHA — Y LA PEGA QUE TIENE
 * ---------------------------------------------------------------------------
 * `@astrojs/cloudflare` genera `dist/_worker.js/index.js` en cada build y ese
 * fichero exporta SOLO un `default` con `fetch`. No tiene `scheduled`, y no se
 * puede añadir ahí porque se regenera. Hace falta un envoltorio propio que
 * reexporte el `fetch` de Astro y añada el `scheduled`:
 * `src/worker/entrada.ts`. Está enganchado en `wrangler.dev.jsonc` (canal de
 * pruebas); para producción, el cambio está en CLOUDFLARE.md, sin aplicar.
 *
 * LO QUE EL CRON ESCRIBE, Y LO QUE NO
 * ---------------------------------------------------------------------------
 * El cron ESCRIBE (caduca reservas); las lecturas de las páginas NO escriben
 * nunca (G.2). Ese reparto es el que permite que `/catalogo` siga siendo
 * cacheable: un GET que escribe no se puede cachear, y una ráfaga de visitas
 * se convertiría en una ráfaga de escrituras que se pagan (R4).
 */

import type { BaseD1Escritura } from './consultas/inventario-formas';
import { caducarVencidas } from './consultas/inventario-caducar';
import { cuadre } from './consultas/inventario-leer';

/** Lo que el barrido hizo, para que el log diga algo útil. */
export interface ResultadoBarrido {
  caducadas: number;
  descuadres: number;
  error?: string;
}

/**
 * EL BARRIDO DE CADA 5 MINUTOS.
 *
 * Caduca las reservas vencidas y, si toca, corre el cuadre. Devuelve lo que
 * hizo en vez de lanzar: un cron que revienta no deja constancia de nada, y
 * esto se ejecuta sin nadie mirando.
 *
 * **Cada 5 minutos y no cada minuto** porque una reserva de 30 minutos que se
 * libera a los 33 no molesta a nadie, y el cron escribe filas que se pagan
 * (R4). El retraso no se nota en el catálogo igualmente, porque la lectura
 * exacta descuenta solo las reservas vigentes (`stockExacto`): el peor retraso
 * visible es cero, no cinco minutos.
 *
 * `conCuadre` lo decide quien llama mirando la hora: el cuadre es una consulta
 * con subconsultas por variante y no hace falta cada 5 minutos. El plan lo
 * pide diario (G.4.4).
 */
export async function barrerReservas(
  db: BaseD1Escritura,
  conCuadre = false,
): Promise<ResultadoBarrido> {
  let caducadas = 0;
  let descuadres = 0;

  try {
    caducadas = await caducarVencidas(db);
    if (caducadas) {
      console.log(`[cron] ${caducadas} reserva(s) caducada(s): el stock vuelve al catálogo.`);
    }
  } catch (fallo) {
    const error = fallo instanceof Error ? fallo.message : String(fallo);
    console.error('[cron] el barrido de reservas falló:', error);
    /* Se sigue al cuadre: son dos trabajos independientes y que uno falle no
       es razón para no hacer el otro. */
    if (!conCuadre) return { caducadas, descuadres, error };
  }

  if (conCuadre) {
    try {
      const filas = await cuadre(db);
      descuadres = filas.length;
      if (descuadres) {
        /* UNA SOLA FILA AQUÍ ES UN BUG, no un error de Andreina: todo
           movimiento se escribe en el mismo `batch()` que el cambio de
           columna. Se registra con los números para poder encontrarlo. */
        console.error(
          `[cron] CUADRE: ${descuadres} variante(s) no cuadran con el libro. ` +
            'Es un bug, no un error de conteo. Detalle: ' +
            filas
              .map(
                (f) =>
                  `#${f.variante_id} ${f.producto_titulo}/${f.titulo} ` +
                  `fisico=${f.stock_fisico} libro=${f.segun_libro} ` +
                  `reservado=${f.stock_reservado} reservas=${f.reservas_activas}`,
              )
              .join(' | '),
        );
      } else {
        console.log('[cron] cuadre: todo coincide con el libro.');
      }
    } catch (fallo) {
      console.error(
        '[cron] el cuadre falló:',
        fallo instanceof Error ? fallo.message : fallo,
      );
    }
  }

  return { caducadas, descuadres };
}

/**
 * ¿Toca el cuadre en esta pasada?
 *
 * El cron corre cada 5 minutos; el cuadre es diario. En vez de declarar un
 * segundo Cron Trigger (que sería otra entrada en `wrangler.jsonc` y otra cosa
 * que mantener), se mira la hora: la primera pasada después de las 5:00 UTC,
 * que es medianoche en Colombia (UTC−5) y la hora de menos tráfico.
 */
export function tocaElCuadre(ahora: Date = new Date()): boolean {
  return ahora.getUTCHours() === 5 && ahora.getUTCMinutes() < 5;
}
