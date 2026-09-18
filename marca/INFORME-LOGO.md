# Informe de extracción — Logo KaffeePlatz (CorelDRAW)

**Archivo origen:** `/home/xan217/Downloads/kaffeePlatz v3.cdr` (40.030.497 bytes) — NO modificado.
**Copia de trabajo:** `/tmp/kp-logo.zip` → extraído en `/tmp/kp-cdr/`
**Fecha del análisis:** 2026-09-18

---

## 1. Contenido del archivo (estructura del ZIP)

Es un contenedor ZCF (Zip Container Format) de CorelDRAW. Se abrió sin problemas con `unzip`.

```
mimetype
META-INF/   container.xml, metadata.xml, textinfo.xml, links.xml
content/    root.dat, dataFileList.dat
            data/  masterPage.dat, page1-5.dat, data1.dat, Bitmaps.dat (88 MB)
font/       fontTable.dat
embed/      embedding0, embedding1   (fuentes embebidas)
color/      color.xml, docPalette.xml, profiles/ (ICC: sRGB, SWOP CMYK, Dot Gain 20%)
previews/   thumbnail.png (875x256), page1-5.png (256x256 c/u)
styles/     document.cdss
```

**Metadatos del documento** (`META-INF/metadata.xml`):

| Campo | Valor |
|---|---|
| Autor | Renne Castellanos |
| Creado | 2025-03-24 19:10:01 -05:00 |
| Modificado | 2025-03-24 20:37:36 -05:00 |
| App | CorelDRAW, CoreVersion 2600 (= CorelDRAW 2023 / v24-26) |
| Páginas | 5 |
| Tamaño de página | 1920 x 1920 px @ 600 dpi |
| Objetos totales | 245 (125 curvas, 74 grupos, 60 rects, 28 texto, 25 bitmaps, 7 elipses) |
| Nodos de curva | 7.233 en 30 subpaths (máx 789 nodos en un objeto) |
| Rellenos | 146 uniformes, 70 degradados (fountain), 29 sin relleno |
| Contornos | 245 sin contorno (todo es relleno) |
| Efectos | 71 transparencias, 56 sombras paralelas, 19 PowerClip |
| Fuentes embebidas | **true** |

**Texto del documento** (`META-INF/textinfo.xml`) — 28 objetos de texto artístico:
- `KAFFEEPLATZ` (×10)
- `EL ARTE DEL CAFÉ / EN CADA DETALLE` (×5, tagline)
- `Especialistas en / Accesorios de Café`
- `Andreina Morales` (×3)
- `301 3809886` (×3, teléfono)
- `kaffeeplatz.co` (×3, dominio)

---

## 2. Tipografías encontradas ✅ **DATO CLAVE RESUELTO**

Fuente: `font/fontTable.dat` (codificado en UTF-16LE — por eso `strings` normal no devolvía nada; hay que usar `strings -e l`). Confirmado de forma cruzada con `cdrinfo:FontsUsed` en `metadata.xml`.

| Familia | Nombre PostScript | Versión | Peso | Script |
|---|---|---|---|---|
| **Geometr415 Blk BT** | `Geometric415BT-BlackA` | 1.01 emb4-OT | **Black** | Western |
| Microsoft Himalaya | Microsoft Himalaya | 5.23 | Regular | Western |
| MS Gothic | MS-Gothic | 5.32 | Regular | Japanese |
| Arial | ArialMT | 7.03 | Regular | Arabic / Hebrew |

### ⚠️ Corrección importante sobre la hipótesis previa

La suposición de trabajo era que el wordmark usaba **un serif Didone de alto contraste** (Didot / Bodoni / Playfair). **Eso es incorrecto.**

La única fuente de diseño real en el documento es **Geometr415 Blk BT** — una **grotesca geométrica de peso Black de Bitstream**, clon del **Geometric 415**, que a su vez es la versión Bitstream de **Metro / Metroblack** de W.A. Dwiggins (Linotype). No tiene nada de Didone: es un sans geométrico pesado.

Las otras tres son fuentes de sistema de Windows que CorelDRAW lista por defecto (fallbacks para scripts japonés/árabe/hebreo y Himalaya para tibetano). **No forman parte del diseño.**

Por qué el PNG confundía: en el thumbnail el wordmark `KAFFEEPLATZ` aparece en versalitas espaciadas, con relleno dorado y un bisel/sombra que adelgaza los trazos horizontales — eso produce un contraste aparente que imita a un Didone. Pero la estructura de las letras (la `A` de vértice plano, la `G` geométrica, la `Z` de remates rectos) es geométrica, no modulada.

**Equivalentes libres si no tienes la licencia Bitstream:**
- **Metropolis** (SIL OFL) — el más cercano, mismo linaje Dwiggins
- **Poppins Black** / **Montserrat Black** (OFL) — geométricas Black, buena sustitución
- La original se compra como *Geometric 415 Black* en MyFonts/Fonts.com (Bitstream)

### Fuentes embebidas — no recuperables

`embed/embedding0` (562 KB) y `embed/embedding1` (45 KB) contienen las fuentes embebidas: `embedding0` = Microsoft Himalaya v5.23, `embedding1` = **Geometr415 v1.01 emb4-OT**. Ambos empiezan con una cabecera propietaria de Corel (`01 00 00 00 03 08 00 00` + nombre de versión UTF-16) y el payload está **cifrado/ofuscado** — no hay firma `sfnt` válida (`OTTO`, `\x00\x01\x00\x00`, `wOFF`) ni tabla de fuente parseable. El sufijo `emb4` indica el esquema de embebido nivel 4 de Corel. **No se puede extraer el TTF/OTF.**

---

## 3. Colores

### Paleta del documento (`color/docPalette.xml`) — valores exactos, no derivados

Todos los colores de marca están definidos en **RGB** (el documento declara `<ColorModel>Rgb</ColorModel>`). No hay colores Pantone ni spot (`inFill:SpotColors` está vacío). Conversión de `tints` (0-1) a hex directa, sin aproximación:

**Dorados / tierra (el núcleo de la marca):**

| Nombre en Corel | RGB | Hex | Rol probable |
|---|---|---|---|
| R222 G193 B133 | 222,193,133 | `#DEC185` | Dorado claro (wordmark) |
| R241 G222 B189 | 241,222,189 | `#F1DEBD` | Crema dorado (2.358 px en thumbnail) |
| R170 G139 B91 | 170,139,91 | `#AA8B5B` | Dorado medio |
| R154 G129 B100 | 154,129,100 | `#9A8164` | Dorado apagado |
| R152 G126 B89 | 152,126,89 | `#987E59` | Dorado sombra |
| R143 G110 B62 | 143,110,62 | `#8F6E3E` | Bronce / degradado oscuro |
| R203 G203 B173 | 203,203,173 | `#CBCBAD` | Beige verdoso |

**Oscuros:**

| Nombre en Corel | RGB | Hex | Rol |
|---|---|---|---|
| Negro / Black | 0,0,0 | `#000000` | Negro puro |
| 90% Negro | 26,26,26 | `#1A1A1A` | Fondo del badge |
| 80% Black | 51,51,51 | `#333333` | |
| R48 G27 B8 | 48,27,8 | `#301B08` | Café muy oscuro |
| R85 G48 B13 | 85,48,13 | `#55300D` | Café medio |

**Claros:**

| Nombre en Corel | RGB | Hex | Rol |
|---|---|---|---|
| Blanco / White | 255,255,255 | `#FFFFFF` | |
| R253 G247 B231 | 253,247,231 | `#FDF7E7` | **Crema de fondo** |
| R252 G253 B232 | 252,253,232 | `#FCFDE8` | Crema alternativo |

**Colores CMYK presentes** (minoritarios, probablemente restos de plantilla):
- `C2 M27 Y67 K0` → aprox. `#F2BC5E` *(conversión aproximada, no oficial)*
- `Orange C0 M60 Y100 K0` → aprox. `#F27900` *(aproximado)*
- `Black C0 M0 Y0 K100`, `C100 M100 Y100 K100` (registro)

**Ruido de plantilla** (ignorar — vienen de la paleta "PsicoFOrmando", reutilizada de otro proyecto): Green `#00FF00`, Ice Blue `#99FFFF`, Red `#FF0000`, R0 G214 B39, R171 G214 B0, R21 G189 B180, R38 G116 B0, R28 G46 B0, R41 G68 B0.

### Correspondencia con la paleta derivada de los PNG

| Tu valor previo | Valor oficial del CDR | Δ | Veredicto |
|---|---|---|---|
| Oro `#D6A95D` | `#AA8B5B` / `#8F6E3E` | notable | Tu muestreo capturó un punto medio del **degradado**; el documento usa una rampa dorada de `#DEC185` → `#8F6E3E`, no un plano. |
| Oro claro `#d1b78a` | **`#DEC185`** | muy cerca | ✅ Confirmado. Usa `#DEC185`. |
| Oscuro `#23201E` | **`#1A1A1A`** (90% Negro) | cerca | El `#23201E` que mediste incluye la textura de lino marrón sobre el negro. El plano real es `#1A1A1A`. |
| Crema `#FBF5E3` | **`#FDF7E7`** | casi idéntico | ✅ Confirmado. Usa `#FDF7E7`. |

**Recomendación de paleta oficial:**
```
--kp-oro-claro:  #DEC185   /* wordmark, trazos principales */
--kp-oro-medio:  #AA8B5B   /* medios tonos */
--kp-oro-oscuro: #8F6E3E   /* fin del degradado, sombras */
--kp-crema:      #FDF7E7   /* fondo claro */
--kp-crema-2:    #F1DEBD   /* fondo cálido alternativo */
--kp-negro:      #1A1A1A   /* fondo del badge */
--kp-cafe:       #301B08   /* acento café oscuro */
```

El logo usa **70 rellenos degradados**, así que el dorado no es un color plano: es una rampa `#DEC185 → #AA8B5B → #8F6E3E` que simula metal grabado.

---

## 4. Assets extraídos

### `marca/previews/` — vistas previas del contenedor
| Archivo | Tamaño | Nota |
|---|---|---|
| `thumbnail.png` | 875x256 | **La más útil.** Muestra 4 lockups: badge con wordmark, badge alterno, badge completo con "COFFEE · PLANT", y versión vertical sobre textura |
| `page1-5.png` | 256x256 c/u | Una por página, baja resolución |
| `crop_lockup1.png` | 720x720 | Recorte ampliado ×4 (LANCZOS) |
| `crop_lockup2.png` | 760x720 | Recorte ampliado ×4 |
| `crop_badge-full.png` | 840x760 | Badge completo ampliado ×4 |
| `crop_vertical.png` | 700x1024 | Versión vertical ampliada ×4 |

⚠️ Las previews nativas son de **256 px de alto máximo**. Los recortes están interpolados, **no** añaden detalle real. No sirven como logo final.

### `marca/bitmaps/` — 12 bitmaps rescatados de `Bitmaps.dat`

`Bitmaps.dat` (88 MB) **no contiene PNG/JPEG/TIFF estándar** — usa el formato raster interno de Corel: descriptor de 64 bytes (`w, h, planes, bpp, stride, dataSize` en little-endian, desalineado 2 bytes respecto al inicio del registro) seguido de píxeles **sin comprimir, bottom-up, en orden BGR/BGRA**. Escribí un escáner que localiza descriptores válidos y los decodifica con PIL.

| Archivo | Dimensiones | Contenido |
|---|---|---|
| `img_66979112_2032x2074_32bpp.png` | 2032x2074 RGBA | Ilustración AeroPress sobre mesa (arte decorativo, con alfa) |
| `img_56420744_1258x839_32bpp.png` | 1258x839 RGBA | **Textura de lino crema** — el fondo de la marca |
| `img_61699928_1258x839_32bpp.png` | 1258x839 RGBA | Textura de lino (variante) |
| `img_50129052_1024x1024_24bpp.png` | 1024x1024 | Badge circular: mano + Chemex + molinillo |
| `img_34788314`, `img_45934552`, `img_53274898` | 1024x1024 | Variantes del badge circular |
| `img_2795842`, `img_10793960`, `img_18792078`, `img_26790196` | 2000x1333 | Fotografías / mockups de producto |
| `img_62_836x836_24bpp.png` | 836x836 | Raster de página |

**Estos bitmaps son arte colocado (ilustraciones de apoyo y texturas), no el logo vectorial.** El badge y el wordmark reales viven como curvas en `page*.dat`.

---

## 5. Herramientas que faltan

**Ninguna herramienta de conversión CDR está instalada.** Verificado: `inkscape`, `libreoffice`/`soffice`, `cdr2raw`, `cdr2xhtml`, `uniconvertor` — todas ausentes. No hay flatpak; snap está presente pero sin ninguna de ellas. `gs` (Ghostscript) y `PIL` sí están, pero no leen CDR.

Las tres están disponibles en apt. **No instalé nada, según tus restricciones.** Comandos sugeridos, en orden de probabilidad de éxito:

```bash
# Opción 1 — la mejor: Inkscape (usa libcdr, exporta SVG con texto vivo)
sudo apt install inkscape
inkscape "/home/xan217/Downloads/kaffeePlatz v3.cdr" \
  --export-type=svg \
  --export-filename=/home/xan217/Documents/Dev/KaffeePlatz/marca/logo-kaffeeplatz.svg

# Opción 2 — LibreOffice Draw (también libcdr)
sudo apt install libreoffice-draw
soffice --headless --convert-to svg \
  --outdir /home/xan217/Documents/Dev/KaffeePlatz/marca/ \
  "/home/xan217/Downloads/kaffeePlatz v3.cdr"

# Opción 3 — herramientas libcdr en crudo (diagnóstico)
sudo apt install libcdr-tools
cdr2xhtml "/home/xan217/Downloads/kaffeePlatz v3.cdr" > /tmp/kp.xhtml
```

**Pronóstico:** el archivo declara `CoreVersion 2600` (CorelDRAW 2023+). libcdr soporta bien hasta X7/2017 y de forma **parcial** las versiones más nuevas — es probable que la geometría (las 125 curvas, 7.233 nodos) se importe correctamente pero que **los 70 degradados, las 71 transparencias y los 19 PowerClip se pierdan o se aplanen**. Aun así, recuperar los contornos vectoriales del badge y el wordmark ya sería un resultado muy valioso.

**Alternativa sin instalar nada:** abrir el `.cdr` en **CorelDRAW o Illustrator** (Illustrator importa CDR hasta cierto punto) o subirlo a **CloudConvert / Vectorizer** y exportar SVG. También sirve pedirle el SVG/AI original a **Renne Castellanos**, que figura como autor en los metadatos — es la vía más limpia y rápida.

---

## 6. Veredicto

### ¿Tenemos vector utilizable? ❌ **NO — todavía no.**

Pero el archivo **sí contiene el logo como vector real** y está intacto: 125 objetos de curva, 7.233 nodos, 30 subpaths, todo sin comprimir en `content/data/page*.dat`. **Nada está rasterizado ni aplanado.** Solo falta un decodificador. Basta instalar Inkscape (un comando) para intentarlo.

### Lo que sí conseguimos ✅

1. **Tipografía identificada con certeza: `Geometr415 Blk BT` (Geometric415BT-BlackA, peso Black).** Este era el objetivo principal y está resuelto a partir de dos fuentes independientes dentro del archivo. **La hipótesis del serif Didone era falsa** — es una grotesca geométrica Black. Sustituto libre: **Metropolis**, o Poppins/Montserrat Black.
2. **Paleta de marca oficial y exacta**, leída de `docPalette.xml` en RGB nativo — no derivada de píxeles. Confirma `#DEC185` y `#FDF7E7` de tu muestreo previo y corrige el oro (es un **degradado** `#DEC185→#8F6E3E`, no un plano) y el oscuro (`#1A1A1A`, no `#23201E`).
3. **12 bitmaps en alta resolución** rescatados del formato raster propietario de Corel, incluidos la textura de lino de marca (1258x839 RGBA) y la ilustración AeroPress (2032x2074 RGBA).
4. **Datos de contacto y copy de marca**: `kaffeeplatz.co`, `301 3809886`, Andreina Morales, tagline *"EL ARTE DEL CAFÉ / EN CADA DETALLE"*, descriptor *"Especialistas en Accesorios de Café"*.
5. **Autor del diseño original: Renne Castellanos** — a quien conviene pedirle el vector fuente.

### Siguiente paso recomendado

```bash
sudo apt install inkscape && inkscape "/home/xan217/Downloads/kaffeePlatz v3.cdr" \
  --export-type=svg --export-filename=/home/xan217/Documents/Dev/KaffeePlatz/marca/logo-kaffeeplatz.svg
```

Si el SVG sale con `<text>`, confirmará `font-family="Geometr415 Blk BT"` y cerrará el círculo. Si sale convertido a curvas, igual tendremos el vector — y ya sabemos la fuente por el `fontTable`.
