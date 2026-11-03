/**
 * fotos-cuadrar.ts — decidir CÓMO se cuadra una foto, sin tocar un canvas.
 *
 * POR QUE CUADRADAS
 * ===========================================================================
 * La tienda pinta cada foto de producto en un hueco cuadrado (tarjeta del
 * catálogo, galería de la ficha, carrito). Una foto vertical u horizontal
 * queda pequeña en medio de su hueco, o recortada en las miniaturas de la
 * galería. Las que ya estaban se cuadraron a mano con `sharp`; desde aquí el
 * panel lo hace solo al subir, con las MISMAS reglas, para que la dueña no
 * tenga que pensar en ello ni prepararlas antes.
 *
 * LAS DOS MANERAS, Y NUNCA RECORTAR
 * ---------------------------------------------------------------------------
 *   'color'       El borde del lado que falta es un fondo PLANO (la foto de
 *                 estudio sobre blanco o sobre un color liso): se completa con
 *                 ese color y no se nota la costura. El producto queda entero.
 *   'desenfoque'  El fondo NO es plano (una foto de ambiente, una mesa, una
 *                 cocina): un color liso al lado de la foto se vería como un
 *                 marco pegado. Se rellena con la misma foto ampliada y muy
 *                 desenfocada, y encima la foto entera con un FUNDIDO en los
 *                 bordes que tocan el relleno, para que no se vea el corte.
 *   'nada'        Ya es cuadrada (o casi: ≤1 % de diferencia). No se toca.
 *
 * Recortar el producto no es nunca una opción: una cafetera sin asa o un
 * molino sin manivela es peor que un hueco.
 *
 * Este módulo es PURO (recibe píxeles y medidas, devuelve números) para poder
 * probarlo en node: scripts/probar-fotos-cuadrar.mjs. La parte de canvas está
 * en fotos-cuadrar-canvas.ts.
 */

/** ≤1 % de diferencia entre lados: a ojo ya es cuadrada y no se toca. */
export const TOLERANCIA_CUADRADA = 0.01;
/**
 * Desviación media absoluta (0–255, por canal) por debajo de la cual el
 * borde se considera fondo plano. 6 es el umbral con el que se cuadraron a
 * mano las fotos que ya están: aguanta el ruido del JPG sobre un blanco de
 * estudio y rechaza cualquier textura (madera, tela, una sombra).
 */
export const UMBRAL_PLANO = 6;
/** Columnas (o filas) del borde que se miran. El último píxel a veces trae
    un hilo raro del recorte de la cámara; con tres, la mediana lo ignora. */
export const BANDA_BORDE = 3;
/** Ancho del fundido, como parte del lado de la foto que toca el relleno. */
export const FUNDIDO = 0.12;

/** Lo mínimo de un `ImageData`: así se prueba en node con un array a mano. */
export interface Pixeles {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export type Rgb = [number, number, number];

/** Qué lados de la foto tocan el relleno (y llevan fundido). */
export interface Lados {
  izquierda: boolean;
  derecha: boolean;
  arriba: boolean;
  abajo: boolean;
}

interface Geometria {
  /** Lado del cuadrado: el mayor de la foto. Nunca se amplía ni se recorta. */
  lado: number;
  /** Dónde va la foto entera dentro del cuadrado (centrada). */
  x: number;
  y: number;
  lados: Lados;
}

export type Plan =
  | { modo: 'nada' }
  | (Geometria & { modo: 'color'; color: Rgb })
  | (Geometria & {
      modo: 'desenfoque';
      /** Píxeles del fundido en horizontal (izq./der.) y en vertical. */
      fundidoX: number;
      fundidoY: number;
    });

export function yaCuadrada(ancho: number, alto: number): boolean {
  return Math.abs(ancho - alto) / Math.max(ancho, alto, 1) <= TOLERANCIA_CUADRADA;
}

/** Foto centrada en un cuadrado de su lado mayor. */
export function geometria(ancho: number, alto: number): Geometria {
  const lado = Math.max(ancho, alto);
  const vertical = alto > ancho;
  return {
    lado,
    x: Math.floor((lado - ancho) / 2),
    y: Math.floor((lado - alto) / 2),
    lados: { izquierda: vertical, derecha: vertical, arriba: !vertical, abajo: !vertical },
  };
}

/**
 * Rectángulo para que la foto CUBRA el cuadrado (el relleno desenfocado).
 * Se pasa un poco del borde (`sobra`): el desenfoque de canvas aclara los
 * bordes de lo que pinta, y así ese halo cae fuera.
 */
export function cubrir(ancho: number, alto: number, lado: number, sobra = 0.08) {
  const k = (lado * (1 + 2 * sobra)) / Math.min(ancho, alto);
  const w = ancho * k;
  const h = alto * k;
  return { x: (lado - w) / 2, y: (lado - h) / 2, w, h };
}

function mediana(v: number[]): number {
  const s = v.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * El color del fondo si el borde que hay que completar es plano; `null` si
 * no. Vertical: se miran las columnas de la izquierda Y de la derecha juntas
 * (si una es blanca y la otra gris, no hay un color que sirva para los dos
 * lados). Horizontal: las filas de arriba y abajo.
 */
export function fondoPlano(img: Pixeles): Rgb | null {
  const { data, width: w, height: h } = img;
  const vertical = h > w;
  const banda = Math.max(1, Math.min(BANDA_BORDE, Math.floor((vertical ? w : h) / 2)));
  const canales: [number[], number[], number[]] = [[], [], []];
  const tomar = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    canales[0].push(data[i]);
    canales[1].push(data[i + 1]);
    canales[2].push(data[i + 2]);
  };
  if (vertical) {
    for (let y = 0; y < h; y++)
      for (let b = 0; b < banda; b++) {
        tomar(b, y);
        tomar(w - 1 - b, y);
      }
  } else {
    for (let x = 0; x < w; x++)
      for (let b = 0; b < banda; b++) {
        tomar(x, b);
        tomar(x, h - 1 - b);
      }
  }
  const color = canales.map(mediana) as Rgb;
  for (let c = 0; c < 3; c++) {
    const v = canales[c];
    let suma = 0;
    for (const n of v) suma += Math.abs(n - color[c]);
    if (suma / v.length >= UMBRAL_PLANO) return null;
  }
  return color.map(Math.round) as Rgb;
}

/** La decisión entera, a partir de los píxeles de la foto ya reducida. */
export function planear(img: Pixeles): Plan {
  const { width: ancho, height: alto } = img;
  if (yaCuadrada(ancho, alto)) return { modo: 'nada' };
  const g = geometria(ancho, alto);
  const color = fondoPlano(img);
  if (color) return { modo: 'color', color, ...g };
  return {
    modo: 'desenfoque',
    ...g,
    fundidoX: g.lados.izquierda ? Math.round(ancho * FUNDIDO) : 0,
    fundidoY: g.lados.arriba ? Math.round(alto * FUNDIDO) : 0,
  };
}

/** Lo que se le dice a la dueña en la fila de la foto, tras subirla. */
export function textoAjuste(modo: Plan['modo']): string | null {
  if (modo === 'color') return 'Ajustada a cuadrado (fondo completado)';
  if (modo === 'desenfoque') return 'Ajustada a cuadrado (fondo difuminado)';
  return null;
}
