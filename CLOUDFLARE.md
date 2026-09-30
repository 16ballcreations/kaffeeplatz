# Desplegar Obsidiana II en Cloudflare Pages

**Obsidiana II** es el sitio, y vive en la raíz del repo. Estos son los
parámetros para conectarlo a Cloudflare Pages desde GitHub, de modo que cada
push a `main` despliegue solo.

## Crear el proyecto

En el panel de Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**,
y elige `16ballcreations/kaffeeplatz`.

## Configuración de build

| Campo | Valor |
|---|---|
| Production branch | `main` |
| Framework preset | `Astro` (o *None*, da igual: los comandos mandan) |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Root directory | *(vacío: la raíz del repo)* |

## Variables de entorno

Estas dos son **imprescindibles**: sin ellas el sitio se construye esperando
vivir bajo `/kaffeeplatz/d-obsidiana-v2/` y en Cloudflare va en la raíz, con lo
que todos los enlaces y las imágenes darían 404.

| Variable | Valor |
|---|---|
| `SITE_URL` | La URL final del proyecto, p. ej. `https://kaffeeplatz.pages.dev` — o el dominio propio cuando se conecte |
| `NODE_VERSION` | `20` |

`BASE_PATH` ya no hace falta: el sitio vive en la raíz del repo y ese es su
valor por defecto. Solo se pasa si algún día hay que publicarlo bajo un
subdirectorio.

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

## Las propuestas anteriores

A · Imprenta, B · Galería y C · Obsidiana están archivadas en la rama
`archivo/propuestas-abc`. Ya no se publican desde `main`; para recuperarlas:

```bash
git checkout archivo/propuestas-abc
```
