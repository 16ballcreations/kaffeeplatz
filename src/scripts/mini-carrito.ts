/**
 * mini-carrito.ts — abrir, cerrar y pintar el panel del boton flotante.
 * ===========================================================================
 *
 * El marcado y el porque del panel estan en src/components/MiniCarrito.astro.
 * La vista de lineas y resumen es la de /carrito (`carrito-vista.ts`). Aqui va
 * lo que solo tiene el panel:
 *
 *   1. CARGA PEREZOSA del catalogo (/api/carrito/catalogo.json): la primera
 *      vez que se abre, o antes si el raton pasa por el boton o le llega el
 *      foco. Una sola peticion por visita a la pagina; si falla, se reintenta
 *      en la siguiente apertura.
 *   2. EL DIALOGO: abre con clic, Enter o Espacio sobre el boton; cierra con
 *      Esc, clic fuera, la X y al salir de la pagina. Mientras esta abierto el
 *      foco no sale de el, y al cerrar vuelve al boton.
 *   3. SINCRONIA: se repinta con `suscribir()`, asi que agregar desde una
 *      tarjeta con el panel abierto (o desde otra pestaña) lo actualiza.
 *
 * Al AGREGAR un producto el panel NO se abre solo: interrumpiria a quien esta
 * mirando el catalogo y le taparia la pagina. Para eso sigue el pulso del
 * boton (FlotanteCarrito.astro), que avisa sin estorbar.
 */
import { recortarGuardado, suscribir, type Catalogo } from './carrito';
import { montarVista, registrarTopesDeCatalogo, textoRecorte } from './carrito-vista';

const boton = document.querySelector<HTMLAnchorElement>('[data-kp-flotante-carrito]');
const panel = document.querySelector<HTMLElement>('[data-mini]');
const fondo = document.querySelector<HTMLElement>('[data-mini-fondo]');
const plantilla = document.querySelector<HTMLTemplateElement>('[data-mini-plantilla]');
const lista = document.querySelector<HTMLElement>('[data-mini-lineas]');

if (boton && panel && fondo && plantilla && lista) {
  const $ = <T extends HTMLElement>(s: string) => panel.querySelector<T>(s);
  const cargando = $('[data-mini-cargando]');
  const error = $('[data-mini-error]');
  const vacio = $('[data-mini-vacio]');
  const lleno = $('[data-mini-lleno]');
  const cuenta = $('[data-mini-cuenta]');
  const recorte = $('[data-mini-recorte]');
  const cerrarBtn = $<HTMLButtonElement>('[data-mini-cerrar]');
  const anuncio = $('[data-mini-anuncio]');

  /* El boton deja de comportarse como enlace: ahora abre un dialogo. El href
     se queda (clic con Ctrl/Cmd o central sigue abriendo /carrito/ en otra
     pestaña), y sin este script nada de esto ocurre. */
  boton.setAttribute('role', 'button');
  boton.setAttribute('aria-haspopup', 'dialog');
  boton.setAttribute('aria-controls', panel.id);
  boton.setAttribute('aria-expanded', 'false');

  /* --- 1. El catalogo, perezoso ------------------------------------------ */
  let catalogo: Catalogo | null = null;
  let peticion: Promise<Catalogo | null> | null = null;

  const cargar = (): Promise<Catalogo | null> => {
    if (catalogo) return Promise.resolve(catalogo);
    peticion ??= (async () => {
      try {
        const base = document.documentElement.dataset.kpBase ?? '';
        const r = await fetch(`${base}/api/carrito/catalogo.json`, {
          headers: { Accept: 'application/json' },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const datos = (await r.json()) as Catalogo;
        /* Un catalogo vacio no es un catalogo: `resolver()` descartaria todas
           las lineas y borraria el carrito. Se trata como un fallo. */
        if (!datos || typeof datos !== 'object' || !Object.keys(datos).length) {
          throw new Error('catálogo vacío');
        }
        catalogo = datos;
        registrarTopesDeCatalogo(datos);
        /* Un carrito guardado por encima del tope se recorta y se dice, como
           en /carrito: este panel tambien enseña las cantidades. */
        const texto = textoRecorte(recortarGuardado(), datos);
        if (texto && recorte) {
          recorte.textContent = texto;
          recorte.hidden = false;
        }
        return datos;
      } catch (fallo) {
        /* Aviso, no error: el panel ya ofrece /carrito/ y no es un fallo del
           codigo. Se olvida la peticion para reintentar en la siguiente. */
        console.warn('[mini-carrito] no se pudo cargar el catálogo:', fallo);
        peticion = null;
        return null;
      }
    })();
    return peticion;
  };

  /* --- 3. La vista ---------------------------------------------------------- */
  const pintar = montarVista({
    lista,
    plantilla,
    subtotal: $('[data-mini-subtotal]'),
    envio: $('[data-mini-envio]'),
    total: $('[data-mini-total]'),
    falta: $('[data-mini-falta]'),
    cierre: $<HTMLAnchorElement>('[data-mini-finalizar]'),
    decir: (texto) => {
      if (anuncio) anuncio.textContent = texto;
    },
    alResolver: (carrito) => {
      const hay = carrito.lineas.length > 0;
      if (vacio) vacio.hidden = hay;
      if (lleno) lleno.hidden = !hay;
      if (cuenta) {
        cuenta.textContent = !hay
          ? ''
          : carrito.unidades === 1
            ? '1 unidad'
            : `${carrito.unidades} unidades`;
      }
    },
    /* La linea con el foco desaparecio: al cerrar, que sigue ahi. Si el
       carrito se vacio, al enlace del catalogo, la unica accion que queda. */
    focoDeReserva: (sinLineas) =>
      sinLineas ? vacio?.querySelector<HTMLAnchorElement>('a') : cerrarBtn,
  });

  const mostrar = (estado: 'cargando' | 'error' | 'listo') => {
    if (cargando) cargando.hidden = estado !== 'cargando';
    if (error) error.hidden = estado !== 'error';
    if (estado !== 'listo') {
      if (vacio) vacio.hidden = true;
      if (lleno) lleno.hidden = true;
    }
  };

  const abierto = () => !panel.hidden && panel.hasAttribute('data-abierto');

  const pintarSiSePuede = () => {
    if (!catalogo) return;
    mostrar('listo');
    pintar(catalogo);
  };

  /* --- 2. El dialogo ---------------------------------------------------------- */
  const ENFOCABLES =
    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const enfocables = () =>
    Array.from(panel.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(
      (el) => !el.closest('[hidden]') && el.tabIndex >= 0,
    );

  /* En movil la hoja ocupa el ancho entero y el fondo no debe desplazarse
     debajo de ella. En escritorio la tarjeta es pequeña y bloquear el scroll
     de la pagina seria mas molesto que util. */
  const movil = window.matchMedia('(max-width: 639.98px)');
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)');
  let finCierre: number | undefined;

  const abrir = async () => {
    window.clearTimeout(finCierre);
    panel.hidden = false;
    fondo.hidden = false;
    /* Reflow entre quitar `hidden` y poner `data-abierto`: sin el, el
       navegador no ve el estado inicial y no hay transicion. */
    void panel.offsetWidth;
    panel.setAttribute('data-abierto', '');
    fondo.setAttribute('data-abierto', '');
    boton.setAttribute('aria-expanded', 'true');
    document.documentElement.toggleAttribute('data-mini-bloqueo', movil.matches);

    if (catalogo) pintarSiSePuede();
    else mostrar('cargando');
    cerrarBtn?.focus();

    if (!catalogo) {
      const datos = await cargar();
      if (!abierto()) return;
      if (datos) pintarSiSePuede();
      else mostrar('error');
      /* El foco sigue en la X: no se le mueve a la persona mientras lee. */
    }
  };

  const cerrar = ({ devolverFoco = true, inmediato = false } = {}) => {
    if (panel.hidden) return;
    panel.removeAttribute('data-abierto');
    fondo.removeAttribute('data-abierto');
    boton.setAttribute('aria-expanded', 'false');
    document.documentElement.removeAttribute('data-mini-bloqueo');
    /* `hidden` al terminar la salida (0.2 s, como el CSS). Por reloj y no por
       `transitionend`, que no llega con movimiento reducido: el mismo motivo
       que el pulso del flotante. */
    const ocultar = () => {
      panel.hidden = true;
      fondo.hidden = true;
    };
    window.clearTimeout(finCierre);
    if (inmediato || reducido.matches) ocultar();
    else finCierre = window.setTimeout(ocultar, 200);
    if (devolverFoco) {
      /* Si el carrito se vacio, el boton ya esta oculto: el foco va al
         contador de la cabecera, que lleva al mismo sitio. */
      const destino = !boton.hidden
        ? boton
        : document.querySelector<HTMLElement>('[data-kp-carrito-enlace]');
      destino?.focus();
    }
  };

  /* Clic normal: abre o cierra. Con modificadores o boton central se deja
     al navegador abrir /carrito/ en otra pestaña, como un enlace. */
  boton.addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (abierto()) cerrar();
    else void abrir();
  });

  /* Espacio: un enlace no lo atiende de serie, un boton si. Enter ya llega
     como `click`. */
  boton.addEventListener('keydown', (e) => {
    if (e.key !== ' ') return;
    e.preventDefault();
    if (abierto()) cerrar();
    else void abrir();
  });

  /* Precarga: la intencion de abrir suele llegar antes que el clic. */
  const precargar = () => void cargar();
  boton.addEventListener('pointerenter', precargar, { once: true });
  boton.addEventListener('focus', precargar, { once: true });

  cerrarBtn?.addEventListener('click', () => cerrar());
  fondo.addEventListener('click', () => cerrar());

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
      return;
    }
    if (e.key !== 'Tab') return;
    /* EL FOCO NO SALE DEL PANEL. Del ultimo, Tab vuelve al primero; del
       primero, Mayus+Tab va al ultimo. */
    const items = enfocables();
    if (!items.length) return;
    const primero = items[0];
    const ultimo = items[items.length - 1];
    const activo = document.activeElement;
    if (e.shiftKey && (activo === primero || !panel.contains(activo))) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && (activo === ultimo || !panel.contains(activo))) {
      e.preventDefault();
      primero.focus();
    }
  });

  /* Si el foco escapa de todos modos (un clic en una zona sin fondo, un
     lector de pantalla), se trae de vuelta. */
  document.addEventListener('focusin', (e) => {
    if (abierto() && e.target instanceof Node && !panel.contains(e.target) && e.target !== boton) {
      (enfocables()[0] ?? cerrarBtn)?.focus();
    }
  });

  /* Al pasar de escritorio a movil (o al girar el telefono) con el panel
     abierto, el bloqueo de scroll se ajusta a la forma que tiene ahora. */
  movil.addEventListener('change', () => {
    if (abierto()) document.documentElement.toggleAttribute('data-mini-bloqueo', movil.matches);
  });

  /* Al navegar: cerrado y sin animacion, para que al volver con el boton de
     atras (bfcache) la pagina no reaparezca con el panel abierto. */
  window.addEventListener('pagehide', () => cerrar({ devolverFoco: false, inmediato: true }));

  /* Agregar desde una tarjeta, quitar en otra pestaña...: si el panel esta
     abierto se repinta. Cerrado no hace falta, se pinta al abrir. */
  suscribir(() => {
    if (abierto()) pintarSiSePuede();
  });
}
