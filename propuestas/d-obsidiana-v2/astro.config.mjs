// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Parametrizables por entorno: en GitHub Pages el sitio vive bajo
  // /kaffeeplatz/d-obsidiana-v2, pero en Cloudflare Pages va en la RAIZ de su
  // dominio. Sin esto habria que mantener dos configs divergentes.
  site: process.env.SITE_URL ?? 'https://16ballcreations.github.io',
  base: process.env.BASE_PATH ?? '/kaffeeplatz/d-obsidiana-v2',
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
