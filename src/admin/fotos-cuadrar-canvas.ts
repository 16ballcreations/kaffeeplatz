/**
 * fotos-cuadrar-canvas.ts — pintar el cuadrado que decidió fotos-cuadrar.ts.
 *
 * Corre en el navegador de la dueña, justo antes de subir (lo llama
 * fotos-cliente-subir.ts con la foto ya reducida a LADO_MAX). Recibe un canvas
 * con la foto y devuelve otro cuadrado, o el mismo si no había nada que hacer.
 *
 * EL DESENFOQUE, CON Y SIN `ctx.filter`
 * ---------------------------------------------------------------------------
 * `ctx.filter = 'blur(...)'` es lo directo, pero Safari no lo tuvo hasta la
 * 18 y un iPhone que no se actualiza lo ignora en silencio (dibuja nítido).
 * Por eso se COMPRUEBA leyendo el valor de vuelta, y si no lo tomó se
 * desenfoca a la antigua: se encoge el relleno a unas decenas de píxeles y se
 * vuelve a ampliar en dos saltos con suavizado. Sale algo menos fino, pero es
 * un fondo detrás de la foto: lo que importa es que no se lea como imagen.
 */
import { cubrir, planear, type Plan } from './fotos-cuadrar';

function lienzo(ancho: number, alto: number) {
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  return { c, g };
}

/** ¿El navegador aplica `ctx.filter`? Si no lo conoce, el valor no se queda. */
function conFiltro(g: CanvasRenderingContext2D): boolean {
  if (!('filter' in g)) return false;
  g.filter = 'blur(2px)';
  const si = g.filter === 'blur(2px)';
  g.filter = 'none';
  return si;
}

/** El relleno: la foto cubriendo el cuadrado, muy desenfocada. */
function relleno(g: CanvasRenderingContext2D, foto: HTMLCanvasElement, lado: number) {
  const r = cubrir(foto.width, foto.height, lado);
  if (conFiltro(g)) {
    g.filter = `blur(${Math.max(8, Math.round(lado * 0.035))}px)`;
    g.drawImage(foto, r.x, r.y, r.w, r.h);
    g.filter = 'none';
    return;
  }
  /* Encoger a ~1/40 y ampliar en dos saltos: cada ampliación suavizada
     reparte el color y no quedan cuadros. */
  const chico = Math.max(8, Math.round(lado / 40));
  const a = lienzo(chico, chico);
  a.g.drawImage(foto, (r.x * chico) / lado, (r.y * chico) / lado, (r.w * chico) / lado, (r.h * chico) / lado);
  const medio = chico * 4;
  const b = lienzo(medio, medio);
  b.g.drawImage(a.c, 0, 0, medio, medio);
  g.drawImage(b.c, 0, 0, lado, lado);
}

/**
 * La foto con sus bordes en degradado de alfa en los lados que tocan el
 * relleno. `destination-in` deja de la foto solo lo que el degradado cubre:
 * opaco en el centro, transparente en el borde.
 */
function fundida(foto: HTMLCanvasElement, plan: Extract<Plan, { modo: 'desenfoque' }>) {
  const { c, g } = lienzo(foto.width, foto.height);
  g.drawImage(foto, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  const tramo = (x0: number, y0: number, x1: number, y1: number, f: number) => {
    const d = g.createLinearGradient(x0, y0, x1, y1);
    d.addColorStop(0, 'rgba(0,0,0,0)');
    d.addColorStop(f, '#000');
    d.addColorStop(1 - f, '#000');
    d.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = d;
    g.fillRect(0, 0, c.width, c.height);
  };
  if (plan.fundidoX > 0) tramo(0, 0, c.width, 0, plan.fundidoX / c.width);
  if (plan.fundidoY > 0) tramo(0, 0, 0, c.height, plan.fundidoY / c.height);
  return c;
}

/** El canvas cuadrado y el modo que se usó ('nada' devuelve el mismo canvas). */
export function cuadrar(foto: HTMLCanvasElement): { canvas: HTMLCanvasElement; modo: Plan['modo'] } {
  const g0 = foto.getContext('2d')!;
  const plan = planear(g0.getImageData(0, 0, foto.width, foto.height));
  if (plan.modo === 'nada') return { canvas: foto, modo: 'nada' };
  const { c, g } = lienzo(plan.lado, plan.lado);
  if (plan.modo === 'color') {
    g.fillStyle = `rgb(${plan.color.join(',')})`;
    g.fillRect(0, 0, plan.lado, plan.lado);
    g.drawImage(foto, plan.x, plan.y);
  } else {
    relleno(g, foto, plan.lado);
    g.drawImage(fundida(foto, plan), plan.x, plan.y);
  }
  return { canvas: c, modo: plan.modo };
}
