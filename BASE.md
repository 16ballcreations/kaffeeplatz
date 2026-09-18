# BASE.md — Cimientos compartidos de KaffeePlatz

Documento para los **tres agentes de diseño**. Aquí está todo lo que existe, cómo consumirlo, y la
frontera entre lo que podéis tocar y lo que no.

Esta base **no tiene diseño**. Está deliberadamente sin estilo: estructura semántica, datos
normalizados y componentes con ganchos. El aspecto lo ponéis vosotros.

---

## 1. Puesta en marcha

```bash
npm install
npm run dev       # servidor de desarrollo
npm run build     # build estático -> dist/
npm run preview   # sirve dist/ tal como quedará publicado
npm run normalizar # regenera src/content/ y public/img/ desde contenido-original/
```

> **Node 20.20.2.** El entorno no tiene Node 22, así que el proyecto está anclado a **Astro 5.18.2**,
> la última versión de la rama 5 que soporta Node 20. No subas a Astro 6 ni 7: exigen Node ≥22 y el
> build dejaría de funcionar aquí.
>
> Por el mismo motivo, `package.json` lleva dos `overrides` **que no debéis quitar**:
> `sharp` a `^0.35.4` (parchea unas CVE de libvips/libheif) y `vite` a la versión de Astro (`^6.4.3`).
> Sin este segundo override, `@tailwindcss/vite` arrastra Vite 8 en paralelo y `astro check` falla
> con un choque de tipos entre las dos copias de Vite.

El sitio se publica en **GitHub Pages** bajo un subdirectorio:

```js
site: 'https://16ballcreations.github.io'
base: '/kaffeeplatz'
```

**Consecuencia práctica, y es la causa de error número uno:** nunca escribas `href="/catalogo"` ni
`src="/img/..."` a pelo. Usa siempre el helper:

```astro
---
import { ruta, recurso } from '../datos/sitio';
---
<a href={ruta('/catalogo')}>Catálogo</a>
<img src={recurso('/img/productos/chemex/chemex-1.jpg')} alt="..." />
```

---

## 2. Estructura de carpetas

```
KaffeePlatz/
├── astro.config.mjs          site + base + output estático + sharp
├── BASE.md                   este documento
├── package.json
├── contenido-original/       MATERIAL DE ORIGEN — solo lectura, no se toca
│   ├── productos/*.json      25 productos tal como se extrajeron
│   ├── blog/*.md             16 artículos
│   ├── imagenes/             30 de producto + 15 de blog
│   ├── datos/                colecciones, políticas, HTML de respaldo
│   └── INVENTARIO.md         auditoría del material
├── marca/                    assets del logo (bitmaps + previews)
├── scripts/
│   └── normalizar.mjs        GENERADOR: contenido-original/ -> src/content/ + public/img/
├── public/
│   ├── favicon.svg           placeholder, sustituible por el logo real
│   └── img/
│       ├── productos/<handle>/<handle>-N.<ext>
│       └── diario/<handle>.<ext>
└── src/
    ├── content.config.ts     esquemas zod de las dos colecciones
    ├── content/              GENERADO — no editar a mano
    │   ├── productos/*.json  25
    │   └── diario/*.md       16
    ├── datos/sitio.ts        datos de negocio + navegación + helper ruta()
    ├── styles/marca.css      tokens de marca (@theme de Tailwind 4)
    ├── layouts/Base.astro    layout esquelético compartido
    ├── components/           componentes neutros (ver §5)
    └── pages/                las 8 rutas (ver §6)
```

---

## 3. Cómo consumir las colecciones

Dos colecciones tipadas con zod, cargadas con el `glob` loader.

### Productos

```astro
---
import { getCollection } from 'astro:content';

const productos = await getCollection('productos');
const destacados = productos.filter((p) => p.data.destacado);
const disponibles = productos.filter((p) => p.data.disponible);
---
```

Forma de `producto.data`:

| campo              | tipo                           | notas                                              |
| ------------------ | ------------------------------ | -------------------------------------------------- |
| `handle`           | `string`                       | slug de la URL                                      |
| `titulo`           | `string`                       | ya normalizado                                      |
| `vendor`           | `string`                       | siempre `"KaffeePlatz"`                             |
| `descripcionHtml`  | `string`                       | HTML, se pinta con `set:html`                       |
| `descripcionTexto` | `string`                       | texto plano, para meta descripciones                |
| `precio`           | `number`                       | COP entero, el **menor** de las variantes           |
| `precioFormateado` | `string`                       | `"$285.000"` — **úsalo, no reformatees**            |
| `disponible`       | `boolean`                      | true si alguna variante lo está                     |
| `variantes[]`      | `{id,titulo,precio,precioFormateado,disponible,sku}` |                           |
| `opciones[]`       | `{nombre,valores[]}`           | vacío si el producto no tiene opciones reales       |
| `imagenes[]`       | `{src,alt}`                    | `src` es ruta de `public/`, **sin** el `base`       |
| `coleccion`        | `string?`                      | **siempre vacío**, ver §8                           |
| `destacado`        | `boolean?`                     | true en 4 productos                                 |

### Diario

```astro
---
import { getCollection, render } from 'astro:content';

const articulos = (await getCollection('diario'))
  .sort((a, b) => b.data.fecha.getTime() - a.data.fecha.getTime());

// dentro de una página de detalle:
const { Content } = await render(articulo);
---
<Content />
```

`articulo.data`: `titulo`, `handle`, `fecha` (objeto `Date`), `autor`, `resumen`, `imagen?`.

> El cuerpo es Markdown sin estilo. Para maquetarlo, envuélvelo en un contenedor y estiliza desde
> ahí: la base ya lo envuelve en `[data-kp-prosa]`.

---

## 4. Tokens de marca

Están en `src/styles/marca.css`, declarados en el bloque `@theme` de Tailwind 4 y además como
custom properties planas. Puedes usar cualquiera de las dos vías:

```html
<div class="bg-kp-surface text-kp-ink">…</div>
<div style="background: var(--kp-surface); color: var(--kp-ink)">…</div>
```

| token              | valor     | uso                                                    |
| ------------------ | --------- | ------------------------------------------------------ |
| `--kp-bg`          | `#FBF5E3` | fondo crema. **Nunca blanco puro**                     |
| `--kp-surface`     | `#FFFFFF` | tarjetas                                               |
| `--kp-border`      | `#EBE1C8` | bordes                                                 |
| `--kp-ink`         | `#23201E` | texto principal — 14.86:1 sobre crema                  |
| `--kp-ink-muted`   | `#6D5B4A` | texto secundario — 5.94:1                              |
| `--kp-accent`      | `#D6A95D` | **ORO RELLENO — solo fondo**                           |
| `--kp-accent-ink`  | `#8F6724` | **ORO TEXTO — texto, enlaces, iconos, bordes** — 4.66:1 |
| `--kp-anchor`      | `#23201E` | secciones invertidas y pie                             |

### ⚠️ REGLA CRÍTICA DEL ORO

Los dos oros **no son intercambiables**:

- `--kp-accent` (#D6A95D) sobre crema da **1.99:1 → FALLA AA**. Úsalo **solo como relleno de
  área**: fondos de botón, franjas, bloques. **Jamás** como color de texto, borde fino o icono.
- `--kp-accent-ink` (#8F6724) da **4.66:1 → PASA AA**. Es el oro para **leer**: texto, enlaces,
  iconos, bordes.

Regla mnemotécnica: **si el oro se PINTA, `--kp-accent`. Si el oro se LEE, `--kp-accent-ink`.**

Sobre un relleno `--kp-accent`, el texto encima debe ser `--kp-ink` (#23201E).

---

## 5. Componentes

Todos son **neutros**: sin colores, sombras ni tipografía. Exponen `clase` y atributos
`data-kp-*` como ganchos de estilo. Estilizad desde vuestra hoja, no reescribáis el componente.

### `BotonWhatsApp.astro` 🔒 NO TOCAR LA LÓGICA

```astro
<BotonWhatsApp producto={producto.data} clase="mi-boton" />
<BotonWhatsApp mensaje="Hola KaffeePlatz, ¿hacen envíos a Cali?" />
<BotonWhatsApp>Escríbenos</BotonWhatsApp>
```

| prop       | tipo                                | por defecto                                   |
| ---------- | ----------------------------------- | --------------------------------------------- |
| `producto` | `{titulo, precioFormateado}?`       | —                                             |
| `mensaje`  | `string?`                           | tiene prioridad sobre `producto`              |
| `clase`    | `string?`                           | `''`                                          |

Genera `https://wa.me/573013809886?text=<encodeURIComponent(mensaje)>`.

- Con producto: `Hola KaffeePlatz, me interesa <TÍTULO> (<PRECIO>). ¿Está disponible?`
- Genérico: `Hola KaffeePlatz, quiero más información.`

**Este es el único canal de venta del sitio.** Cambiadle el aspecto por `clase` y el texto por el
slot; no toquéis la construcción de la URL ni el encoding.

### `TarjetaProducto.astro`

Props: `producto` (requerido), `clase`, `prioridad` (carga eager), `mostrarPrecio`.
Slots: `media`, `antes-titulo`, `despues-precio`, `acciones`.
Ganchos: `[data-kp-tarjeta]`, `-media`, `-cuerpo`, `-titulo`, `-precio`, `[data-kp-agotado]`,
`[data-kp-disponible="true|false"]`.

### `TarjetaArticulo.astro`

Props: `articulo`, `clase`, `prioridad`, `mostrarResumen`.
Slots: `media`, `despues-resumen`.
Ganchos: `[data-kp-articulo]`, `-media`, `-cuerpo`, `-fecha`, `-titulo`, `-resumen`.

### `Imagen.astro`

Props: `src` (ruta de `public/` **o** `ImageMetadata` importado), `alt` **obligatorio**, `ancho`,
`alto`, `cargando`, `prioridad`, `clase`.
Aplica el `base` solo, va en `lazy` por defecto. Si importáis una imagen desde `src/assets/`,
sharp la optimiza automáticamente.

### `Precio.astro`

Props: `precioFormateado` (requerido), `precio`, `desde`, `clase`.
No formatea nada: el formato viene de la normalización, para que el HTML y el mensaje de WhatsApp
nunca discrepen.

### `SEO.astro` 🔒 NO TOCAR

Props: `titulo`, `descripcion`, `camino`, `imagen?`, `tipoOg?`, `migas?`, `jsonLd?`, `noIndex?`.
Emite title, description, canonical, Open Graph, Twitter Card y JSON-LD.
Se usa a través de `Base.astro`; pasadle los valores por props desde la página.

### `FormularioContacto.astro`

Props: `action` (endpoint), `method`, `clase`, `avisoPendiente`.
**Maqueta sin backend.** Con `action` vacío, muestra el aviso y deshabilita el botón. Al conectar
un servicio de envío, pasadle `action` y el aviso desaparece solo.

---

## 6. Rutas

| ruta                | archivo                          | páginas |
| ------------------- | -------------------------------- | ------- |
| `/`                 | `pages/index.astro`              | 1       |
| `/catalogo`         | `pages/catalogo.astro`           | 1       |
| `/producto/[handle]`| `pages/producto/[handle].astro`  | **25**  |
| `/cafe`             | `pages/cafe.astro`               | 1       |
| `/diario`           | `pages/diario/index.astro`       | 1       |
| `/diario/[handle]`  | `pages/diario/[handle].astro`    | **16**  |
| `/nosotros`         | `pages/nosotros.astro`           | 1       |
| `/contacto`         | `pages/contacto.astro`           | 1       |
|                     | **total**                        | **47**  |

Las dos rutas dinámicas usan `getStaticPaths`. **No cambiéis las rutas ni los handles**: son URLs
públicas y los tres diseños deben ser intercambiables sobre el mismo mapa de sitio.

### `/cafe` merece atención

El modelo de la línea de café en grano **no está definido**: no se sabe si KaffeePlatz será curador
de tostadores terceros o marca propia. El texto es **provisional** y neutro a propósito, y está
marcado de tres formas: comentario `<!-- PROVISIONAL -->`, atributo `data-kp-provisional` y un
tratamiento visual (borde discontinuo + trama) en `marca.css`.

**Podéis reestilarlo, pero debe seguir siendo visualmente distinguible del contenido definitivo.**
No lo convirtáis en una sección más: nadie debe confundirlo con una promesa comercial.

---

## 7. Qué podéis tocar y qué no

### ✅ SÍ — es vuestro terreno

- Crear vuestro propio layout que envuelva o sustituya a `Base.astro`.
- Toda la maquetación, rejillas, espaciado y composición visual.
- Tipografía: elegid y cargad las fuentes display que queráis.
- Vuestra hoja de estilos, apuntando a los ganchos `data-kp-*`.
- Animaciones, transiciones, estados hover/focus (manteniendo el foco visible).
- Cómo se compone cada página: orden de secciones, hero, destacados, densidad del catálogo.
- Fondos por sección, secciones invertidas con `--kp-anchor`, tratamiento de las imágenes.
- Sustituir el placeholder textual del logo por los assets reales de `marca/`.

### ❌ NO — rompe la base compartida

- **`scripts/normalizar.mjs` y todo `src/content/`.** El contenido está normalizado y verificado.
  Si hay que corregir texto, se corrige en el script y se regenera; nunca a mano.
- **Las rutas y los handles.** URLs públicas, iguales en los tres diseños.
- **`BotonWhatsApp.astro`.** La URL y el encoding son críticos para la venta. Estilo sí, lógica no.
- **`SEO.astro` y el JSON-LD.** Pasadle props; no lo reescribáis.
- **Los valores de los tokens en `marca.css`.** Y sobre todo, **no violéis la regla del oro**.
- **`contenido-original/`.** Es el material de origen, de solo lectura.
- **`astro.config.mjs`** (`site`, `base`, output estático).
- **No añadáis carrito, checkout ni pasarela de pago.** El sitio es catálogo + experiencia; toda
  compra se cierra por WhatsApp.
- **No inventéis contenido de negocio**: ni fundación, ni equipo, ni cifras, ni orígenes de café.

### Accesibilidad — mínimos que hay que conservar

- Contraste AA. La paleta ya lo cumple **si respetáis la regla del oro**.
- `alt` en todas las imágenes (`Imagen.astro` lo exige por tipo).
- Foco visible (ya está en `marca.css`; no lo quitéis con `outline: none`).
- El enlace "Saltar al contenido" y la jerarquía de encabezados (un solo `h1` por página).

---

## 8. Estado del contenido y deudas conocidas

Correcciones ya aplicadas por la normalización:

- `Kaffee Platz` / `Kaffeeplatz` → **`KaffeePlatz`** en toda la prosa, títulos y vendor.
  Las URLs en minúsculas (`kaffeeplatz.co`, `www.kaffeeplatz.co`, el CDN) y el correo se respetan.
- Vendor `"Mi tienda"` → `"KaffeePlatz"` en 6 productos.
- Handle `sin-nombre-2jul_23-46` → **`hario-v60-mugen`** (derivado de su título real).
- Handle `fitro-de-acero-chemex-3-tazas` → **`filtro-de-acero-chemex-3-tazas`**.
- Errata `"se gaanan"` → `"se ganan"`.
- Precios formateados en COP con punto de miles: `120000` → `"$120.000"`.

Deudas abiertas, con marcador claro en el código:

| asunto | estado |
| ------ | ------ |
| Línea de café en grano | modelo **sin definir**; `/cafe` es provisional |
| Backend del formulario | **sin conectar**; `FormularioContacto` avisa y deshabilita el envío |
| `coleccion` en productos | **siempre vacío**: `collections.json` trae los recuentos pero no la pertenencia producto→colección. No se inventó. Si se quiere agrupar el catálogo, hace falta ese dato |
| Calidad de imagen | **25/25 productos** tienen la principal por debajo de 1200 px, y 18 vienen de captura de móvil. No ampliéis por CSS más de la cuenta: se ve el pixelado |
| 1 artículo sin portada | `que-es-el-cafe-de-especialidad-y-por-que-esta-conquistando-al-mundo`: su imagen se declaró pero no está en el material. `imagen` queda `undefined`, **manejad el caso** |
| 1 artículo sin resumen | `el-metodo-de-preparacion-que-conquisto-al-mundo-del-cafe`: se derivó del primer párrafo |
| Logo | `public/favicon.svg` y la cabecera usan **placeholder textual**. Sustituidlo por los assets de `marca/` |
| Contenido duplicado | hay 2 pares de artículos casi idénticos en tema (ver `INVENTARIO.md` §5). Decisión editorial pendiente, no técnica |

---

## 9. Datos de negocio verificados

De `src/datos/sitio.ts`. **No inventéis nada más; si falta un dato, dejad un marcador visible.**

- **Marca:** KaffeePlatz (una palabra, dos mayúsculas)
- **Lema:** "Eleva tu experiencia cafetera"
- **Dueña:** Andreina Morales
- **WhatsApp:** +57 301 380 9886 (`573013809886`)
- **Email:** kaffeeplatz28@gmail.com
- **Ubicación:** Medellín, Colombia — **100% online, sin punto físico**
- **Horario:** lunes a viernes, 9:00 a.m. – 6:00 p.m.
- **Envíos:** todo Colombia. Principales 2–5 días hábiles; otras 5–8; encargos 8–15
- **Voz:** tutea siempre, divulgativa, cercana
