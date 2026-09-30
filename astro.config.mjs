// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // El sitio vive en la RAIZ de su dominio. Ambos valores son parametrizables
  // por entorno para poder publicarlo tambien bajo un subdirectorio (GitHub
  // Pages) sin mantener dos configs divergentes.
  site: process.env.SITE_URL ?? 'https://kaffeeplatz.16ballcreations.workers.dev',
  base: process.env.BASE_PATH ?? '/',
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
