/**
 * acciones-tarjeta.ts — "Agregar" desde la tarjeta del catalogo.
 * ===========================================================================
 *
 * QUE RESUELVE
 * ---------------------------------------------------------------------------
 * Hasta ahora, para comprar habia que entrar a la ficha de cada producto. Las
 * tarjetas del catalogo (y de los destacados de la portada, y de los
 * relacionados de la ficha) solo ofrecian WhatsApp. Este modulo enciende el
 * "Agregar" de las tarjetas de producto con UNA sola variante.
 *
 * NO REIMPLEMENTA EL CARRITO. Importa `agregar` de `./carrito`, el mismo
 * modulo que usa la ficha: mismo `localStorage`, misma clave versionada,
 * mismo evento `kp:carrito`. El contador de la cabecera se actualiza porque
 * ya esta suscrito a ese evento, sin que este fichero sepa que existe.
 *
 * ENLACE -> BOTON (el patron que ya usa GaleriaProducto)
 * ---------------------------------------------------------------------------
 * La accion se sirve en el HTML como `<a href="/producto/<handle>">`. Si este
 * script no corre —sin JS, con un error de red o con el modulo bloqueado— el
 * enlace sigue llevando a la ficha, donde el "Agregar al carrito" de siempre
 * funciona. Nunca queda un boton muerto.
 *
 * Cuando SI corre, los enlaces marcados con `data-kp-agregar` dejan de
 * navegar y pasan a ser botones de verdad:
 *   - role="button": lo que ES ahora, no lo que era.
 *   - se quita href: un enlace sin destino no debe anunciarse como enlace, y
 *     ademas evita que el clic central o "abrir en pestaña nueva" se lleve a
 *     la persona a la ficha cuando lo que pidio fue agregar.
 *   - tabindex="0": sin href un <a> sale del orden de tabulacion; esto lo
 *     devuelve.
 *   - Enter y Espacio se implementan a mano: un <a role="button"> sin href no
 *     los activa por su cuenta (eso solo lo hace un <button> real).
 *
 * La conversion se hace ANTES de enganchar los eventos, para que no exista un
 * instante en el que el elemento diga una cosa y haga otra.
 *
 * SOLO UNA VARIANTE, NUNCA UNA ELEGIDA A DEDO
 * ---------------------------------------------------------------------------
 * `data-kp-agregar` solo lo imprime el servidor cuando el producto tiene UNA
 * variante (ver AccionesTarjeta.astro). Un producto con colores o tamaños no
 * trae el atributo, su enlace se queda enlace y la eleccion ocurre en la
 * ficha. Este fichero no tiene forma de "coger la primera": el dato de la
 * variante simplemente no esta en el DOM de esas tarjetas.
 */
import { agregar } from './carrito';

/** Cuanto dura la confirmacion antes de retirarse. Igual que en la ficha. */
const MS_AVISO = 6000;

const enlaces = document.querySelectorAll<HTMLAnchorElement>('a[data-kp-agregar]');

for (const el of enlaces) {
  const handle = el.dataset.kpHandle;
  const varianteId = el.dataset.kpVarianteId;
  const titulo = el.dataset.kpTitulo ?? '';

  /* Sin los dos datos no se puede agregar nada: el enlace se queda como
     enlace a la ficha, que es el camino correcto y sigue funcionando. */
  if (!handle || !varianteId) continue;

  /* --- CONVERSION, antes de escuchar nada -------------------------------- */
  el.setAttribute('role', 'button');
  el.removeAttribute('href');
  el.tabIndex = 0;

  /* La confirmacion de ESTA tarjeta. Cada tarjeta tiene la suya para que el
     anuncio salga junto al producto que se agrego y no en un sitio comun. */
  const fila = el.closest<HTMLElement>('[data-kp-acciones]');
  const aviso = fila?.querySelector<HTMLElement>('[data-kp-acc-aviso]') ?? null;
  const avisoTexto = fila?.querySelector<HTMLElement>('[data-kp-acc-aviso-texto]') ?? null;
  let borrar: number | undefined;

  const confirmar = () => {
    if (!aviso || !avisoTexto) return;
    /* El texto NOMBRA el producto: en una rejilla de 25 tarjetas, un
       "Agregado" suelto no dice cual. Es tambien lo que anuncia el lector de
       pantalla al rellenarse la region viva. */
    avisoTexto.textContent = `${titulo} agregado al carrito.`;
    aviso.hidden = false;
    window.clearTimeout(borrar);
    /* Se retira a los 6 s: ya se anuncio y deja de ser informacion nueva. El
       contador de la cabecera queda como la confirmacion permanente. */
    borrar = window.setTimeout(() => {
      aviso.hidden = true;
      avisoTexto.textContent = '';
    }, MS_AVISO);
  };

  const activar = () => {
    agregar(handle, varianteId, 1);
    confirmar();
  };

  el.addEventListener('click', (e) => {
    /* El <a> ya no tiene href, pero se corta igual: si algo volviera a
       ponerlo, un clic no debe navegar Y agregar a la vez. */
    e.preventDefault();
    activar();
  });

  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    /* Espacio hace scroll de pagina por defecto: se corta. */
    e.preventDefault();
    activar();
  });
}
