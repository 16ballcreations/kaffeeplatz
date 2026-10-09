/**
 * env.d.ts — qué hay en `Astro.locals`.
 *
 * POR QUE ESTE FICHERO EXISTE
 * ===========================================================================
 * `Astro.locals` es el saco donde el adaptador deja los bindings de Cloudflare
 * y donde las páginas dejan sus etiquetas de caché. Sin declararlo, TypeScript
 * no sabe que `locals.runtime` existe y `astro check` da error en el middleware.
 *
 * Pero el motivo de fondo es mejor que callar un error: este fichero es EL
 * CONTRATO de lo que una página puede esperar en `locals` y de lo que puede
 * dejar ahí. Es el sitio donde se lee, de un vistazo, qué atraviesa la petición.
 */

declare namespace App {
  interface Locals {
    /**
     * Lo que inyecta `@astrojs/cloudflare`. En producción lo pone el runtime de
     * Workers; en `astro dev` lo pone `platformProxy` (activado en
     * astro.config.mjs), así que el mismo código vale en los dos sitios.
     *
     * `env.DB` es la base del catálogo (`d1_databases` de wrangler.jsonc). NO se
     * usa directamente desde ninguna página: la única frontera con D1 son
     * `src/datos/catalogo.ts` y `src/datos/diario.ts` (regla F.1 del plan).
     *
     * `ctx.waitUntil` deja que la respuesta salga sin esperar a que se escriba
     * la copia de caché de respaldo.
     */
    runtime?: {
      env?: {
        DB?: unknown;
        [clave: string]: unknown;
      };
      ctx?: {
        waitUntil?: (promesa: Promise<unknown>) => void;
      };
    };

    /**
     * De qué depende esta página, para poder purgar solo lo que cambió cuando
     * la dueña guarde (R2/R9) en vez de tirar la caché entera.
     *
     * La página la escribe con `marcarEtiquetas(Astro.locals, [...])` y el
     * middleware la lee. Una página dinámica que NO la ponga no se cachea, que
     * es el valor por defecto seguro: cachear algo que no debía es peor que no
     * cachear algo que podía.
     */
    etiquetasCache?: string[];

    /**
     * FASE 4. La sesión del panel, puesta por la puerta (`src/admin/puerta.ts`).
     *
     * Una página de `/admin` puede dar por hecho que esto EXISTE: si no hubiera
     * sesión, la puerta habría cortado la petición en el middleware y la página
     * no se estaría renderizando. Es opcional en el tipo porque en las rutas
     * públicas no está, no porque una página del panel deba comprobarlo.
     */
    panel?: {
      sesion: { id: string; expira: Date };
    };

    /**
     * La cookie de sesión renovada, si la puerta decidió estirar la caducidad
     * en esta petición. La entrega el middleware; ninguna página la toca.
     */
    cookieRenovada?: string;
  }
}
