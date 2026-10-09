/**
 * carrito-almacen.ts — leer y escribir el carrito guardado, y avisar.
 *
 * Salio de `carrito.ts` al partirlo (iba por 661 lineas). Aqui esta todo lo
 * que toca `localStorage` (con su respaldo en memoria), el recorte al tope al
 * leer y el evento `kp:carrito`. Las operaciones (`agregar`,
 * `cambiarCantidad`...) siguen en `carrito.ts` y pasan por aqui.
 *
 * `escribir`, `aplicar` y `leerCrudo` se exportan solo para los otros modulos
 * del carrito: `carrito.ts` NO los reexporta, asi que la API publica es la de
 * siempre y ninguna pagina puede saltarse el tope escribiendo a pelo.
 */

import { MAX_POR_LINEA, margen } from './topes';
import { tope } from './carrito-topes';
import type { LineaGuardada, DetalleEvento } from './carrito-tipos';

/* ===========================================================================
   ALMACENAMIENTO
   =========================================================================== */

export const CLAVE = 'kp.carrito.v1';

/** Cuantas unidades de esa variante hay YA en el carrito guardado. */
export function enCarrito(handle: string, varianteId: string): number {
  const l = leerGuardado().find((x) => x.handle === handle && x.varianteId === varianteId);
  return l?.cantidad ?? 0;
}

/** Cuantas se pueden añadir todavia, contando lo que ya hay. */
export function disponibleParaAgregar(handle: string, varianteId: string): number {
  return margen(tope(handle, varianteId), enCarrito(handle, varianteId));
}

/**
 * Respaldo en memoria para cuando `localStorage` no se puede usar.
 * Mientras dure la visita el carrito funciona igual.
 */
let memoria: LineaGuardada[] | null = null;

/** `localStorage`, o null si el navegador lo niega. Incluso el acceso lanza. */
function almacen(): Storage | null {
  try {
    const s = window.localStorage;
    /* Safari en modo privado deja el objeto pero lanza al escribir: se
       comprueba de verdad, no por su presencia. */
    const sonda = '__kp_sonda__';
    s.setItem(sonda, '1');
    s.removeItem(sonda);
    return s;
  } catch {
    return null;
  }
}

/** Valida y normaliza lo que venga de `localStorage`. Nada se da por bueno. */
function sanear(crudo: unknown): LineaGuardada[] {
  if (!Array.isArray(crudo)) return [];
  const limpias: LineaGuardada[] = [];
  for (const item of crudo) {
    if (!item || typeof item !== 'object') continue;
    const l = item as Record<string, unknown>;
    const handle = typeof l.handle === 'string' ? l.handle : null;
    const varianteId = typeof l.varianteId === 'string' ? l.varianteId : null;
    const cantidad = typeof l.cantidad === 'number' ? Math.floor(l.cantidad) : 0;
    if (!handle || !varianteId || cantidad < 1) continue;
    /* Una misma variante repetida se suma en vez de duplicar la linea. */
    const ya = limpias.find((x) => x.handle === handle && x.varianteId === varianteId);
    if (ya) ya.cantidad = Math.min(MAX_POR_LINEA, ya.cantidad + cantidad);
    else limpias.push({ handle, varianteId, cantidad: Math.min(MAX_POR_LINEA, cantidad) });
  }
  return limpias;
}

/* ===========================================================================
   CARRITOS GUARDADOS QUE YA SE PASAN DEL TOPE

   Existen de verdad: el `+` de /carrito no tenia techo, asi que hay
   navegadores (el del cliente incluido) con 69 unidades de una variante
   guardadas desde antes de este arreglo.

   DECISION: se RECORTAN al tope al leer, y /carrito lo ANUNCIA.

   Por que recortar y no conservar:
     - Un carrito que el sitio no puede cumplir engaña a quien lo mira. Enseña
       un subtotal, un envio y un total de un pedido que al confirmarse por
       WhatsApp se va a tener que corregir a la baja. Es peor que el recorte:
       el recorte se ve una vez, el numero falso viaja hasta la conversacion.
     - El tope existe para que el pedido sea cumplible. Si una via lo respeta y
       lo guardado no, el limite es decorativo.
     - 69 unidades no son una intencion de compra: son el rastro de un boton
       sin tope. Conservarlas no conserva ninguna decision de nadie.

   Por que se recorta AL LEER y no con una migracion de clave:
     - No se sube la clave a v2: v2 tiraria el carrito ENTERO, y la linea de 69
       sigue siendo un producto que esa persona si queria. Se baja a 10 y lo
       demas se queda intacto.
     - Al leer, las tres vias ven la verdad desde el primer pintado, sin que
       ninguna tenga que acordarse de llamar a una limpieza.

   El recorte NO se escribe aqui: escribir desde la lectura haria que un
   `leerGuardado()` tuviera efectos, y la lectura ocurre en cada pintado.
   `recortarGuardado()` (mas abajo) es la que escribe, y la llama /carrito una
   vez al cargar, que es el sitio donde se puede explicar lo que paso.
   =========================================================================== */

/**
 * Aplica el tope de cada variante a lo leido. No escribe nada.
 *
 * El suelo es 1, no 0: una variante agotada da tope 0, y recortar su linea a 0
 * la haria desaparecer del carrito sin decir nada. Se deja en 1 y /carrito
 * pinta su «Agotado por ahora», que es la informacion util. Agregar mas sigue
 * siendo imposible (margen 0) y el boton de agregar de la ficha ya esta
 * desactivado para una variante agotada.
 */
function conTope(lineas: LineaGuardada[]): LineaGuardada[] {
  return lineas.map((l) => {
    const max = Math.max(1, Math.min(MAX_POR_LINEA, tope(l.handle, l.varianteId)));
    return l.cantidad > max ? { ...l, cantidad: max } : l;
  });
}

/**
 * Recorta de verdad lo guardado y devuelve que lineas se tocaron.
 *
 * La llama /carrito al cargar: es la unica pagina que puede explicar un
 * recorte, porque es la que enseña las cantidades. Si no hay nada que
 * recortar no escribe ni avisa.
 */
export function recortarGuardado(): { handle: string; varianteId: string; antes: number; ahora: number }[] {
  /* CRUDO, no `leerGuardado()`: esa ya viene acotada, asi que comparar contra
     ella nunca encontraria diferencia y el recorte no se escribiria ni se
     anunciaria nunca. Es justo el caso del carrito de 69 del cliente. */
  const antes = leerCrudo();
  const ahora = conTope(antes);
  const tocadas = ahora
    .map((l, i) => ({
      handle: l.handle,
      varianteId: l.varianteId,
      antes: antes[i].cantidad,
      ahora: l.cantidad,
    }))
    .filter((c) => c.antes !== c.ahora);
  if (tocadas.length) aplicar(ahora);
  return tocadas;
}

/**
 * Lee las lineas guardadas, YA ACOTADAS al tope de cada variante.
 *
 * El recorte se aplica en la lectura para que las tres vias vean la misma
 * verdad sin tener que acordarse de nada: un carrito de 69 guardado de antes
 * se lee como 10 desde el primer pintado. Lo guardado no se toca aqui (leer no
 * escribe); de eso se encarga `recortarGuardado()`.
 *
 * Nunca lanza: devuelve [] en el peor caso.
 */
export function leerGuardado(): LineaGuardada[] {
  return conTope(leerCrudo());
}

/**
 * Lo guardado TAL CUAL, saneado pero SIN aplicar el tope.
 *
 * Solo lo usa `recortarGuardado()`, que necesita ver las cantidades de verdad
 * para poder decir «de 69 a 10». Todo lo demas pasa por `leerGuardado()`, que
 * ya viene acotado: ninguna via puede leer un 69 por descuido.
 */
export function leerCrudo(): LineaGuardada[] {
  if (memoria) return memoria.map((l) => ({ ...l }));
  const s = almacen();
  if (!s) return [];
  try {
    const texto = s.getItem(CLAVE);
    if (!texto) return [];
    return sanear(JSON.parse(texto));
  } catch {
    /* JSON corrupto o lectura denegada: se trata como carrito vacio. No se
       borra la clave, por si otra pestana la esta usando bien. */
    return [];
  }
}

/** Escribe las lineas. Si no hay almacen, se queda en memoria. Nunca lanza. */
export function escribir(lineas: LineaGuardada[]): void {
  const s = almacen();
  if (!s) {
    memoria = lineas.map((l) => ({ ...l }));
    return;
  }
  try {
    s.setItem(CLAVE, JSON.stringify(lineas));
  } catch {
    /* Cuota llena o permiso retirado a media visita: se sigue en memoria. */
    memoria = lineas.map((l) => ({ ...l }));
  }
}

/* ===========================================================================
   EL AVISO AL RESTO DE LA PAGINA
   =========================================================================== */

/** Nombre del evento que se emite en `window` con cada cambio. */
export const EVENTO = 'kp:carrito';

/** Emite `kp:carrito` con el estado ya guardado. */
function avisar(lineas: LineaGuardada[]): void {
  const detalle: DetalleEvento = {
    lineas,
    unidades: lineas.reduce((n, l) => n + l.cantidad, 0),
  };
  window.dispatchEvent(new CustomEvent<DetalleEvento>(EVENTO, { detail: detalle }));
}

/** Guarda y avisa, en ese orden: quien escuche ya lee el estado nuevo. */
export function aplicar(lineas: LineaGuardada[]): LineaGuardada[] {
  escribir(lineas);
  avisar(lineas);
  return lineas;
}
