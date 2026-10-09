/**
 * fotos-validar.ts — qué es de verdad lo que llega al subir una foto.
 *
 * EL TIPO SE LEE DE LOS BYTES, NO DEL NAVEGADOR
 * ===========================================================================
 * `File.type` y la extensión los pone quien envía: un `.jpg` puede ser
 * cualquier cosa. Aquí se miran los primeros bytes (la «firma» del formato) y
 * se aceptan solo JPG, PNG y WebP, que es lo que el plan pide (B.4) y lo que
 * un navegador pinta sin sorpresas. Un SVG, por ejemplo, NO se acepta aunque
 * sea una imagen: puede llevar `<script>`, y se serviría desde nuestro propio
 * dominio.
 *
 * LAS MEDIDAS TAMBIEN SALEN DE LOS BYTES
 * ---------------------------------------------------------------------------
 * `sharp` no corre en un Worker (B.4), pero leer ancho y alto no necesita
 * decodificar la imagen: están en la cabecera de los tres formatos, a unos
 * bytes del principio. Se guardan en `imagenes.ancho/alto` y en la clave (ver
 * `src/datos/imagenes.ts`), y son las que reservan el hueco en la ficha.
 *
 * Si la cabecera no se puede leer, el fichero se rechaza: algo que dice ser un
 * JPG y no tiene medidas legibles no es un JPG que el navegador vaya a pintar.
 */

export type Formato = 'jpg' | 'png' | 'webp';

export interface Medidas {
  formato: Formato;
  ancho: number;
  alto: number;
}

/** 15 MB: una foto de celular sin tocar cabe (4–8 MB, B.4). Más es un error. */
export const MAX_BYTES_FOTO = 15 * 1024 * 1024;
/** La miniatura la genera el navegador a 480 px: 2 MB es holgadísimo. */
export const MAX_BYTES_MINI = 2 * 1024 * 1024;
/** Lado máximo admitido. Por encima, ni un celular: es un fichero raro. */
export const MAX_LADO = 12_000;

export const TIPOS: Record<Formato, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32be = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) >>> 0) + ((b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!);

/** Formato y medidas, o `null` si no es un JPG/PNG/WebP legible. */
export function leerMedidas(b: Uint8Array): Medidas | null {
  if (b.length < 30) return null;

  /* PNG: firma de 8 bytes y el bloque IHDR justo detrás, siempre el primero. */
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return valida('png', u32be(b, 16), u32be(b, 20));
  }

  /* WebP: contenedor RIFF con tres variantes de cabecera. */
  const txt = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (txt(0, 4) === 'RIFF' && txt(8, 4) === 'WEBP') {
    const bloque = txt(12, 4);
    if (bloque === 'VP8 ') return valida('webp', u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
    if (bloque === 'VP8L') {
      const v = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return valida('webp', (v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1);
    }
    if (bloque === 'VP8X') return valida('webp', u24le(b, 24) + 1, u24le(b, 27) + 1);
    return null;
  }

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return leerJpg(b);
  return null;
}

function valida(formato: Formato, ancho: number, alto: number): Medidas | null {
  if (!(ancho > 0 && alto > 0 && ancho <= MAX_LADO && alto <= MAX_LADO)) return null;
  return { formato, ancho, alto };
}

/**
 * JPG: se recorren los segmentos hasta el SOF, que trae alto y ancho.
 *
 * Y SE LEE LA ORIENTACION EXIF. Un celular guarda la foto «tumbada» y anota en
 * el EXIF que hay que girarla; el navegador la pinta girada, así que las
 * medidas que importan son las de después de girar. Si se guardaran las del
 * SOF tal cual, una foto vertical reservaría un hueco horizontal. Con JS esto
 * no pasa (el navegador de la dueña la redibuja ya girada); el caso es la
 * subida sin JS, que manda el fichero original.
 */
function leerJpg(b: Uint8Array): Medidas | null {
  let i = 2;
  let girada = false;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marca = b[i + 1]!;
    /* Relleno: 0xFF repetidos antes de la marca. */
    if (marca === 0xff) {
      i++;
      continue;
    }
    const largo = u16be(b, i + 2);
    if (marca === 0xe1 && String.fromCharCode(...b.subarray(i + 4, i + 8)) === 'Exif') {
      girada = orientacionGirada(b, i + 10, i + 2 + largo);
    }
    /* SOF0..SOF15 menos DHT (C4), JPG (C8) y DAC (CC), que no son cabeceras. */
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
      const alto = u16be(b, i + 5);
      const ancho = u16be(b, i + 7);
      return girada ? valida('jpg', alto, ancho) : valida('jpg', ancho, alto);
    }
    i += 2 + largo;
  }
  return null;
}

/** ¿Dice el EXIF que la foto va girada 90°/270° (orientaciones 5 a 8)? */
function orientacionGirada(b: Uint8Array, tiff: number, fin: number): boolean {
  if (tiff + 8 > fin) return false;
  const le = b[tiff] === 0x49; // "II" = little endian; "MM" = big endian
  const r16 = (i: number) => (le ? u16le(b, i) : u16be(b, i));
  const r32 = (i: number) => (le ? r16(i) + r16(i + 2) * 65536 : r16(i) * 65536 + r16(i + 2));
  const ifd = tiff + r32(tiff + 4);
  if (ifd + 2 > fin) return false;
  const n = r16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > fin) return false;
    if (r16(e) === 0x0112) return r16(e + 8) >= 5 && r16(e + 8) <= 8;
  }
  return false;
}
