# KaffeePlatz — propuestas de sitio web

Tres propuestas de diseño para el nuevo sitio de **KaffeePlatz**, tienda
colombiana especializada en accesorios de café.

> **Estado: propuesta.** El sitio actual en Shopify sigue en producción.
> Estas tres versiones son para elegir dirección antes de migrar.

---

## Las tres propuestas

| | Carácter | Fondo | Referencia estructural |
|---|---|---|---|
| **A · Imprenta** | Editorial de imprenta. Serif ligera a gran tamaño, acciones como enlaces con borde, imágenes enmarcadas | Crema | Redbrick Coffee |
| **B · Galería** | Galería contemporánea. Una sola familia en muchos pesos, píldoras, bloques de dato gigante | Crema | Arsenijs Fabrica |
| **C · Obsidiana** | Editorial sobre papel negro. Serif en cursiva, oro sobre oscuro | Negro | Assembly Coffee |

Las tres comparten **el mismo contenido y la misma arquitectura**. Solo cambia
el lenguaje visual, para que la comparación sea honesta.

De las referencias se tomó la **estructura**, nunca la paleta: el color es
siempre el de KaffeePlatz.

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
```

Las propuestas comparten `public/img` por symlink: una sola copia de las
imágenes en el repo.

## Desarrollo

```bash
npm install
npm run normalizar      # regenera src/content/ desde contenido-original/
npm run build
```

Para una propuesta:

```bash
cd propuestas/a-imprenta && npm run build
```

**Node 20.** Astro está anclado a 5.18.2, la última rama que soporta Node 20.
Astro 6+ exige Node ≥22.

> El contenido de `src/content/` es **generado**. No lo edites a mano: se pierde
> en la siguiente normalización. Las correcciones van en `scripts/normalizar.mjs`.

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
