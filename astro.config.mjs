// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Variables de entorno del build. Se leen via globalThis para que el
// chequeo de tipos no exija @types/node solo por esta linea.
const entorno = /** @type {Record<string, string | undefined>} */ (
  /** @type {any} */ (globalThis).process?.env ?? {}
);

// https://astro.build/config
export default defineConfig({
  // El sitio vive en la RAIZ de su dominio. Ambos valores son parametrizables
  // por entorno para poder publicarlo tambien bajo un subdirectorio (GitHub
  // Pages) sin mantener dos configs divergentes.
  site: entorno.SITE_URL ?? 'https://kaffeeplatz.co',
  base: entorno.BASE_PATH ?? '/',
  output: 'static',
  trailingSlash: 'ignore',
  image: {
    // Las imagenes de origen son locales (public/img + src/assets), no hay dominios remotos.
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
