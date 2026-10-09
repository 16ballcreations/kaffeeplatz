# KaffeePlatz — propuestas de sitio web

Propuestas de diseño para el nuevo sitio de **KaffeePlatz**, tienda
colombiana especializada en accesorios de café.

> **Estado: propuesta.** El sitio actual en Shopify sigue en producción.
> Estas versiones son para elegir dirección antes de migrar.

---

## Las propuestas

| | Carácter | Fondo | Referencia estructural |
|---|---|---|---|
| **A · Imprenta** | Editorial de imprenta. Serif ligera a gran tamaño, acciones como enlaces con borde, imágenes enmarcadas | Crema | Redbrick Coffee |
| **B · Galería** | Galería contemporánea. Una sola familia en muchos pesos, píldoras, bloques de dato gigante | Crema | Arsenijs Fabrica |
| **C · Obsidiana** | Editorial sobre papel negro. Serif en cursiva, oro sobre oscuro | Negro | Assembly Coffee |
| **D · Obsidiana II** | Evolución de C orientada a vender: buscador de método, catálogo con filtros, variantes dentro del mensaje de WhatsApp | Negro | C + patrones de tienda |

Las cuatro comparten **el mismo contenido y la misma arquitectura**. Solo cambia
el lenguaje visual, para que la comparación sea honesta.

De las referencias se tomó la **estructura**, nunca la paleta: el color es
siempre el de KaffeePlatz.

---

## D · Obsidiana II

Segunda versión de Obsidiana. Conserva lo que el cliente aprobó en C: papel
negro, oro, Cormorant en los títulos, la franja crema con lino al 30 % y el
passe-partout crema detrás de las fotos. Sobre esa base trabaja tres frentes.

**Captación.** WhatsApp siempre a mano: cabecera, botón flotante y barra fija
en la ficha móvil. Un buscador "¿Cómo te gusta el café?" que termina en una
recomendación concreta con mensaje precargado. Una ficha de asesoría dentro de
la rejilla del catálogo. En los agotados, "Avísame" en vez de un callejón sin
salida. Franja de confianza: envíos, atención humana, asesoría y guías.

**Catálogo.** Barra fija con categorías, orden por precio y "solo
disponibles". La categoría viaja en la URL (`?categoria=metodos`) para poder
enlazarla o mandarla por WhatsApp. Tarjetas con segunda foto al pasar el
cursor, categoría y resumen de variantes. Mosaico de categorías en portada.

**Ficha.** Selector de variante real: cambia el precio, la foto y el mensaje de
WhatsApp, que ahora dice qué variante se quiere ("Chemex Original (3 tazas,
$285.000)"). Enlace a la guía del diario que aplica; y cada artículo del diario
muestra los productos de su método.

Decisiones que se apartan de C, a propósito:

- **Botón de oro relleno** para la acción principal (10:1 de contraste). C lo
  prohibía; aquí es la única pieza rellena de cada vista.
- **Geist** en lugar de Inter en cuerpo e interfaz; precios en cifras tabulares.
- **Formas con regla**: superficies 20 px, imágenes 14 px, interactivo en píldora.
- **Iconos Phosphor** (peso light), servidos en línea desde `@phosphor-icons/core`.

Los textos nuevos no inventan datos: salen de la base, de las políticas de
envío o, en el buscador de método, literalmente del artículo del diario que los
respalda (ver `src/datos/guias.ts`). Contraste verificado con
`node scripts/contraste.mjs` dentro de la propuesta: 31/31 pares AA.

---

## Modelo del sitio

**Catálogo + experiencia. Sin carrito ni checkout.**

Toda compra se cierra por contacto directo con la dueña vía WhatsApp, con el
mensaje precargado según el producto. Las tres propuestas se eligieron en parte
porque ninguna de sus referencias usa botones rellenos de compra: la acción
como enlace es nativa en los tres lenguajes, no un parche.

## Arquitectura

```
/                    Inicio
/catalogo            25 productos
/producto/[handle]   Ficha + WhatsApp precargado
/cafe                Línea de café en grano (PROVISIONAL)
/diario              16 artículos
/diario/[handle]     Artículo
/nosotros            Marca
/contacto            WhatsApp · formulario · email
```

47 páginas por propuesta.

---

## Estructura del repo

```
src/                    Base compartida (Astro + Tailwind)
scripts/normalizar.mjs  Genera el contenido desde contenido-original/
contenido-original/     Respaldo íntegro del Shopify actual
marca/MARCA.md          Manual de identidad
public/img/marca/       Emblema, lino, wordmark
propuestas/
  a-imprenta/
  b-galeria/
  c-obsidiana/
  d-obsidiana-v2/
```

Las propuestas comparten `public/img` por symlink: una sola copia de las
imágenes en el repo.

## Desarrollo

```bash
npm install
npm run d1:migrar       # crea la base LOCAL y aplica migrations/
npm run d1:sembrar      # carga los 25 productos y los 16 articulos en ella
npm run d1:comparar     # comprueba campo a campo que no se perdio nada
npm run dev             # servidor de desarrollo, con recarga
npm run build
npm run preview         # construye y sirve el Worker igual que en produccion
```

**Los tres comandos `d1:` son el arranque obligatorio.** Desde la fase 2 del
plan del panel, el catalogo y el diario viven en **D1**, no en los ficheros: un
`npm run dev` sin base cargada sirve la pagina de cortesia en vez del catalogo
(que es el comportamiento correcto, pero no el que se busca al desarrollar).
Todo ocurre en local, en `.wrangler/state/`: no se toca nada de Cloudflare.

### `normalizar.mjs` ya no es seguro de correr (riesgo R8 del plan)

> **Antes:** "los JSON los genera el script, no se editan a mano".
> **Desde que D1 es la fuente de verdad, esa regla queda al reves.**
>
> `npm run normalizar` regenera `src/content/` desde `contenido-original/`, y
> `npm run d1:sembrar` vuelca eso en la base **pisando lo que la duena haya
> editado en el panel**. A diferencia de los prospectos de 16bc —donde la
> investigacion y el seguimiento son columnas distintas— aqui la semilla y la
> edicion escriben los mismos campos.
>
> Los dos son ahora **herramientas de arranque y de recuperacion, no de
> rutina**. Contra la base local, uselos sin miedo. Contra `--remote`, solo con
> respaldo hecho y a sabiendas. El aviso completo esta en la cabecera de
> `scripts/sembrar-d1.mjs`.

**Los JSON y los MD de `src/content/` NO se borran.** Son el respaldo, la
referencia de `npm run d1:comparar` y la prueba de que habia antes (R5).

**`npm run preview` cambió.** Desde que el sitio usa el adaptador de
Cloudflare (`output: 'server'`), `astro preview` ya no funciona: el adaptador
no lo soporta y aborta con *"The @astrojs/cloudflare adapter does not support
the preview command"*. El script ahora hace `astro build && wrangler dev
--local`, que levanta el mismo Worker que se despliega, con `--local` para no
tocar nada de la cuenta de Cloudflare.

`npm run dev` **no cambia**: sigue siendo `astro dev` y sigue siendo el
comando del día a día, más rápido y con recarga en caliente. `preview` es para
comprobar el comportamiento real del Worker antes de publicar.

Para una propuesta:

```bash
cd propuestas/a-imprenta && npm run build
```

**Node 20.** Astro está anclado a 5.18.2, la última rama que soporta Node 20.
Astro 6+ exige Node ≥22.

> El contenido de `src/content/` es **generado** por `scripts/normalizar.mjs`
> desde `contenido-original/`. Desde la fase 2 del plan del panel ya **no es la
> fuente de verdad del sitio** —lo es D1— sino el respaldo y la referencia de
> comparación. Sigue sin editarse a mano, y además regenerarlo ya no es
> inofensivo: ver el aviso de R8 en "Desarrollo".

---

## Identidad

Extraída del archivo CorelDRAW original de la marca. Detalle completo en
[marca/MARCA.md](marca/MARCA.md).

| Token | Hex | Uso |
|---|---|---|
| `--kp-bg` | `#FDF7E7` | Fondo crema — nunca blanco puro |
| `--kp-ink` | `#1A1A1A` | Texto |
| `--kp-accent` | `#DEC185` | Oro — **solo relleno** |
| `--kp-accent-ink` | `#8F6724` | Oro — texto, bordes, iconos |

**Regla del oro.** `#DEC185` sobre crema da 1.85:1: falla AA. Como relleno con
texto oscuro encima da 10:1 y es perfecto. Sobre fondo oscuro (propuesta C)
también pasa como texto. La prohibición es relativa al fondo, no al color.

---

## Panel de administración (`/admin`)

Fase 4 del plan `planes/kaffeeplatz-panel-admin.md`. Sesiones con cookie, no
Basic Auth: el porqué está en B.5 del plan y en la cabecera de
`src/admin/sesion.ts`.

### La clave

La clave **no se guarda en ningún sitio**; lo que se guarda es su hash PBKDF2.

```bash
npm run hash-clave               # genera una clave al azar y su hash
npm run hash-clave 'mi clave'    # o usa una concreta
```

En **producción** (lo ejecuta una persona con la cuenta delante; ningún script
lo hace solo):

```bash
npx wrangler secret put ADMIN_CLAVE_HASH
```

En **local**, en `.dev.vars` (que está en `.gitignore` y nunca se versiona):

```bash
echo 'ADMIN_CLAVE_HASH=pbkdf2$sha256$...' >> .dev.vars
```

Sin ese secreto el panel **no se abre**: responde 503 con la instrucción en
pantalla. Falla cerrado, a propósito.

### La puerta

Toda ruta que empiece por `/admin` pasa por `src/admin/puerta.ts`, llamada desde
`src/middleware.ts` **antes** de `next()`. No hay comprobación por página: una
pantalla nueva de las fases 5–7 queda protegida el día que se crea.

`npm run verificar:puerta` (que corre solo en cada `npm run build`) comprueba las
cuatro propiedades de las que depende eso, incluida la que falla en silencio: que
no haya HTML de `/admin` en `dist/`, porque un asset estático lo serviría el
borde **sin ejecutar el Worker**.

### Pruebas propias

```bash
npm run probar:saneador    # 45 casos: XSS, el <br> de 16bc, Markdown
npm run verificar:puerta   # las 4 propiedades de la puerta
npm run contraste          # incluye los colores del panel
```

El saneador de HTML (`src/admin/escapar.ts`, `sanear.ts`, `markdown.ts`) está
escrito de cero: **no** se reutiliza el de 16bc, que des-escapa `<br>` después de
escapar (hallazgo 2 de A.6 del plan). Regla: `set:html` solo con `cuerpo_html` y
`descripcion_html`, que ya pasaron por ahí.

---

## Estado de validación

Las tres propuestas pasan:

- Build sin errores ni warnings · `astro check` limpio
- 47 páginas generadas
- Contraste WCAG AA verificado por script en todos los pares texto/fondo
- Responsive comprobado en navegador real a 375, 768 y 1440px, sin scroll horizontal
- Enlaces de WhatsApp íntegros y con encoding correcto

## Limitaciones conocidas

**Fotografía.** Ninguna imagen principal de producto alcanza 1200px de ancho y
18 de 25 son capturas de móvil. Las tres propuestas enmarcan las imágenes para
mitigarlo, y funciona en la rejilla del catálogo — pero en la ficha individual,
a mayor tamaño, el pixelado se nota. Es límite del material de origen.

**Colecciones.** El respaldo de Shopify trae los recuentos por colección pero no
qué producto pertenece a cuál. El campo queda vacío en los 25.

**Una portada de blog** declarada en el origen no está en disco. El artículo
degrada limpiamente, sin hueco.

**Línea de café en grano.** Aún sin definir si serán curadores o productores.
`/cafe` está marcada como provisional en tono neutro.

**Redes sociales.** No existen. La papelería de marca ya incluye iconos de
Instagram y TikTok; los enlaces están construidos y ocultos, listos para activar.

**SVG del logo.** La conversión desde CorelDRAW aplanó los degradados. El oro
metálico se aproxima con CSS. El archivo fuente daría el vector exacto.
