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
| URL de pruebas | https://kaffeeplatz.16ballcreations.workers.dev |
| Configuración | `wrangler.jsonc` (sirve `dist/`) |

## Publicar

```bash
npm run deploy
```

Construye con `astro build` y sube `dist/` con `wrangler deploy`. Hace falta
haber iniciado sesión una vez con `npx wrangler login` en la cuenta de
16ballcreations.

`SITE_URL` no hace falta mientras se publique en la dirección `.workers.dev`,
que es el valor por defecto de `astro.config.mjs`. `BASE_PATH` tampoco: en
Cloudflare el sitio va en la raíz.

GitHub Pages sigue publicándose solo con cada push a `main`, bajo
`/kaffeeplatz/` (el workflow le pasa `BASE_PATH` y `SITE_URL`).

## Mientras sea una evaluación

`public/_headers` añade `X-Robots-Tag: noindex, nofollow` a todo el sitio en
Cloudflare, para que no compita en buscadores con el Shopify que sigue en
producción. Se quita el día que el sitio pase a ser el oficial.

## Dominio propio: kaffeeplatz.co

> Ojo con el orden: no conviene apuntar el dominio hasta que el contenido esté
> aprobado, porque el Shopify actual sigue en producción ahí.

1. **Mover los DNS a Cloudflare.** Un Worker solo admite dominios cuyos
   nameservers estén en Cloudflare. Añadir `kaffeeplatz.co` a la cuenta,
   revisar que se importen todos los registros (el correo, sobre todo) y
   cambiar los nameservers en el registrador. Hasta este punto el sitio de
   Shopify sigue igual: solo cambia quién sirve el DNS.
2. **Redirecciones desde Shopify.** Las URL viejas (`/products/...`,
   `/blogs/...`, `/pages/...`, `/collections/...`) tienen que llevar con 301
   a las nuevas, o se pierde el posicionamiento. Van en `public/_redirects`.
3. **Conectar el dominio.** Descomentar las `routes` de `wrangler.jsonc`,
   quitar el bloque de `public/_headers` y publicar con el dominio:

   ```bash
   SITE_URL=https://kaffeeplatz.co npm run deploy
   ```

   Así las URL canónicas, Open Graph y los datos estructurados apuntan al
   dominio real.

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
