/**
 * Versiones optimizadas de las imagenes de public/img.
 *
 * `imagenes.json` lo genera `npm run imagenes` (scripts/optimizar-imagenes.mjs):
 * por cada original trae el ancho y alto de su WebP completo y los anchos
 * menores disponibles (320/640/960). No se edita a mano.
 */
import manifiesto from './imagenes.json';
import { recurso, optimizada } from './sitio';

interface Entrada {
  ancho: number;
  alto: number;
  anchos: number[];
}

const M = manifiesto as Record<string, Entrada>;

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

/** La version mas pequena disponible: para miniaturas de pocos px. */
export function miniatura(src: string): string {
  const e = M[src];
  if (!e?.anchos.length) return recurso(optimizada(src));
  return recurso(`${src.replace(/\.(png|jpe?g)$/i, '')}.w${e.anchos[0]}.webp`);
}
