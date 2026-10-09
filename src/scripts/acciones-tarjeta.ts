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
 *
 * EL TOPE: LA TARJETA AGREGABA DE UNO EN UNO SIN CONSULTAR NADA
 * ---------------------------------------------------------------------------
 * Era el tercer agujero. Ahora `agregar()` aplica el tope por su cuenta, asi
 * que pulsar veinte veces ya no puede pasarse. Pero un boton que deja de hacer
 * efecto sin decir nada es peor que uno que avisa: la tarjeta LEE el
 * `Resultado` y, al llegar al tope, el boton lo DICE —cambia su texto y su
 * `aria-label`— en vez de quedarse mudo.
 *
 * El tope de la variante lo imprime el servidor en `data-kp-tope` y se
 * registra en el carrito al arrancar: asi el limite no depende de que esta
 * pagina se acuerde de comprobarlo antes de llamar.
 */
import { agregar, disponibleParaAgregar, registrarTopesVivos, suscribir, tope } from './carrito';

/** Cuanto dura la confirmacion antes de retirarse. Igual que en la ficha. */
const MS_AVISO = 6000;

const enlaces = document.querySelectorAll<HTMLAnchorElement>('a[data-kp-agregar]');

/* Los topes de todo lo agregable de esta pagina, ANTES de escuchar nada: el
   carrito tiene que conocerlos ya en el primer clic. */
registrarTopesVivos(
  Array.from(enlaces)
    .filter((el) => el.dataset.kpHandle && el.dataset.kpVarianteId)
    .map((el) => ({
      handle: el.dataset.kpHandle as string,
      varianteId: el.dataset.kpVarianteId as string,
      tope: Number.parseInt(el.dataset.kpTope ?? '', 10),
      /* Con el inventario encendido el tope es stock real: se apunta para que
         el `+` de /carrito no lo supere (ver topes-recordados.ts). */
      deStock: el.hasAttribute('data-kp-tope-stock'),
    })),
);

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

  const confirmar = (texto: string) => {
    if (!aviso || !avisoTexto) return;
    /* El texto NOMBRA el producto: en una rejilla de 25 tarjetas, un
       "Agregado" suelto no dice cual. Es tambien lo que anuncia el lector de
       pantalla al rellenarse la region viva. */
    avisoTexto.textContent = texto;
    aviso.hidden = false;
    window.clearTimeout(borrar);
    /* Se retira a los 6 s: ya se anuncio y deja de ser informacion nueva. El
       contador de la cabecera queda como la confirmacion permanente. */
    borrar = window.setTimeout(() => {
      aviso.hidden = true;
      avisoTexto.textContent = '';
    }, MS_AVISO);
  };

  /* El texto y la etiqueta originales, para poder volver a ellos cuando el
     carrito baje del tope (se quito la linea, o se bajo la cantidad). */
  const etiquetaTexto = el.querySelector<HTMLElement>('[data-kp-agregar-texto]');
  const textoOriginal = etiquetaTexto?.textContent ?? 'Agregar';
  const ariaOriginal = el.getAttribute('aria-label') ?? '';

  /**
   * El boton DICE si ya no cabe mas, en vez de no hacer nada.
   *
   * No se desactiva (`disabled`): un boton desactivado sale del recorrido de
   * tabulacion y deja a quien navega con teclado sin poder leer por que. Se
   * queda activable y lo que cambia es lo que dice; pulsarlo repite el aviso,
   * que es informacion, no una accion fallida.
   */
  const pintar = () => {
    const max = tope(handle, varianteId);
    const lleno = Math.min(max, disponibleParaAgregar(handle, varianteId)) === 0;
    el.toggleAttribute('data-kp-lleno', lleno);
    if (etiquetaTexto) {
      etiquetaTexto.textContent = lleno ? `Máximo ${max}` : textoOriginal;
    }
    el.setAttribute(
      'aria-label',
      lleno
        ? `${titulo}: ya tienes el máximo de ${max} por pedido en el carrito`
        : ariaOriginal,
    );
  };

  const activar = () => {
    const res = agregar(handle, varianteId, 1);
    if (res.agregadas === 0) {
      /* El agujero era este: pulsar y que no pasara nada. Ahora se explica. */
      confirmar(
        `Ya tienes ${res.total} de ${titulo} en el carrito, el máximo por pedido. ` +
          `Para más, escríbenos por WhatsApp.`,
      );
    } else {
      confirmar(`${titulo} agregado al carrito.`);
    }
    pintar();
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

  /* El carrito puede cambiar desde otra pestaña, desde /carrito o desde otra
     tarjeta del mismo producto en esta misma pagina (destacados y
     relacionados repiten productos). Si cambia, este boton tiene que decir la
     verdad sin que nadie lo toque. */
  suscribir(() => pintar());
  pintar();
}
