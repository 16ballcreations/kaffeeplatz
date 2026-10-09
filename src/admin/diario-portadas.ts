/**
 * diario-portadas.ts — de qué fotos se puede elegir la portada de un artículo.
 *
 * ELEGIR, NO SUBIR
 * ===========================================================================
 * Subir fotos es la fase 6 (R2 + Images). Hasta que exista, la portada se
 * elige entre las imágenes que el sitio YA sabe servir optimizadas: las claves
 * del manifiesto `src/datos/imagenes.json`, que son las que `Imagen.astro`
 * convierte en `srcset` con sus anchos. Ofrecer otra cosa (una ruta escrita a
 * mano, una URL externa) sería ofrecer una portada que en la tienda saldría
 * sin versiones responsivas o rota, y la dueña no tendría forma de saberlo.
 *
 * Se ofrecen las del diario primero (son las que se hicieron para esto) y
 * luego las de producto: un artículo sobre la V60 puede querer la foto de la
 * V60, y esa foto ya existe.
 *
 * Y una regla de respeto con lo que hay: si un artículo YA tiene una portada
 * que no está en el manifiesto (un dato heredado), se sigue ofreciendo para
 * ese artículo. Abrir y guardar un artículo sin tocar la foto no puede
 * quitársela con un «esa portada no está disponible».
 */

import manifiesto from '../datos/imagenes.json';

export interface Portada {
  clave: string;
  /** Lo que se lee bajo la miniatura: el nombre del fichero, legible. */
  nombre: string;
  grupo: 'diario' | 'productos';
}

/** «/img/diario/guia-de-la-v60.png» → «guia de la v60». */
function nombreLegible(clave: string): string {
  const fichero = clave.split('/').pop() ?? clave;
  return fichero.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
}

const CLAVES = Object.keys(manifiesto as Record<string, unknown>);

/** Las portadas que se pueden elegir. `actual` se añade si no estaba. */
export function portadasDisponibles(actual?: string | null): Portada[] {
  const lista: Portada[] = [];
  for (const grupo of ['diario', 'productos'] as const) {
    for (const clave of CLAVES.filter((c) => c.startsWith(`/img/${grupo}/`)).sort()) {
      lista.push({ clave, nombre: nombreLegible(clave), grupo });
    }
  }
  if (actual && !lista.some((p) => p.clave === actual)) {
    lista.unshift({ clave: actual, nombre: nombreLegible(actual), grupo: 'diario' });
  }
  return lista;
}
