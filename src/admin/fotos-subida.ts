/**
 * fotos-subida.ts — guardar UNA foto en R2, después de comprobarla.
 *
 * QUE SE GUARDA Y CON QUE NOMBRE
 * ===========================================================================
 * Dos objetos por foto, con la clave que explica `src/datos/imagenes.ts`:
 *
 *   productos/<handle>/<uuid>-<ancho>x<alto>.<ext>        la foto
 *   productos/<handle>/<uuid>-<ancho>x<alto>-mini.<ext>   la miniatura
 *
 * UUID y no el nombre que puso la dueña (B.4): «foto.jpg» subida dos veces no
 * se pisa, no hay nada que sanear en la ruta, y la clave es INMUTABLE, que es
 * lo que permite servirla con caché de un año (src/pages/medios/).
 *
 * La miniatura la genera su navegador. Si no llegó (subida sin JS, o un
 * navegador que no pudo redibujar la foto), se guarda una copia de la foto con
 * el nombre de la miniatura: la ruta `-mini` existe SIEMPRE, y ningún
 * componente tiene que preguntarse si está.
 *
 * EL BINDING SE LLAMA `MEDIOS`
 * ---------------------------------------------------------------------------
 * Como pide B.4. Si falta, se lanza con un mensaje que dice qué falta: es un
 * error de configuración (el `r2_buckets` de wrangler), no de la foto, y la
 * pantalla tiene que poder decírselo a quien lo arregle.
 */
import { leerMedidas, MAX_BYTES_FOTO, MAX_BYTES_MINI, TIPOS, type Medidas } from './fotos-validar';
import { ladoMini, PREFIJO_MEDIOS } from '../datos/imagenes';

/** Lo mínimo de R2 que usa el panel. El sitio público solo LEE (ver medios/). */
export interface BucketMedios {
  put(
    clave: string,
    cuerpo: ArrayBuffer | Uint8Array,
    opciones?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<unknown>;
  delete(clave: string | string[]): Promise<void>;
}

export function medios(locals: unknown): BucketMedios {
  const env = (locals as { runtime?: { env?: Record<string, unknown> } })?.runtime?.env;
  const b = env?.MEDIOS as BucketMedios | undefined;
  if (!b?.put) {
    throw new Error(
      'El binding MEDIOS (R2) no está disponible. Falta `r2_buckets` en la configuración de wrangler.',
    );
  }
  return b;
}

/** Un error que se le puede enseñar a la dueña tal cual. */
export class FotoRechazada extends Error {}

const MB = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

/** Comprueba una foto y su miniatura. Lanza `FotoRechazada` con el motivo. */
export async function comprobar(
  foto: File,
  mini: File | null,
): Promise<{ medidas: Medidas; bytes: Uint8Array; bytesMini: Uint8Array }> {
  if (foto.size === 0) throw new FotoRechazada('El fichero está vacío.');
  /* Por el tamaño declarado ANTES de leerlo: no se carga en memoria un
     fichero que se va a rechazar. */
  if (foto.size > MAX_BYTES_FOTO) {
    throw new FotoRechazada(
      `Pesa ${MB(foto.size)} y el máximo es ${MB(MAX_BYTES_FOTO)}. Expórtala más pequeña e inténtalo otra vez.`,
    );
  }
  const bytes = new Uint8Array(await foto.arrayBuffer());
  const medidas = leerMedidas(bytes);
  if (!medidas) {
    throw new FotoRechazada('No es una foto JPG, PNG o WebP que se pueda leer. Otros formatos no se aceptan.');
  }

  /* La miniatura vale si es del mismo formato y mide lo que debe medir; si
     no, se sustituye por la foto (ver la cabecera). Nunca rechaza la subida:
     la foto es lo importante. */
  let bytesMini = bytes;
  if (mini && mini.size > 0 && mini.size <= MAX_BYTES_MINI) {
    const b = new Uint8Array(await mini.arrayBuffer());
    const m = leerMedidas(b);
    const [w, h] = ladoMini(medidas.ancho, medidas.alto);
    if (m && m.formato === medidas.formato && m.ancho === w && m.alto === h) bytesMini = b;
  }
  return { medidas, bytes, bytesMini };
}

/**
 * Sube los dos objetos y devuelve la ruta pública que se guarda en
 * `imagenes.clave` ("/medios/productos/...").
 *
 * POR QUE LA RUTA Y NO LA CLAVE DE R2 A SECAS
 * ---------------------------------------------------------------------------
 * `imagenes.clave` de la semilla es la ruta que se pinta ("/img/productos/..."),
 * y la tienda la usa tal cual como `src`: en `<img>`, en el JSON-LD de la
 * ficha y en la imagen para compartir. Guardando "/medios/..." las fotos
 * nuevas funcionan en todos esos sitios sin tocar la capa de datos ni las
 * páginas. La clave de R2 es esa misma ruta sin el prefijo.
 */
export async function guardarEnR2(
  bucket: BucketMedios,
  handle: string,
  c: { medidas: Medidas; bytes: Uint8Array; bytesMini: Uint8Array },
): Promise<{ clave: string; claves: string[] }> {
  const { formato, ancho, alto } = c.medidas;
  const base = `productos/${handle}/${crypto.randomUUID()}-${ancho}x${alto}`;
  const claveR2 = `${base}.${formato}`;
  const claveMini = `${base}-mini.${formato}`;
  const meta = {
    httpMetadata: {
      contentType: TIPOS[formato],
      cacheControl: 'public, max-age=31536000, immutable',
    },
  };
  await Promise.all([bucket.put(claveR2, c.bytes, meta), bucket.put(claveMini, c.bytesMini, meta)]);
  return { clave: `${PREFIJO_MEDIOS}${claveR2}`, claves: [claveR2, claveMini] };
}
