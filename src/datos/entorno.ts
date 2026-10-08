/**
 * Entorno de publicación.
 *
 * El proyecto tiene DOS destinos y no son equivalentes:
 *
 *   DESARROLLO  16ballcreations.github.io/kaffeeplatz/
 *               Donde se prueban las ramas antes de nada. NO se indexa.
 *
 *   PRODUCCION  kaffeeplatz.co
 *               Cloudflare Workers. Se publica a mano con `npm run deploy`.
 *               Es el unico que se indexa.
 *
 * Que un entorno de pruebas acabe en Google es un problema real: compite con
 * el sitio bueno por las mismas busquedas, reparte la autoridad entre dos
 * dominios y puede acabar mostrando a un cliente precios o productos que
 * todavia no existen. Por eso el bloqueo NO depende de que alguien se acuerde
 * de activarlo: se deduce del dominio en que se construye.
 *
 * `site` lo fija SITE_URL en el momento del build (ver astro.config.mjs y el
 * workflow de GitHub Pages).
 */

/** Dominio del sitio real. Lo demas es desarrollo. */
const DOMINIO_PRODUCCION = 'kaffeeplatz.co';

/**
 * ¿Esta construccion va al sitio publico?
 *
 * Se le pasa `Astro.site`. Si no hay `site` (p. ej. `astro dev`), se considera
 * desarrollo: ante la duda, no indexar. Es el fallo seguro.
 */
export function esProduccion(site: URL | undefined): boolean {
  if (!site) return false;
  return site.hostname === DOMINIO_PRODUCCION || site.hostname.endsWith(`.${DOMINIO_PRODUCCION}`);
}

/** Lo contrario, para leerlo mejor donde toca. */
export const esDesarrollo = (site: URL | undefined): boolean => !esProduccion(site);
