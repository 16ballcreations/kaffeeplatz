// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
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

  // FASE 1 de planes/kaffeeplatz-panel-admin.md (opcion B de B.3).
  // El modo pasa a 'server' SOLO para cambiar el envoltorio: el sitio se
  // despliega como un Worker en vez de assets puros. El contenido no cambia.
  //
  // Hoy TODAS las paginas llevan `export const prerender = true`, asi que el
  // build sigue generando las mismas 47 paginas en disco y el Worker solo las
  // sirve. El prerenderizado selectivo (quitar el flag de /catalogo, las
  // fichas y el diario) llega en la fase 3, cuando esas paginas lean de D1.
  output: 'server',
  adapter: cloudflare({
    // `platformProxy` da acceso a los bindings de wrangler.jsonc en `astro dev`.
    // Hoy no hay ninguno que usar (ni D1 ni R2 todavia), pero dejarlo activado
    // es lo que hara que `npm run dev` siga valiendo en la fase 3 sin cambiar
    // de comando.
    platformProxy: { enabled: true },

    // `sharp` NO corre en un Worker. Con "compile" las imagenes se optimizan
    // en el build (en Node, donde sharp si corre) y en tiempo de ejecucion no
    // se intenta nada: es exactamente lo que necesita un sitio 100%
    // prerenderizado como el de esta fase. Sin esto el adaptador avisa en cada
    // build de que sharp no esta disponible en el runtime.
    imageService: 'compile',
  }),
  trailingSlash: 'ignore',
  image: {
    // Las imagenes de origen son locales (public/img + src/assets), no hay
    // dominios remotos. `sharp` NO corre en un Worker, pero aqui no hace
    // falta que corra: al estar todo prerenderizado, las imagenes se procesan
    // en el build (en Node) y lo que se despliega son los ficheros ya hechos.
    // Si en la fase 3 alguna pagina con <Imagen> deja de prerenderizarse,
    // habra que pasar a las transformaciones de Cloudflare Images (B.4).
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
