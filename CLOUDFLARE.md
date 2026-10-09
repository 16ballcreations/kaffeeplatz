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
| Configuración | `wrangler.jsonc` (`main` + assets de `dist/`) |

## Modo servidor (fase 1 del panel de administración)

Desde la rama `feature/modo-servidor`, el sitio se construye en **modo
servidor** con `@astrojs/cloudflare` en vez de como sitio estático puro. Es un
cambio de **envoltorio**, no de contenido: el objetivo de esta fase es que el
sitio salga idéntico.

**Qué cambió y por qué:**

| Fichero | Cambio | Por qué |
|---|---|---|
| `package.json` | `@astrojs/cloudflare@12.6.13` | Es la última rama del adaptador compatible con Astro 5 (pide `astro ^5.7.0`). La 13.x exige Astro 6 y la 14.x Astro 7: **no se puede subir sin subir Astro**, y Astro está anclado a propósito |
| `astro.config.mjs` | `output: 'server'` + `adapter: cloudflare(...)` | Lo que pide la opción B del plan. `site` y `base` se conservan tal cual, con su parametrización por `SITE_URL` / `BASE_PATH` |
| `astro.config.mjs` | `imageService: 'compile'` | `sharp` no corre en un Worker. Con `compile` las imágenes se optimizan en el build (en Node) y en ejecución no se intenta nada. Es lo correcto mientras todo esté prerrenderizado |
| Las 10 páginas | `export const prerender = true` | En esta fase **nada** es dinámico: el build sigue generando las mismas 47 páginas y el Worker solo las sirve |
| `wrangler.jsonc` | `main`, `compatibility_flags`, `assets.binding` | `main` apunta al Worker que genera el adaptador. `nodejs_compat` lo necesita el renderizador de Astro. El bloque `routes` **no se tocó** |

**Lo que NO cambió:** la fuente de datos. Las páginas siguen leyendo de
`getCollection`; D1 llega en la fase 2.

### Cómo volver atrás (R6 del plan)

El sitio está en producción: hay que poder revertir en minutos. Como el
dominio apunta al Worker `kaffeeplatz`, volver atrás es **volver a desplegar
la versión estática**.

**Opción 1 — revertir el despliegue desde Cloudflare (lo más rápido, ~1 min).**
No necesita el repositorio: en el panel, **Workers & Pages → kaffeeplatz →
Deployments**, se elige el despliegue anterior y **Rollback**. Es el camino a
usar si el sitio ya está caído.

**Opción 2 — volver a publicar el estático desde git (~3 min).**

```bash
git checkout main          # main sigue siendo el sitio estatico
npm ci                     # sin @astrojs/cloudflare
npm run build              # genera dist/ sin _worker.js
npx wrangler deploy        # vuelve a publicar como assets puros
```

Para que esto funcione, `main` **no debe** llevar los cambios de esta fase
hasta que el modo servidor esté validado en producción. Mientras tanto viven
en `feature/modo-servidor`.

**Comprobación antes de dar por buena la vuelta atrás:** que `dist/` NO
contenga `_worker.js`, y que `wrangler.jsonc` no tenga `main`. Si queda
`main` apuntando a un `_worker.js` que ya no se genera, el despliegue falla.

**Ensayar esto una vez antes de publicar**, no suponerlo: el plan lo pide
explícitamente (R6).

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

## D1: la base del catálogo y el diario

Desde la fase 2 del plan del panel, el catálogo y el diario viven en **D1**.
El sitio los lee en cada petición (con caché de borde delante), no del build.

**En esta rama todo es LOCAL.** No se ha creado nada en Cloudflare: el
`database_id` de `wrangler.jsonc` es un marcador a propósito, para que un
despliegue accidental falle en vez de escribir en una base equivocada.

```bash
npm run d1:migrar     # aplica migrations/ a la base local (.wrangler/state/)
npm run d1:sembrar    # genera tmp/semilla.sql y lo carga
npm run d1:comparar   # verifica campo a campo contra los JSON/MD
```

### Lo que falta para publicar (fases 0 y 8 del plan)

1. `npx wrangler d1 create kaffeeplatz` y pegar el `database_id` real en
   `wrangler.jsonc`, sustituyendo el marcador.
2. `npx wrangler d1 migrations apply kaffeeplatz --remote`.
3. Revisar `tmp/semilla.sql` **antes** de cargarlo, y
   `npx wrangler d1 execute kaffeeplatz --remote --file tmp/semilla.sql`.
4. **Workers Paid** antes de abrir al público (R4 del plan): son 5 USD al mes y
   quitan de encima el modo de fallo "la tienda se apaga a mediodía porque se
   acabó la cuota del plan gratuito". Desde el 1 sep 2026 las consultas
   **fallan** al pasarse, no se degradan.
5. Probar en `kaffeeplatz.16ballcreations.workers.dev` antes de tocar el
   dominio.

### Si D1 se cae, el sitio NO se cae (R1)

Tres capas, probadas: (1) D1 responde y la página se guarda en la Cache API;
(2) D1 falla y se sirve **la copia aunque esté vencida**, registrando el fallo;
(3) no hay copia → página de cortesía con el WhatsApp de Andreina y **503 con
`Retry-After`**. Nunca un 500 desnudo ni un 200 con la tienda vacía.

Para distinguirlo desde fuera, las respuestas de emergencia llevan la cabecera
`X-KP-Origen` (`cache-vencida` o `cortesia`). Si aparece en producción, algo
pasa aunque la tienda se vea bien.

## Cron de reservas (fase 9, inventario)

Las reservas de un pago en curso duran 30 minutos (sección G.2 del plan del
panel). Cada 5 minutos, un **Cron Trigger** las caduca y devuelve esas unidades
al catálogo; una vez al día, a las 5:00 UTC (medianoche en Colombia), comprueba
además que la cuenta de cada producto cuadra con su historial.

El Worker que genera Astro (`dist/_worker.js/index.js`) solo exporta `fetch`, y
se regenera en cada build: no se le puede añadir el `scheduled()` que invoca el
cron. Por eso hay un envoltorio, **`src/worker/entrada.ts`**, que importa ese
Worker, reexporta su `fetch` **intacto** y añade `scheduled()`.

**Estado: enganchado SOLO en el canal de pruebas** (`wrangler.dev.jsonc`).
Producción (`wrangler.jsonc`) no se ha tocado.

### El cambio para producción (NO aplicado)

En `wrangler.jsonc`, dos cosas — `main` y un bloque `triggers` nuevo. Nada más
cambia: `assets`, `routes` y `d1_databases` se quedan como están.

```jsonc
  // antes:  "main": "./dist/_worker.js/index.js",
  "main": "./src/worker/entrada.ts",

  "triggers": {
    "crons": ["*/5 * * * *"]
  },
```

**`npm run build` tiene que ir ANTES de desplegar** (ya lo hace `npm run
deploy`): el envoltorio importa `dist/_worker.js/index.js`, y wrangler lo empaqueta
junto con él. Sin build previo, el despliegue falla al no encontrar ese fichero
(falla ruidosamente, no sube nada a medias).

### Cómo se comprobó (y cómo repetirlo antes de producción)

```bash
npm run build
npx wrangler dev --local --config wrangler.dev.jsonc --test-scheduled
# en otra terminal:
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"   # → "Ran scheduled event"
```

Comprobado el 9 oct 2026 en local:

- Una reserva vencida pasa a `caducada`, `stock_reservado` baja lo que tenía y
  queda su movimiento `reserva_caducada` (quien = `cron`). Una segunda pasada
  no hace nada (la condición va en el `WHERE`).
- **El sitio se sirve igual**: las 40 páginas públicas (incluidas las
  prerenderizadas `/contacto/`, `/nosotros/`, `/cafe/`, el sitemap y los
  assets) salen idénticas byte a byte a las del `main` de Astro, y las
  cabeceras (caché, `Cache-Tag`, 301 de Shopify, 404, la puerta de `/admin`)
  también.

Nota: en local, `/__scheduled` ignora `?time=` y usa la hora del reloj, así que
el cuadre diario no se puede forzar desde ahí. Usa la misma consulta que el
aviso de la pantalla de inventario del panel, que sí se probó.

### Volver atrás

Quitar el bloque `triggers` y devolver `main` a `./dist/_worker.js/index.js`, y
desplegar. El inventario sigue funcionando sin cron: la lectura descuenta solo
las reservas vigentes y el checkout caduca las de sus variantes antes de
reservar (G.2); lo único que se pierde es que `stock_reservado` baje solo.

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
