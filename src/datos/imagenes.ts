/**
 * Versiones optimizadas de las imagenes: las de public/img y, desde la fase 6,
 * las que la dueña sube desde el panel a R2.
 *
 * DOS ORIGENES, UNA SOLA FORMA DE PEDIRLAS
 * ---------------------------------------------------------------------------
 * `fuentes(src)` y `miniatura(src)` reciben la MISMA ruta que trae
 * `ImagenProducto.src`, venga de donde venga, y los componentes no distinguen.
 * Es lo que permite que `GaleriaProducto`, `TarjetaProducto`, la portada y el
 * carrito pinten fotos nuevas sin cambiar una línea.
 *
 *   1. "/img/..." (public/). `imagenes.json` lo genera `npm run imagenes`
 *      (scripts/optimizar-imagenes.mjs): por cada original trae el ancho y alto
 *      de su WebP completo y los anchos menores disponibles (320/640/960). No
 *      se edita a mano. Este camino NO cambia con la fase 6: las 30 fotos de
 *      hoy se siguen pintando byte a byte igual.
 *
 *   2. "/medios/productos/<handle>/<uuid>-<ancho>x<alto>.<ext>" (R2). Las sube
 *      el panel y las sirve el Worker (src/pages/medios/[...clave].ts). No hay
 *      build que genere derivados, así que el navegador de la dueña ya sube dos
 *      versiones (ver `src/admin/fotos-cliente-subir.ts`): la foto de hasta
 *      LADO_MAX px y una miniatura de hasta LADO_MINI px, con sufijo `-mini`.
 *
 * POR QUE LAS MEDIDAS VAN EN EL NOMBRE DEL FICHERO
 * ---------------------------------------------------------------------------
 * `width`/`height` hacen falta para reservar el hueco (sin ellos la página
 * salta al cargar la foto) y el `srcset` necesita el ancho real de cada
 * versión. Están en D1 (`imagenes.ancho/alto`), pero la forma que reciben los
 * componentes es `{src, alt, variante}` y ampliarla obligaba a tocar la capa de
 * datos y los tipos compartidos. Escritas en la clave, viajan con la ruta: la
 * clave es inmutable (UUID), así que no pueden quedar desfasadas.
 */
import manifiesto from './imagenes.json';
import { recurso, optimizada } from './sitio';

interface Entrada {
  ancho: number;
  alto: number;
  anchos: number[];
}

const M = manifiesto as Record<string, Entrada>;

/** Lado mayor de la foto que se guarda. El mismo tope que `npm run imagenes`. */
export const LADO_MAX = 1600;
/** Lado mayor de la miniatura: cubre la rejilla del catálogo en móvil (2x). */
export const LADO_MINI = 480;

/** Prefijo público de lo que se sirve desde R2. Fuera de /admin a propósito. */
export const PREFIJO_MEDIOS = '/medios/';

/** "/medios/productos/h/<uuid>-1600x1200.jpg" → partes. `null` si no es de R2. */
const RE_MEDIO = /^\/medios\/(productos\/[a-z0-9-]+\/[0-9a-f-]{36})-(\d{1,5})x(\d{1,5})\.(jpg|png|webp)$/;

export interface Medio {
  ancho: number;
  alto: number;
  /** Ruta de la miniatura (mismo fichero con sufijo `-mini`). */
  mini: string;
}

export function leerMedio(src: string): Medio | null {
  const m = RE_MEDIO.exec(src);
  if (!m) return null;
  return {
    ancho: Number(m[2]),
    alto: Number(m[3]),
    mini: src.replace(/\.(jpg|png|webp)$/, '-mini.$1'),
  };
}

/**
 * Medidas de la miniatura a partir de las de la foto. La usan el navegador de
 * la dueña al generarla y el servidor al comprobarla, así que la cuenta es una
 * sola y el `srcset` dice el ancho real.
 */
export function ladoMini(ancho: number, alto: number): [number, number] {
  const f = Math.min(1, LADO_MINI / Math.max(ancho, alto));
  return [Math.max(1, Math.round(ancho * f)), Math.max(1, Math.round(alto * f))];
}

export interface Fuentes {
  src: string;
  srcset?: string;
  ancho?: number;
  alto?: number;
}

/**
 * Todo lo que un <img> necesita para cargar solo el tamano que va a pintar:
 * `src` (WebP completo, respaldo), `srcset` con cada ancho y las dimensiones
 * reales para reservar el hueco. Si la imagen no esta en el manifiesto
 * (p. ej. se anadio y no se corrio `npm run imagenes`), devuelve solo el src.
 */
export function fuentes(src: string): Fuentes {
  const r2 = leerMedio(src);
  if (r2) {
    const [anchoMini] = ladoMini(r2.ancho, r2.alto);
    /* Si la foto ya era pequeña, la miniatura es del mismo ancho y anunciarla
       en el srcset solo duplicaría la entrada. */
    const srcset =
      anchoMini < r2.ancho
        ? `${recurso(r2.mini)} ${anchoMini}w, ${recurso(src)} ${r2.ancho}w`
        : undefined;
    return { src: recurso(src), srcset, ancho: r2.ancho, alto: r2.alto };
  }
  const e = M[src];
  const completa = recurso(optimizada(src));
  if (!e) return { src: completa };
  const base = src.replace(/\.(png|jpe?g)$/i, '');
  const srcset = [
    ...e.anchos.map((w) => `${recurso(`${base}.w${w}.webp`)} ${w}w`),
    `${completa} ${e.ancho}w`,
  ].join(', ');
  return { src: completa, srcset, ancho: e.ancho, alto: e.alto };
}

/**
 * Imagen para Open Graph (vista previa al compartir). Los PNG de productos y
 * del diario pesan hasta 2 MB y WhatsApp descarta imagenes asi: se usa su
 * copia JPG de 1200 px (<nombre>.og.jpg, la genera `npm run imagenes`). Los
 * JPG originales ya son livianos y se usan tal cual. Devuelve la ruta sin
 * `base`: SEO.astro la convierte en absoluta.
 *
 * Las fotos de R2 no pasan por aquí con ningún cambio: la regla solo mira
 * "/img/...", y lo que sube el panel ya es un JPG de 1600 px como mucho.
 */
export function paraCompartir(src: string): string {
  return /^\/img\/(productos|diario)\/.+\.png$/i.test(src) ? src.replace(/\.png$/i, '.og.jpg') : src;
}

/** La version mas pequena disponible: para miniaturas de pocos px. */
export function miniatura(src: string): string {
  const r2 = leerMedio(src);
  if (r2) return recurso(r2.mini);
  const e = M[src];
  if (!e?.anchos.length) return recurso(optimizada(src));
  return recurso(`${src.replace(/\.(png|jpe?g)$/i, '')}.w${e.anchos[0]}.webp`);
}
