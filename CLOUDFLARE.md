# Publicar KaffeePlatz en Cloudflare

**Obsidiana II** es el sitio, y vive en la raíz del repo. En Cloudflare se
publica como **Worker con assets estáticos** llamado `kaffeeplatz`, igual que
los demás proyectos de la cuenta (psicoformando, lex-pretor). Cloudflare
recomienda Workers en lugar de Pages para proyectos nuevos: Pages sigue
funcionando, pero las novedades llegan a Workers.

| | |
|---|---|
| Cuenta | 16ballcreations@gmail.com |
| Worker | `kaffeeplatz` |
| Sitio | **https://kaffeeplatz.co** (y `www.`), en producción desde 2026-09-30 |
| URL de pruebas | https://kaffeeplatz.16ballcreations.workers.dev |
| DNS | Cloudflare (nameservers `gail` y `houston.ns.cloudflare.com`; registrador GoDaddy) |
| Configuración | `wrangler.jsonc` (sirve `dist/`) |

## Publicar

```bash
npm run deploy
```

Construye con `astro build` y sube `dist/` con `wrangler deploy` al dominio.
Hace falta haber iniciado sesión una vez con `npx wrangler login` en la
cuenta de 16ballcreations.

`SITE_URL` vale `https://kaffeeplatz.co` por defecto (`astro.config.mjs`):
canonical, Open Graph, datos estructurados y sitemap apuntan al dominio sin
www. `BASE_PATH` no hace falta: en Cloudflare el sitio va en la raíz.

GitHub Pages sigue publicándose solo con cada push a `main`, bajo
`/kaffeeplatz/` (el workflow le pasa su propio `BASE_PATH` y `SITE_URL`).

Antes de publicar: si cambiaron fotos, `npm run imagenes`; si cambiaron
productos o artículos del respaldo de Shopify, `npm run redirecciones`.

## Dominio: cómo quedó

- **Las rutas** de `wrangler.jsonc` conectan `kaffeeplatz.co` y
  `www.kaffeeplatz.co` al Worker. Cloudflare gestiona sus registros DNS y el
  certificado: no hay que crear registros a mano para el sitio.
- **Redirecciones 301** desde las URL de Shopify en `public/_redirects`
  (lo genera `npm run redirecciones`): productos, diario, colecciones,
  páginas fijas, carrito, cuenta y políticas.
- **Buscadores:** `/sitemap.xml` y `/robots.txt`. Se quitó el `noindex` de la
  etapa de evaluación.
- **Shopify** se retira: sus registros (`A @`, `www`, `pagos`, verificación)
  ya no existen.

Pendiente en el panel de Cloudflare: **SSL/TLS → Edge Certificates → Always
Use HTTPS**, para que `http://` redirija a `https://`.

## Despliegue automático (opcional)

Si se quiere que cada push a `main` publique también en Cloudflare, se puede
conectar el repo desde el panel: **Workers & Pages → kaffeeplatz → Settings →
Builds → Connect**, con `npm run build` como comando de build y
`npx wrangler deploy` como comando de despliegue.

## Las propuestas anteriores

A · Imprenta, B · Galería y C · Obsidiana están archivadas en la rama
`archivo/propuestas-abc`. Ya no se publican desde `main`; para recuperarlas:

```bash
git checkout archivo/propuestas-abc
```
