/**
 * selector-cantidad.ts — el contador de unidades de la ficha de producto.
 * ===========================================================================
 *
 * QUE HACE, Y QUE NO
 * ---------------------------------------------------------------------------
 * Mantiene un numero entre 1 y LO QUE CABE TODAVIA de la variante elegida, y
 * lo expone para que quien agrega lo lea. NO agrega nada: agregar sigue siendo
 * trabajo del script de la ficha, que usa `agregar()` del modulo del carrito.
 * Asi no hay una segunda implementacion del carrito.
 *
 * EL TOPE ES DEL PEDIDO, NO DE LA PULSACION
 * ---------------------------------------------------------------------------
 * Antes este selector acotaba a `data-tope` a secas, que es el tope de la
 * variante. Pero el tope es del PEDIDO: con 8 ya en el carrito y un tope de
 * 10, el maximo que tiene sentido ofrecer es 2, no 10. Si se ofrecen 10 y solo
 * entran 2, el numero que se vio era falso.
 *
 * Asi que el techo del campo es `disponibleParaAgregar()` del modulo del
 * carrito: el tope de la variante MENOS lo que ya hay guardado. Es la unica
 * razon por la que este fichero importa `carrito.ts`, y solo para PREGUNTAR:
 * no escribe nada en el carrito.
 *
 * El tope de la variante sigue saliendo del DOM (`data-tope`, que
 * SelectorCantidad.astro imprime desde `topeDe()`), porque es un dato del
 * build que depende del catalogo. Lo que ya hay en el carrito sale del propio
 * carrito, que es quien lo sabe. El dia que el tope salga del stock, este
 * fichero no se toca: `topes.ts` es el unico sitio que cambia.
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

import { disponibleParaAgregar, enCarrito, registrarTopes, suscribir } from './carrito';

/** El contenedor del selector, con el tope de la variante actual. */
const caja = document.querySelector<HTMLElement>('[data-kp-cantidad]');
const campo = document.querySelector<HTMLInputElement>('[data-kp-cantidad-valor]');
const menos = document.querySelector<HTMLButtonElement>('[data-kp-cantidad-menos]');
const mas = document.querySelector<HTMLButtonElement>('[data-kp-cantidad-mas]');
const aviso = document.querySelector<HTMLElement>('[data-kp-cantidad-aviso]');

/** El tope de la variante vigente. 0 = agotada: no se puede agregar nada. */
function tope(): number {
  const n = Number.parseInt(caja?.dataset.tope ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/** La variante vigente, tal como el script de la ficha la va anotando. */
function variante(): { handle: string; varianteId: string } | null {
  const handle = caja?.dataset.handle;
  const varianteId = caja?.dataset.variante;
  return handle && varianteId ? { handle, varianteId } : null;
}

/** Cuantas unidades de la variante vigente hay YA en el carrito. */
function yaHay(): number {
  const v = variante();
  return v ? enCarrito(v.handle, v.varianteId) : 0;
}

/**
 * El techo del campo: lo que CABE TODAVIA, no el tope entero.
 *
 * Es la cuenta que faltaba. Se le pregunta al carrito (unico que sabe lo
 * guardado) y, si por lo que sea no hay variante anotada, se cae al tope de la
 * variante: peor caso, el limite lo aplica igualmente `agregar()`.
 */
function cabe(): number {
  const v = variante();
  return v ? disponibleParaAgregar(v.handle, v.varianteId) : tope();
}

/** El valor del campo, acotado a [1, cabe]. Nunca devuelve NaN ni 0. */
export function leer(): number {
  const max = Math.max(1, cabe());
  const n = Number.parseInt(campo?.value ?? '', 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(max, Math.max(1, n));
}

/** Escribe el valor ya acotado y pone al dia botones y aviso. */
function fijar(n: number): void {
  if (!campo) return;
  const max = Math.max(1, cabe());
  const v = Math.min(max, Math.max(1, Math.floor(n)));
  campo.value = String(v);
  campo.max = String(max);
  pintarEstado(v, max);
}

/**
 * Botones de los extremos y aviso. No toca el valor.
 *
 * Hay TRES estados que explicar, y por eso el aviso no es un texto fijo:
 *   - variante agotada        -> el control entero se apaga (ya lo hacia).
 *   - el carrito esta lleno   -> no cabe ni una mas: se dice cuantas hay.
 *   - se llego al techo       -> se dice el maximo por pedido, y lo que ya
 *                                hay si es parte de la razon.
 */
function pintarEstado(v: number, max: number): void {
  const t = tope();
  const agotado = t === 0;
  const hay = yaHay();
  const lleno = !agotado && cabe() === 0;

  if (menos) menos.disabled = agotado || lleno || v <= 1;
  if (mas) mas.disabled = agotado || lleno || v >= max;
  if (campo) campo.disabled = agotado || lleno;

  if (caja) {
    caja.toggleAttribute('data-agotado', agotado);
    caja.toggleAttribute('data-lleno', lleno);
  }

  /* El aviso aparece solo cuando hay algo que explicar: al llegar al techo o
     con el carrito ya lleno. Antes de eso un texto permanente seria ruido. */
  if (aviso) {
    let texto = '';
    if (lleno) {
      /* El caso que el cliente reporto al reves: ya no se puede agregar mas
         porque lo que falta YA ESTA en el carrito. Mirando el control no se
         puede adivinar, asi que se escribe. */
      texto =
        `Ya tienes ${hay} en el carrito, el máximo por pedido. ` +
        `Para más, escríbenos por WhatsApp.`;
    } else if (!agotado && v >= max) {
      /* No se habla de stock: hoy no se sabe cuanto hay (el inventario esta
         diseñado, no implementado). Se dice lo unico cierto. */
      texto =
        hay > 0
          ? `Puedes agregar ${max} más: ya tienes ${hay} y el máximo por pedido es ${t}.`
          : `Máximo ${t} por pedido. Para más, escríbenos por WhatsApp.`;
    }
    if (texto !== aviso.textContent) aviso.textContent = texto;
    aviso.hidden = texto === '';
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
  /* QUE VARIANTE es, no solo cual es su tope: `cabe()` necesita preguntarle al
     carrito por esta variante concreta. El tope es por variante, asi que dos
     colores del mismo producto no comparten ni tope ni cuenta. */
  caja.dataset.variante = varianteId;
  /* Si venia pidiendo 8 y de la variante nueva solo caben 3, baja a 3 en vez
     de dejar un numero que no se puede agregar. */
  fijar(leer());
}

/**
 * Vuelve a 1 despues de agregar: la cantidad es de ESA agregada, no del dia.
 *
 * `fijar()` repinta contra el carrito ya actualizado, asi que si la agregada
 * dejo la variante en su tope, el control queda apagado y el aviso lo dice sin
 * que la ficha tenga que pedirlo.
 */
export function reiniciar(): void {
  fijar(1);
}

/** Enciende el selector. Sin JS el bloque se queda `hidden` y no hay control. */
export function iniciar(): void {
  if (!caja || !campo) return;
  caja.hidden = false;

  /* Los topes de TODAS las variantes de esta ficha, para que `carrito.ts` los
     aplique sin conocer el catalogo. Es lo que cierra el agujero de la ficha:
     el limite deja de depender de que este selector se acuerde de mirarlo. */
  const handle = caja.dataset.handle;
  if (handle) {
    registrarTopes(
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-kp-cantidad-tope-variante]'),
      ).map((el) => ({
        handle,
        varianteId: el.dataset.kpCantidadTopeVariante ?? '',
        tope: Number.parseInt(el.dataset.tope ?? '', 10),
      })),
    );
  }

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

  /* El carrito puede cambiar sin pasar por esta ficha: otra pestaña del mismo
     sitio, o el propio «Agregar» de aqui. Si cambia, lo que cabe cambia, y un
     selector que ofrece 5 cuando ya no cabe ninguna miente. */
  suscribir(() => fijar(leer()));

  fijar(1);
}
