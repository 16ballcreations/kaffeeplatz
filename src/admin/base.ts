/**
 * base.ts — el binding de D1 visto desde el panel, que además ESCRIBE.
 *
 * POR QUE NO SE REUTILIZA `BaseD1` DE `consultas/productos.ts`
 * ===========================================================================
 * Ese tipo declara `all` y `first` y nada más: es el contrato del SITIO
 * PUBLICO, que solo lee. Eso no es un descuido, es la garantía más barata que
 * tiene este proyecto de que una página pública no pueda escribir en el
 * catálogo aunque alguien lo intente por error — no hay método que llamar.
 *
 * El panel sí escribe, así que necesita `run()` y `batch()`. Se declara aquí,
 * en `src/admin/`, en vez de ensanchar el tipo compartido: el permiso de
 * escritura queda acotado al único directorio que debe tenerlo, y el día que
 * alguien lea `consultas/productos.ts` seguirá viendo un tipo de solo lectura.
 *
 * `BaseAdmin` es un supertipo de `BaseD1` en la práctica, así que las consultas
 * del sitio público (`todosLosProductos`, etc.) aceptan un `BaseAdmin` sin
 * conversiones. El panel reutiliza esas consultas para `/admin`.
 */

/** Resultado de una escritura. `changes` es lo que dice si cambió algo de verdad. */
export interface ResultadoEscritura {
  meta?: { changes?: number; last_row_id?: number };
}

export interface SentenciaPreparada {
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<ResultadoEscritura>;
}

export interface BaseAdmin {
  prepare(sql: string): SentenciaPreparada & {
    bind(...valores: unknown[]): SentenciaPreparada;
  };
  /**
   * `batch` corre en una transacción implícita. Es el patrón 2 de A.6 («batch()
   * para lo que debe pasar junto») y lo usarán las fases 5–7 para guardar un
   * producto con sus variantes e imágenes sin que pueda quedar a medias. La
   * fase 4 no lo necesita todavía; el tipo lo declara para que esté ahí.
   */
  batch?(sentencias: unknown[]): Promise<ResultadoEscritura[]>;
}

/**
 * El binding, sacado de `Astro.locals`. Lanza si no está.
 *
 * Mismo criterio que `base()` de `src/datos/catalogo.ts`: que falte el binding
 * es un error de CONFIGURACION, no un fallo de la base, y confundirlos haría
 * que un despliegue mal montado se viera como «D1 está caído».
 *
 * Aquí, además, el panel no tiene caché de respaldo que servir: si no hay base,
 * no hay sesión que comprobar, y la puerta trata eso como «no hay sesión» y
 * manda a entrar. Falla cerrado.
 */
export function baseAdmin(locals: unknown): BaseAdmin {
  const env = (locals as { runtime?: { env?: Record<string, unknown> } })?.runtime?.env;
  const db = env?.DB as BaseAdmin | undefined;
  if (!db?.prepare) {
    throw new Error(
      'El binding DB no está disponible. Comprueba `d1_databases` en wrangler.jsonc ' +
        'y que la base local exista (npm run d1:migrar && npm run d1:sembrar).',
    );
  }
  return db;
}

/** El valor de un secreto del Worker (`.dev.vars` en local, `wrangler secret` en producción). */
export function secreto(locals: unknown, nombre: string): string | undefined {
  const env = (locals as { runtime?: { env?: Record<string, unknown> } })?.runtime?.env;
  const v = env?.[nombre];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
