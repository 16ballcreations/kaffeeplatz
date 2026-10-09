/**
 * worker/entrada.ts — el envoltorio que le añade `scheduled()` al Worker.
 * ===========================================================================
 * NO ESTÁ ENGANCHADO TODAVÍA. Para activarlo hay que cambiar dos líneas de
 * `wrangler.jsonc`, y este trabajo no toca ese fichero a propósito: el bloque
 * exacto está en el informe de entrega para que lo añada quien integre.
 *
 * POR QUÉ HACE FALTA UN ENVOLTORIO
 * ---------------------------------------------------------------------------
 * El Cron Trigger de Cloudflare invoca el export `scheduled()` del Worker.
 * Pero `main` en wrangler.jsonc apunta a `dist/_worker.js/index.js`, que lo
 * GENERA `@astrojs/cloudflare` en cada build y que exporta SOLO un `default`
 * con `fetch`. Añadirle `scheduled` ahí es imposible de mantener: el fichero
 * se reescribe en cada `npm run build`.
 *
 * La salida estándar es esta: un módulo propio que importa el Worker generado,
 * reexporta su `fetch` sin tocarlo y añade el `scheduled`. El sitio sigue
 * sirviéndose exactamente igual —la misma función, el mismo código— y encima
 * se cuelga el cron.
 *
 * POR QUÉ ESTE FICHERO NO ESTÁ EN `src/pages/` NI EN `src/datos/`
 * ---------------------------------------------------------------------------
 * No es una página ni es la capa de datos: es el punto de entrada del runtime,
 * que es una tercera cosa. `src/worker/` deja claro que lo que hay dentro
 * habla con Cloudflare y no con Astro.
 *
 * SOBRE EL `@ts-ignore` DE ABAJO, Y POR QUÉ NO ES `@ts-expect-error`
 * ---------------------------------------------------------------------------
 * `dist/` es un artefacto del build: existe o no según si alguien compiló
 * antes de chequear. `@ts-expect-error` EXIGE que haya un error, así que da
 * «Unused '@ts-expect-error' directive» justo cuando `dist/` sí está — o sea,
 * el chequeo fallaría o no según el orden en que se corran los comandos, que
 * es la peor clase de fallo. `@ts-ignore` es el correcto aquí precisamente
 * porque el error es CONDICIONAL. No es un atajo: la dependencia va en la
 * dirección correcta (el envoltorio depende del build, no al revés) y el tipo
 * no se puede conocer antes de generarlo.
 */

import { barrerReservas, tocaElCuadre } from '../datos/barrido';
import type { BaseD1Escritura } from '../datos/consultas/inventario-formas';

/* El Worker que genera Astro en cada build. Ver la nota de la cabecera. */
// @ts-ignore — `dist/` puede no existir en tiempo de chequeo; lo crea el build.
import astro from '../../dist/_worker.js/index.js';

interface EntornoWorker {
  DB?: BaseD1Escritura;
  [clave: string]: unknown;
}

interface ContextoCron {
  waitUntil?: (promesa: Promise<unknown>) => void;
}

export default {
  /* El `fetch` de Astro, intacto. El sitio no se entera de que esto existe. */
  fetch: (astro as { fetch: (...a: unknown[]) => Promise<Response> }).fetch,

  /**
   * El Cron Trigger. Cada 5 minutos, según `triggers.crons` de wrangler.jsonc.
   *
   * NO LANZA NUNCA. Un `scheduled` que revienta no deja constancia útil y esto
   * corre sin nadie delante; `barrerReservas` ya devuelve lo que hizo y
   * registra sus fallos. Aquí solo se atrapa lo que ni eso pudo prever (que no
   * haya binding, por ejemplo), para que el log diga la verdad.
   */
  async scheduled(
    _evento: { cron?: string; scheduledTime?: number },
    env: EntornoWorker,
    _ctx: ContextoCron,
  ): Promise<void> {
    const db = env.DB;
    if (!db?.prepare) {
      console.error(
        '[cron] no hay binding DB: el barrido de reservas no corre. ' +
          'Comprueba `d1_databases` en wrangler.jsonc.',
      );
      return;
    }
    try {
      await barrerReservas(db, tocaElCuadre());
    } catch (fallo) {
      console.error(
        '[cron] el barrido falló de forma inesperada:',
        fallo instanceof Error ? fallo.message : fallo,
      );
    }
  },
};
