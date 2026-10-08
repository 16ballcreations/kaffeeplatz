/**
 * selector-cantidad.ts — el contador de unidades de la ficha de producto.
 * ===========================================================================
 *
 * QUE HACE, Y QUE NO
 * ---------------------------------------------------------------------------
 * Mantiene un numero entre 1 y el tope de la variante elegida, y lo expone
 * para que quien agrega lo lea. NO agrega nada: no importa `carrito.ts` ni lo
 * conoce. Agregar sigue siendo trabajo del script de la ficha, que ya usa
 * `agregar()` del modulo del carrito y ahora le pasa esta cantidad en vez de
 * un 1 fijo. Asi no hay una segunda implementacion del carrito.
 *
 * EL TOPE NO ES EL STOCK (todavia)
 * ---------------------------------------------------------------------------
 * El tope sale del DOM: `data-tope` del contenedor, que el servidor imprime
 * desde `topeDe()` en SelectorCantidad.astro. Hoy es una constante
 * provisional porque el inventario esta diseñado y no implementado; el dia
 * que exista, cambia esa funcion y este fichero no se toca: ya lee un tope
 * por variante.
 *
 * SANEAR LO QUE SE TECLEA, Y CUANDO
 * ---------------------------------------------------------------------------
 * El numero es un `<input type="number">`, asi que puede contener cualquier
 * cosa: vacio, "abc" (que el navegador reporta como vacio), 999, "-2", "3.7".
 * Se sanea en `blur` y NO en cada `input`, porque corregir mientras alguien
 * escribe hace imposible borrar el 1 para teclear un 3: en cuanto el campo
 * queda vacio, un saneado inmediato lo repondria a 1.
 *
 * Mientras se escribe solo se actualizan los botones (no se puede subir mas
 * alla del tope aunque el campo diga 50), y el valor que se lee al agregar
 * pasa siempre por `leer()`, que sanea. Es decir: lo que entra al carrito
 * esta acotado aunque el campo muestre algo raro en ese instante.
 */

/** El contenedor del selector, con el tope de la variante actual. */
const caja = document.querySelector<HTMLElement>('[data-kp-cantidad]');
const campo = document.querySelector<HTMLInputElement>('[data-kp-cantidad-valor]');
const menos = document.querySelector<HTMLButtonElement>('[data-kp-cantidad-menos]');
const mas = document.querySelector<HTMLButtonElement>('[data-kp-cantidad-mas]');
const aviso = document.querySelector<HTMLElement>('[data-kp-cantidad-aviso]');

/** El tope vigente. 0 significa "variante agotada": no se puede agregar. */
function tope(): number {
  const n = Number.parseInt(caja?.dataset.tope ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/** El valor del campo, acotado a [1, tope]. Nunca devuelve NaN ni 0. */
export function leer(): number {
  const max = Math.max(1, tope());
  const n = Number.parseInt(campo?.value ?? '', 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(max, Math.max(1, n));
}

/** Escribe el valor ya acotado y pone al dia botones y aviso. */
function fijar(n: number): void {
  if (!campo) return;
  const max = Math.max(1, tope());
  const v = Math.min(max, Math.max(1, Math.floor(n)));
  campo.value = String(v);
  campo.max = String(max);
  pintarEstado(v, max);
}

/** Botones de los extremos y aviso del tope. No toca el valor. */
function pintarEstado(v: number, max: number): void {
  const agotado = tope() === 0;
  if (menos) menos.disabled = agotado || v <= 1;
  if (mas) mas.disabled = agotado || v >= max;

  if (caja) caja.toggleAttribute('data-agotado', agotado);

  /* El aviso solo aparece AL LLEGAR al tope, no antes: antes no hay nada que
     explicar y un texto permanente bajo el control seria ruido. */
  if (aviso) {
    const enTope = !agotado && v >= max;
    const texto = enTope
      ? /* No se habla de stock: hoy no se sabe cuanto hay (el inventario
           esta diseñado, no implementado). Se dice lo unico cierto: cual es
           el maximo por pedido y por donde se piden mas. */
        `Máximo ${max} por pedido. Para más, escríbenos por WhatsApp.`
      : '';
    if (texto !== aviso.textContent) aviso.textContent = texto;
    aviso.hidden = !enTope;
  }
}

/**
 * Cambia la variante vigente: nuevo tope, y la cantidad se reajusta si se
 * queda fuera. Lo llama el script de la ficha al mover los radios.
 *
 * `agotada` llega aparte porque hoy la disponibilidad es un si/no que no se
 * deduce del tope. Cuando el tope sea el stock real, un tope de 0 ya
 * significara agotada por si mismo y este argumento podra desaparecer.
 */
export function cambiarVariante(varianteId: string, agotada: boolean): void {
  if (!caja) return;
  const fuente = document.querySelector<HTMLElement>(
    `[data-kp-cantidad-tope-variante="${CSS.escape(varianteId)}"]`,
  );
  const suyo = Number.parseInt(fuente?.dataset.tope ?? '', 10);
  const nuevo = agotada ? 0 : Number.isFinite(suyo) && suyo > 0 ? suyo : 1;
  caja.dataset.tope = String(nuevo);
  /* Si venia pidiendo 8 y la variante nueva solo admite 3, baja a 3 en vez
     de dejar un numero que no se puede agregar. */
  fijar(leer());
}

/** Vuelve a 1 despues de agregar: la cantidad es de ESA agregada, no del dia. */
export function reiniciar(): void {
  fijar(1);
}

/** Enciende el selector. Sin JS el bloque se queda `hidden` y no hay control. */
export function iniciar(): void {
  if (!caja || !campo) return;
  caja.hidden = false;

  menos?.addEventListener('click', () => fijar(leer() - 1));
  mas?.addEventListener('click', () => fijar(leer() + 1));

  /* Mientras se escribe: solo los botones. Ver la cabecera del fichero. */
  campo.addEventListener('input', () => {
    const max = Math.max(1, tope());
    const n = Number.parseInt(campo.value, 10);
    pintarEstado(Number.isFinite(n) ? n : 1, max);
  });

  /* Al salir del campo si se sanea: es el momento en que la persona ya
     termino de teclear y un valor imposible debe dejar de verse. */
  campo.addEventListener('blur', () => fijar(leer()));

  /* Enter dentro del campo no envia nada (no hay formulario) pero es el gesto
     natural de "ya esta": se sanea en el sitio. */
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fijar(leer());
    }
  });

  fijar(1);
}
