// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://16ballcreations.github.io',
  base: '/kaffeeplatz/a-imprenta',
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
