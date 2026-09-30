# Desplegar Obsidiana II en Cloudflare Pages

La propuesta **D · Obsidiana II** (`propuestas/d-obsidiana-v2`) es la elegida.
Estos son los parámetros para conectarla a Cloudflare Pages desde el repo de
GitHub, de modo que cada push a `main` despliegue solo.

## Crear el proyecto

En el panel de Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**,
y elige `16ballcreations/kaffeeplatz`.

## Configuración de build

| Campo | Valor |
|---|---|
| Production branch | `main` |
| Framework preset | `Astro` (o *None*, da igual: los comandos mandan) |
| Build command | `npm ci && npm i @phosphor-icons/core && cd propuestas/d-obsidiana-v2 && ln -sfn ../../node_modules node_modules && npm run build` |
| Build output directory | `propuestas/d-obsidiana-v2/dist` |
| Root directory | *(vacío: la raíz del repo)* |

## Variables de entorno

Estas dos son **imprescindibles**: sin ellas el sitio se construye esperando
vivir bajo `/kaffeeplatz/d-obsidiana-v2/` y en Cloudflare va en la raíz, con lo
que todos los enlaces y las imágenes darían 404.

| Variable | Valor |
|---|---|
| `BASE_PATH` | `/` |
| `SITE_URL` | La URL final del proyecto, p. ej. `https://kaffeeplatz.pages.dev` — o el dominio propio cuando se conecte |
| `NODE_VERSION` | `20` |

`astro.config.mjs` lee ambas con un valor por defecto, así que el build de
GitHub Pages sigue funcionando sin tocar nada.

## Dominio propio

Cuando la propuesta se apruebe y haya que migrar `kaffeeplatz.co`:

1. **Custom domains → Set up a domain** en el proyecto de Pages.
2. Cloudflare pedirá que el dominio esté en la cuenta (si el DNS está en otro
   proveedor, hay que moverlo o apuntar un CNAME).
3. Actualizar `SITE_URL` a `https://kaffeeplatz.co` y volver a desplegar, para
   que el sitemap y las URLs canónicas apunten al dominio real.

> Ojo con el orden: no conviene apuntar el dominio hasta que el contenido esté
> aprobado, porque el Shopify actual sigue en producción ahí.

## Nota sobre las otras propuestas

A, B y C se siguen publicando en GitHub Pages con la portada comparativa. El
workflow de `.github/workflows/deploy.yml` no cambia; Cloudflare es un destino
adicional, no un reemplazo.
