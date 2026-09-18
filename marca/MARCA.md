# KaffeePlatz — Identidad de marca

Fuente: `kaffeePlatz v3.cdr` (CorelDRAW 2023+, autor Renne Castellanos, marzo 2025)
+ imágenes de alta resolución aportadas por el cliente.

---

## Nombre

**KaffeePlatz** — una palabra, dos mayúsculas.
El logo renderiza `KAFFEEPLATZ` en versalitas. El dominio `kaffeeplatz.co` se mantiene en minúsculas.

## Posicionamiento

> Tienda especializada en **Accesorios de Café**

## Tagline

> El arte del café… …en cada detalle

Va en serif de alto contraste, nunca en la geométrica.

---

## Tipografía

| Rol | Familia | Observación |
|---|---|---|
| Wordmark del emblema | **Serif de alto contraste** (didona/transicional) | Remates finos, modulación marcada. No identificada; usar **Playfair Display** |
| Tagline | Serif elegante | Misma familia que el wordmark |
| Texto de apoyo | `Geometr415 Blk BT` (grotesca geométrica Black) | Declarada en el CDR. Sustituto: **Poppins Black** o **Montserrat Black** |

**Nota:** el CDR declara `Geometr415 Blk BT`, pero corresponde al texto de la tarjeta
("Accesorios de Café"), NO al wordmark del logo, que es claramente serif.

---

## Color

Valores oficiales leídos de `color/docPalette.xml` del CDR.

| Token | Hex | Uso |
|---|---|---|
| `--kp-bg` | `#FDF7E7` | Fondo crema. **Nunca blanco puro** |
| `--kp-surface` | `#FFFFFF` | Tarjetas |
| `--kp-border` | `#EBE1C8` | Bordes |
| `--kp-ink` | `#1A1A1A` | Texto principal |
| `--kp-ink-muted` | `#6D5B4A` | Texto secundario |
| `--kp-accent` | `#DEC185` | Oro claro — relleno |
| `--kp-accent-deep` | `#8F6E3E` | Oro oscuro — extremo del degradado |
| `--kp-accent-ink` | `#8F6724` | Oro para texto y bordes (AA) |
| `--kp-anchor` | `#1A1A1A` | Secciones invertidas |

### El oro es un degradado, no un plano

El documento tiene 70 rellenos degradados. El dorado simula **metal grabado**
mediante una rampa `#DEC185` → `#8F6E3E`.

```css
--kp-gold-gradient: linear-gradient(145deg, #DEC185 0%, #B89A5E 45%, #8F6E3E 100%);
```

### Regla crítica de accesibilidad

`#DEC185` sobre crema da **1.99:1** — falla AA incluso para componentes no textuales.

- `--kp-accent` → **solo relleno de fondo**, con texto oscuro encima
- `--kp-accent-ink` → texto, enlaces, iconos, bordes (4.66:1, pasa AA)

---

## Textura de lino

**Es identidad, no decoración.** El medallón va sobre lino oscuro; la papelería
sobre lino claro. Presente en todas las piezas de marca.

Archivo recuperado: `textura-lino.png` (1258×839 RGBA en origen)

---

## Assets

| Archivo | Descripción |
|---|---|
| `assets/emblema-1600.png` | Emblema completo sobre lino oscuro, 980×980 RGBA |
| `emblema.png` | Emblema 490×490 |
| `textura-lino.png` | Textura de marca |
| `logo-completo.svg` | Vector de Inkscape — **degradados aplanados**, usar con cuidado |
| `logo-completo.png` | 3000×813 RGBA, todos los lockups |

### La planta de café — elemento gráfico recurrente

Existe en tres tratamientos, todos aprovechables:

1. **Crema** sobre claro → marca de agua, fondos sutiles
2. **Marrón sólido** → iconografía, favicon, sellos
3. **Degradado oro** → acentos sobre fondo oscuro

---

## Contacto

| Canal | Dato |
|---|---|
| Titular | Andreina Morales |
| WhatsApp | +57 301 380 9886 |
| Email | kaffeeplatz28@gmail.com |
| Web | kaffeeplatz.co |

La papelería de marca ya incluye iconos de **TikTok e Instagram**, aunque esas
cuentas no existen todavía. Los enlaces se construyen y se dejan ocultos,
listos para activar.

---

## Voz

Tutea siempre. Divulgativa y cercana, con jerga cafetera explicada y cifras
concretas. Autora del contenido: Andreina Morales.

Frases ancla del sitio actual:
- "Eleva tu experiencia cafetera"
- "café de especialidad" (48 apariciones en el blog)

---

## Pendiente

- **SVG limpio con degradados.** La conversión de Inkscape los aplanó.
  Pedir el original a Renne Castellanos evitaría la pérdida.
- **Identificar la serif del wordmark.** Está rasterizada; Playfair Display
  es el sustituto de trabajo.
