# Plan: panel de administración para KaffeePlatz

Preparado desde 16 Ball Creations el 8 oct 2026. Es para que otro agente lo ejecute en el repositorio de KaffeePlatz. Este documento es el encargo: léelo completo antes de tocar código.

## Resumen para quien decide

El cliente pidió un panel donde la dueña edite el catálogo y el diario, con **D1 como fuente de verdad y el sitio leyendo en vivo**. Esa decisión está tomada y este plan la respeta.

Cinco cosas que hay que decir antes de empezar, con números (la quinta se añadió el 8 oct 2026, con el inventario):

1. **Es más trabajo del que suele imaginarse.** No es "agregar un `/admin`": es cambiar el modo de renderizado de un sitio que ya está en producción. El total estimado es **78–109 horas** (eran 64–90 antes de que entrara el inventario el 8 oct 2026: ver el punto 5 y la sección G). El panel en sí (fases 4–7 y 9) son 48–67; el resto es la infraestructura para que el sitio pueda leer de D1 sin perder lo que ya tiene (imágenes responsivas, SEO, velocidad).
2. **Recomendación firme: adaptador de Cloudflare para Astro, con prerenderizado selectivo.** No duplicar el HTML en plantillas del Worker. El diseño Obsidiana II son **3.464 líneas de CSS** y ~2.600 de `.astro` entre páginas y componentes; reescribir eso en strings dentro del Worker costaría 25–35 horas adicionales y dejaría dos copias del diseño divergiendo para siempre. El detalle está en la sección C.
3. **El modelo de imágenes por variante NO es una extensión menor, y conviene saberlo antes de empezar.** El cliente lo describe como "una extensión de lo que ya existe, sin demasiado drama". La parte de datos sí lo es (ya existe el campo `variante` y la galería ya lo lee). Pero **obliga a replantear dos cosas que hoy no existen**: la noción de *portada* (hoy es implícitamente "la primera foto del array", y con 9 fotos de 3 colores eso deja de significar nada) y el comportamiento de la galería al cambiar de color (hoy cambia **una** foto grande; con el modelo nuevo tiene que **recomponer la fila de miniaturas**, que es un cambio de lógica, no de dato). Son **12–17 horas** de las que ~5–7 son de la ficha pública, no del panel. Detalle en B.7.
4. **Hay una alternativa más barata que conviene poner sobre la mesa antes de la fase 0.** Si lo que la dueña necesita de verdad es "editar sin pedirle nada a nadie", un panel que escribe en D1 y **dispara un build** (3–5 minutos de retraso, sitio 100% estático) cuesta **42–57 horas** en vez de 78–109 (eran 28–38 contra 64–90 antes de que entrara el inventario; esa fase 9 cuesta lo mismo en las dos opciones, porque el stock vive en D1 de todas formas), y no añade ningún riesgo de caída. No es lo que se pidió, pero es honesto ponerle precio: la diferencia son unas 40 horas y un modo de fallo nuevo. Ver "Opción D" en la sección C. Si el cliente confirma que quiere ver el cambio al instante, se sigue con la recomendación 2 y ya está.

5. **AÑADIDO EL 8 OCT 2026: el inventario entra en el alcance, y supera una decisión anterior.** El cliente pidió poder cargar y descontar cantidades desde el panel para las ventas que se cierran por WhatsApp, y que lo vendido quede bloqueado en una lista de «productos a despachar». Eso significa **llevar stock**, lo que **deja sin vigencia** la decisión previa de «confirmación manual de la dueña, sin llevar stock» (plan del carrito, decisión 4) que este documento tenía en «Fuera de alcance». El diseño completo es la **sección G** y es la **fase 9: 14–19 horas**, con lo que el total pasa de 64–90 a **78–109**. La razón del cambio, para quien lea esto dentro de un año, está en **G.0**: hay dos vías de venta compitiendo por las mismas unidades, y un sí/no manual no puede con eso sin cobrar alguna vez por algo que ya se vendió.

**Nota sobre dos cifras de este documento que corrigen lo que se asumió al encargarlo.** El encargo hablaba de 56 imágenes; el recuento real es **30 referencias de producto sobre 29 ficheros** (21 de los 25 productos tienen una sola foto) más **16 portadas del diario**. Las 270 entradas de `public/img` son casi todas derivados generados. La cifra importa porque cambia la escala del trabajo de imágenes: hoy el catálogo está **casi vacío de fotos**, y lo que el cliente describe (9 fotos para la Aeropress Clear) significa que **la dueña va a multiplicar el material fotográfico por tres o cuatro**. El panel hay que diseñarlo para ese volumen futuro, no para las 30 de hoy.

---

# A. Cómo funciona el panel de 16bc

Fuente leída: `/home/xan217/Documents/Dev/16bc/16ballcreations-site/worker/index.js` (1.668 líneas), `wrangler.jsonc`, `migrations/0001`–`0007`, `scripts/prospectos-sql.mjs`, `README.md`. **No se modificó nada de ese repositorio.**

## A.1 Rutas de `/admin`

El Worker es un único `fetch` con una cadena de `if` sobre `path` (líneas 38–70). Todo lo que empieza por `/admin` entra en la función `admin()` (línea 256), que vuelve a ramificar por ruta y método.

| Ruta | Qué hace |
|---|---|
| `GET /admin` | Panel de inicio: mosaico con lo pendiente y seguimientos del día (`dashboardPage`, 389) |
| `GET /admin/mira`, `/admin/contacto` | Listados de formularios recibidos, con filtro "solo sin revisar" (`submissionsPage`, 426) |
| `POST /admin/revisado` | Marca un envío como revisado o no, y vuelve a donde estaba (262–270) |
| `GET /admin/autorizaciones` | Autorizaciones de uso de imagen (`authorizationsPage`, 442) |
| `GET POST /admin/autorizacion` | Crear una nueva, ya firmada por Renne (525, 652) |
| `GET POST /admin/autorizacion/editar` | Corregir una que nadie ha firmado todavía (598, 625) |
| `POST /admin/autorizacion/borrar` | Borrar, con confirmación en el navegador (645) |
| `GET /admin/testimonios` | Testimonios recibidos (457) |
| `POST /admin/testimonio/revisado` \| `/borrar` | Revisar o borrar uno (280–291) |
| `GET POST /admin/firma` | La firma registrada de Renne: verla y reemplazarla (560, 585) |
| `GET /admin/prospectos` | Prospectos por campaña, con filtros (744) |
| `GET /admin/prospecto?id=` | Ficha de uno: contacto, investigación, historial (835) |
| `POST /admin/prospecto` | Cambiar etapa, registrar lo ocurrido, fijar próxima acción (961) |
| `GET POST /admin/prospecto/nuevo` | Agregar uno a mano (1027, 1067) |
| `GET /admin/mapa` | Todos los prospectos de una campaña sobre un mapa Leaflet (1103) |
| `GET /admin/recursos`, `/admin/recurso?slug=` | Documentos de campaña en Markdown (1234, 1251) |

Lo que está bien pensado: una ruta por cosa (no un `?tipo=` para todo), los enlaces viejos redirigen a la sección nueva (309–315), y cualquier `/admin/loquesea` desconocido redirige a `/admin` en vez de dar 404 (316).

## A.2 Autenticación — Basic Auth con `ADMIN_PASSWORD`

Implementación completa, líneas 234–260:

```js
function unauthorized(){
  return new Response("Se necesita la clave del panel.", {
    status:401,
    headers:{ "WWW-Authenticate":'Basic realm="16bc admin", charset="UTF-8"', "Cache-Control":"no-store" }
  });
}
function sameText(a, b){
  /* compare in constant time, so the answer time does not leak the key */
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for(let i = 0; i < Math.max(x.length, y.length); i++){ diff |= (x[i] || 0) ^ (y[i] || 0); }
  return diff === 0;
}
function authorized(request, env){
  const header = request.headers.get("Authorization") || "";
  if(!header.startsWith("Basic ")){ return false; }
  let decoded = "";
  try{ decoded = atob(header.slice(6)); }catch(e){ return false; }
  const password = decoded.slice(decoded.indexOf(":") + 1);
  return sameText(password, env.ADMIN_PASSWORD);
}
```

**Cómo se declara el secreto:** no está en `wrangler.jsonc`. Se crea con `npx wrangler secret put ADMIN_PASSWORD` y llega como `env.ADMIN_PASSWORD`. Si falta, la línea 257 devuelve un 503 con la instrucción en pantalla en vez de dejar el panel abierto — buen detalle: **falla cerrado**.

**Cómo se protegen las rutas:** una sola puerta en la línea 260, `if(!authorized(request, env)){ return unauthorized(); }`, antes de cualquier ramificación. Como `admin()` es el único camino a todo lo que empieza por `/admin` (línea 65–67), **no hay forma de llegar a una ruta del panel sin pasar por ahí**. Esto es correcto y es el patrón a copiar: una comprobación, lo más arriba posible, no una por handler.

**Fugas: lo que revisé y lo que encontré.**

- **Rutas de API sin proteger: no hay fuga de escritura del panel.** Verifiqué las cinco rutas que se atienden antes de `/admin` (líneas 43–64). Las públicas (`/api/mira`, `/api/contacto`, `/api/testimonio`) solo hacen `INSERT` de formularios, que es su función. `GET /api/autorizacion/:token` sí devuelve datos de un cliente sin clave, pero el token es de 128 bits (`newToken`, 175) y el regex exige 32 hex exactos; es una capacidad, no un agujero. Y devuelve a propósito solo lo que la página de firma necesita: **no** expone `client_ip` ni `client_ua` (192–202). Bien hecho.
- **Comparación vulnerable a timing: no.** `sameText` compara en tiempo constante y el comentario explica por qué. Es mejor de lo que suele verse. Dos matices menores: el bucle recorre `Math.max` de las dos longitudes, así que la longitud de la clave sí es observable por tiempo (irrelevante en la práctica, y de todos modos ya se filtra en `diff |= x.length ^ y.length`); y como `env.ADMIN_PASSWORD` se comprueba antes (257), no hay riesgo de comparar contra `undefined`.
- **El usuario se ignora.** `decoded.slice(decoded.indexOf(":") + 1)` toma todo lo que va después del primer `:` y nunca mira el nombre de usuario. Cualquier usuario con la clave correcta entra. Es una decisión, no un error, pero conviene saberla: **no hay identidad, solo una clave compartida**.
- **La fuga real es de diseño, no de código: no hay CSRF.** Busqué comprobación de `Origin`, `Referer`, token de formulario o cookie `SameSite` en todo el fichero: no existe ninguna. Todos los `POST` del panel son formularios normales sin token. Con Basic Auth el navegador **reenvía la cabecera `Authorization` automáticamente** en peticiones entre sitios, así que mientras Renne tenga la sesión abierta, cualquier página que visite puede enviar un `POST` a `/admin/testimonio/borrar` o `/admin/autorizacion/borrar` y ejecutarlo. Hoy el daño es limitado (borrar testimonios). **En KaffeePlatz, donde los `POST` editan el catálogo de una tienda en producción, esto no es aceptable.** Mitigación en la sección B.5.
- **No hay cierre de sesión.** Es inherente a Basic Auth: la única forma de salir es cerrar el navegador. Para un panel al que entra la dueña desde un celular, importa.
- **No hay límite de intentos.** Nada impide probar claves contra `/admin` a toda velocidad. Con una clave larga generada al azar no es urgente; con una que eligió una persona, sí.

## A.3 Cómo sirve HTML — plantillas en strings dentro del Worker

Una mezcla, con la frontera clara: **el sitio público es estático** (copiado a `dist/` por `scripts/build.mjs` y servido por `env.ASSETS.fetch(request)` en la línea 68, que es el último recurso de la cadena), y **el panel es HTML generado en el Worker**, en plantillas literales.

Está en dos capas. `page()` (1442) es el documento completo: `<!DOCTYPE html>`, `<meta name="robots" content="noindex, nofollow">`, las fuentes de Google y **unas 200 líneas de CSS en un `<style>` incrustado**. `adminPage()` (367) envuelve el contenido en el armazón con el menú lateral y las insignias de lo pendiente:

```js
async function adminPage(env, active, title, content, status = 200, script = ""){
  let a = null;
  try{ a = await attention(env); }catch(e){}
  const nav = MENU.map(g => `
    ${g.group ? `<p class="nav-group">${g.group}</p>` : ""}
    ${g.items.map(it => {
      const p = a && a[it.key] ? a[it.key].p : 0;
      return `<a class="nav-item${it.key === active ? " on" : ""}" href="${it.href}"...>
        <span>${it.label}</span>${p ? `<span class="badge" ...>${p}</span>` : ""}</a>`;
    }).join("")}`).join("");
  return page(title, `<div class="shell"><aside class="side">...</aside>
      <div class="content">${content}</div></div>`, status, script, true);
}
```

Detalle que conviene copiar: el `try{ ... }catch(e){}` de la línea 369. Si la consulta de insignias falla, el panel **se pinta igual, sin insignias**, en vez de dar error. Un panel que se cae porque no pudo contar es un panel inútil.

Para escapar hay `esc()` (1394), aplicado 82 veces en el fichero:

```js
function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}
```

Correcto: cubre las cinco entidades que hacen falta y trata `null`/`undefined` como cadena vacía en vez de imprimir `"null"`.

**Veredicto para KaffeePlatz:** este patrón funciona para 16bc porque el panel es su propio diseño mínimo, sin relación con el sitio. **Sirve para el panel de KaffeePlatz y no sirve para las páginas públicas de KaffeePlatz.** Ver sección C.

## A.4 Cómo escribe y lee en D1

Patrón uniforme y correcto. `env.DB.prepare(sql).bind(...).run() | .first() | .all()`, con parámetros numerados `?1, ?2`. Ejemplo de escritura (línea 133):

```js
await env.DB.prepare(
  "INSERT INTO submissions (kind, name, brand, contact, data) VALUES (?1, ?2, ?3, ?4, ?5)"
).bind(kind, name, brand, contact, JSON.stringify(data)).run();
```

- **Inyección SQL en el Worker: no encontré ninguna.** Revisé las 40-y-pico consultas del fichero. Todos los valores de usuario van por `.bind()`. Lo único que se concatena en SQL son fragmentos fijos escritos en el código, no datos: `" AND reviewed = 0"` según un booleano (429), y `BALL_SQL` (695), que es una constante. Eso es seguro.
- **`batch()` para lo que debe pasar junto** (325, 1092, 1017). `env.DB.batch()` corre en una transacción implícita, así que crear un prospecto y su primer evento no puede quedar a medias. **Esto es importante copiarlo**: en KaffeePlatz, guardar un producto y sus variantes e imágenes es exactamente el mismo caso.
- **Concurrencia resuelta en SQL, no en JavaScript.** La línea 637 es el mejor detalle del fichero:

  ```js
  "UPDATE authorizations SET ... WHERE id = ?5 AND client_signed_at IS NULL"
  ```

  y después comprueba `result.meta.changes` para saber si cambió algo. La condición vive en el `WHERE`, así que no hay ventana entre "compruebo si está firmada" y "la actualizo". Es el patrón correcto y es el que hay que usar en KaffeePlatz para la edición concurrente (sección B.1, `version`).
- **Manejo de errores: aquí está el punto flojo.** Casi ningún `await env.DB...` está en `try/catch`. La excepción es `attention()` (369). Si D1 falla en cualquier otro handler, la promesa se rechaza, el Worker devuelve un **500 sin cuerpo** y la dueña ve una página en blanco del navegador. En 16bc es un panel privado y se tolera. En KaffeePlatz, si el sitio público lee de D1, **un 500 desnudo en `/catalogo` es una página rota para un cliente**. Hay que envolverlo (sección B.6).
- **Validación de entrada: existe y es razonable, pero desigual.** Lo bueno: `clean()` (96) recorre lo que llega recortando cadenas a `MAX_TEXT` y limitando profundidad, arrays y número de claves — defensa contra payloads abusivos pensada de verdad; `MAX_BODY` se comprueba **dos veces**, por la cabecera `Content-Length` y por la longitud real del texto (110, 113), porque la cabecera se puede mentir; campo trampa anti-bots que responde `ok` para no delatarse (122); y los `CHECK` de las migraciones (`kind IN ('mira','contacto')`, `satisfaccion BETWEEN 1 AND 5`, `etapa IN (...)`) ponen el último filtro **en la base de datos**, que es donde no se puede olvidar. Lo flojo: en los handlers del panel la validación es a mano y repetida, `const field = (k, max) => String(form.get(k) || "").trim().slice(0, max)` aparece copiada en tres sitios (627, 654 y variante en 1068). Funciona, pero **truncar en silencio** no es validar: si la dueña pega una descripción de 3.000 caracteres, se guarda cortada sin avisar. En un panel de catálogo eso es pérdida de datos silenciosa.

## A.5 Patrón de formularios

El ciclo es clásico y correcto:

1. `GET` pinta el formulario con `method="post"`, campos `name=`, y los valores actuales ya escapados con `esc()`.
2. `POST` llega al mismo path; el router elige por método: `return request.method === "POST" ? updateAuthorization(...) : editAuthorizationPage(...)` (274).
3. Se lee con `await request.formData()` — nunca JSON, nunca query string.
4. Se valida y, si falta algo, **se re-pinta la página con estado 400** y un enlace para volver (632). En `newProspectPage` se hace mejor: se le pasan los `values` ya escritos para no perder lo que la persona había tecleado (1070). Ese es el buen patrón.
5. Si todo va bien, **`Response.redirect(..., 303)`**.

**Doble envío:** se evita con el 303 (patrón POST-redirect-GET): tras guardar, el navegador hace un `GET`, así que recargar no reenvía el formulario. Es la respuesta correcta y hay que mantenerla.

Dos detalles buenos y uno malo:

- Bueno: el `volver` se valida contra redirección abierta antes de usarlo (línea 268, `back.startsWith("/admin") ? back : "/admin"`). Alguien pensó en esto.
- Bueno: los borrados llevan `data-confirm` y un `<script>` global intercepta el `submit` para pedir confirmación (489, 1310).
- Malo: **el "confirmar" es solo del navegador.** El `POST /admin/autorizacion/borrar` no comprueba nada; sin JavaScript, o con una petición directa, borra sin preguntar. Combinado con la falta de CSRF (A.2), un borrado se puede provocar desde fuera.

## A.6 Qué hace bien y qué haría distinto

**Qué copiar tal cual:**

1. Una sola puerta de autenticación lo más arriba posible, y **falla cerrado** si falta el secreto.
2. `prepare`/`bind` sin excepciones, y `batch()` para lo que debe pasar junto.
3. Condiciones de concurrencia en el `WHERE` + `meta.changes`, no en JavaScript.
4. POST-redirect-GET con 303.
5. `CHECK` en las migraciones: el último filtro, en la base.
6. Migraciones numeradas e incrementales con `IF NOT EXISTS` y `ALTER TABLE` para lo nuevo (0006, 0007), nunca reescribiendo las viejas.
7. `try/catch` alrededor de lo accesorio (las insignias) para que el panel se pinte aunque eso falle.
8. Migración de datos idempotente: `scripts/prospectos-sql.mjs` genera SQL que se puede cargar dos veces (`INSERT ... ON CONFLICT DO UPDATE`) y **recargar la investigación no pisa el seguimiento**. Ese es exactamente el requisito de la sección B.2.
9. El SQL generado se escribe fuera del repositorio (`tmp/`) porque son datos de terceros.

**Qué haría distinto, con número de línea:**

| # | Problema | Dónde | Para KaffeePlatz |
|---|---|---|---|
| 1 | **Sin CSRF.** Ningún `POST` comprueba `Origin`/`Referer` ni lleva token. Basic Auth reenvía credenciales entre sitios. | Todo `admin()`, 256–317 | **Bloqueante.** Sesión por cookie `SameSite=Strict` + comprobación de `Origin`. Ver B.5 |
| 2 | **XSS latente en `markdown()`.** `inline()` escapa primero (1262) y luego **des-escapa `&lt;br&gt;` a `<br>`** (1263) y convierte `[texto](url)` en `<a href="$2">` (1267). El regex de enlace exige `https?:`, así que `javascript:` no pasa — correcto. Pero el des-escape de `<br>` significa que el pipeline **no es escape-y-punto**. Hoy no es explotable porque `resources.body` solo lo escribe Renne desde su carpeta privada (`prospectos-sql.mjs:50`), nunca un visitante. | 1261–1308 | **En KaffeePlatz sí sería explotable**: la dueña escribirá los artículos del diario y el HTML de los productos, y ese contenido se pinta en el **sitio público**. No reutilizar este renderizador. Ver B.1 y B.5 |
| 3 | **D1 sin `try/catch`.** Un fallo de la base da 500 sin cuerpo. | Casi todo handler | **Bloqueante** si el sitio público lee de D1. Ver B.6 |
| 4 | **Truncado silencioso** en vez de validación. `.slice(0, max)` sin avisar. | 627, 654, 1068 | Validar y **devolver el error**, no cortar. Un precio o una descripción cortada es un dato equivocado publicado |
| 5 | **Confirmación de borrado solo en el navegador.** | 489, 645 | Doble confirmación en el servidor, y **borrado reversible** (`archivado_en`) para el catálogo. Un producto borrado por error es dinero |
| 6 | **Sin cierre de sesión ni caducidad.** Inherente a Basic Auth. | 234–254 | Sesión con caducidad y botón de salir. Ver B.5 |
| 7 | **Sin límite de intentos.** | 247 | Limitar por IP |
| 8 | **CSS duplicado en cada respuesta.** ~200 líneas en `<style>` en todas las páginas, sin caché. | 1442+ | Sacarlo a `/admin.css` como asset con `Cache-Control`. Trivial y se nota en el celular |
| 9 | **Un fichero de 1.668 líneas.** Router, HTML, CSS, SQL y JavaScript de cliente mezclados. | Todo | Partir por módulos desde el primer día |
| 10 | Sin identidad: usuario ignorado, clave compartida. | 252 | Aceptable con una sola persona; dejarlo documentado |

---

# B. Diseño para KaffeePlatz

## B.0 Estado de partida (verificado)

- **25 productos** en `src/content/productos/*.json`, **16 artículos** en `src/content/diario/*.md`, validados por zod en `src/content.config.ts`.
- **47 páginas HTML** en el build actual (`dist/`).
- **Imágenes, recuento real** (comprobado, y distinto de lo que se asumió al encargar el plan): **30 referencias de imagen de producto** sobre **29 ficheros en disco**, más **15 portadas del diario en disco** para 16 artículos. **270 ficheros** en `public/img` contando los derivados (`.webp`, `.w320`, `.w640`, `.w960`, `.og.jpg`) que genera `npm run imagenes`. **51 MB** en total. El manifiesto `src/datos/imagenes.json` tiene **55 claves**.
- **Distribución, que es el dato que importa para el panel:** **21 de los 25 productos tienen UNA sola foto.** Solo cuatro tienen más de una: `aeropress-clear` (3), `chemex` (2), `dripper-de-vidrio` (2), `termometro` (2). Y solo dos tienen el campo `variante` relleno: `aeropress-clear` (Morado/Verde/Rosa) y `chemex` (6 tazas/3 tazas) — **5 vínculos imagen↔variante en total**.
- **Tres productos tienen variantes SIN fotos propias:** `filtros-v60` (V60 #01 / #02), `hervidor-mango-de-madera` (Blanco / Negro) y `chemex` (que sí las tiene). Es decir, el modelo variante→imágenes que pide el cliente ya tiene huecos conocidos desde el primer día, y el panel tiene que mostrarlos como tales (ver B.7).
- **Dos anomalías de datos encontradas al auditar, que la migración debe conservar sin romperse** (ninguna es urgente, pero si el script de semilla las ignora, falla):
  1. **`servex-hario` referencia un `.webp` como origen** (`/img/productos/servex-hario/servex-hario-1.webp`), y es el único fichero de esa carpeta: no hay JPG/PNG. Por eso **no está en el manifiesto** (`imagenes.json` no tiene ninguna clave `servex`) y `fuentes()` cae a su rama sin `srcset` — la foto se sirve sin versiones responsivas y nadie se enteró, porque degrada en silencio por diseño. El validador de la semilla **no puede exigir que todo origen sea JPG/PNG**, o este producto rompe la carga.
  2. **Un artículo del diario no tiene portada:** `que-es-el-cafe-de-especialidad-y-por-que-esta-conquistando-al-mundo.md` no trae `imagen` (de ahí 15 ficheros para 16 artículos). El esquema lo admite (`imagen` es opcional) y debe seguir admitiéndolo.
- Los JSON **los genera `scripts/normalizar.mjs`** desde `contenido-original/`; hoy la regla es que no se editan a mano. **Este plan rompe esa regla a propósito**, y hay que decirlo: cuando D1 sea la fuente de verdad, `normalizar.mjs` pasa a ser solo el cargador inicial (fase 2) y deja de poder regenerar nada sin pisar lo que la dueña haya editado. Ver el riesgo R8.
- Rama `feature/carrito-bold` en curso. Puntos de contacto en la sección D.

## B.1 Esquema de D1

Criterios: respetar la forma actual de los datos (los nombres de campo salen del zod existente, en español), no inventar lo que hoy no existe, y que cada tabla pueda devolver exactamente lo que el componente `.astro` ya espera.

Decisiones que conviene justificar:

- **`precio` en enteros COP**, como hoy. Nunca coma flotante para dinero.
- **`precioFormateado` NO se guarda.** Hoy está en el JSON, pero es un valor derivado (`$315.000`). Guardarlo invita a que se desincronice del precio real. Se calcula al leer, con el `Precio.astro` que ya existe.
- **`descripcionHtml` se guarda, pero se sanea al escribir**, no al leer (ver B.5). `descripcionTexto` se deriva al guardar y se guarda, porque lo usa el SEO y calcularlo en cada petición es gasto inútil.
- **`categorias` pasa a tabla**, pero `src/datos/categorias.ts` se mantiene como el catálogo semilla. El propio fichero ya anticipa este cambio ("el día que estos productos lleguen por HTTP, solo cambia el ORIGEN, no la forma"). Se respeta esa previsión.
- **`version` para edición concurrente**, con el patrón de 16bc (`WHERE ... AND version = ?`). Con una sola persona editando parece de sobra; cuesta una columna y evita que dos pestañas abiertas se pisen.
- **Borrado reversible** (`archivado_en`). "Eliminar productos" en el panel marca, no borra. El borrado definitivo es una operación aparte.
- **`orden` explícito** en imágenes y variantes: el requisito "reordenar" lo exige, y el orden de inserción no es un orden.

### `migrations/0001_catalogo.sql`

```sql
-- Catálogo de KaffeePlatz en D1. Los nombres de campo son los mismos que ya
-- valida el zod de src/content.config.ts, para que una fila se pueda entregar
-- a los componentes .astro existentes sin traducir nada.

CREATE TABLE IF NOT EXISTS categorias (
  id           TEXT    PRIMARY KEY,          -- slug estable: 'metodos', 'molinos'...
  nombre       TEXT    NOT NULL,
  orden        INTEGER NOT NULL DEFAULT 99,
  descripcion  TEXT,
  ambito       TEXT    NOT NULL DEFAULT 'producto'
               CHECK (ambito IN ('producto', 'diario'))
);

CREATE TABLE IF NOT EXISTS productos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  handle             TEXT    NOT NULL UNIQUE,     -- la URL: /producto/<handle>
  titulo             TEXT    NOT NULL,
  vendor             TEXT    NOT NULL DEFAULT 'KaffeePlatz',
  descripcion_html   TEXT    NOT NULL DEFAULT '',  -- saneado AL ESCRIBIR, ver B.5
  descripcion_texto  TEXT    NOT NULL DEFAULT '',  -- derivado al guardar; lo usa el SEO
  categoria          TEXT    NOT NULL DEFAULT 'otros' REFERENCES categorias (id),
  coleccion          TEXT,                          -- heredado de Shopify, hoy vacío
  destacado          INTEGER NOT NULL DEFAULT 0 CHECK (destacado IN (0, 1)),
  -- Precio y disponibilidad DERIVADOS de las variantes, mantenidos al guardar:
  -- un producto sin variantes propias lleva una variante única ('Default Title'),
  -- igual que hoy en los JSON.
  precio             INTEGER NOT NULL DEFAULT 0 CHECK (precio >= 0),
  disponible         INTEGER NOT NULL DEFAULT 0 CHECK (disponible IN (0, 1)),
  archivado_en       TEXT,                          -- NULL = visible. Borrado reversible
  version            INTEGER NOT NULL DEFAULT 1,    -- edición concurrente
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- El catálogo público filtra por esto en cada visita: sin el índice es un
-- escaneo completo por petición, y los row reads se pagan.
CREATE INDEX IF NOT EXISTS productos_vivos    ON productos (archivado_en, categoria);
CREATE INDEX IF NOT EXISTS productos_handle   ON productos (handle);

CREATE TABLE IF NOT EXISTS variantes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id   INTEGER NOT NULL REFERENCES productos (id) ON DELETE CASCADE,
  -- El id de Shopify, como texto, para no perder la trazabilidad del respaldo
  -- ni romper los carritos ya guardados en localStorage (ver sección D).
  id_externo    TEXT,
  titulo        TEXT    NOT NULL,                  -- 'Morado', 'Default Title'
  precio        INTEGER NOT NULL CHECK (precio >= 0),
  disponible    INTEGER NOT NULL DEFAULT 1 CHECK (disponible IN (0, 1)),
  sku           TEXT,
  orden         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (producto_id, titulo)
);
CREATE INDEX IF NOT EXISTS variantes_por_producto ON variantes (producto_id, orden);
CREATE INDEX IF NOT EXISTS variantes_externas     ON variantes (id_externo);

-- Las opciones ('Color' → Morado, Verde, Rosa). Se guardan explícitas en vez
-- de derivarlas de las variantes porque el orden de los valores es un dato
-- editable y derivarlo perdería ese orden.
CREATE TABLE IF NOT EXISTS opciones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id  INTEGER NOT NULL REFERENCES productos (id) ON DELETE CASCADE,
  nombre       TEXT    NOT NULL,
  valores      TEXT    NOT NULL,                   -- JSON array, el orden importa
  orden        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS opciones_por_producto ON opciones (producto_id, orden);

-- Roles de toma: catálogo editable, NO una enumeración cerrada. Justificación
-- extensa en B.7; en corto: el cliente ya nombró tres roles sin agotar la
-- lista ("ese tipo de cosas"), y un CHECK IN (...) obligaría a una migración
-- de esquema el día que llegue un molino que necesite "despiece". Pero texto
-- libre produciría 'en uso', 'En uso' y 'usando' en tres productos distintos y
-- rompería el agrupado. Una tabla da las dos cosas: lista cerrada en la
-- interfaz, y abrirla es insertar una fila desde el panel.
CREATE TABLE IF NOT EXISTS roles_imagen (
  id      TEXT    PRIMARY KEY,                     -- 'desarmado', 'armado', 'en-uso', 'detalle'
  nombre  TEXT    NOT NULL,                        -- lo que ve la dueña: 'Desarmado'
  orden   INTEGER NOT NULL DEFAULT 99              -- orden sugerido dentro de una variante
);

CREATE TABLE IF NOT EXISTS imagenes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id  INTEGER NOT NULL REFERENCES productos (id) ON DELETE CASCADE,
  -- La variante a la que pertenece ESTA foto, o NULL si es del producto en
  -- general (la foto de catálogo, un detalle del material, el empaque...).
  -- Es FK a variantes.id, no el título como hoy en el JSON: así renombrar
  -- 'Morado' a 'Violeta' no deja 3 fotos huérfanas. ON DELETE SET NULL y no
  -- CASCADE: si la dueña borra una variante, sus fotos pasan a ser del
  -- producto en vez de desaparecer. Borrar un color no debe borrar el trabajo
  -- de fotografía; que sobren fotos se ve y se arregla, que falten no se ve.
  variante_id  INTEGER REFERENCES variantes (id) ON DELETE SET NULL,
  rol          TEXT    REFERENCES roles_imagen (id),  -- NULL = sin clasificar
  -- Clave en R2: 'productos/<handle>/<uuid>.jpg'. No una ruta de public/.
  clave        TEXT    NOT NULL UNIQUE,
  alt          TEXT    NOT NULL,                   -- obligatorio, como hoy en zod
  ancho        INTEGER,                            -- para reservar el hueco
  alto         INTEGER,
  -- Orden DENTRO de su grupo (su variante, o el producto si variante_id es
  -- NULL). No un orden global: la dueña reordena las 3 fotos del Morado sin
  -- que eso toque las del Verde.
  orden        INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
-- El índice lleva variante_id porque la consulta de la ficha agrupa por ella.
CREATE INDEX IF NOT EXISTS imagenes_por_producto ON imagenes (producto_id, variante_id, orden);

-- PORTADAS. Van en columnas, no como un flag 'es_portada' en imagenes, por
-- una razón concreta: un flag permite CERO portadas o DOS, y entonces cada
-- lectura necesita decidir qué hacer con un dato imposible. Una FK permite
-- exactamente una, y el NULL es un estado legítimo ("usa la primera").
ALTER TABLE productos ADD COLUMN portada_id INTEGER REFERENCES imagenes (id) ON DELETE SET NULL;
ALTER TABLE variantes ADD COLUMN portada_id INTEGER REFERENCES imagenes (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS articulos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  handle       TEXT    NOT NULL UNIQUE,            -- /diario/<handle>
  titulo       TEXT    NOT NULL,
  fecha        TEXT    NOT NULL,                   -- YYYY-MM-DD
  autor        TEXT    NOT NULL DEFAULT 'Andreina Morales',
  resumen      TEXT    NOT NULL,
  cuerpo_md    TEXT    NOT NULL,                   -- Markdown, como hoy el .md
  cuerpo_html  TEXT    NOT NULL DEFAULT '',        -- renderizado y saneado AL GUARDAR
  imagen       TEXT,                               -- clave R2 de la portada
  categoria    TEXT    NOT NULL DEFAULT 'otros' REFERENCES categorias (id),
  publicado    INTEGER NOT NULL DEFAULT 1 CHECK (publicado IN (0, 1)),
  archivado_en TEXT,
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS articulos_por_fecha ON articulos (publicado, archivado_en, fecha DESC);
```

**`cuerpo_html` se guarda renderizado.** Es la decisión no obvia del esquema y es deliberada: convertir Markdown a HTML en cada visita es gasto por petición y obliga a meter un renderizador en el Worker. Renderizar y sanear **una vez al guardar** mueve el coste al panel (donde una persona espera medio segundo sin notarlo) y, sobre todo, significa que **el HTML que llega al público ya pasó por el saneador**. Se guarda también `cuerpo_md` para poder reeditar.

### `migrations/0002_sesiones.sql`

```sql
-- Sesiones del panel. Reemplazan Basic Auth: ver B.5.
CREATE TABLE IF NOT EXISTS sesiones (
  id          TEXT    PRIMARY KEY,                 -- 256 bits aleatorios, hex
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL,
  ultima_ip   TEXT,
  ultima_ua   TEXT
);
CREATE INDEX IF NOT EXISTS sesiones_por_caducidad ON sesiones (expires_at);

-- Intentos de entrada, para limitar la fuerza bruta.
CREATE TABLE IF NOT EXISTS intentos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip          TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  ok          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS intentos_por_ip ON intentos (ip, created_at DESC);
```

### `migrations/0003_auditoria.sql`

```sql
-- Qué se cambió y cuándo. En una tienda real, poder responder "¿qué le pasó al
-- precio de la Chemex el martes?" vale más que su coste en filas.
CREATE TABLE IF NOT EXISTS auditoria (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  entidad     TEXT    NOT NULL CHECK (entidad IN ('producto', 'variante', 'imagen', 'articulo', 'categoria')),
  entidad_id  TEXT    NOT NULL,
  accion      TEXT    NOT NULL CHECK (accion IN ('crear', 'editar', 'archivar', 'restaurar', 'borrar', 'reordenar')),
  antes       TEXT,                                -- JSON del estado anterior
  nota        TEXT
);
CREATE INDEX IF NOT EXISTS auditoria_por_fecha ON auditoria (created_at DESC);
```

## B.2 Migración inicial: 25 productos y 16 artículos a D1

Script nuevo: `scripts/sembrar-d1.mjs`. Reproducible e idempotente, siguiendo el patrón de `prospectos-sql.mjs` (genera SQL a un fichero, y se carga con `wrangler d1 execute`) en vez de escribir directo, porque así el SQL se puede **leer antes de ejecutarlo** contra producción.

```
node scripts/sembrar-d1.mjs                 # escribe tmp/semilla.sql
npx wrangler d1 execute kaffeeplatz --local  --file tmp/semilla.sql
npx wrangler d1 execute kaffeeplatz --remote --file tmp/semilla.sql
```

Qué hace, en orden:

1. Lee `src/datos/categorias.ts` (ambos catálogos: `CATEGORIAS` y `CATEGORIAS_DIARIO`) y emite las `categorias`.
2. Lee los 25 `src/content/productos/*.json` y **los valida con el mismo zod de `src/content.config.ts`** antes de emitir nada. Si un JSON no valida, el script **falla y no escribe SQL**. No se carga a la base lo que el build de hoy no aceptaría.
3. Por cada producto emite `productos`, sus `variantes` (con `id_externo` = el id de Shopify actual, y `orden` = posición en el array), sus `opciones` y sus `imagenes` (`orden` = posición, `alt` tal cual, `variante` tal cual — en `aeropress-clear` ya viene relleno, en los demás es `NULL`).
4. Lee los 16 `src/content/diario/*.md`, separa frontmatter y cuerpo, y emite `articulos` con `cuerpo_md` íntegro y `cuerpo_html` ya renderizado y saneado por **el mismo módulo que usará el panel** (así la semilla y lo que la dueña escriba pasan por el mismo filtro).
5. Emite un recuento al final y el script lo compara contra lo leído: **25 productos, 16 artículos, 30 imágenes de producto (sobre 29 ficheros), 15 portadas del diario y 5 vínculos imagen↔variante**. Si no cuadra, falla. Los números salen de contar, no de este documento: si alguien añade un producto antes de ejecutar la fase 2, el script debe contar 26 y seguir, no fallar por no coincidir con una cifra escrita a mano.

**Idempotencia**, con el patrón de `prospectos-sql.mjs`:

```sql
INSERT INTO productos (handle, titulo, ..., precio, disponible)
VALUES ('chemex', 'Chemex', ..., 285000, 1)
ON CONFLICT (handle) DO UPDATE SET
  titulo = excluded.titulo, descripcion_html = excluded.descripcion_html, ...,
  updated_at = datetime('now');
```

Para las tablas hijas (variantes, opciones, imágenes) el `ON CONFLICT` no basta, porque recargar debe poder quitar una variante que ya no está. Patrón: **borrar las hijas de ese producto y reinsertarlas, todo dentro del mismo `batch()`**, que es transaccional. Así recargar la semilla deja el producto exactamente como el JSON, sin filas huérfanas y sin estados intermedios visibles.

**Y aquí la advertencia que hay que escribir en la cabecera del script:**

> Recargar la semilla **pisa lo que la dueña haya editado en el panel**. A diferencia de los prospectos de 16bc —donde la investigación y el seguimiento son columnas distintas y por eso recargar era seguro— aquí la semilla y la edición escriben los mismos campos. Después de la fase 2, este script es una herramienta de recuperación, no de rutina. Úsalo contra `--local` libremente; contra `--remote`, solo con respaldo hecho y a sabiendas.

Esa asimetría respecto a 16bc es real y conviene no esconderla: el patrón de allá **no se puede copiar entero** aquí.

**Verificación de que no se perdió nada** (fase 2, obligatoria): un script `scripts/comparar-d1.mjs` que lea los 25 JSON y los 16 MD, consulte D1, y compare campo por campo, imprimiendo las diferencias. No vale "parece que está": se compara.

## B.3 Qué pasa con las páginas que hoy son estáticas

Hoy el build genera **47 páginas**. Si D1 manda, `/catalogo`, `/producto/[handle]` (25) y `/diario/[handle]` (16) tienen que servirse dinámicamente. Las demás (`/`, `/cafe`, `/nosotros`, `/contacto`) también muestran productos destacados, así que también tocan la base.

### Las opciones, con su coste real

**Opción A — El Worker genera el HTML (plantillas en el Worker, como 16bc).**

- A favor: un solo patrón con 16bc; control total; sin adaptador.
- En contra, y es decisivo: hay que **reescribir en strings** `catalogo.astro` (255 líneas), `producto/[handle].astro` (361), `diario/[handle].astro` (161), `diario/index.astro` (84), `index.astro` (463) y los componentes que usan (`GaleriaProducto` 303, `TarjetaProducto` 140, `FiltrosCategoria` 139, `Imagen` 82, `SEO` 115, `Precio` 28, `TarjetaArticulo` 58, `Base.astro` 306). Son **unas 2.600 líneas de `.astro`** más el acompañamiento de **3.464 líneas de CSS**. Y se pierde el pipeline de imágenes responsivas: `Imagen.astro` + `src/datos/imagenes.json` habría que reimplementarlo a mano en el Worker.
- Coste estimado solo de esta reescritura: **25–35 horas**, y después **dos copias del diseño** (la del Worker y la de los `.astro` que queden) divergiendo en cada cambio visual. `npm run contraste` y la revisión de Obsidiana II habría que rehacerlas sobre el HTML nuevo.
- **Descartada.** Para 16bc el patrón es correcto porque su panel tiene su propio diseño mínimo y el sitio público sigue estático. Aquí el sitio público es justo lo que habría que duplicar.

**Opción B — Astro en modo servidor con el adaptador de Cloudflare. ← RECOMENDADA**

- Se añade `@astrojs/cloudflare`, se pasa a `output: 'server'` y se marca con `export const prerender = true` todo lo que no depende de la base.
- A favor: **se conservan los componentes `.astro`, el CSS y el pipeline de imágenes tal como están**. El cambio en cada página dinámica es sustituir `getCollection('productos')` por una consulta a D1 detrás de la misma forma de datos — y esto ya estaba previsto: `src/datos/categorias.ts` dice literalmente que el día que los datos lleguen por HTTP "solo cambia el ORIGEN, no la forma ni el consumo", y el zod de `content.config.ts` está escrito para servir de validador de una respuesta de API. El repositorio fue diseñado para este cambio.
- El adaptador de Astro para Cloudflare es **GA (generalmente disponible) para producción** según la guía de frameworks de Cloudflare, y `wrangler deploy` lo detecta y configura solo (`main: dist/_worker.js/index.js`, `assets: { directory: ./dist, binding: ASSETS }`, `nodejs_compat`).
- En contra: `nodejs_compat` y un Worker más grande; el `dev` local necesita D1 local (`--local`, que ya es el flujo de 16bc); y **el prerenderizado deja de aplicarse a las rutas dinámicas**, así que su velocidad pasa a depender de D1 + caché (ver B.6).
- Coste: **8–12 horas** para el cambio de modo y la capa de datos, contra 25–35 de la opción A.

**Opción C — Armazón estático + hidratación con datos de una API.**

- `/catalogo` se sirve estático y vacío, y JavaScript pide los productos a `/api/productos`.
- En contra, y es decisivo para esta tienda: **el contenido deja de estar en el HTML**. Una tienda vive del SEO; hoy `sitemap.xml.ts` y `SEO.astro` existen precisamente para eso. Hidratar el catálogo significa entregar a Google una página vacía y confiar en que la renderice. Además empeora el LCP en celular (ida y vuelta extra antes de pintar) y rompe la vista previa al compartir, que es justo lo que se arregló en el commit `30a8163`.
- **Descartada** para las páginas de catálogo y ficha. Sí es la técnica correcta para el contador del carrito, que es exactamente lo que ya hace `ContadorCarrito.astro`.

**Opción D — D1 como fuente de verdad, pero el sitio sigue estático: el panel dispara un build.**

No es lo que se pidió, pero es la alternativa honesta y hay que ponerla con precio. El panel escribe en D1 igual; al guardar, dispara un despliegue (Workers Builds o un webhook) que lee D1 y genera las 47 páginas.

- A favor: el sitio público **no cambia nada** — sigue estático, igual de rápido, igual de indexable, **y si D1 se cae, el sitio sigue en pie** porque no lo consulta. Desaparecen los riesgos R1, R2 y R4 de la sección B.6. Coste total del proyecto: **42–57 horas** en vez de 78–109 (eran 28–38 contra 64–90 antes del inventario).
- En contra: el cambio tarda **3–5 minutos** en verse, no es instantáneo. Y hay que manejar el caso de dos ediciones seguidas (encolar builds).
- **Cuándo tiene sentido:** si "al instante" en realidad significaba "sin pedirle nada al desarrollador". Para un catálogo de 25 productos que cambia unas pocas veces por semana, esperar 4 minutos no suele ser el problema que parecía.
- Si el cliente confirma que quiere ver el cambio al instante, se descarta y se sigue con B. **Pero preguntarlo antes de gastar 35 horas es parte del trabajo.** Ver la decisión 1 de la sección E.

### Recomendación

**Opción B: adaptador de Cloudflare, con prerenderizado selectivo.** Reparto propuesto:

| Ruta | Modo | Por qué |
|---|---|---|
| `/`, `/cafe`, `/nosotros`, `/contacto` | **Prerenderizada**, con los destacados leídos en el build… | …y el bloque de destacados actualizado por `revalidate` vía caché, o aceptando que cambie en el siguiente despliegue. No vale la pena hacer dinámica la portada por un carrusel |
| `/catalogo` | Servidor + caché de borde | Es la página que cambia cuando la dueña edita |
| `/producto/[handle]` | Servidor + caché de borde | Idem |
| `/diario`, `/diario/[handle]` | Servidor + caché de borde | Idem |
| `/robots.txt`, `/sitemap.xml` | Servidor | El sitemap tiene que incluir los productos nuevos sin build |
| `/admin/*` | Servidor, sin caché | El panel |

Con esto, una visita normal a `/catalogo` se sirve de la caché de borde y **no toca D1**; solo la primera tras una edición paga la consulta. Es lo que hace que el coste en `row reads` sea despreciable (B.6, R4).

## B.4 Imágenes

Hoy viven en `public/img/productos/<handle>/`, se compilan como assets, y `npm run imagenes` genera los derivados WebP (`.webp`, `.w320`, `.w640`, `.w960`) más la copia `.og.jpg` para compartir, con el manifiesto `src/datos/imagenes.json` que alimenta el `srcset` de `Imagen.astro`. **51 MB y 270 ficheros, de los que solo 29 son originales de producto y 15 portadas del diario** (ver B.0: el resto son derivados). El modelo variante→rol de B.7 va a multiplicar ese número; el plan es para ese volumen, no para el de hoy.

Con D1 mandando, ese pipeline no sirve para lo nuevo: la dueña subirá una foto desde el panel y no puede esperar un build para que existan sus derivados.

**Recomendación: R2 para los originales + transformaciones de Cloudflare Images para los tamaños.**

- **R2** (`binding: MEDIOS`) guarda el original que sube la dueña, con clave `productos/<handle>/<uuid>.<ext>`. UUID y no el nombre del fichero: así "foto.jpg" subida dos veces no se pisa, y no hay que sanear nombres.
- **Cómo se sirven.** Dos caminos, y conviene elegir el segundo:
  1. Bucket público con dominio propio (`img.kaffeeplatz.co`), que permite caché de Cloudflare, WAF y control de acceso — el `r2.dev` **no**, y además está limitado por tasa y es solo para desarrollo. 
  2. **A través del Worker** (`/img/...`), que lee de R2 y responde con `Cache-Control` largo. Una capacidad más, pero mantiene todo bajo un dominio y evita configurar una zona nueva. **Recomendado**, porque el Worker ya está ahí.
- **Tamaños y formato.** Las transformaciones de Images funcionan sobre imágenes guardadas fuera de Images (como R2) y están en el **plan gratuito hasta 5.000 transformaciones únicas al mes**. Hoy, con 45 imágenes y 4 anchos, son ~180 transformaciones únicas. **Pero el modelo de B.7 cambia la cuenta:** si la dueña llega a 9 fotos en los productos con variantes, el catálogo puede pasar de 30 a 120–150 fotos, es decir **480–600 transformaciones únicas**. Sigue entrando con holgura en el plan gratuito (son únicas y permanentes, no por visita: una vez generada, cada variante se sirve de caché). Conviene saber que el margen es ~1.250 fotos antes de acercarse al límite, y que si se pasara, el parámetro `onerror` redirige al original en vez de romper la foto. **Alternativa sin depender de Images:** generar los derivados con `sharp` al subir y guardarlos también en R2. `sharp` ya es dependencia del proyecto, pero **no corre en un Worker**; haría falta subir desde una herramienta local o un contenedor. Por eso se recomienda Images.
- **Optimizar al subir: sí, y hay que hacerlo.** Una foto de celular son 4–8 MB; aceptarla tal cual llena R2 de peso inútil y hace lenta la vista del panel. Al subir: rechazar lo que no sea JPG/PNG/WebP, rechazar por encima de ~15 MB, **leer ancho y alto y guardarlos** en `imagenes.ancho`/`alto` (los necesita `Imagen.astro` para reservar el hueco y no dar saltos), y guardar el original. Los tamaños los pone Images al servir, con `LADO_MAX = 1600` como hoy.
- **Qué pasa con las actuales (29 de producto + 15 del diario).** Se suben a R2 con sus claves nuevas en la fase 2, por script (`scripts/subir-imagenes-r2.mjs`, idempotente: si la clave existe, no la vuelve a subir). **Solo se suben los originales**, no los derivados `.webp`/`.w320`/`.og.jpg`, que son regenerables y los sustituye Images. **Ojo con `servex-hario`**, cuyo único origen es un `.webp` (B.0): el script debe aceptarlo, no exigir JPG/PNG. **Los `public/img/productos/` actuales se dejan en su sitio durante toda la migración** y solo se quitan cuando el sitio nuevo lleve semanas en pie. Son 51 MB y no molestan; borrarlos antes de tiempo es regalarse un incidente. Las imágenes de marca (`public/img/marca/`) **no se mueven**: no las edita nadie desde el panel.
- `Imagen.astro` necesita un camino nuevo: hoy resuelve el `srcset` desde `imagenes.json`. Pasa a aceptar también una clave de R2 y construir el `srcset` con URLs de transformación. Es un cambio aditivo, igual que el que ya tiene previsto para `ImageMetadata`.

## B.5 Autenticación: qué mejoraría respecto a Basic Auth

Basic Auth está bien para el panel privado de 16bc. **Para un panel que edita el catálogo de una tienda en producción, no.** Tres razones, por orden de gravedad:

1. **No hay CSRF y Basic Auth lo empeora**, porque el navegador reenvía `Authorization` entre sitios (A.2). Con el panel abierto, una página cualquiera puede provocar un `POST` que cambie un precio o archive un producto.
2. **No se puede cerrar sesión.** La dueña entra desde su celular; "cierra el navegador" no es una respuesta.
3. **La clave viaja en cada petición** y suele acabar guardada en el gestor del navegador sin caducidad.

**Lo que propongo** (tabla `sesiones` de B.1):

- `GET /admin/entrar`: formulario con un solo campo, la clave.
- `POST /admin/entrar`: limitar por IP con la tabla `intentos` (p. ej. 10 fallos en 15 minutos → esperar). Comparar **en tiempo constante**, igual que `sameText` de 16bc — eso se copia tal cual. Mejor: guardar la clave como **hash** (PBKDF2 vía WebCrypto, que está en el runtime) en lugar de comparar el secreto en claro.
- Si es correcta: generar 256 bits aleatorios con `crypto.getRandomValues`, guardar la sesión con caducidad (**30 días** de vida, renovada al usarla) y responder con cookie:
  `Set-Cookie: kp_sesion=<id>; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=...`
  `SameSite=Strict` es lo que mata el CSRF: el navegador no manda la cookie en peticiones que vengan de otro sitio.
- **Cinturón y tirantes:** además, todo `POST` del panel comprueba que `Origin` coincida con el del sitio. Dos líneas, y cubre el caso de un navegador que no respete `SameSite`.
- `POST /admin/salir`: borra la sesión de D1 y vacía la cookie.
- **Una sola puerta, arriba**, como la línea 260 de 16bc. Y **falla cerrado** si falta el secreto, como la 257.
- **Secreto:** `npx wrangler secret put ADMIN_PASSWORD_HASH`. Nunca en el repositorio ni en un `.dev.vars` versionado.
- **Rutas del panel con `Cache-Control: no-store` y `X-Robots-Tag: noindex`**, como hace `page()` en 16bc.
- **Lo que NO haría todavía:** Cloudflare Access / Zero Trust sería más seguro (identidad real, segundo factor, sin clave que gestionar) y vale la pena mencionárselo al cliente; pero ata el panel a una cuenta y a un flujo de inicio de sesión que hay que explicarle a la dueña. Con una sola persona, sesión + cookie + límite de intentos es la relación coste/beneficio correcta. Dejarlo anotado como mejora.

**Y lo que importa tanto como la autenticación: sanear lo que se escribe.** El panel es la única entrada, pero lo que se escribe sale en el **sitio público**. `descripcion_html` y `cuerpo_html` no se pueden guardar como llegan.

- **No reutilizar el `markdown()` de 16bc** (hallazgo 2 de A.6). Allí es inofensivo porque solo escribe Renne documentos propios; aquí el contenido se publica.
- Al guardar: convertir Markdown a HTML y pasarlo por una **lista blanca** de etiquetas (`p, br, strong, em, b, i, a, ul, ol, li, h2, h3, h4, blockquote, code, pre, img, figure, figcaption`) y de atributos (`href`, `src`, `alt`, `title`), con `href`/`src` restringidos a `https:`, `/` o `mailto:` — **nunca** `javascript:` ni `data:`. Guardar el resultado en `cuerpo_html` y pintarlo tal cual.
- `descripcion_html` de los productos: mismo filtro. Hoy son `<p>` sencillos del respaldo de Shopify y pasarán sin tocarse.
- Todo lo demás (títulos, `alt`, nombres de variante) se escapa al pintar, con un `esc()` como el de la línea 1394, que es correcto. Con Astro esto sale gratis: `{titulo}` escapa solo, y solo `set:html` no lo hace. **Regla para quien ejecute: `set:html` únicamente con `cuerpo_html` y `descripcion_html`, que ya pasaron por el saneador. En ningún otro sitio.**

## B.6 Riesgos de la migración, con mitigaciones

El sitio **ya está en producción en kaffeeplatz.co** (commits `d0c7e4e`, `7edf38e`: dominio en Cloudflare y 301 desde Shopify). Pasar de estático a dinámico se hace con red.

| # | Riesgo | Gravedad | Mitigación concreta |
|---|---|---|---|
| **R1** | **Si D1 falla, el catálogo no se pinta.** Hoy el sitio es estático: no tiene cómo caerse por datos. Mañana, un error de D1 en `/catalogo` es una tienda cerrada. Y en 16bc esto **no está resuelto**: casi ningún `await env.DB` tiene `try/catch` y un fallo da 500 sin cuerpo (A.4) | **Alta** | Tres capas. (1) `try/catch` en **toda** lectura de la base. (2) Al servir bien una página, guardarla en **Cache API**; si D1 falla, **servir la copia de caché aunque esté vencida** (`stale-if-error`) y registrar el fallo: la tienda sigue en pie con datos de hace unos minutos. (3) Si no hay ni caché, página de cortesía con el WhatsApp de la dueña y **estado 503 con `Retry-After`** — nunca un 500 desnudo, y nunca un 200 con la tienda vacía, que es lo que haría a Google desindexar |
| **R2** | **Rendimiento: el TTFB sube.** Hoy es un asset de borde. Mañana, consulta a D1 + render | **Media** | Caché de borde con `Cache-Control: public, s-maxage=...` e invalidación por etiqueta al guardar en el panel: la dueña edita y se purga solo lo que cambió. Con la caché caliente, la mayoría de visitas no tocan D1. Medir con Lighthouse **antes** de migrar y guardar el número como referencia. Objetivo: no empeorar el LCP en celular. D1 además replica en lectura en varias regiones sin coste extra |
| **R3** | **SEO.** 47 páginas ya indexadas. Un fallo aquí se paga en ventas durante meses. Riesgos: URLs que cambian, `canonical` roto, sitemap incompleto, o páginas que devuelven 500 y Google desindexa | **Alta** | **Las URLs no cambian: ni una.** `/producto/<handle>` y `/diario/<handle>` se mantienen exactas, con el mismo `handle` que ya es la clave única en D1. `sitemap.xml.ts` pasa a leer de D1 y hay que comprobar que siga listando las 47. Conservar `SEO.astro` y el `canonical` tal cual. Las 301 desde Shopify (`7edf38e`) se dejan quietas. Tras publicar: revisar Search Console a los 3 y a los 14 días, y comparar la lista de URLs indexadas contra el sitemap. Un producto archivado debe dar **410 o 301 a su categoría**, nunca un 404 silencioso ni un 200 vacío |
| **R4** | **Coste.** D1 gratis son **5 millones de filas leídas y 100.000 escritas al día**, y desde el 1 sep 2026 **las consultas fallan al pasarse**, no se degradan | **Baja**, si hay caché | Con caché de borde, las lecturas son una por página por periodo de caché, no una por visita. Sin caché y con `/catalogo` leyendo ~25 productos + variantes + imágenes (~150 filas), harían falta más de 30.000 visitas diarias para acercarse al límite. Los índices de B.1 existen para que no haya escaneos completos. **Aun así: pasar a Workers Paid antes de publicar.** Son 5 USD al mes y quitan de encima el modo de fallo "la tienda se apaga a mediodía porque se acabó la cuota". No arriesgar una tienda por 5 dólares |
| **R5** | **Pérdida de datos en la migración.** 25 productos y 16 artículos a mano no se revisan bien | **Alta** | `scripts/comparar-d1.mjs` (B.2) compara campo por campo JSON/MD contra D1 y falla si algo no cuadra. Y **los JSON y los MD se quedan en el repositorio** después de migrar: son el respaldo y la referencia para comparar. No se borran en este proyecto |
| **R6** | **Despliegue sin vuelta atrás.** Si el sitio dinámico sale mal, hay que poder volver en minutos | **Alta** | Probar todo en `kaffeeplatz.16ballcreations.workers.dev` (ya existe y `workers_dev` está activo) con una copia de D1. El dominio se cambia al final. Y **antes de publicar, guardar el `dist/` estático que hoy funciona**: volver atrás es un `wrangler deploy` de la versión anterior. Ensayarlo una vez, no suponerlo |
| **R7** | **La dueña publica algo roto.** Un precio en 0, una descripción con HTML pegado de Word, un producto sin foto | **Media** | Validar en el servidor y **devolver el error, no truncar** (hallazgo 4 de A.6). Saneador de HTML obligatorio (B.5). `CHECK` en la base como último filtro. Vista previa antes de publicar, y `publicado = 0` para que un artículo pueda escribirse sin salir al público. Borrado reversible (`archivado_en`) para que ningún error sea definitivo |
| **R8** | **`normalizar.mjs` queda en contradicción.** Hoy la regla es "los JSON los genera el script, no se editan a mano". Cuando D1 mande, correr `normalizar.mjs` y resembrar **pisa lo que la dueña editó** | **Media** | Documentarlo en el `README` y en la cabecera de `sembrar-d1.mjs` (B.2). Tras la fase 2, `normalizar.mjs` es herramienta de arranque y recuperación, no de rutina. A diferencia de los prospectos de 16bc, aquí recargar **no** es seguro, y hay que decirlo donde se lea |
| **R9** | **Caché obstinada: la dueña edita y no ve el cambio.** El síntoma que hace que un panel se sienta roto aunque funcione | **Media** | Invalidación por etiqueta al guardar, y que el panel enlace a la página pública con un parámetro que salte la caché para que la dueña **se vea su cambio al instante**. Si la invalidación falla, la caché no puede durar más de unos minutos |
| **R10** | **Dos despliegues sobre el mismo dominio.** Hoy `wrangler.jsonc` sirve `./dist` como assets puros, sin `main`. Con el adaptador pasa a tener un Worker | **Baja** | Un solo `wrangler.jsonc`, cambiado en la fase 1 y probado en `workers.dev` antes de tocar las `routes` del dominio |

## B.7 Imágenes por variante y por rol: lo que sí es una extensión y lo que no

El cliente lo describe así: *"va a ser un manejo de varias imágenes por color/versión de producto. Por ejemplo, aeropress verde, rosa y morado, cada uno tendrá foto desarmado, armado y extrayendo café"*, y añade que es *"una extensión de lo que ya existe, sin demasiado drama"*.

**Lo que sí es una extensión sin drama (y es la mayor parte):**

- El vínculo imagen↔variante **ya existe** en el esquema zod (`imagenes[].variante`) y está relleno en dos productos.
- `GaleriaProducto.astro` **ya lo lee**, ya lo emite como `data-variante`, y ya tiene escrito el enganche en las dos direcciones (miniatura→variante y variante→foto grande), hoy inerte porque el dato falta. También ya descarta en el servidor los vínculos que no casan con ninguna variante real, lo cual es exactamente el comportamiento que hace falta.
- Pasar de "título de variante" a `variante_id` es trabajo de la migración, no un replanteo.
- Añadir el `rol` es una columna y un catálogo.

**Lo que NO es una extensión, y es lo que hay que decirle al cliente:**

1. **La noción de "portada" hoy no existe, y el modelo nuevo la rompe.** La galería hace `const principal = imgs[0]` y `TarjetaProducto` usa igualmente la primera. Con una foto por producto, "la primera" es una regla perfectamente buena. Con **9 fotos de 3 colores, "la primera" no significa nada**: dependería del orden de subida, y la foto del catálogo podría acabar siendo un Aeropress desarmado en morado. Por eso el esquema añade `productos.portada_id` y `variantes.portada_id`. **Esto toca `TarjetaProducto.astro`, `catalogo.astro` y la portada**, no solo la ficha.

2. **La galería cambia de lógica, no de datos.** Hoy hay **una** `<img>` grande cuyo `src` se sustituye, y una fila de miniaturas **fija**. Lo que pide el cliente ("al elegir un color, las miniaturas pasan a ser las de ESE color") significa que **la fila de miniaturas se recompone al cambiar de variante**. Y el componente está construido explícitamente sobre lo contrario: su comentario dice *"No se duplica el marcado ni se ocultan copias"*, los índices de las miniaturas son posiciones fijas en un array (`data-indice`), y el listener delegado resuelve por ese índice. Recomponer la lista invalida esos índices.

   No es dramático, pero tampoco es gratis. **Diseño recomendado:** pintar en el HTML **todas** las miniaturas de todas las variantes, cada una con su `data-variante-id`, y **filtrar por CSS** (`[hidden]`) al cambiar de color en vez de reconstruir DOM. Así se conserva la decisión del componente (no se toca el marcado), funciona sin JavaScript (se ven todas las fotos, que es un buen estado de reposo), y la selección por índice sigue siendo válida porque los índices no se mueven. Hay que cuidar que `aria-pressed` y la región `aria-live` sigan siendo coherentes cuando la miniatura activa queda oculta por un cambio de color — ese es el detalle que se escapa si no se piensa antes.

3. **Hay huecos en los datos desde el día uno.** Tres productos tienen variantes sin fotos propias (`filtros-v60`, `hervidor-mango-de-madera`, y parcialmente `chemex`). El panel y la ficha tienen que tratar "esta variante no tiene fotos" como un estado normal, con respaldo a las fotos del producto. Si la galería asume que toda variante trae fotos, esos tres productos se rompen.

**Veredicto honesto:** la parte de datos es media hora de esquema; la de la ficha pública son **5–7 horas** y toca un componente de 303 líneas cuidadosamente razonado, más las tarjetas del catálogo. En total **12–17 horas** (fase 6). Es asumible y vale la pena — las fotos "qué recibo y qué hago con esto" son exactamente lo que vende un objeto de café. Pero no es "sin drama", y preferí decirlo.

### Por qué el rol es una tabla de catálogo

Tres opciones, y la razón de la elegida:

- **Enumeración cerrada** (`CHECK (rol IN ('desarmado','armado','en-uso'))`): da consistencia y permite agrupar, pero el cliente ya dijo *"ese tipo de cosas"* — la lista **no está cerrada**. El día que llegue un molino que necesite "despiece", o un filtro que necesite "comparativa de tamaños", haría falta **una migración de esquema para añadir una palabra**. Para un panel que usa alguien no técnico, eso significa esperar al desarrollador. Mal.
- **Texto libre**: nunca bloquea, pero a los seis meses habrá `en uso`, `En uso`, `usando` y `en-uso` en cuatro productos, y cualquier agrupado o filtro por rol deja de funcionar. Y lo que se degrada no es visible hasta que importa.
- **Tabla de catálogo** ← elegida. La interfaz muestra una lista cerrada (la dueña **elige**, no escribe, así que no hay variantes ortográficas), y ampliarla es **insertar una fila desde el panel**, sin migración ni desarrollador. Es exactamente el patrón que el proyecto ya usa para las categorías y por los mismos motivos: `src/datos/categorias.ts` razona que las categorías son "un DATO, no una lista de constantes repartidas por el markup". Los roles son el mismo caso.

Semilla sugerida (`roles_imagen`), tomada de lo que el cliente nombró más dos obvios:

```sql
INSERT OR IGNORE INTO roles_imagen (id, nombre, orden) VALUES
  ('armado',     'Armado',           1),
  ('desarmado',  'Desarmado',        2),
  ('en-uso',     'Extrayendo café',  3),
  ('detalle',    'Detalle',          4),
  ('empaque',    'Empaque',          5);
```

`rol` es **nullable** a propósito: las 30 fotos actuales no tienen rol y no se va a inventar uno. Una foto sin rol se muestra igual; el rol solo añade orden y una etiqueta.

### Cómo se resuelve la galería al leer

Regla, en una frase: **una variante muestra sus fotos; si no tiene, muestra las del producto.**

```sql
-- Todas las fotos de un producto, agrupables por variante en memoria.
SELECT i.id, i.clave, i.alt, i.ancho, i.alto, i.orden,
       i.variante_id, v.titulo AS variante_titulo,
       i.rol, r.nombre AS rol_nombre
FROM imagenes i
LEFT JOIN variantes    v ON v.id = i.variante_id
LEFT JOIN roles_imagen r ON r.id = i.rol
WHERE i.producto_id = ?1
ORDER BY (i.variante_id IS NOT NULL), v.orden, COALESCE(r.orden, 99), i.orden;
```

Las fotos generales salen primero (`variante_id IS NULL` ordena antes), y dentro de cada variante se ordenan por rol y luego por el orden manual. **La capa de datos devuelve la misma forma que hoy** (`{src, alt, variante}`), más los campos nuevos, de modo que `GaleriaProducto.astro` sigue funcionando sin cambios mientras la ficha no se actualice. Eso permite partir la fase 6 en dos: datos primero, ficha después, sin romper nada en medio.

**Portadas, con respaldo en cascada y sin ramas extra en las plantillas:** `COALESCE(variantes.portada_id, productos.portada_id, primera foto de la variante, primera del producto)`. Resolver esto **en la capa de datos**, nunca en los componentes.

### El panel: cargar 9 fotos de un producto de 3 colores sin que sea un suplicio

Es el requisito explícito del cliente y la parte que más fácil se hace mal. Diseño:

1. **Una sola zona de carga**, con `<input type="file" multiple>` y arrastrar-y-soltar. La dueña suelta las 9 fotos de golpe. Nada de subir una, guardar, volver, subir otra.
2. **Subida en paralelo con barra de progreso por foto** y, muy importante, **cada foto se guarda en cuanto termina**. Si la novena falla o se va el wifi, las ocho primeras ya están. Una subida de 9 fotos que es todo-o-nada desde un celular es una subida que falla.
3. **Asignación en rejilla, después de subir.** Una tabla con una fila por foto y dos desplegables: *Variante* y *Rol*. Sin escribir nada.
4. **Dos atajos que convierten el suplicio en un minuto** — y son el verdadero diseño de esta pantalla:
   - **"Aplicar a las siguientes N"**: la dueña marca Morado en la primera y las tres siguientes se ponen en Morado. Las fotos se suben casi siempre agrupadas por color, porque así se hizo la sesión.
   - **Deducción del nombre del fichero.** Si suben `aeropress-morado-armado.jpg`, el panel **propone** Morado + Armado comparando el nombre con los títulos de variante y los roles (sin acentos, en minúsculas). **Propone, no decide**: queda marcado como sugerencia hasta que la dueña confirma. Si la sesión de fotos se nombró con un mínimo de orden, las 9 quedan asignadas sin tocar un desplegable.
5. **Reordenar arrastrando, dentro de cada grupo.** Y respaldo accesible sin arrastre: botones de subir/bajar. Arrastrar en un celular con 9 fotos es incómodo; que no sea el único camino.
6. **`alt` obligatorio, pero prerrellenado** con `"<Producto> — <Variante>, <Rol>"` (p. ej. "Aeropress Clear — Morado, armado"), que es exactamente el patrón de los `alt` que ya existen. Editable. Si se deja vacío, no se guarda: `alt` es `NOT NULL` en el esquema y obligatorio en el zod de hoy, y esa decisión se respeta.
7. **Marcar portada con un clic** (una estrella en la foto): una por variante y una del producto.
8. **Señalar los huecos de forma visible:** "Verde no tiene fotos" junto al color, para que la dueña vea lo que falta sin tener que contar. Es el aviso que hace que los tres productos con variantes sin foto se arreglen solos con el tiempo.
9. **Borrado reversible también aquí.** Quitar una foto la desvincula; el objeto en R2 se conserva y se limpia después. Borrar al instante el original de una foto de producto es irreversible y no hay razón para correr.

### Migración del vínculo existente (fase 2)

Los 5 vínculos actuales (`aeropress-clear` ×3, `chemex` ×2) se conservan resolviendo el **título** del JSON contra `variantes.titulo` para obtener el `variante_id`. Si un título no casa, **el script falla y lo dice** — no lo descarta en silencio, porque en la semilla un vínculo perdido es un dato perdido. (La galería sí lo descarta en silencio al pintar, y ahí es correcto: en tiempo de render vale más una galería sin vínculo que una roto. Son dos sitios con dos criterios distintos, a propósito.)

El `rol` queda `NULL` en las 30: no se inventa. `portada_id` queda `NULL`, lo que hace que el respaldo "primera foto" mantenga **exactamente** el comportamiento de hoy. La migración no cambia ni un píxel del sitio actual; solo habilita lo nuevo.

---

# C. Plan de fases

Formato y estilo del plan de `planes/kaffeeplatz-carrito-bold.md`.

| Fase | Qué incluye | Horas |
|---|---|---|
| **0 · Decisiones y red de seguridad** | Resolver las decisiones de la sección E (sobre todo la 1: ¿instantáneo de verdad, u opción D?). Crear D1 `kaffeeplatz` y R2 `kaffeeplatz-medios`. Secretos. Workers Paid. Medir Lighthouse de hoy y guardarlo. Guardar el `dist/` que funciona, y **ensayar la vuelta atrás** | 3–4 |
| **1 · Modo servidor** | `@astrojs/cloudflare`, `output: 'server'`, `prerender = true` en lo estático, `wrangler.jsonc` con `main` y bindings, dev local con `--local`. **Sin tocar la fuente de datos todavía: las páginas siguen leyendo de `getCollection`.** Que el sitio salga idéntico en `workers.dev`, página por página, antes de seguir | 6–9 |
| **2 · Datos a D1** | Migraciones 0001–0003 (incluidas `roles_imagen`, `imagenes.variante_id`/`rol` y las portadas de B.7). `scripts/sembrar-d1.mjs` idempotente, validando con el zod actual, conservando los 5 vínculos imagen↔variante y tolerando las dos anomalías de B.0. `scripts/subir-imagenes-r2.mjs`. `scripts/comparar-d1.mjs` y pasarlo en verde | 8–11 |
| **3 · El sitio lee de D1** | Capa de acceso a datos (`src/datos/catalogo.ts`) con la **misma forma** que hoy devuelve `getCollection`, para que los componentes no se enteren. `/catalogo`, `/producto/[handle]`, `/diario`, `/diario/[handle]`, destacados de la portada, `sitemap.xml`. `Imagen.astro` aceptando claves de R2. Caché de borde con invalidación por etiqueta. **`try/catch` en toda lectura y la caché vencida como respaldo (R1)** | 10–14 |
| **4 · Panel: autenticación y armazón** | Sesiones (B.5): entrar, salir, límite de intentos, cookie `SameSite=Strict`, comprobación de `Origin`, clave como hash. Armazón del panel con menú, en `.astro` reutilizando el CSS del sitio. `/admin` con lo que necesita atención. Saneador de HTML con pruebas | 7–10 |
| **5 · Panel: productos** | Listado con buscador y filtro por categoría. Alta, edición (título, descripción, precio, categoría, disponible, destacado), variantes (añadir, quitar, reordenar, precio y disponibilidad por variante), archivar y restaurar. Validación que **devuelve el error en vez de truncar**. `version` para edición concurrente. Vista previa. Auditoría | 10–14 |
| | *Nota: las variantes se editan aquí porque las imágenes de la fase 6 cuelgan de ellas. Renombrar una variante no debe romper sus fotos (por eso el vínculo es por `id`, no por título).* | |
| **6 · Imágenes por variante y rol** (B.7) | **Panel (7–10 h):** carga múltiple con progreso y guardado por foto, rejilla de asignación variante+rol, "aplicar a las siguientes N", deducción desde el nombre del fichero, reordenar por grupo con respaldo accesible, `alt` prerrellenado, marcar portadas, avisar de variantes sin foto. **Ficha pública (5–7 h):** miniaturas filtradas por variante conservando los índices y el `aria-pressed`, respaldo cuando la variante no tiene fotos, portadas en `TarjetaProducto` y catálogo. Servir desde el Worker con caché | 12–17 |
| **7 · Panel: diario y categorías** | Alta y edición de artículos (título, fecha, autor, resumen, cuerpo en Markdown, portada, categoría, publicado/borrador), vista previa, archivar. Editar categorías (nombre, orden, descripción) y los roles de imagen | 5–7 |
| **8 · Pruebas y publicación** | Lista de pruebas de abajo. Comparar Lighthouse contra la referencia de la fase 0. Simular caída de D1. Cambiar el dominio. **Vigilar Search Console a los 3 y 14 días** | 3–4 |
| **9 · Inventario** (sección G, añadida el 8 oct 2026) | `0004_inventario.sql` (+ tabla `ajustes`). Fórmula de `vendible` con interruptor de activación. Reservas en el checkout y cierre en el webhook de Bold, con idempotencia triple. Cron Trigger de caducidad. Pantalla de inventario a 375 px (cargar/descontar con motivo). Lista de «productos a despachar» con los dos orígenes. Venta por WhatsApp en un toque. Historial por variante. Cuadre diario. **Conteo inicial con Andreina** | 14–19 |
| **Total** | | **78–109** |

**La suma, comprobada** (el encargo lo pide porque una versión anterior de este documento declaró un total que no cuadraba con su propia tabla; la tabla vigente sí cuadraba y sigue cuadrando con la fase 9 añadida): mínimos `3+6+8+10+7+10+12+5+3+14 = 78`; máximos `4+9+11+14+10+14+17+7+4+19 = 109`.

De esas, **48–67 son el panel** (fases 4–7 y 9, incluidas las 7–10 del panel de imágenes) y **30–42 son el cambio de arquitectura y la ficha pública** (fases 0–3, 6-público, 8). Si el cliente eligiera la opción D (B.3), las fases 1 y 3 se reemplazan por un disparador de build de 2–3 horas y el total baja a **42–57** (antes de la fase 9 eran 28–38).

**Y el plan del carrito sube también:** el checkout y el webhook de Bold pasan a tocar inventario (+2–3 h en su fase 2, +2–3 h en su fase 3, −1 h en su fase 4, porque «marcar como enviado» se hace una sola vez aquí). Su total pasa de **26–36** a **29–41**. Detalle en G.5; ese documento no se editó.

**Las fases 5 y 6 se pueden invertir si hace falta enseñar algo pronto**, pero la 6 depende de que las variantes ya se editen (fase 5). Lo que **no** conviene es adelantar la parte pública de la 6 antes de que el panel permita cargar las fotos: se estaría construyendo una galería para datos que nadie puede introducir todavía.

---

## CONVENCIÓN DE NOMBRES DE FOTOS — APROBADA POR EL CLIENTE (8 oct 2026)

El cliente la aprobó textualmente: «esa convención de las imágenes funciona.
Sencillo y fácil de escalar.» Deja de ser una propuesta: es **requisito** para
la sesión de fotos y para el panel.

### El formato

    <handle>-<variante>-<rol>.jpg

Ejemplos reales del catálogo:

    aeropress-clear-morado-desarmado.jpg
    aeropress-clear-morado-armado.jpg
    aeropress-clear-morado-extrayendo.jpg
    aeropress-clear-verde-desarmado.jpg
    chemex-6-tazas-armado.jpg

Reglas:

- Todo en minúsculas, sin tildes ni ñ, separado por guiones.
- `<handle>` es el del producto, tal como está en la base.
- `<variante>` es el color o tamaño, en el mismo texto que el título de la
  variante pero normalizado (`6 tazas` → `6-tazas`, `Morado` → `morado`).
- `<rol>` sale de la tabla `roles_imagen`.
- **Sin variante**: `<handle>-<rol>.jpg` para fotos del producto en general.
- Varias fotos del mismo rol: sufijo numérico (`...-armado-2.jpg`).

### Qué hace el panel con esto

Al subir, **propone** variante y rol deducidos del nombre y los deja marcados
como sugerencia. La dueña confirma o corrige con un clic. **Nunca decide sola**:
un nombre mal escrito no debe publicar una foto en el color equivocado.

Si el nombre no encaja con el patrón, la foto se sube igual y queda sin asignar,
para que se complete a mano. Nombrar bien es un atajo, no un requisito para
poder trabajar.

### Por qué importa fijarlo ANTES de la sesión de fotos

Con 3 colores × 3 tomas son 9 fotos por producto. Asignar variante y rol a mano,
producto por producto, es el tipo de tarea que hace que un panel se abandone.
Nombrar los ficheros al exportarlos no cuesta nada y elimina ese trabajo.

Conviene pasarle esta convención a quien haga las fotos, junto con la lista de
handles y los títulos exactos de las variantes, que el panel puede exportar.

---

## Pruebas obligatorias antes de dar por terminado

1. Las 47 URLs de hoy responden 200 y con el mismo contenido. Comparar contra la lista de `dist/` de antes de migrar, no de memoria.
2. Editar un precio en el panel y verlo en `/producto/<handle>` y en `/catalogo` **sin build**, dentro del tiempo de caché prometido.
3. **Simular la caída de D1** (clave mal puesta a propósito): `/catalogo` sirve la copia de caché o una página de cortesía con 503. **Nunca un 500 en blanco ni una tienda vacía con 200.**
4. Archivar un producto: desaparece del catálogo y su URL da 410 o 301, no un 404 silencioso.
5. `sitemap.xml` lista todo lo publicado y nada archivado; crear un producto lo mete sin build.
6. **XSS:** guardar `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>` y `<a href="javascript:alert(1)">` en la descripción de un producto y en un artículo. Ninguno ejecuta nada en la página pública.
7. **CSRF:** un `POST` a `/admin/producto/guardar` desde otro origen se rechaza. Comprobar también con la sesión abierta.
8. Límite de intentos: 10 claves mal seguidas bloquean temporalmente.
9. Cerrar sesión invalida la cookie: volver atrás en el navegador no entra.
10. Subir una foto de 8 MB desde el celular: se acepta, o se rechaza **con un mensaje claro**, nunca un error en blanco.
11. Reordenar imágenes y variantes: el orden aguanta la recarga.
11b. **Imágenes por variante (B.7):** subir 9 fotos de golpe a un producto de 3 colores y que ninguna se pierda si falla la última. Asignar variante y rol a las 9 en menos de un minuto usando "aplicar a las siguientes". Elegir un color en la ficha y ver **solo** las miniaturas de ese color, con el `aria-pressed` coherente cuando la activa queda oculta. Una variante sin fotos (`filtros-v60`, `hervidor-mango-de-madera`) muestra las del producto en vez de un hueco. Cambiar la portada de un color y verlo reflejado en el catálogo. Renombrar una variante no deja fotos huérfanas; borrarla deja sus fotos como del producto, no las borra.
11c. **`servex-hario` y el artículo sin portada** (las dos anomalías de B.0) sobreviven a la semilla y se pintan sin error.
12. Dos pestañas editando el mismo producto: la segunda avisa en vez de pisar.
13. Resembrar `sembrar-d1.mjs` sobre una base ya cargada no duplica filas ni deja huérfanas.
14. `comparar-d1.mjs` en verde: 25 productos, 16 artículos, 30 imágenes de producto, 15 portadas del diario y los 5 vínculos imagen↔variante intactos.
15. Lighthouse en celular: no peor que la referencia de la fase 0.
16. Flujo completo del panel en celular a 375 px. La dueña va a editar desde el teléfono.
17. **El carrito sigue funcionando** con los productos que vienen de D1 (ver D).

---

# D. Puntos de contacto con el carrito de `feature/carrito-bold`

Trabajo en curso en esa rama: `src/scripts/carrito.ts`, `src/components/ContadorCarrito.astro`, `src/datos/envio.ts`, y cambios en `Icono.astro`, `Base.astro` y `producto/[handle].astro`. **Los dos proyectos se cruzan en cuatro sitios y conviene no descubrirlos al mezclar.**

1. **`producto/[handle].astro` lo tocan los dos.** El carrito le añade "Agregar al carrito" con la variante elegida; este plan le cambia la fuente de datos. **Mezclar el carrito primero** y construir la fase 3 sobre el resultado. Al revés son conflictos en el fichero más grande de los dos trabajos.
2. **`carrito.ts` guarda `handle` + `varianteId` y relee precio y título del catálogo en cada pintado** — decisión ya documentada en ese fichero ("un carrito que recuerda precios es un carrito que miente"). **Esa decisión encaja perfectamente con D1 y hay que conservarla.** Pero `varianteId` hoy es el id de Shopify. Por eso el esquema de B.1 guarda **`variantes.id_externo`** y lo indexa: los carritos que la gente ya tenga en `localStorage` siguen resolviendo. Si se perdiera ese campo, todo carrito guardado se vaciaría en silencio el día del despliegue.
3. **`resolver()` del carrito tendrá que leer de D1**, no del catálogo compilado. Con la capa de datos de la fase 3 devolviendo la misma forma, es un cambio de origen, no de lógica. Y cuando llegue el checkout, el recálculo de precio en el servidor (regla no negociable del plan de Bold) pasa a hacerse **contra D1**, que es más fuerte que contra los JSON: el precio de cobro será el que la dueña tenga puesto en ese momento.
4. **`disponible` deja de ser estático.** El plan de Bold da por hecho que sale del respaldo y lo marca como decisión pendiente (su punto 4). Con el panel, la dueña lo cambia cuando quiere: el carrito debe descartar una variante que se agotó **mientras estaba en el carrito**, no solo al añadirla.
   **Actualizado el 8 oct 2026 (ver G.0):** la mecánica de este punto sigue
   valiendo entera, pero **cambia la causa**. Una variante ya no se agota solo
   porque la dueña mueva una bandera, sino porque su **stock llegó a cero** — y
   eso puede pasar por una venta de Bold, por una venta de WhatsApp o por una
   reserva de otro cliente, es decir **mientras el carrito está quieto**. El
   requisito «releer la disponibilidad en cada pintado» pasa de conveniente a
   necesario. La buena noticia es que `carrito.ts` ya lo hace y **no hay que
   tocarlo** (G.5).
5. **`src/datos/envio.ts`** tiene `TARIFA_PLANA_ENVIO` marcado como pendiente de confirmar. No lo toca este plan, pero si se quiere que la dueña lo edite desde el panel, es una tabla `ajustes` (clave/valor, como la `settings` de 16bc, migración 0003 de allá). **Fuera de alcance aquí**; anotado porque el cliente lo va a pedir.

**Orden recomendado:** terminar y mezclar el carrito (fases 1–2 del plan de Bold), después las fases 0–3 de este plan, y el checkout de Bold ya sobre D1. Hacer este plan en paralelo al carrito garantiza conflictos en `producto/[handle].astro` y en la capa de datos.

---

# E. Decisiones que hay que tomar antes de programar

KaffeePlatz es del cliente y su pareja: **las decisiones se toman de su lado y no hay que convencer a nadie más**. Por eso esta lista no deja puertas abiertas "por si acaso": cada punto trae una recomendación con su razón, para que decidir sea decir sí o no. Lo que sí hace falta es que **quede escrito por qué**, para quien lea esto dentro de un año.

Pregúntaselas al usuario. No las inventes.

1. **¿"Al instante" es instantáneo, o es "sin pedírselo a nadie"?** Es la pregunta que más dinero mueve: la opción D (B.3) cuesta **42–57 horas** contra **78–109**, el sitio sigue estático, y el cambio tarda 3–5 minutos. Si la respuesta es "con 4 minutos me vale", sobran unas 40 horas y desaparecen los riesgos R1, R2 y R4. Preguntarlo es parte del trabajo.
2. **¿Workers Paid?** Recomendado y casi obligatorio (R4): 5 USD al mes para que la tienda no se apague por cuota. Si el cliente se niega, hay que decirle que el riesgo queda abierto.
3. **Imágenes: ¿transformaciones de Cloudflare Images, o derivados con `sharp` al subir?** Recomendado Images (gratis hasta 5.000 transformaciones únicas al mes, de sobra para 56 fotos). `sharp` no corre en un Worker y obligaría a subir desde una herramienta local.
4. **¿Dominio propio para las imágenes (`img.kaffeeplatz.co`) o servirlas por el Worker?** Recomendado el Worker: ya está ahí y no hay zona nueva que configurar.
5. **¿Quién entra al panel?** Si es solo la dueña, sesión con clave (B.5) es lo correcto. Si va a entrar más gente, conviene hablar de Cloudflare Access desde el principio en vez de añadirlo después.
6. **¿Borradores en el diario?** El esquema trae `publicado`. Confirmar que se quiere, porque cambia la interfaz del panel.
7. **¿Qué hace "eliminar un producto"?** Propuesta: archivar (reversible) y que su URL dé 301 a la categoría. Confirmar que a la dueña le sirve, y qué debe pasar con un producto archivado que esté en el carrito de alguien.
8. **¿Se mantiene `normalizar.mjs` y `contenido-original/`?** Propuesta: sí, como arranque y respaldo, con la contradicción documentada (R8). Conviene que el cliente sepa que después de la fase 2 ese script deja de ser seguro de correr.
9. **Roles de imagen: ¿sirven los cinco propuestos?** (`Armado`, `Desarmado`, `Extrayendo café`, `Detalle`, `Empaque`, en B.7). Son los tres que nombró el cliente más dos obvios. No hace falta acertar a la primera: la tabla se amplía desde el panel sin migración, y eso es justamente el motivo de que sea una tabla y no un `CHECK`.
10. **¿Quién nombra los ficheros de las fotos?** No es una pregunta técnica trivial: si la sesión de fotos se nombra `aeropress-morado-armado.jpg`, el panel asigna las 9 fotos **solo**; si llegan como `IMG_4821.jpg`, hay que asignarlas a mano (con los atajos, un minuto). Vale la pena pedirle a quien haga las fotos que las nombre así. **Es la mejora más barata de todo el plan: cero código.**
11. **La ficha pública de la fase 6, ¿entra ahora o después?** Se puede entregar el panel (fases 4–5 y la mitad de la 6) y dejar la galería por variante para una fase posterior: la capa de datos devuelve la forma de hoy, así que el sitio **no se rompe** mientras tanto. Son 5–7 horas que se pueden mover si corre prisa enseñar el panel.

## Nota sobre quién va a usar esto a diario

El panel lo usa **Andreina Morales**, que conoce su catálogo al dedillo y no es técnica. Tres reglas para quien lo implemente, que valen más que cualquier detalle de la interfaz:

- **Nada de jerga ni de conceptos de base de datos.** No hay "registros", "variantes huérfanas", "slugs" ni "ids". Hay productos, colores, fotos y artículos. `handle` se presenta como "la dirección del producto" y, mejor, **se genera solo** desde el título y solo se muestra si la dueña quiere cambiarla.
- **Ningún paso debe exigir entender el modelo de datos.** El orden natural es "elijo el producto, subo fotos, digo de qué color es cada una". Que por debajo eso sean tres tablas y dos claves ajenas es problema del código, no suyo.
- **Que nada sea irreversible.** Archivar en vez de borrar, fotos recuperables, auditoría de qué cambió. La confianza para editar un catálogo en producción viene de saber que un error se deshace, y es lo que hace que el panel se use de verdad en vez de quedarse mirando.

Dos consecuencias prácticas: los mensajes de error dicen qué hacer ("El precio no puede estar vacío"), no qué falló ("violación de restricción CHECK"); y todo flujo tiene que funcionar **en un celular a 375 px**, porque ahí es donde se va a usar.

# F. Mantenimiento a dos años

El cliente pidió explícitamente que esto quede bien estructurado "para evitar novedades". Lo que más se degrada en dos años no es el código que funciona, sino las decisiones que nadie escribió. Cinco que conviene fijar desde el primer día:

1. **Una sola forma de datos, en un solo sitio.** `src/datos/catalogo.ts` es la **única** frontera con D1. Ningún `.astro` y ninguna ruta del panel ejecutan SQL. Si en dos años hay que cambiar de D1 a otra cosa, o volver a estático, se toca un módulo. Es la misma apuesta que el proyecto ya hizo con `categorias.ts`, y la razón por la que este plan es barato de ejecutar: ese fichero **predijo este cambio por escrito**.
2. **No partir el fichero de 1.668 líneas de 16bc otra vez.** Es el defecto #9 de A.6 y a dos años es el que más cuesta. Desde el primer commit: `src/datos/` para el acceso a datos, `src/pages/admin/` para las rutas, componentes `.astro` reutilizando el CSS del sitio. El panel **no lleva su propio CSS** ni su propio HTML en strings.
3. **Las listas que crecen son tablas, no constantes.** Categorías y roles de imagen ya lo son. La regla general: si la dueña puede querer añadir un valor, es una fila; si cambiarlo es un cambio de comportamiento, es código. Aplicarla también a lo que venga (tipos de envío, etiquetas, lo que sea).
4. **Los JSON y los MD no se borran.** Son el respaldo, la referencia para `comparar-d1.mjs` y la prueba de qué había antes. 51 MB y unos cuantos ficheros de texto no son un problema de espacio; perder el estado original sí lo es.
5. **Escribir las decisiones donde se van a leer**, que en este repositorio significa en la cabecera del fichero, en prosa, explicando el *por qué* y no el *qué*. Es la costumbre que ya tiene el proyecto (`content.config.ts`, `carrito.ts`, `GaleriaProducto.astro` y `categorias.ts` son ejemplos buenos de verdad) y es la razón de que se pueda retomar meses después. **Mantenerla no es opcional: es la mitad del valor de este código.** En particular, hay que dejar escrito por qué el rol es una tabla (B.7), por qué la portada es una FK y no un flag (B.1), por qué resembrar ya no es seguro (R8) y por qué el vínculo imagen↔variante es por `id` y no por título.

---

# G. Inventario: un solo stock, dos vías de venta

Añadido el **8 oct 2026**, a petición del cliente, textualmente:

> «Necesito que tengamos en cuenta que en el panel administrativo tenemos que
> poder hacer cargas y descuentos de cantidades de producto si se venden por
> WhatsApp y no se hacen por medio de la confirmación de Bold. En ese último
> caso, ese producto vendido quedaría bloqueado y en una lista de "productos a
> despachar". Se entiende el flujo de manejo de inventario en este caso?»

Sí se entiende, y la frase clave es **«un solo inventario»**. KaffeePlatz no
tiene dos tiendas: tiene una estantería. Que la venta se cierre por Bold o
hablando por WhatsApp cambia **quién** descuenta, no **de dónde** se descuenta.
Todo el diseño de esta sección sale de ahí: una sola tabla de existencias, dos
puertas de entrada a los mismos movimientos, y un único sitio donde mirar lo que
hay que empacar.

## G.0 DECISIÓN SUPERADA — «confirmación manual, sin llevar stock»

**Qué decía.** El plan del carrito (`planes/kaffeeplatz-carrito-bold.md`,
«Decisiones que hay que tomar antes de programar», punto 4) planteaba:

> «**Inventario.** `disponible` es estático y sale del respaldo. Hay que decidir
> si el pedido pagado se confirma a mano con la dueña (recomendado para empezar)
> o si se lleva stock en la base de datos.»

Y este documento lo daba por resuelto en dos sitios: en «Fuera de alcance»
(«Inventario con stock numérico (hoy `disponible` es un sí/no)») y en el punto 4
de la sección D, que describe `disponible` como un interruptor que la dueña
cambia a mano.

**Estado: SUPERADA el 8 oct 2026.** El cliente elige **llevar stock**. La
recomendación anterior («confirmación manual para empezar») **ya no está
vigente** y no debe tomarse como criterio alternativo.

**Por qué cambió, para quien lea esto dentro de un año.** La recomendación de
«sin stock» era correcta *bajo su supuesto*: que la única vía de venta fuera
Bold y que la dueña revisara cada pedido antes de confirmarlo. Con una sola vía,
un sí/no manual es más barato y no se desincroniza, porque solo una persona lo
toca. Lo que cambió el supuesto es que **hay dos vías que compiten por las
mismas unidades**. Con venta simultánea por Bold y por WhatsApp, un sí/no manual
tiene un modo de fallo que no tenía antes: la dueña vende el último hervidor
blanco por WhatsApp, no le da tiempo a cambiar la bandera, y el sitio acepta y
**cobra** ese mismo hervidor diez minutos después. Eso ya no es un dato
desactualizado: es dinero recibido por algo que no existe, y un reembolso con
una disculpa. Un contador por variante es la única forma de que las dos vías
resten del mismo sitio.

**Consecuencias de la supersesión, aplicadas en este documento:**

1. «Inventario con stock numérico» **sale** de «Fuera de alcance» (ya corregido
   más abajo, con la nota de fecha).
2. El punto 4 de la sección D se mantiene válido en su mecánica (`disponible`
   deja de ser estático; el carrito debe descartar lo que se agotó estando
   dentro) pero **cambia de causa**: ya no se agota porque la dueña mueva una
   bandera, sino porque el stock llegó a cero. La bandera sigue existiendo, con
   otro significado: ver G.1.
3. **El plan del carrito queda desactualizado en su punto 4 y en su «Fuera de
   alcance»** («Inventario en tiempo real»). No se edita aquí porque el encargo
   de hoy limita la escritura a este fichero; queda anotado como pendiente: hay
   que marcar ese punto 4 como resuelto a favor de llevar stock y remitir a esta
   sección G. **Si alguien lee los dos planes en orden, el del carrito dice lo
   contrario que este: este es el vigente, por fecha y por decisión explícita
   del cliente.**

## G.1 Modelo de datos

### Dónde vive el stock: en la variante, y solo ahí

El stock vive en `variantes`, no en `productos`. No es una preferencia de
modelado, es lo que se vende: hay **30 variantes** sobre 25 productos, y un
«Aeropress Clear» no se despacha — se despacha un **morado**. Un contador en
`productos` sería la suma de cosas que no son intercambiables, y la pregunta que
el cliente necesita responder («¿me queda hervidor blanco?») no se podría
contestar.

Los 21 productos de una sola variante no son una excepción: ya llevan su
variante única `Default Title` en el esquema actual (B.1), así que tienen su
contador igual que los demás, sin ninguna rama de código especial. Esa decisión
del esquema de 0001 —no tratar «producto sin variantes» como un caso aparte— es
la que hace que el inventario se pueda añadir sin tocar nada.

### Las tres cantidades: dos guardadas y una calculada

Hacen falta tres números distinguibles, y la decisión de cuál se guarda no es de
estilo:

| Cantidad | ¿Se guarda? | Dónde | Por qué |
|---|---|---|---|
| **Físico** | **Sí**, columna `variantes.stock_fisico` | Una columna | Es un hecho del mundo: lo que hay en la estantería. No se deriva de nada; se cuenta mirando. Si se calculara sumando movimientos, un movimiento mal registrado haría imposible decir «aquí hay cuatro» |
| **Reservado** | **Sí**, columna `variantes.stock_reservado` | Una columna | Es derivable (`SELECT SUM(cantidad) FROM reservas WHERE ... activa`), y aun así se guarda. Razón en el párrafo siguiente |
| **Disponible para vender** | **No**: se calcula | `stock_fisico - stock_reservado` | Es una resta de dos columnas de la misma fila. Guardarlo sería un tercer número que puede contradecir a los otros dos, y entonces habría que decidir cuál manda. No hay beneficio: la resta es gratis y siempre es verdad |

**Por qué `stock_reservado` se guarda en vez de calcularse.** Es la única
duplicación deliberada del modelo, y la razón es la misma que ya justifica
`productos.precio` en 0001 (columna derivada de las variantes, mantenida al
guardar): **el catálogo público consulta la disponibilidad en cada visita**. Con
`stock_reservado` como columna, saber si una variante se puede vender es leer
dos enteros de una fila que ya se está leyendo; con un `SUM()` sobre `reservas`,
es una subconsulta agregada por cada una de las 30 variantes en cada pintado de
`/catalogo`, y los *row reads* se pagan (R4). Pero —y esto es lo que lo hace
seguro— **nunca se escribe suelto**: todo cambio de `stock_reservado` ocurre en
el mismo `batch()` transaccional que crea o cierra la reserva que lo causa. El
invariante (`stock_reservado` = suma de reservas activas) se puede comprobar con
una consulta, y el panel lo comprueba (G.4, «cuadre»). No es un número que
alguien mantiene a mano: es una caché transaccional de una suma.

**Lo que NO se guarda, a propósito:** ningún «stock vendido histórico» ni
«stock comprometido total». Son sumas sobre `movimientos`, y preguntas que se
hacen una vez al mes, no una vez por visita.

### Qué pasa con `productos.disponible` y `variantes.disponible`

Hoy son banderas estáticas venidas del respaldo de Shopify. La pregunta del
encargo es si se derivan del stock o se conservan como interruptor manual. **La
respuesta es: las dos cosas, y separadas.** Son dos conceptos distintos que hoy
están colapsados en una sola columna porque hasta ahora no hacía falta
distinguirlos:

- **«No hay»** es un hecho de inventario. Se deriva: `stock_fisico - stock_reservado <= 0`.
- **«No se vende»** es una decisión de la dueña. No se deriva de nada: es
  voluntad. *«Tengo seis filtros V60 #02 pero están reservados para el curso del
  sábado»*, *«esta Chemex está en el escaparate y no la vendo»*, *«este color lo
  voy a descatalogar: que se acabe lo que queda y no entre más»*.

Si se colapsan, se pierde información que el cliente va a necesitar. Derivar
`disponible` del stock y borrar la bandera deja a la dueña sin forma de retirar
algo que sí tiene. Y conservar solo la bandera manual es exactamente el problema
que esta sección viene a resolver.

**Decisión:**

- **`variantes.disponible` se CONSERVA, con su significado estrechado a
  interruptor manual** — y se renombra su *significado*, no su nombre: «**se
  pone a la venta**». Lo que pinta la interfaz es «A la venta / Retirado», nunca
  «disponible». La columna no se renombra porque `src/datos/consultas/productos.ts`
  y `formas.ts` la leen y el carrito la consume: renombrarla sería tocar la capa
  de datos, el tipo `Variante` y `carrito.ts` para ganar una palabra.
- **`productos.disponible` se CONSERVA y pasa a ser derivada de sus variantes**,
  como ya lo son `productos.precio` y como ya dice el comentario de 0001
  («Precio y disponibilidad DERIVADOS de las variantes, mantenidos al
  guardar»). Su regla pasa a ser: **1 si alguna variante es vendible**. Un
  producto cuyas tres variantes están agotadas se muestra «Agotado» entero, que
  es lo que debe pasar.
- **Se añade el concepto derivado `vendible`**, que es el que usa todo lo
  público y **el que no se guarda**:

  ```
  vendible = disponible = 1  AND  (stock_fisico - stock_reservado) > 0
  ```

  Una sola fórmula, en un solo sitio (`src/datos/consultas/productos.ts`). Los
  componentes no la calculan: reciben `disponible: boolean` como hoy, ya
  resuelto. **La forma de datos de `formas.ts` no cambia** — es el requisito que
  hizo baratas las fases 1–3 y se respeta aquí: `Variante.disponible` sigue
  siendo un booleano, solo cambia cómo se computa. Esto es lo que hace que el
  catálogo, la ficha, `TarjetaProducto` y `carrito.ts` **no se toquen** (ver
  G.5).

Esto resuelve además, sin código extra, la **decisión 2 del cliente** («stock a
cero ⇒ agotado automático»): no hace falta un proceso que cambie banderas
cuando el stock llega a cero. El stock llega a cero y `vendible` ya es falso en
la siguiente lectura. Cuando Andreina carga unidades, `vendible` vuelve a ser
verdadero en la siguiente lectura. **Nadie tiene que acordarse de nada**, que es
la única forma de que esto no se desincronice. (El único trabajo real es purgar
la caché de borde al cargar stock: R9 y G.5.)

**Lo que se le muestra a la dueña, para que esta distinción no sea jerga:** en
la pantalla de inventario cada variante tiene **un número** (lo que hay) y **un
interruptor** (a la venta sí/no). Si el número es 0, debajo dice «Agotado — se
pondrá a la venta sola cuando cargues unidades». Si el interruptor está apagado
con stock, dice «Retirado por ti — hay 4 en bodega». Nunca aparecen las palabras
«derivado», «flag» ni «disponible».

### Movimientos: el libro de lo que pasó

```
Todo cambio de stock_fisico o stock_reservado escribe una fila en movimientos.
Sin excepciones, ni para los ajustes de la dueña, ni para la carga inicial.
```

Esto es lo que el encargo pide y tiene razón en por qué: cuando el stock no
cuadre —y va a pasar— la pregunta no es «¿cuántos hay?» sino «¿dónde se fue el
que falta?». Un contador sin libro responde la primera y es inútil para la
segunda, que es la que importa. El patrón ya existe en el repositorio: la tabla
`auditoria` de 0003 es exactamente esta idea para el catálogo, incluida la
decisión de **no poner FK a la entidad** para que el historial sobreviva a lo
que describe. `movimientos` sí lleva FK a `variantes` (una variante no se borra,
se archiva su producto), pero hereda lo demás.

Motivos (`movimientos.motivo`), con `CHECK` cerrado porque **esta lista sí está
cerrada** —al contrario que `roles_imagen`, que es un catálogo editable
(B.7)—: añadir un motivo nuevo cambia el comportamiento del código que lo trata,
así que es código, no dato. Es la regla 3 de F aplicada en la dirección
contraria, y conviene que se vea que se aplicó a conciencia:

| Motivo | Signo | Quién lo escribe |
|---|---|---|
| `entrada` | +físico | La dueña, al recibir mercancía |
| `venta_bold` | −físico, −reservado | El webhook, al despachar |
| `venta_whatsapp` | −físico | El panel, cuando la dueña cierra una venta hablando |
| `reserva` | +reservado | El checkout |
| `reserva_confirmada` | — (cambia de pedido, no de cantidad) | El webhook al cobrar: la reserva pasa a comprometida |
| `reserva_caducada` | −reservado | El barrido (G.2) |
| `reserva_liberada` | −reservado | Cancelación explícita, o carrito abandonado |
| `devolucion` | +físico | La dueña |
| `ajuste` | ±físico | La dueña, con nota obligatoria |
| `despacho` | −físico, −reservado | Al marcar «despachado» |

Cada fila lleva **fecha, variante, cantidad (con signo), motivo, quién lo hizo y
una referencia opcional** al pedido o reserva que lo causó. «Quién» es texto, no
una FK a usuarios: el panel tiene **una clave compartida y no tiene identidad**
(A.2, hallazgo «el usuario se ignora»), así que los valores reales van a ser
`'panel'`, `'webhook'` y `'cron'`. Escribirlo igualmente cuesta una columna y el
día que haya dos personas con acceso (decisión E.5) el libro ya lo distingue sin
migración.

### Reservas

Tabla propia, con vencimiento. Una fila por línea de un checkout iniciado.
Estados: `activa`, `confirmada` (se pagó), `caducada`, `liberada`. No se borran:
una reserva caducada es justo lo que explica un stock que «bajó y volvió a
subir», y borrarla deja el libro con un agujero.

**Duración elegida: 30 minutos.** La justificación está en G.2, porque es
inseparable de las 24 horas de Bold.

### «Productos a despachar»: una vista, no una tabla

El encargo pregunta si es tabla propia o vista. **Es una vista** (`SELECT`), y
la razón es la que hace que la pregunta importe: una tabla propia sería un
**cuarto** sitio donde vive la misma verdad (están `pedidos`, `reservas` y
`movimientos`), y el día que se desincronice —porque el webhook escribió en una
y falló al escribir en la otra— habría que decidir cuál manda. Una vista no
puede desincronizarse de sus fuentes.

Pero una vista sola no cubre el caso de WhatsApp, y aquí está la decisión real:
las ventas de WhatsApp **no generan un pedido del sitio**, así que no hay nada
sobre lo que hacer `SELECT`. La solución es que **sí generen algo**, pero
mínimo: una tabla `despachos`, con una fila por «paquete que hay que armar»,
venga de un pedido de Bold o de una venta hablada.

```
despachos: UNA fila por cosa que hay que empacar y sacar.
  origen = 'bold'      → pedido_id apunta al pedido; los artículos salen de pedido_items
  origen = 'whatsapp'  → pedido_id es NULL; los artículos salen de despacho_items
```

Así «productos a despachar» es **una consulta sobre `despachos`** (pendientes,
más antiguo primero) que une con los artículos de cada origen. La tabla no
duplica el pedido de Bold —no copia ni líneas ni precios, solo apunta— y da
cuerpo a la venta de WhatsApp, que no tiene dónde vivir. Es la mínima tabla que
hace que la lista sea una y no dos.

**Por qué no reutilizar `pedidos.estado` con un `estado = 'pagado'` y filtrar.**
Porque entonces la venta de WhatsApp tendría que crear un `pedido` completo, con
cliente, documento, dirección, subtotal, envío y total — y eso es exactamente lo
que G.3 argumenta que no se debe exigir a alguien que está contestando mensajes
con el móvil en la mano.

### `migrations/0004_inventario.sql`

Mismas convenciones que 0001–0003: `IF NOT EXISTS` en todo, `CHECK` como último
filtro en la base, comentarios que explican el *por qué* (F.5), e idempotente
para poder recargarse.

**Un aviso de método, aprendido de 0001.** Las columnas nuevas en `variantes`
se añaden con `ALTER TABLE ... ADD COLUMN`, y **`ADD COLUMN` no admite `IF NOT
EXISTS`**: al correr la migración dos veces falla con *duplicate column name* y
aborta el fichero entero. Es el mismo problema que 0001 corrigió moviendo las
portadas al `CREATE TABLE` (corrección 1 de su cabecera), pero aquí no se puede
aplicar la misma solución, porque `variantes` ya existe y no se va a recrear.
Las dos salidas honestas, y la elegida:

- **Elegida: `0004` es idempotente en todo menos en los dos `ALTER TABLE`, y lo
  dice en su cabecera.** Las migraciones las aplica `wrangler d1 migrations
  apply`, que **lleva su propia tabla de migraciones aplicadas y no reaplica un
  fichero ya corrido**. La idempotencia de 0001 era un seguro extra, no el
  mecanismo; exigirla aquí obligaría a lo de abajo.
- Descartada: recrear `variantes` (tabla nueva, copiar, borrar, renombrar) para
  declarar las columnas en el `CREATE`. Es la operación más peligrosa de SQLite,
  hay FK apuntando a `variantes` desde `imagenes`, y se haría solo por un
  seguro que el runner ya da.

```sql
-- INVENTARIO: un solo stock, dos vías de venta (venta por Bold y venta por
-- WhatsApp). Diseño completo y justificaciones en la sección G del plan
-- planes/kaffeeplatz-panel-admin.md.
--
-- SUPERA UNA DECISIÓN ANTERIOR (8 oct 2026). El plan del carrito
-- (kaffeeplatz-carrito-bold.md, decisión 4) recomendaba "confirmación manual
-- de la dueña, sin llevar stock", y este plan lo tenía en "Fuera de alcance".
-- El cliente eligió llevar stock porque hay DOS vías de venta compitiendo por
-- las mismas unidades: sin un contador, vender el último hervidor por WhatsApp
-- y que el sitio lo cobre diez minutos después no es un dato viejo, es un
-- reembolso. Ver G.0 del plan.
--
-- SOBRE LA IDEMPOTENCIA DE ESTE FICHERO
-- ===========================================================================
-- Todo es `IF NOT EXISTS` menos los dos ALTER TABLE del final: `ADD COLUMN` no
-- admite `IF NOT EXISTS` en SQLite y reaplicar el fichero fallaría con
-- "duplicate column name". No se corrige recreando `variantes` (hay FK
-- apuntando a ella desde `imagenes`, y recrear tablas es la operación más
-- peligrosa de SQLite) porque `wrangler d1 migrations apply` lleva su propio
-- registro de migraciones aplicadas y no reaplica un fichero ya corrido. Si
-- alguien ejecuta esto a mano dos veces, fallará en el primer ALTER y no habrá
-- hecho daño: los CREATE son idempotentes y los ALTER son lo último.

-- ---------------------------------------------------------------------------
-- 1. LAS DOS CANTIDADES QUE SE GUARDAN, EN LA VARIANTE
-- ---------------------------------------------------------------------------
-- El stock vive en la VARIANTE y solo ahí: hay 30 variantes y es lo que se
-- vende. Nadie despacha "un Aeropress Clear"; despacha un morado. Los 21
-- productos de una sola variante no son un caso especial: ya llevan su
-- variante única 'Default Title' desde 0001, así que tienen su contador como
-- los demás y no hay ninguna rama de código distinta para ellos.
--
-- `stock_disponible` NO existe como columna: es `stock_fisico -
-- stock_reservado`, y guardarlo sería un tercer número capaz de contradecir a
-- los otros dos.

ALTER TABLE variantes ADD COLUMN stock_fisico INTEGER NOT NULL DEFAULT 0;
-- Caché transaccional de SUM(reservas activas). Se duplica a propósito —igual
-- que `productos.precio` en 0001— porque el catálogo público pregunta por la
-- disponibilidad en CADA visita y una resta de dos enteros de la fila que ya se
-- está leyendo no cuesta nada, mientras que un SUM() agregado por cada una de
-- las 30 variantes en cada pintado de /catalogo sí (R4, row reads).
-- NUNCA se escribe fuera del batch() que crea o cierra la reserva que lo causa.
ALTER TABLE variantes ADD COLUMN stock_reservado INTEGER NOT NULL DEFAULT 0;

-- Nota sobre los CHECK que NO están en estas dos columnas:
-- `ADD COLUMN` admitiría `CHECK (stock_fisico >= 0)`, y a propósito no se pone.
-- El stock negativo es un estado al que se llega por error humano y que hay que
-- poder REPRESENTAR para poder avisar de él y corregirlo (caso límite G.4 /
-- C.4): un CHECK convertiría "la dueña se equivocó contando" en "el guardado
-- falla con un error de base de datos" y el panel no podría explicar nada. Lo
-- que sí tiene CHECK es `stock_reservado`, abajo, por una razón distinta: un
-- reservado negativo no es un error de conteo humano, es un BUG del código de
-- reservas, y ahí sí se quiere que falle ruidosamente.
--
-- Se declara como índice parcial en vez de CHECK porque CHECK no se puede
-- añadir a una tabla existente sin recrearla. El invariante se comprueba en el
-- WHERE de cada UPDATE (ver G.4) y en el cuadre del panel.

-- ---------------------------------------------------------------------------
-- 2. MOVIMIENTOS: el libro de por qué el stock es el que es
-- ---------------------------------------------------------------------------
-- Toda variación de stock_fisico o stock_reservado escribe aquí. Sin
-- excepciones, ni para los ajustes de la dueña ni para la carga inicial. Sin
-- esto, cuando el stock no cuadre —y va a pasar— no habrá forma de saber por
-- qué. Es la misma idea que `auditoria` (0003) aplicada a cantidades.
--
-- `motivo` SÍ es un CHECK cerrado, al contrario que `roles_imagen` (B.7), que
-- es un catálogo editable. La diferencia es la regla 3 de F: si la dueña puede
-- querer añadir un valor, es una fila; si añadirlo cambia el comportamiento del
-- código, es código. Un motivo nuevo de movimiento cambia cómo se calcula el
-- stock, así que es código.
CREATE TABLE IF NOT EXISTS movimientos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  variante_id  INTEGER NOT NULL REFERENCES variantes (id) ON DELETE CASCADE,
  -- Con signo: +3 es una entrada, -1 una venta. Se guarda con signo y no un
  -- "tipo + cantidad positiva" porque así SUM(cantidad) por variante es
  -- directamente el stock esperado, y eso es el cuadre de G.4 en una línea.
  -- NUNCA 0: un movimiento que no mueve nada es un error de quien lo escribe.
  cantidad     INTEGER NOT NULL CHECK (cantidad <> 0),
  -- Sobre QUÉ cantidad actúa. Un mismo motivo puede tocar las dos (un despacho
  -- baja físico Y reservado), y entonces escribe DOS filas: así cada fila dice
  -- una sola cosa y el cuadre de cada columna es independiente.
  afecta       TEXT    NOT NULL CHECK (afecta IN ('fisico', 'reservado')),
  motivo       TEXT    NOT NULL CHECK (motivo IN (
                 'entrada',            -- + físico: llegó mercancía
                 'venta_bold',         -- - físico: pago confirmado por webhook
                 'venta_whatsapp',     -- - físico: la dueña cerró la venta hablando
                 'reserva',            -- + reservado: empezó un checkout
                 'reserva_confirmada', -- la reserva pasa a comprometida (no cambia cantidades)
                 'reserva_caducada',   -- - reservado: venció sin pagar
                 'reserva_liberada',   -- - reservado: cancelación explícita
                 'devolucion',         -- + físico
                 'ajuste',             -- ± físico: conteo, rotura, pérdida. Nota obligatoria
                 'despacho'            -- - físico y - reservado: salió el paquete
               )),
  -- Quién. TEXT y no FK a usuarios porque el panel tiene UNA CLAVE COMPARTIDA y
  -- no tiene identidad (A.2: "el usuario se ignora"). Hoy los valores reales
  -- son 'panel', 'webhook' y 'cron'. Se escribe igualmente: cuesta una columna
  -- y el día que entren dos personas (decisión E.5) el libro ya lo distingue
  -- sin migración.
  quien        TEXT    NOT NULL DEFAULT 'panel',
  -- Qué lo causó, para poder volver atrás desde el movimiento. Sueltos y sin
  -- FK, por la misma razón que `auditoria.entidad_id` (0003, nota 3): el
  -- historial tiene que sobrevivir a lo que describe.
  pedido_id    TEXT,
  reserva_id   INTEGER,
  despacho_id  INTEGER,
  -- Obligatoria para 'ajuste' (lo exige el panel, no la base: un CHECK
  -- condicional aquí daría un error de base de datos en vez de un mensaje
  -- que diga "escribe por qué lo estás ajustando").
  nota         TEXT
);
-- La consulta que de verdad se hace: "¿qué le pasó a ESTA variante?".
CREATE INDEX IF NOT EXISTS movimientos_por_variante
  ON movimientos (variante_id, created_at DESC);
-- Para el cuadre y para el historial general del panel.
CREATE INDEX IF NOT EXISTS movimientos_por_fecha ON movimientos (created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. RESERVAS: lo apartado mientras alguien paga
-- ---------------------------------------------------------------------------
-- Una fila por LÍNEA de un checkout iniciado. 30 minutos de vida (G.2 explica
-- por qué 30 y no 15 ni las 24 h que da Bold).
--
-- No se borran nunca: una reserva caducada es exactamente lo que explica un
-- stock que bajó y volvió a subir, y borrarla deja el libro con un agujero.
CREATE TABLE IF NOT EXISTS reservas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  -- El pedido de Bold al que pertenece. TEXT porque el order-id de Bold es
  -- 'kp-<timestamp>-<aleatorio>' (plan del carrito). Sin FK: `pedidos` la crea
  -- la migración del carrito y el orden de aplicación no debe acoplarlas.
  pedido_id    TEXT    NOT NULL,
  variante_id  INTEGER NOT NULL REFERENCES variantes (id) ON DELETE CASCADE,
  cantidad     INTEGER NOT NULL CHECK (cantidad > 0),
  -- Cuándo deja de valer. Se guarda la fecha ABSOLUTA y no una duración: así
  -- cambiar los 30 minutos mañana no reinterpreta las reservas de hoy.
  vence_en     TEXT    NOT NULL,
  estado       TEXT    NOT NULL DEFAULT 'activa'
               CHECK (estado IN ('activa', 'confirmada', 'caducada', 'liberada')),
  cerrada_en   TEXT                              -- cuándo dejó de estar activa
);
-- El barrido del cron: "las activas que ya vencieron". Índice parcial, que es
-- lo que lo hace barato: solo indexa las filas que el barrido mira.
CREATE INDEX IF NOT EXISTS reservas_a_caducar
  ON reservas (vence_en) WHERE estado = 'activa';
-- Para el webhook, que llega con un pedido_id y tiene que cerrar sus reservas.
CREATE INDEX IF NOT EXISTS reservas_por_pedido ON reservas (pedido_id);
-- Para el cuadre: SUM de lo activo de una variante contra stock_reservado.
CREATE INDEX IF NOT EXISTS reservas_por_variante
  ON reservas (variante_id) WHERE estado = 'activa';

-- ---------------------------------------------------------------------------
-- 4. DESPACHOS: la lista de "productos a despachar"
-- ---------------------------------------------------------------------------
-- UNA fila por paquete que hay que armar y sacar, venga de donde venga. Es la
-- tabla que hace que la lista sea UNA y no dos.
--
-- Por qué una tabla y no solo una vista sobre `pedidos`: porque la venta por
-- WhatsApp NO genera un pedido del sitio, así que no habría nada sobre lo que
-- hacer SELECT. Y por qué no obligar a la venta de WhatsApp a crear un pedido
-- completo: porque eso significaría pedirle cliente, documento, dirección,
-- subtotal y envío a alguien que está contestando mensajes con el móvil en la
-- mano (G.3).
--
-- No duplica el pedido de Bold: no copia líneas ni precios, solo apunta.
CREATE TABLE IF NOT EXISTS despachos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  origen       TEXT    NOT NULL CHECK (origen IN ('bold', 'whatsapp')),
  -- Para 'bold': el pedido. Para 'whatsapp': NULL, y los artículos están en
  -- despacho_items. El CHECK de abajo lo hace cumplir de verdad.
  pedido_id    TEXT,
  -- Lo mínimo para saber a quién es. Para 'bold' se deja NULL y se lee del
  -- pedido (no se copia: una copia se desactualiza). Para 'whatsapp' es lo
  -- único que hay, y es OPCIONAL: la dueña sabe de quién es cada paquete y
  -- exigirle que lo escriba para poder descontar una unidad es el tipo de
  -- requisito que hace que un panel se abandone.
  cliente      TEXT,
  nota         TEXT,
  estado       TEXT    NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente', 'despachado', 'anulado')),
  despachado_en TEXT,
  -- Un pedido de Bold tiene exactamente un despacho; una venta de WhatsApp no
  -- tiene pedido. Las dos reglas en una restricción:
  CHECK ((origen = 'bold'     AND pedido_id IS NOT NULL)
      OR (origen = 'whatsapp' AND pedido_id IS NULL))
);
-- La lista del panel: lo pendiente, lo más viejo primero. Índice parcial: solo
-- indexa lo que la pantalla mira.
CREATE INDEX IF NOT EXISTS despachos_pendientes
  ON despachos (created_at) WHERE estado = 'pendiente';
-- Idempotencia del webhook: un pedido de Bold no puede generar dos despachos
-- aunque el evento llegue dos veces. Es la segunda red del webhook, después de
-- `pedidos.estado`, y es la que no depende de que nadie se acuerde.
CREATE UNIQUE INDEX IF NOT EXISTS despachos_un_pedido
  ON despachos (pedido_id) WHERE pedido_id IS NOT NULL;

-- Artículos de un despacho de WhatsApp. Los de Bold salen de `pedido_items`.
CREATE TABLE IF NOT EXISTS despacho_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  despacho_id  INTEGER NOT NULL REFERENCES despachos (id) ON DELETE CASCADE,
  variante_id  INTEGER NOT NULL REFERENCES variantes (id),
  cantidad     INTEGER NOT NULL CHECK (cantidad > 0),
  -- Copia del título en el momento de la venta, igual que `pedido_items` del
  -- plan del carrito. Para que la lista de hace tres meses siga diciendo lo
  -- que se vendió aunque la dueña haya renombrado la variante desde entonces.
  titulo       TEXT    NOT NULL,
  -- OPCIONAL, y esta es la decisión. En una venta por WhatsApp el precio se
  -- negocia hablando y puede no ser el del catálogo. Exigirlo convertiría
  -- "descontar una unidad" en "registrar una venta", que es justo lo que G.3
  -- dice que no se puede pedir. Si se rellena, la pantalla de ventas del mes
  -- suma; si no, cuenta unidades y no pesos. Media verdad vale más que pedir
  -- un dato que nadie va a escribir con el móvil en la mano.
  precio_unitario INTEGER CHECK (precio_unitario IS NULL OR precio_unitario >= 0)
);
CREATE INDEX IF NOT EXISTS despacho_items_por_despacho ON despacho_items (despacho_id);

-- ---------------------------------------------------------------------------
-- 5. CARGA INICIAL DEL STOCK
-- ---------------------------------------------------------------------------
-- NO se inventa. Las 30 variantes quedan en stock_fisico = 0 y, por tanto, en
-- "Agotado" según la regla de G.1 — lo cual sería APAGAR LA TIENDA el día que
-- esto se aplique. Por eso la fase 9 no termina con la migración: termina con
-- Andreina contando su bodega en la pantalla de inventario, antes de que el
-- cálculo de `vendible` empiece a mirar el stock.
--
-- La secuencia obligatoria está en G.6 ("el día del cambio") y es: aplicar
-- 0004 → cargar el conteo real → y SOLO ENTONCES activar el stock en el
-- cálculo de `vendible`. Mientras el interruptor está apagado, `vendible` es
-- solo `disponible`, exactamente como hoy.
INSERT OR IGNORE INTO ajustes (clave, valor) VALUES ('inventario_activo', '0');
```

**Sobre la última línea, y una dependencia que hay que declarar.** Ese
interruptor necesita una tabla `ajustes` (clave/valor) que **hoy no existe**: la
sección D, punto 5, la menciona como «fuera de alcance» para la tarifa de envío.
El inventario la necesita de verdad, así que **`0004` la crea** (es una tabla de
cuatro líneas) y la tarifa de envío podrá usarla después sin otra migración:

```sql
-- Ajustes del sitio, clave/valor. La menciona la sección D.5 del plan como la
-- forma correcta de que la dueña edite TARIFA_PLANA_ENVIO, y el inventario la
-- necesita para el interruptor de activación (ver 5, arriba), así que se crea
-- aquí. Es el patrón `settings` de 16bc.
CREATE TABLE IF NOT EXISTS ajustes (
  clave       TEXT PRIMARY KEY,
  valor       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

(En el fichero real va **antes** del `INSERT OR IGNORE`, obviamente. Se presenta
aparte aquí para que se vea que es una dependencia nueva y no un detalle.)

## G.2 Reserva temporal: por qué 30 minutos y no 24 horas

La decisión 1 del cliente ya está tomada: **se reserva al iniciar el pago**. Lo
que el encargo pide resolver es la tensión real, y es una tensión de verdad:

- **Bold da 24 horas para pagar.** Está en el plan del carrito (fase 3: «manejo
  de rechazado y abandonado (Bold da 24 horas para pagar)»). Un cliente puede
  abrir el checkout a las 10 de la noche, generar el enlace, y pagar por PSE a
  la mañana siguiente. Si el pago llega y la unidad ya se vendió, hay que
  devolver el dinero.
- **Reservar 24 horas apaga la tienda.** Con 1 o 2 unidades por variante —que es
  el stock realista de una tienda de café que vende objetos de 300.000 pesos—
  **un solo abandono deja el producto agotado durante un día entero**. Tres
  curiosos que abren el checkout y se van, y el catálogo queda en blanco. Es
  peor que el problema que resuelve: perder una venta por «agotado» cuando sí
  había es un daño silencioso y diario; un reembolso ocasional es ruidoso y
  raro.

No se pueden tener las dos cosas: o se garantiza que todo pago dentro de las 24 h
tiene unidad, o se mantiene el catálogo vivo. **Hay que elegir, y hay que decir
qué se pierde.**

**Elegido: 30 minutos.** Y, sobre todo, **la reserva no es la garantía**: la
garantía la da el `UPDATE` condicional del webhook (G.4, caso 1). La reserva
solo reduce la probabilidad de que dos personas lleguen a la vez al último
hervidor; no es una promesa.

**Por qué 30 y no 15:**

- 15 minutos es lo habitual en comercio de gran volumen, donde se paga con
  tarjeta en dos clics. Aquí los medios reales son **PSE y Nequi**, y PSE
  significa salir a la web del banco, iniciar sesión, pedir una clave que llega
  por SMS, confirmar. Desde un celular, con una red regular, **15 minutos se
  agotan de verdad**, y el peor fallo posible de este sistema es que a alguien
  le caduque la reserva **mientras estaba pagando bien** (caso límite 5).
- 30 minutos cubre con holgura un PSE lento sin dejar el catálogo apagado un
  tiempo perceptible. Si en media hora no se pagó, no se estaba pagando: se
  cerró la pestaña.

**Qué se pierde, dicho claro:** un pago que llega entre los 30 minutos y las 24
horas **puede encontrar la unidad vendida**. El caso límite 5 de G.4 lo resuelve
(no se rechaza el pago en silencio: se cobra, se marca para atención y se decide
con el cliente), pero **va a pasar alguna vez** y Andreina tiene que saberlo. El
mensaje del checkout lo dice sin jerga: *«Te apartamos tu pedido 30 minutos
mientras pagas. Si tardas más, lo seguimos teniendo casi siempre, pero te
escribimos para confirmar.»*

**Dónde se guarda el número:** en `ajustes` (`reserva_minutos`), no en una
constante del código. Es un número que se va a querer ajustar viendo cómo se
comporta la tienda real, y pedir un despliegue para pasar de 30 a 45 es la clase
de cosa que no se hace y se queda mal para siempre. La reserva guarda su
`vence_en` **absoluto**, así que cambiarlo mañana no reinterpreta las reservas de
hoy.

### Cómo caducan: Cron Trigger, y además al leer

El encargo pide evaluar las dos opciones. **Se hacen las dos, y no es
redundancia: resuelven cosas distintas.**

**1. Barrido periódico con Cron Trigger — el que libera el stock.**

Cloudflare Workers tiene Cron Triggers y son la herramienta correcta aquí: se
declaran en `wrangler.jsonc` y el runtime invoca `scheduled()` sin que haya que
montar nada.

```jsonc
// wrangler.jsonc
"triggers": { "crons": ["*/5 * * * *"] }
```

Cada 5 minutos, en un `batch()`:

```sql
-- Las que vencieron. El índice parcial reservas_a_caducar las encuentra sin
-- escanear la tabla.
SELECT id, variante_id, cantidad FROM reservas
 WHERE estado = 'activa' AND vence_en <= datetime('now');
-- Por cada una, y en la misma transacción:
UPDATE reservas SET estado = 'caducada', cerrada_en = datetime('now')
 WHERE id = ?1 AND estado = 'activa';          -- la condición en el WHERE
UPDATE variantes SET stock_reservado = stock_reservado - ?2
 WHERE id = ?3 AND stock_reservado >= ?2;      -- nunca por debajo de cero
INSERT INTO movimientos (variante_id, cantidad, afecta, motivo, quien, reserva_id)
VALUES (?3, -?2, 'reservado', 'reserva_caducada', 'cron', ?1);
```

`AND estado = 'activa'` en el `WHERE` es lo que hace que dos ejecuciones
solapadas del cron —o el cron y una lectura a la vez— no resten el reservado dos
veces. Es el patrón de 16bc (A.4) y es la única protección que no depende de
nadie. **Cada 5 minutos y no cada minuto** porque una reserva de 30 minutos que
se libera a los 33 no molesta a nadie, y el cron escribe filas que se pagan (R4).

**2. Al leer — el que impide vender humo.**

El barrido deja una ventana de hasta 5 minutos en la que una reserva ya vencida
sigue contando como reservada. Si eso fuera la única red, el catálogo diría
«agotado» hasta 5 minutos después de que la unidad volviera a estar libre. Así
que **el cálculo de disponibilidad descuenta solo las reservas realmente
vigentes**, y no `stock_reservado` a secas, cuando la variante está al límite:

```sql
-- Para la ficha de producto y el checkout, donde la precisión importa.
-- Esta consulta es por variante y solo se hace cuando el stock está al límite:
-- /catalogo sigue usando las dos columnas, que es lo que lo hace barato.
SELECT v.stock_fisico - COALESCE((
         SELECT SUM(r.cantidad) FROM reservas r
          WHERE r.variante_id = v.id AND r.estado = 'activa'
            AND r.vence_en > datetime('now')
       ), 0) AS vendible
  FROM variantes v WHERE v.id = ?1;
```

**Lo que NO se hace al leer: escribir.** Caducar reservas durante una lectura
significa que una visita al catálogo haga `UPDATE`, y eso rompe tres cosas de
golpe: las páginas públicas quedan cacheadas (B.3) y una respuesta de caché no
ejecuta nada, un `GET` que escribe impide cachear, y una ráfaga de visitas se
convierte en una ráfaga de escrituras que se pagan. **El cron escribe, la
lectura solo lee.** La lectura es exacta sin escribir porque mira `vence_en`, no
`stock_reservado`.

**Y una tercera red, barata:** el checkout caduca las reservas vencidas **de las
variantes que va a reservar**, justo antes de reservarlas, en su mismo `batch()`.
Son dos o tres variantes, no la tabla; es una escritura que ya estaba ocurriendo;
y cierra el caso que más duele: el cliente que no puede comprar porque alguien
abandonó un checkout hace 31 minutos y el cron pasa dentro de cuatro.

## G.3 Los dos flujos, paso a paso

### Flujo 1 — Venta por Bold

El punto que el encargo pide exacto es **en qué momento baja cada cantidad**, y
la respuesta corta es: **el reservado baja y sube tres veces; el físico baja una
sola vez, al final.**

| Paso | `stock_fisico` | `stock_reservado` | Qué más pasa |
|---|---|---|---|
| **1. Carrito** (`localStorage`) | — | — | Nada. El carrito no reserva: eso dejaría el catálogo apagado por gente que mira. `carrito.ts` solo guarda `handle` + `varianteId` + cantidad, y ya relee disponibilidad en cada pintado |
| **2. Abre `/checkout`** | — | — | Tampoco. Se reserva al **enviar** el formulario, no al abrirlo |
| **3. `POST /api/pedidos`** | — | **+n** | **Aquí se reserva.** Mismo `batch()`: crea el pedido `pendiente`, crea una `reserva` por línea con `vence_en = ahora + 30 min`, sube `stock_reservado`, escribe un `movimiento` `reserva` por línea. Si alguna línea no alcanza, **todo el batch se deshace** y el cliente ve qué falta (G.4, caso 1) |
| **4. Paga en Bold** | — | — | Fuera de nuestro sistema |
| **5. Webhook: pago aprobado** | **−n** | **−n** | Mismo `batch()`: pedido a `pagado`, reservas a `confirmada`, **baja el físico**, baja el reservado, crea el `despacho` (`origen='bold'`), escribe dos `movimientos` por línea (`venta_bold` sobre físico, `despacho`… no: ver nota) |
| **6. Andreina marca «despachado»** | — | — | Solo cambia `despachos.estado`. **El stock ya bajó en el paso 5** |

**Nota sobre el paso 5 y 6, que es la decisión no obvia.** Hay dos sitios
posibles para bajar el físico: al cobrar (paso 5) o al despachar (paso 6). **Se
baja al cobrar**, y la razón es la pregunta que el stock tiene que responder:
*«¿puedo vender esto?»*. Una unidad cobrada y aún en la estantería **no se puede
vender a nadie más**, así que contarla como existencias haría que el sitio la
ofreciera. La estantería tendrá una unidad que el sistema no ve, durante las
horas que tarde en salir el paquete; eso es un desajuste de inventario físico
que no cuesta nada (está en la lista de despachos, visible), mientras que lo
contrario es vender dos veces lo mismo. Por eso `despacho` como motivo de
movimiento existe en el `CHECK` pero **solo lo usan las ventas de WhatsApp
registradas con despacho diferido**; el camino de Bold usa `venta_bold`. Está
dicho aquí porque leyendo solo la tabla de motivos parece una inconsistencia.

**Qué pasa si el pago se rechaza.** El webhook de rechazo libera: reservas a
`liberada`, baja `stock_reservado`, movimiento `reserva_liberada`, pedido a
`rechazado`. **No se espera a que caduque**: liberar en cuanto se sabe devuelve
la unidad al catálogo en segundos en vez de en media hora. Y el cliente puede
reintentar: un reintento es un **checkout nuevo**, con reserva nueva, porque la
anterior ya se liberó. (Si al reintentar ya no hay unidad, lo trata G.4 caso 1
como cualquier otro: se le dice antes de cobrar, no después.)

**Qué pasa si el cliente abandona.** No llega ningún webhook. La reserva vence a
los 30 minutos y el cron la caduca (G.2). El pedido se queda `pendiente` y lo
recoge el estado `expirado` que el plan del carrito ya tiene previsto. **Nadie
tiene que hacer nada**, que es el requisito.

**Qué pasa si el webhook llega DOS VECES.** El plan del carrito ya exige
idempotencia; el inventario añade su propia capa porque aquí un doble proceso no
duplica un correo, **descuenta dos unidades**. Tres redes, en orden:

1. **El cambio de estado del pedido es la puerta, y la condición va en el
   `WHERE`** —el patrón de 16bc (A.4, línea 637) que el encargo pide usar:

   ```sql
   UPDATE pedidos SET estado = 'pagado', pagado_en = datetime('now'), bold_tx_id = ?2
    WHERE id = ?1 AND estado = 'pendiente';
   ```

   Se comprueba `meta.changes`. **Si es 0, el evento ya se procesó y el webhook
   devuelve 200 sin tocar inventario.** No hay ventana entre comprobar y
   actualizar, porque no se comprueba: se actualiza condicionalmente.
2. **Las reservas también se cierran condicionalmente** (`AND estado =
   'activa'`), así que incluso si la puerta 1 se abriera por un bug, el
   reservado no baja dos veces.
3. **El despacho no se puede duplicar**, por el índice único parcial
   `despachos_un_pedido` sobre `pedido_id`. Esta es la red que no depende de que
   nadie escriba bien el código: la base la impone.

Y todo el paso 5 va **en un solo `batch()`**, que en D1 es una transacción
implícita (A.4). O baja el stock y se crea el despacho, o no pasa nada. Nunca un
pedido pagado sin stock descontado.

**Y `eventos_pago`**, que el plan del carrito ya define como «registro crudo de
cada webhook recibido, para auditar», sigue escribiéndose **siempre**, incluso
cuando el evento se descarta por repetido. Es lo que permite responder «¿Bold nos
avisó dos veces o fuimos nosotros?».

### Flujo 2 — Venta por WhatsApp

El requisito de diseño es explícito y manda sobre todo lo demás: **Andreina está
contestando mensajes, con el móvil en la mano, y acaba de cerrar una venta
hablando.** Lo que necesita es descontar una unidad **en pocos toques**, sin
rellenar un pedido.

**¿Crea un «pedido» del mismo tipo que los de Bold? No.** Crea un **despacho**,
que es deliberadamente más ligero. La justificación:

- Un `pedido` de Bold existe para **cobrar**: necesita subtotal, envío, total,
  tipo y número de documento, email, celular, dirección, ciudad, departamento,
  `bold_tx_id`, `metodo_pago`. Casi todo eso es obligatorio porque la pasarela
  lo exige y porque es una transacción electrónica.
- En una venta por WhatsApp **ya se cobró** (transferencia, Nequi, en mano) y la
  dirección está en la conversación. Pedirle a Andreina que rellene catorce
  campos para descontar un filtro garantiza una de dos cosas: que no lo haga y
  el stock quede mal, o que escriba basura para pasar la pantalla. **Las dos son
  peores que no pedirlo.**
- Un despacho de WhatsApp tiene **un campo obligatorio: qué y cuánto.** Cliente,
  nota y precio son opcionales (ver el SQL de `despacho_items`).

**Lo que esto cuesta, dicho claro:** las ventas de WhatsApp **no entran en la
contabilidad de ingresos del panel** salvo que Andreina rellene el precio. Es un
compromiso consciente: el objetivo de esta pantalla es que el **stock** cuadre,
no llevar la caja. Si más adelante se quiere el ingreso, se le pone el precio del
catálogo como valor por defecto editable en un toque —pero **no se hace
obligatorio nunca**, porque el precio hablado no siempre es el del catálogo.

**La pantalla, en toques reales.** Desde `/admin/inventario`, donde ya está la
lista de las 30 variantes con su número:

1. **Un toque** en el botón `−` de la variante. Descuenta **uno** y ya está:
   crea el despacho, el item, baja el físico, escribe el movimiento. Un toque,
   cero pantallas.
2. Aparece una franja abajo: **«−1 Hervidor blanco · vendido por WhatsApp ·
   [Deshacer] [Añadir más]»**, que se queda unos segundos.
   - **[Deshacer]** revierte (movimiento `devolucion` con nota automática
     «deshecho», no un `DELETE`: el libro no se borra).
   - **[Añadir más]** abre el mismo despacho para sumarle otra variante, para la
     venta de tres cosas a la vez.
3. La franja también lleva **[Poner nombre]**, opcional, que es lo único que
   hace falta para que el paquete de la lista de despacho diga «Para Marcela» en
   vez de «Venta por WhatsApp». Un campo, un toque.

**Toques para el caso más común (una unidad, una variante): uno.** Para tres
unidades de lo mismo: tres toques en `−`, que el panel agrupa en el mismo
despacho si son del mismo minuto (y si no, son dos despachos, que tampoco está
mal).

**Y el `−` tiene una guarda, con la condición en el `WHERE`:**

```sql
UPDATE variantes SET stock_fisico = stock_fisico - 1
 WHERE id = ?1 AND stock_fisico - stock_reservado >= 1;
```

Si `meta.changes` es 0, no había vendible: el panel **no falla**, pregunta. Es el
caso límite 2 de G.4, y es el más probable de todos.

**El despacho de WhatsApp nace `pendiente`**, no `despachado`. Porque muchas
veces se cierra la venta y el paquete sale al día siguiente, y esa es justo la
lista que el cliente pidió. Si Andreina lo entrega en mano en ese momento, un
toque en «Ya salió» lo cierra. **Lo que no se hace es presuponerlo**: un
despacho que nace cerrado nunca aparece en la lista, y una venta que no aparece
en la lista es un paquete que se olvida.

## G.4 Casos límite

### 1. Dos clientes pagan a la vez la última unidad

**Se resuelve en el `WHERE` de un `UPDATE`, no en JavaScript.** El patrón ya
está documentado en este plan (A.4, A.6 punto 3) y es exactamente para esto.

**Lo que NO se hace** (y es el error natural):

```js
const v = await db.prepare('SELECT stock_fisico, stock_reservado FROM variantes WHERE id=?').first();
if (v.stock_fisico - v.stock_reservado >= n) {            // ← la ventana
  await db.prepare('UPDATE variantes SET stock_reservado = stock_reservado + ?').run();
}
```

Entre el `SELECT` y el `UPDATE` cabe el otro cliente. Los dos leen 1, los dos
deciden que sí, los dos reservan, y `stock_reservado` queda en 2 con una unidad.

**Lo que sí:**

```sql
UPDATE variantes
   SET stock_reservado = stock_reservado + ?2
 WHERE id = ?1
   AND stock_fisico - stock_reservado >= ?2;   -- la condición, en el WHERE
```

Y después `meta.changes`: **1 reservó, 0 no alcanzó**. No hay ventana porque no
hay dos operaciones. El primero en llegar a la base gana; el segundo recibe
`changes = 0`, **todo su `batch()` se deshace** (pedido incluido) y ve: *«Nos
quedamos sin Hervidor blanco mientras armabas el pedido. Lo quitamos para que
puedas seguir con el resto.»* — antes de pagar, que es lo único que importa.

**Y la misma condición protege el paso del webhook**, porque el otro camino de
esta carrera es que los dos consigan reservar (había 2) y uno pague tarde:

```sql
UPDATE variantes SET stock_fisico = stock_fisico - ?2
 WHERE id = ?1 AND stock_fisico >= ?2;
```

Si ese `changes` es 0 con un pago aprobado, es el caso 5 y se trata como tal:
**el dinero ya entró, así que no se rechaza nada en silencio.**

### 2. Andreina vende por WhatsApp algo que alguien tiene reservado

El caso más probable de toda la lista, porque pasa a diario: hay 1 hervidor, un
cliente abrió el checkout hace cinco minutos, y por WhatsApp alguien lo quiere
ahora.

**La decisión: el `−` respeta las reservas.** No descuenta. El `WHERE` de arriba
(`stock_fisico - stock_reservado >= 1`) devuelve `changes = 0`, y el panel
**pregunta en vez de fallar**:

> **No puedo descontarlo todavía**
> Tienes **1 Hervidor blanco**, pero **alguien lo está pagando ahora mismo** en
> la tienda (le quedan 23 minutos).
> · **Esperar** — si no paga, vuelve solo y te aviso.
> · **Venderlo igual** — si el otro paga, tendrás que devolverle el dinero.
>   *(deja el stock en −1 y lo marca para revisar)*

**Por qué respetar la reserva y no dar prioridad a quien está delante.** Porque
el cliente del checkout **puede estar a punto de pagar con su banco abierto**:
quitarle la unidad produce un cobro aprobado sin mercancía, que es el peor
resultado posible. La venta de WhatsApp, en cambio, está **en una conversación**:
«dame 20 minutos y te confirmo» es una frase normal que no cuesta nada. Se
protege al que ya tiene dinero en juego.

**Pero no se le prohíbe.** «Venderlo igual» existe porque Andreina conoce su
negocio y puede tener razones (el cliente de WhatsApp está en la puerta, el del
checkout es un carrito abandonado que ella reconoce). Deja el stock negativo a
propósito, escribe el movimiento con nota automática, y lo marca para revisar
(caso 4). **Nunca se toma esa decisión sola**, pero tampoco se le impide tomarla.

### 3. Un pedido pagado se cancela o se devuelve

Son dos cosas distintas y se tratan distinto, porque la diferencia es **si la
mercancía salió**:

- **Cancelación antes de despachar** (el despacho está `pendiente`): el paquete
  nunca se armó. Un toque en «Anular» sobre el despacho: pasa a `anulado`,
  **devuelve el físico** (movimiento `devolucion`, nota «pedido cancelado»), y el
  pedido pasa a `cancelado`. La unidad vuelve al catálogo en el siguiente
  pintado. El reservado **no se toca**: ya se había cerrado en el paso 5.
- **Devolución después de despachar** (el despacho ya está `despachado`): el
  objeto se fue y vuelve. **Se registra como un movimiento nuevo**, no como un
  deshacer: `devolucion`, +físico, con nota obligatoria. Y aquí sí se pide algo
  más, porque es el único caso donde hace falta: **¿vuelve a la venta o no?**
  Una Chemex que vuelve con el cristal picado no es stock. Dos botones: «Vuelve a
  la venta» (+1 físico) y «No se puede vender» (movimiento `ajuste` con nota, no
  suma al vendible). Sin esa pregunta, el inventario dice que hay una Chemex que
  nadie puede comprar, y eso es exactamente cómo se pierde la confianza en un
  contador.
- **El reembolso del dinero NO lo hace el panel.** Está fuera de alcance: lo hace
  la dueña desde Bold. El panel registra qué pasó con la mercancía y deja la
  nota; el dinero es otro sistema y mezclarlos aquí sería inventar un módulo que
  nadie pidió.

### 4. El stock queda negativo por un error humano

**¿Se permite? Sí. ¿Se avisa? Mucho.** Es la decisión que más fácil se hace mal
en la dirección «más estricta es más seguro», y aquí no lo es.

**Por qué se permite.** El stock negativo no es un estado inventado por el
sistema: es **lo que ya pasó en el mundo real**. Andreina contó cuatro y había
tres; vendió por WhatsApp algo que estaba reservado; se rompió una unidad y nadie
lo registró. Si la base lo prohibiera con un `CHECK (stock_fisico >= 0)`, el
guardado **fallaría con un error de base de datos** y el panel tendría que
decirle «no puedo guardar eso», dejándola con dos opciones: mentirle al sistema
(poner 0 cuando debe −1) o no registrar nada. Las dos destruyen el libro, que es
precisamente la cosa que hace recuperable un desajuste. **Un contador que no
puede representar el error no puede ayudar a encontrarlo.** Por eso el SQL de
G.1 documenta explícitamente la ausencia de ese `CHECK`.

**Qué sí se prohíbe, con dureza:** que el **reservado** quede negativo. Un
`stock_reservado` negativo no es un error de conteo humano: es un **bug del
código de reservas** (se liberó dos veces lo mismo). Ahí sí se quiere que falle:
todo `UPDATE` que baja reservado lleva `AND stock_reservado >= ?`, y un
`changes = 0` en ese sitio se registra como error, no como «no alcanzó».

**Cómo se avisa, en tres sitios:**

1. **En la fila**, en rojo: «**−1** · hay menos de lo que dice el sistema ·
   [Corregir]». Nunca «valor inválido».
2. **En `/admin`**, en el mosaico de lo que necesita atención, junto a las
   insignias que ya existen en el patrón de 16bc (A.3). Con `try/catch` alrededor
   del recuento, por la misma razón que allí: un panel que no se pinta porque no
   pudo contar es un panel inútil.
3. **El negativo nunca se vende.** `vendible` es `stock_fisico -
   stock_reservado > 0`, y −1 no es > 0, así que el producto sale como «Agotado»
   en el sitio sin ninguna rama extra. El error se ve en el panel y **no llega al
   cliente**, que es el reparto correcto.

**Y el cuadre, que es el seguro de todo esto.** Una consulta que compara, por
variante, `stock_fisico` contra `SUM(cantidad)` de los movimientos de tipo
`fisico`, y `stock_reservado` contra la suma de reservas activas:

```sql
SELECT v.id, v.titulo, v.stock_fisico,
       COALESCE((SELECT SUM(m.cantidad) FROM movimientos m
                  WHERE m.variante_id = v.id AND m.afecta = 'fisico'), 0) AS segun_libro,
       v.stock_reservado,
       COALESCE((SELECT SUM(r.cantidad) FROM reservas r
                  WHERE r.variante_id = v.id AND r.estado = 'activa'), 0) AS reservas_activas
  FROM variantes v
 WHERE v.stock_fisico <> segun_libro OR v.stock_reservado <> reservas_activas;
```

**Si esta consulta devuelve una sola fila, hay un bug** —no un error de
Andreina—, porque todo movimiento se escribe en el mismo `batch()` que el cambio
de columna. Se corre en el cron diario y, si devuelve algo, sale en `/admin`. Es
la diferencia entre «el stock no cuadra» y «sé exactamente dónde no cuadra».

### 5. Reserva caducada mientras el cliente seguía pagando

El peor caso, y el que justifica los 30 minutos de G.2. Secuencia: reserva a las
10:00, vence a las 10:30, el cliente estaba en PSE y el pago se aprueba a las
10:34. El webhook llega con un pago **real, cobrado**, y la reserva ya no existe.

**Regla primera, no negociable: el dinero ya entró. El pago no se rechaza ni se
ignora.** Lo que se decide es solo qué pasa con la mercancía. Dos ramas:

- **Si todavía hay unidad** (el caso normal: caducó pero nadie compró en esos 4
  minutos): **se procesa como un pago normal**. El `UPDATE` condicional
  `WHERE stock_fisico >= n` da `changes = 1`, baja el físico, se crea el
  despacho. La reserva se queda en `caducada` —no se resucita, porque el libro
  cuenta lo que pasó— y el movimiento `venta_bold` lleva la nota «reserva
  caducada, había stock». **El cliente no se enteró de nada**, que es el
  resultado correcto.
- **Si NO hay unidad** (alguien compró en esos 4 minutos, o Andreina la vendió
  por WhatsApp): `changes = 0`. Entonces:
  1. **El pedido pasa a `pagado`** igualmente. Negar el pago porque no hay stock
     dejaría a un cliente con el dinero cobrado y un pedido en estado raro.
  2. **Se crea el despacho igual, marcado `sin_stock`** y **primero** en la
     lista de despachos, en rojo: «Pagado y no hay unidad — hay que hablar con
     el cliente». Visible al minuto, no al final del día.
  3. **El stock NO se deja negativo aquí.** Es la asimetría con el caso 4 y es
     deliberada: ahí el negativo refleja algo que pasó en el mundo (una unidad
     que salió); aquí no ha salido nada, y poner −1 diría que hay una unidad
     menos de la que hay. Se registra el compromiso en el despacho, que es donde
     vive.
  4. **Resolución humana**, porque no hay otra: Andreina escribe al cliente y se
     acuerda esperar reposición o devolver. El panel ofrece los dos caminos
     («Llegó mercancía y se despachó» / «Se devolvió el dinero», que anula el
     despacho) y **no decide solo**.

**Y una red más, barata y que evita casi todos estos casos:** la redirección de
Bold a `/pedido/resultado` llega **antes** que el webhook en la práctica. Esa
página ya existe en el plan del carrito; se le añade que, si el pedido está
`pendiente` y la reserva está `activa`, **le extienda el `vence_en` 10 minutos**.
Señal de que alguien está ahí volviendo del banco. No sustituye nada de lo
anterior, pero recorta mucho la ventana real.

### 6. Un producto se archiva teniendo unidades reservadas

El plan ya decide que archivar es reversible (`archivado_en`) y que la URL da 301
a su categoría (R3, E.7). El inventario añade una pregunta que antes no existía:
**¿y lo que alguien está pagando ahora mismo?**

- **Las reservas activas SOBREVIVEN al archivado.** Archivar es «quítalo del
  catálogo», no «cancela las ventas en curso». Quien esté pagando puede
  terminar, el webhook procesa y se crea el despacho. **La FK no se rompe**: las
  reservas apuntan a `variantes.id`, y archivar no borra nada (es un campo de
  fecha en `productos`). Esto no es un accidente afortunado: es lo que hace que
  el borrado reversible funcione.
- **El panel avisa antes de archivar**, porque Andreina no puede saberlo: «Este
  producto tiene **1 unidad que alguien está pagando** y **2 paquetes sin
  despachar**. Si lo archivas, dejará de verse en la tienda pero esas ventas
  siguen. ¿Archivar?» Con los dos números. Sin ese aviso, archivar se siente
  como cancelar y no lo es.
- **Los despachos pendientes siguen en la lista**, con el producto marcado como
  archivado. Un paquete pagado hay que mandarlo aunque el producto ya no se
  venda. **Desaparecer de la lista de despacho sería perder un pedido pagado**,
  que es lo más grave que puede hacer este sistema.
- **El borrado definitivo** (la operación aparte que B.1 ya contempla) **se
  bloquea** mientras haya reservas activas o despachos pendientes. Aquí sí se
  bloquea y no se pregunta: `movimientos.variante_id` tiene
  `ON DELETE CASCADE`, así que borrar de verdad **se llevaría el libro por
  delante**. Mensaje: «No se puede eliminar del todo: hay 2 paquetes sin
  despachar. Despáchalos o anúlalos primero.»
- **El stock se conserva al archivar.** Archivar y desarchivar un producto no
  puede perder el conteo: son cuatro hervidores que siguen en la estantería.

## G.5 Impacto en lo ya hecho

### El catálogo, la ficha y el carrito: **no se tocan**

Es el mejor resultado posible de este diseño y conviene decir por qué se
consiguió, porque fue una decisión y no suerte: **`formas.ts` no cambia**.

Hoy `Variante.disponible` y `Producto.disponible` son booleanos que los
componentes consumen sin saber de dónde salen. El inventario **cambia cómo se
calculan, no qué son**. En consecuencia:

| Fichero | Cambia |
|---|---|
| `src/datos/formas.ts` | **No.** Ni un tipo |
| `src/components/TarjetaProducto.astro` | **No.** (Y conviene: hay otro trabajo en curso ahí) |
| `src/components/GaleriaProducto.astro`, `Precio.astro`, `SEO.astro` | **No** |
| `src/pages/catalogo.astro`, `producto/[handle].astro` | **No** por el inventario. Solo el aviso de «últimas unidades», que es opcional |
| `src/scripts/carrito.ts` | **No.** Sigue releyendo disponibilidad en cada pintado, que es justo lo que hace falta. Su decisión documentada («un carrito que recuerda precios es un carrito que miente») vale igual para la disponibilidad |
| `src/datos/consultas/productos.ts` | **Sí**, y es casi todo el cambio público: la fórmula de `vendible` |
| `src/datos/catalogo.ts` | **Sí**, mínimo: una función para el stock exacto de una variante (checkout y ficha) |

**El cambio en `consultas/productos.ts`,** en la práctica, es que `CAMPOS` pase a
calcular la columna en el `SELECT` en vez de leerla:

```sql
-- Antes:  precio, disponible, ...
-- Ahora:  precio, ... y la disponibilidad calculada:
--   v.disponible = 1 AND (v.stock_fisico - v.stock_reservado) > 0
-- y el producto es vendible si alguna de sus variantes lo es.
```

El mapeo `disponible: v.disponible === 1` de la línea 233 pasa a leer la columna
calculada. **La forma que sale de la capa es idéntica**, y por eso las fases 1–3
no se rehacen.

**Un añadido opcional que sí vale la pena** (y es el único cambio visible en el
sitio): **«Queda 1»** en la ficha cuando el vendible es 1 o 2. Vende, y es
honesto. **Lo que no se muestra nunca es el número exacto de stock**: a un
competidor le dice cuánto se vende, y a un cliente que ve «quedan 14» le dice
que no corra. Dos umbrales y nada más.

### Qué cambia en las fases del plan del carrito

Esto es lo que el encargo pide señalar, y **toca las fases 2 y 3 de ese plan**:

- **Fase 2 (Checkout).** `POST /api/pedidos` pasa de «crear el pedido y firmar» a
  «crear el pedido, **reservar**, y firmar — todo en un `batch()`, y fallar con un
  mensaje útil si alguna línea no alcanza». Es el cambio de más peso:
  **+2–3 horas** sobre su estimación.
- **Fase 3 (Confirmación).** El webhook pasa de «cambiar el estado y avisar» a
  «cambiar el estado, **bajar el stock, cerrar las reservas y crear el
  despacho**», con las tres redes de idempotencia de G.3. **+2–3 horas.**
- **Fase 3, además:** el estado `expirado` ya previsto se conecta con la
  caducidad de reservas (el cron de G.2 ya libera; el pedido se marca con el
  mismo barrido).
- **Fase 4 (Avisos y panel).** `/admin/pedidos` ya estaba previsto; «marcar como
  enviado» pasa a ser la acción sobre `despachos` de G.4. **Se solapa con la fase
  9 de este plan**: conviene hacerlo una sola vez, aquí. **−1 hora allá.**
- **Su «Fuera de alcance» queda desactualizado** («Inventario en tiempo real»),
  igual que su decisión 4. Ver G.0, punto 3.
- **Y una regla nueva para ese plan, que encaja con la que ya tiene:** su regla
  no negociable dice «el precio nunca se toma del navegador». La hermana es **«la
  disponibilidad tampoco»**. El servidor comprueba el stock al reservar, con la
  condición en el `WHERE`, y lo que el navegador creyera que había es
  irrelevante. Su prueba obligatoria 5 («variante agotada: no se puede agregar ni
  pagar») pasa a cubrir también «agotada **entre** agregar y pagar», que es el
  caso que de verdad ocurre.

### Fases de este plan

El inventario es **una fase nueva, la 9**, y no se reparte entre las existentes.
Razón: depende de que el panel exista (fase 4) y de que las variantes se editen
(fase 5), y meterlo dentro de la 5 convertiría una fase ya grande en una
inauditable. Va **después de la 8** porque el sitio dinámico tiene que estar en
pie y medido antes de añadirle un contador que apaga productos.

**Y un aviso de secuencia que importa más que las horas:** la fase 9 **no se
puede entregar a medias**. Aplicar `0004` y activar el cálculo de `vendible` con
las 30 variantes a 0 **apaga la tienda entera**. Por eso el interruptor
`inventario_activo` de `ajustes` existe y por eso la fase incluye el conteo
inicial de Andreina como paso obligatorio (ver G.6).

| Fase | Qué incluye | Horas |
|---|---|---|
| **9 · Inventario** (G) | `0004_inventario.sql` (+ `ajustes`). Fórmula de `vendible` en `consultas/productos.ts` con el interruptor de activación. Reservas en `POST /api/pedidos` y cierre en el webhook, con las tres redes de idempotencia. Cron Trigger de caducidad + caducidad en el checkout. Pantalla de inventario (30 variantes, cargar/descontar con motivo, a 375 px). Lista de «productos a despachar» con los dos orígenes y «ya salió». Venta por WhatsApp en un toque, con deshacer. Historial por variante. Cuadre diario y avisos en `/admin`. Conteo inicial con Andreina | 14–19 |

**Tabla de fases actualizada y con la suma comprobada.** El encargo advierte que
una versión anterior de este documento declaraba un total que no cuadraba con su
propia tabla; **se verificó la tabla de las 9 fases anteriores y sí cuadraba**
(`3+6+8+10+7+10+12+5+3 = 64` y `4+9+11+14+10+14+17+7+4 = 90`, con sus dos
subtotales correctos: 34–48 de panel y 30–42 de arquitectura). La fase 9 se suma
sin tocar nada de lo anterior:

| Fase | Horas |
|---|---|
| 0 · Decisiones y red de seguridad | 3–4 |
| 1 · Modo servidor | 6–9 |
| 2 · Datos a D1 | 8–11 |
| 3 · El sitio lee de D1 | 10–14 |
| 4 · Panel: autenticación y armazón | 7–10 |
| 5 · Panel: productos | 10–14 |
| 6 · Imágenes por variante y rol | 12–17 |
| 7 · Panel: diario y categorías | 5–7 |
| 8 · Pruebas y publicación | 3–4 |
| **9 · Inventario** (nueva) | **14–19** |
| **Total** | **78–109** |

Comprobación, porque el encargo lo pide explícitamente:
mínimos `3+6+8+10+7+10+12+5+3+14 = 78`; máximos `4+9+11+14+10+14+17+7+4+19 = 109`.
**Cuadra.**

Y los subtotales, también recomputados:
- **Panel (fases 4–7 y 9): 48–67** (`7+10+12+5+14` / `10+14+17+7+19`).
- **Arquitectura y sitio público (0–3, 8): 30–42**, sin cambios.

Al plan del carrito hay que sumarle, por su parte, **+3 a +5 horas netas**
(+2–3 en su fase 2, +2–3 en su fase 3, −1 en su fase 4), con lo que su total pasa
de **26–36** a **29–41**. Ese documento no se edita aquí; queda anotado.

### Riesgos nuevos (formato de B.6)

| # | Riesgo | Gravedad | Mitigación concreta |
|---|---|---|---|
| **R11** | **El inventario se desincroniza de la realidad y nadie lo nota.** Es el modo de fallo característico de todo sistema de stock: no se cae, **miente**. Una rotura sin registrar, un conteo mal hecho, una venta por WhatsApp que no se descontó, y a los dos meses el panel dice 4 donde hay 2. Entonces el sitio vende lo que no existe, y la confianza en el contador se pierde de golpe — después de lo cual Andreina deja de usarlo y el proyecto se queda con lo peor de los dos mundos | **Alta** | Cuatro capas. (1) **Todo cambio escribe en `movimientos`**, sin excepción: un desajuste siempre es *localizable* en el tiempo. (2) **Cuadre automático diario** (consulta de G.4 caso 4) en el cron; una sola fila devuelta es un bug y sale en `/admin`. (3) **Descontar tiene que costar un toque** (G.3): el diseño de interfaz *es* la mitigación, porque un registro que cuesta trabajo no se hace. (4) **Recuento guiado**: una pantalla «contar bodega» que pide los 30 números y escribe los `ajuste` necesarios, para hacerlo una vez al mes sin pelear con la interfaz |
| **R12** | **Las reservas apagan el catálogo.** Con 1–2 unidades por variante, unos pocos checkouts abandonados dejan productos en «Agotado» sin que falte nada. El daño es invisible: no hay error, solo ventas que no ocurren | **Media** | Reserva de **30 minutos**, no 24 h (G.2, con su compromiso explícito). Caducidad por cron cada 5 min **y** cálculo exacto al leer que descuenta solo lo vigente, así que el peor retraso visible es cero, no 5 minutos. Liberación inmediata al rechazo, sin esperar el vencimiento. El panel muestra «reservado ahora: 2» en la fila, para que un «agotado» raro sea explicable en un vistazo en vez de un misterio |
| **R13** | **El día de la activación se apaga la tienda.** `0004` deja las 30 variantes en 0, y 0 significa «Agotado» por la decisión 2 del cliente. Activado sin conteo previo, el catálogo entero queda vacío — con 200, que es lo que R3 señala como lo peor para Google | **Alta** | **Interruptor `inventario_activo` en `ajustes`, apagado en la migración.** Con él apagado `vendible` es exactamente `disponible`, o sea el comportamiento de hoy, con el stock ya cargándose en segundo plano. La secuencia obligatoria de G.6 (migrar → contar → activar) **no es una recomendación**: es el contenido de la fase 9. Y la activación se hace con Andreina delante, a primera hora, no un viernes por la tarde |
| **R14** | **Un pago cobrado sin mercancía.** Puede ocurrir por la ventana de los 30 min (caso 5) o porque Andreina vendió por WhatsApp algo reservado (caso 2). Es poco frecuente y es el que más daña la reputación de una tienda pequeña, donde cada cliente se conoce | **Media** | El `UPDATE` condicional hace que **se detecte siempre**, nunca pase inadvertido. El despacho nace marcado `sin_stock` y **primero** en la lista, en rojo, visible al minuto. **El pago nunca se rechaza por falta de stock**: se cobra, se avisa y lo resuelve una persona hablando, que es como se resuelve de verdad. La extensión de reserva al volver de Bold (G.4 caso 5) recorta la ventana. Y el aviso previo de «Venderlo igual» deja la decisión en quien puede valorarla |
| **R15** | **Caché y stock: el sitio dice «hay» y no hay.** Las páginas públicas se sirven de caché de borde (B.3) y el stock cambia cada vez que Andreina descuenta. Una página cacheada puede ofrecer durante minutos algo que se acabó. Es R9 con dinero encima | **Media** | La verdad **no está en la página, está en el `WHERE` del `UPDATE`**: una página cacheada puede invitar a comprar, pero la reserva se comprueba contra la base y falla limpiamente con un mensaje (caso 1). Además: purgar por etiqueta (`producto:<handle>`) en todo movimiento que cruce el umbral de 0 —no en cada movimiento, que sería purgar la caché todo el día—, y **nunca cachear `/checkout` ni las respuestas de la API**. Los avisos de «Queda 1» llevan `s-maxage` corto |

### Pruebas obligatorias que se añaden

Se suman a la lista existente, con su numeración:

18. **Dos pagos simultáneos de la última unidad**: uno cobra y despacha, el otro
    recibe un mensaje claro **antes de pagar**. El stock queda en 0, nunca en −1,
    y el libro tiene exactamente una venta.
19. **Webhook por duplicado**: el stock baja **una** vez, hay **un** despacho (lo
    impide el índice único), y `eventos_pago` registra los dos eventos.
20. **Abandono**: a los 30 min el cron libera, el producto vuelve a venderse y el
    movimiento `reserva_caducada` lo explica.
21. **Caducada mientras pagaba, con stock y sin stock**: con stock, el cliente no
    se entera; sin stock, el pedido queda `pagado` y el despacho sale **primero y
    en rojo**.
22. **WhatsApp en un toque**: descontar una unidad desde `/admin/inventario` a
    375 px en **un** toque, con deshacer que escribe un movimiento (no un
    `DELETE`).
23. **WhatsApp contra una unidad reservada**: el panel **pregunta**, no falla.
    «Esperar» no cambia nada; «Venderlo igual» deja −1, lo marca y lo avisa.
24. **Negativo**: una variante en −1 sale «Agotado» en el sitio, en rojo en el
    panel y en el mosaico de `/admin`. **Nunca un error de base de datos en
    pantalla.**
25. **Cuadre**: la consulta de G.4 devuelve **cero filas** tras ejecutar los
    casos 18–24 seguidos. Si devuelve algo, es un bug y hay que encontrarlo.
26. **Archivar con reservas**: avisa con los dos números, las reservas sobreviven,
    el despacho pendiente sigue en la lista, y el borrado definitivo se bloquea.
27. **Cargar diez unidades en tres toques**, a 375 px, cronometrado. Si cuesta
    más, la pantalla está mal y hay que rehacerla (R11 capa 3).
28. **Activación**: con `inventario_activo = 0` el catálogo se comporta
    **exactamente** como antes de la migración, con el stock ya cargado. Se
    comprueba antes de activar, no después.

## G.6 La pantalla de inventario: para alguien que no es técnica

Las tres reglas de «Nota sobre quién va a usar esto a diario» se aplican sin
excepción: nada de jerga, ningún paso que exija entender el modelo, nada
irreversible. Y a 375 px, porque ahí se va a usar.

**Vocabulario. Esta tabla es normativa, no una sugerencia de estilo:**

| Nunca aparece | Se dice |
|---|---|
| stock, inventario (como número) | **«Cuántos tengo»** |
| variante | **el color**, **el tamaño**, o su nombre: «Morado» |
| reservado | **«Lo está pagando alguien»** |
| disponible / vendible | **«A la venta»** |
| movimiento | **«Qué pasó»** |
| ajuste | **«Corregir la cuenta»** |
| caducó / expiró | **«No llegó a pagar»** |
| id, handle, SKU | nada: no se muestran |

### `/admin/inventario` — la pantalla principal

Una lista de las **30 variantes**, agrupadas por producto, buscador arriba. Cada
fila, en una línea a 375 px:

```
┌─────────────────────────────────────────────┐
│ Hervidor mango de madera                    │
│                                             │
│  Blanco          4        [ − ]  [ + ]      │
│                                             │
│  Negro           1        [ − ]  [ + ]      │
│                  ⚠ 1 lo está pagando alguien│
│                                             │
│  ──────────────────────────────────────     │
│ Filtros V60                                 │
│                                             │
│  #01             0   Agotado   [ − ]  [ + ] │
│                  Se pondrá a la venta sola   │
│                  cuando cargues unidades     │
└─────────────────────────────────────────────┘
```

- **El número grande es lo que puede vender** (físico − reservado). Es el que
  importa y por eso es el que se ve. El físico y el reservado aparecen debajo
  **solo cuando se diferencian**: mostrar siempre tres números es pedirle que
  aprenda un modelo de datos.
- **`+` y `−` son el 90 % del uso.** Un toque = una unidad.
  - **`−`** pregunta **una sola cosa**, con los botones del tamaño del pulgar:
    **[Vendí por WhatsApp]** · **[Se rompió o se perdió]** · **[Corregir la
    cuenta]**. Eso es el «motivo» del encargo, dicho en español. Nada de
    desplegables.
  - **`+`** pregunta lo mismo: **[Llegó mercancía]** · **[Me devolvieron una]** ·
    **[Corregir la cuenta]**.
  - **«Corregir la cuenta» pide una nota** y es el único caso donde se exige
    escribir, porque es el único donde el motivo no lo explica ya.
- **Cargar diez filtros en tres toques**, que es el requisito literal: toque en
  el número → se abre un teclado numérico con el valor actual → teclea `14` →
  **[Guardar]**. Son tres interacciones y **no** diez toques en `+`. Los `+`/`−`
  son para de uno en uno; el teclado para cantidades. Las dos vías existen porque
  los dos casos existen.
- **Deshacer siempre.** Una franja de unos segundos tras cada cambio: «Cargaste
  10 filtros #01 · **Deshacer**». Deshacer escribe un movimiento contrario, nunca
  borra: el libro cuenta lo que pasó, incluidos los errores.

### `/admin/despachos` — «Productos a despachar»

La lista que pidió el cliente. Lo pendiente, lo más antiguo primero, los dos
orígenes **mezclados en una sola lista** porque para Andreina son lo mismo:
paquetes que hay que armar.

```
┌─────────────────────────────────────────────┐
│  Para despachar  (4)                        │
│                                             │
│  ⚠ PAGADO Y NO HAY UNIDAD                   │
│  Marcela Ruiz · hoy 10:34                   │
│  1 × Hervidor blanco                        │
│  Hay que hablar con ella        [Ver]       │
│  ─────────────────────────────────────      │
│  Pagado en la tienda · hoy 9:12             │
│  1 × Chemex 6 tazas                         │
│  2 × Filtros V60 #01                        │
│  Bogotá · Calle 85 #11-22                   │
│  [ Ya salió ]        [WhatsApp]  [Ver]      │
│  ─────────────────────────────────────      │
│  Vendido por WhatsApp · ayer 18:40          │
│  1 × Aeropress morado                       │
│  Para Juan                                  │
│  [ Ya salió ]                    [Ver]      │
└─────────────────────────────────────────────┘
```

- **Lo roto va primero y en rojo**, siempre. Es la regla de orden de la pantalla.
- **«Ya salió» es un toque** y el objetivo es que se pueda hacer con una mano
  mientras se pega la guía al paquete. Deshacer disponible unos segundos.
- **El origen se dice, no se codifica**: «Pagado en la tienda» / «Vendido por
  WhatsApp». Nunca `origen='bold'`.
- **[WhatsApp]** abre la conversación con el cliente, con el pedido en el
  mensaje, reutilizando `enlaceWhatsApp()` de `carrito.ts` y
  `mensajePedido()`. La fase 4 del plan del carrito ya lo pedía; aquí se cumple
  en el mismo sitio.
- **La dirección se muestra en la lista**, no detrás de un «Ver». Es el dato que
  se necesita para armar el paquete y esconderlo añade un toque a cada envío.

### `/admin/inventario/<variante>` — «Qué pasó»

El historial que pide el encargo, en lenguaje de persona:

```
Hervidor mango de madera — Negro
Tienes 1

  hoy 11:02    −1   Vendido por WhatsApp         (Para Juan)
  hoy  9:40    +4   Llegó mercancía
  ayer 16:20   −1   Se vendió en la tienda       (pedido del 7 oct)
  ayer 15:50   −1   Apartado para un pago
  ayer 16:20   +1   No llegó a pagar · volvió al stock
  3 oct        −2   Corregir la cuenta  «se rompieron en el envío»
```

Fechas relativas, cantidades con signo, motivo en español, nota si la hay. **Es
la pantalla que convierte «el stock no cuadra» en «ah, el 3 de octubre se
rompieron dos»**, y es la razón de que `movimientos` exista.

### El día del cambio (parte de la fase 9, no un apéndice)

1. Aplicar `0004`. **Nada cambia en el sitio**: `inventario_activo = 0`, y
   `vendible` sigue siendo solo `disponible`.
2. Andreina cuenta su bodega y carga los 30 números desde la pantalla de
   inventario, con calma, sin prisa y sin que nada dependa de ello. Cada número
   deja su movimiento `entrada`.
3. **Revisar juntos** que los 30 números coinciden con lo que ella ve. Es el paso
   que no se puede saltar y el que no es técnico.
4. **Activar** (`inventario_activo = 1`) y purgar la caché. A primera hora de un
   día laborable, con ella delante. **Nunca un viernes por la tarde.**
5. Si algo sale mal: **apagar el interruptor** devuelve el sitio al
   comportamiento de hoy en un toque, con el stock intacto. Es la vuelta atrás
   de R6 aplicada a esta fase, y es la razón de que el interruptor exista.

## G.7 Lo que queda fuera, a propósito

Para que no se interprete como olvido:

- **Reposición automática, alertas de mínimos, pedidos a proveedor.** La dueña
  conoce su catálogo al dedillo (nota de E): un sistema que le avise de que le
  quedan dos Chemex le está contando algo que ya sabe.
- **Stock por ubicación** (bodega / casa / escaparate). Hay una estantería. El
  día que haya dos sitios, `movimientos` ya permite reconstruirlo.
- **Costo, margen, valoración de inventario.** Es contabilidad, no stock. Haría
  falta el costo de compra, que nadie ha pedido.
- **Reservas manuales desde el panel** («aparta esto para el curso del sábado»).
  Hoy se resuelve con el interruptor «A la venta» apagado, que es lo mismo con
  cero código.
- **Sincronización con el Shopify.** Ya estaba fuera de alcance y lo sigue
  estando: el respaldo es histórico, no una fuente viva.
- **El dinero de las devoluciones.** Lo hace la dueña desde Bold. El panel
  registra la mercancía y la nota.

# Fuera de alcance

- ~~Inventario con stock numérico (hoy `disponible` es un sí/no).~~ **SUPERADO el
  8 oct 2026: el cliente eligió llevar stock.** Está diseñado en la sección G y
  es la fase 9. La razón del cambio está en G.0; en corto, hay **dos vías de
  venta** (Bold y WhatsApp) compitiendo por las mismas unidades, y un sí/no
  manual no puede con eso. `disponible` **no desaparece**: se conserva como
  interruptor manual («no vender esto aunque haya»), separado del stock (G.1).
- Pedidos y checkout: son del plan de Bold. El inventario **sí** toca su checkout
  y su webhook (G.3, G.5), que pasan a reservar y a descontar.
- Cuentas de cliente.
- Edición de las páginas fijas (`/cafe`, `/nosotros`, `/contacto`) desde el panel.
- Cambiar el diseño Obsidiana II. El panel **lo reutiliza**, no lo reinventa.
- Facturación electrónica.
- Traducciones.

# Referencias

- Patrón de Worker + D1 + panel: `/home/xan217/Documents/Dev/16bc/16ballcreations-site` (`worker/index.js`, `wrangler.jsonc`, `migrations/`, `scripts/prospectos-sql.mjs`). **Solo lectura.**
- Astro en Cloudflare Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/
- Precios y límites de D1: https://developers.cloudflare.com/d1/platform/pricing/ y https://developers.cloudflare.com/d1/platform/limits/
- Enforcement del plan gratuito de D1 (1 sep 2026): https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- Réplicas de lectura de D1: https://developers.cloudflare.com/d1/best-practices/read-replication/
- Buckets públicos de R2: https://developers.cloudflare.com/r2/buckets/public-buckets/
- Precios de Images: https://developers.cloudflare.com/images/pricing/
- Plan del carrito: `planes/kaffeeplatz-carrito-bold.md`.
