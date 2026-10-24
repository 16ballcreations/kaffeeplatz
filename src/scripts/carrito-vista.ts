/**
 * carrito-vista.ts — pintar las lineas y el resumen de un carrito. Compartido.
 * ===========================================================================
 *
 * Lo usan /carrito y el mini carrito (el panel del boton flotante). Salio de
 * carrito.astro, que iba por 749 lineas, cuando el panel necesito la misma
 * vista: dos copias de «como se pinta una linea» acabarian con un `+` que se
 * detiene en el tope en un sitio y no en el otro, que es justo el agujero que
 * los topes cerraron (ver la cabecera de carrito.ts).
 *
 * QUE PONE CADA SITIO Y QUE PONE ESTO
 * ---------------------------------------------------------------------------
 * Cada sitio trae su MARCADO: su <template> de linea (con sus clases) y los
 * nodos del resumen. Esto rellena por atributos `data-linea-*` dentro de esa
 * plantilla y de esa lista, nunca con un `querySelector` global: /carrito
 * tiene un contador en la cabecera con `data-vacio`, y un selector a secas ya
 * encontro una vez el nodo equivocado.
 *
 * Si a una plantilla le falta una pieza (el panel no pinta el subtotal de la
 * linea, p. ej.), simplemente no se rellena: todas las piezas son opcionales.
 *
 * Nada de innerHTML con datos: todo va por `textContent` y atributos.
 */
import {
  cambiarCantidad,
  leerGuardado,
  pesos,
  quitar,
  registrarTopes,
  resolver,
  tope,
  type Catalogo,
  type CarritoResuelto,
  type LineaResuelta,
} from './carrito';
import { destinoDelPedido } from './carrito-destino';
import { topeDe } from './topes';
import { calcularEnvio } from '../datos/envio';

/* ===========================================================================
   TOPES Y RECORTES, DEL CATALOGO DE LA PAGINA
   =========================================================================== */

/**
 * Da a `carrito.ts` los topes de todo el catalogo: una entrada por variante,
 * porque el tope es POR VARIANTE. `topeDe()` es el unico sitio que lo decide.
 */
export function registrarTopesDeCatalogo(catalogo: Catalogo): void {
  registrarTopes(
    Object.values(catalogo).flatMap((p) =>
      p.variantes.map((v) => ({
        handle: p.handle,
        varianteId: v.id,
        tope: topeDe({ disponible: p.disponible && v.disponible, stockDisponible: v.stockDisponible }),
      })),
    ),
  );
}

/**
 * El texto del aviso de recorte (lo que devuelve `recortarGuardado()`), o
 * `null` si no se recorto nada. Nombra el producto y las dos cantidades: un
 * cambio que la persona NO pidio tiene que poder entenderse leyendolo.
 */
export function textoRecorte(
  recortes: { handle: string; varianteId: string; antes: number; ahora: number }[],
  catalogo: Catalogo,
): string | null {
  if (!recortes.length) return null;
  const nombres = recortes.map((c) => {
    const p = catalogo[c.handle];
    const v = p?.variantes.find((x) => x.id === c.varianteId);
    const nombre = p ? (p.conVariantes && v ? `${p.titulo} (${v.titulo})` : p.titulo) : 'Un producto';
    return `${nombre}: de ${c.antes} a ${c.ahora}`;
  });
  return recortes.length === 1
    ? `Ajustamos la cantidad al máximo por pedido. ${nombres[0]}.`
    : `Ajustamos ${recortes.length} cantidades al máximo por pedido. ${nombres.join('; ')}.`;
}

/* ===========================================================================
   UNA LINEA
   =========================================================================== */

export const nombreLinea = (l: LineaResuelta) =>
  l.varianteTitulo ? `${l.titulo} (${l.varianteTitulo})` : l.titulo;

/** Rellena un <li> clonado de la plantilla con los datos de una linea. */
export function pintarLinea(plantilla: HTMLTemplateElement, l: LineaResuelta): DocumentFragment {
  const frag = plantilla.content.cloneNode(true) as DocumentFragment;
  const q = <T extends Element>(s: string) => frag.querySelector<T>(s);
  const nombre = nombreLinea(l);

  const li = q<HTMLLIElement>('[data-linea]');
  li?.setAttribute('data-handle', l.handle);
  li?.setAttribute('data-variante', l.varianteId);
  /* La cantidad vive tambien en el <li>: una plantilla sin <input> (o con el
     input a medio teclear) sigue sabiendo de que numero parte el `+`. */
  li?.setAttribute('data-cantidad', String(l.cantidad));

  const foto = q<HTMLAnchorElement>('[data-linea-enlace-foto]');
  if (foto) {
    foto.href = l.url;
    /* La foto y el titulo llevan al mismo sitio. En vez de dos enlaces que
       anuncian lo mismo, la foto sale del recorrido de tabulacion y queda
       oculta al lector de pantalla: el titulo, justo al lado, ya hace de
       enlace con nombre (WCAG 2.4.4, y una parada inutil menos al tabular). */
    foto.tabIndex = -1;
    foto.setAttribute('aria-hidden', 'true');
  }
  const img = q<HTMLImageElement>('[data-linea-img]');
  if (img) {
    if (l.imagen) {
      /* WebP, igual que el resto del sitio (ver `optimizada` en
         src/datos/sitio.ts). Las fotos de R2 responden igual al alias .webp
         (src/pages/medios/[...clave].ts). */
      img.src = l.imagen.src.replace(/\.(png|jpe?g)$/i, '.webp');
      img.alt = '';
    } else {
      img.remove();
    }
  }

  const enlace = q<HTMLAnchorElement>('[data-linea-enlace]');
  if (enlace) {
    enlace.href = l.url;
    enlace.textContent = l.titulo;
  }

  const variante = q<HTMLElement>('[data-linea-variante]');
  if (variante && l.varianteTitulo) {
    variante.textContent = l.varianteTitulo;
    variante.hidden = false;
  }

  const unitario = q<HTMLElement>('[data-linea-unitario]');
  if (unitario) unitario.textContent = l.precioUnitarioFormateado;

  const agotado = q<HTMLElement>('[data-linea-agotado]');
  if (agotado && !l.disponible) agotado.hidden = false;

  const cantidad = q<HTMLInputElement>('[data-linea-cantidad]');
  if (cantidad) {
    cantidad.value = String(l.cantidad);
    cantidad.setAttribute('aria-label', `Cantidad de ${nombre}`);
  }

  /* Etiquetas accesibles: cada boton dice QUE producto toca, porque un lector
     de pantalla los recorre fuera de contexto. El signo visible va aparte. */
  const menos = q<HTMLButtonElement>('[data-linea-menos]');
  const masBtn = q<HTMLButtonElement>('[data-linea-mas]');
  const etMenos = q<HTMLElement>('[data-linea-menos-etiqueta]');
  const etMas = q<HTMLElement>('[data-linea-mas-etiqueta]');
  if (etMenos) etMenos.textContent = `Quitar una unidad de ${nombre}`;
  if (etMas) etMas.textContent = `Agregar una unidad de ${nombre}`;
  menos?.setAttribute('data-signo', '−');
  masBtn?.setAttribute('data-signo', '+');
  /* EL `+` SE DETIENE EN EL TOPE. El limite lo aplica `cambiarCantidad()`
     pase lo que pase; esto es para que se VEA antes de pulsar. */
  const max = tope(l.handle, l.varianteId);
  if (menos) menos.disabled = l.cantidad <= 1;
  if (masBtn) masBtn.disabled = l.cantidad >= max;
  if (cantidad) cantidad.max = String(max);

  /* POR QUE no se puede subir mas: un boton apagado dice que no se puede,
     no por que. Se anuncia al pulsar (la region viva de quien monta). */
  const elTope = q<HTMLElement>('[data-linea-tope]');
  if (elTope && l.cantidad >= max) {
    elTope.textContent = `Máximo ${max} por pedido`;
    elTope.hidden = false;
  }

  const subtotal = q<HTMLElement>('[data-linea-subtotal]');
  if (subtotal) subtotal.textContent = l.subtotalFormateado;

  const etQuitar = q<HTMLElement>('[data-linea-quitar-etiqueta]');
  if (etQuitar) etQuitar.textContent = `Quitar ${nombre} del carrito`;

  return frag;
}

/* ===========================================================================
   LA LISTA ENTERA, CON SU RESUMEN Y SU INTERACCION
   =========================================================================== */

export interface PiezasVista {
  lista: HTMLElement;
  plantilla: HTMLTemplateElement;
  subtotal?: HTMLElement | null;
  envio?: HTMLElement | null;
  total?: HTMLElement | null;
  /** «Te faltan $X para el envío gratis». Solo se ve si falta algo. */
  falta?: HTMLElement | null;
  /** El boton de cierre del pedido. Su destino lo decide carrito-destino.ts. */
  cierre?: HTMLAnchorElement | null;
  /** La region viva de quien monta. */
  decir: (texto: string) => void;
  /** Antes de repintar: encender el bloque lleno o el vacio. */
  alResolver?: (carrito: CarritoResuelto) => void;
  /** A donde va el foco si la linea que lo tenia desaparece. */
  focoDeReserva: (carritoVacio: boolean) => HTMLElement | null | undefined;
}

/**
 * Engancha la interaccion (delegada en la lista) y devuelve `pintar`, que
 * repinta todo contra el catalogo que se le de. Quien monta decide CUANDO
 * pintar (normalmente desde `suscribir()`), no esto.
 */
export function montarVista(p: PiezasVista): (catalogo: Catalogo) => CarritoResuelto {
  const { lista, decir } = p;

  /* --- El foco, a traves de un repintado ------------------------------
     La lista se reconstruye entera en cada cambio, asi que el <button> que
     se acababa de pulsar deja de existir y el foco caeria al <body>: quien
     navega con teclado se quedaria sin sitio desde el que seguir pulsando
     "+". Se anota que control lo tenia (su linea y su papel) y se recupera
     el mismo despues. */
  const recordarFoco = () => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || !lista.contains(a)) return null;
    const li = a.closest<HTMLElement>('[data-linea]');
    const papel = ['data-linea-mas', 'data-linea-menos', 'data-linea-quitar'].find((x) =>
      a.hasAttribute(x),
    );
    if (!li || !papel) return null;
    return { handle: li.dataset.handle ?? '', variante: li.dataset.variante ?? '', papel };
  };

  const restaurarFoco = (m: ReturnType<typeof recordarFoco>, vacio: boolean) => {
    if (!m) return;
    const li = lista.querySelector<HTMLElement>(
      `[data-linea][data-handle="${CSS.escape(m.handle)}"][data-variante="${CSS.escape(m.variante)}"]`,
    );
    const destino = li?.querySelector<HTMLButtonElement>(`[${m.papel}]`);
    /* Un boton desactivado ("−" al llegar a 1) no acepta el foco: se cae al
       otro control de la misma linea antes que al body. */
    if (destino && !destino.disabled) destino.focus();
    else if (li) li.querySelector<HTMLButtonElement>('[data-linea-mas]')?.focus();
    else p.focoDeReserva(vacio)?.focus();
  };

  /* --- El resumen ------------------------------------------------------- */
  const pintarResumen = (carrito: CarritoResuelto) => {
    /* La misma regla de envio que el resto del sitio, de src/datos/envio.ts. */
    const envio = calcularEnvio(carrito.subtotal);
    if (p.subtotal) p.subtotal.textContent = pesos(carrito.subtotal);
    if (p.envio) p.envio.textContent = envio.gratis ? 'Gratis' : pesos(envio.costo);
    if (p.total) p.total.textContent = pesos(carrito.subtotal + envio.costo);
    if (p.falta) {
      const falta = envio.faltaParaGratis > 0;
      p.falta.textContent = falta ? `Te faltan ${pesos(envio.faltaParaGratis)} para el envío gratis.` : '';
      p.falta.hidden = !falta;
    }
    if (p.cierre) {
      /* El numero sale del enlace que ya trae el HTML (wa.me/<numero>): asi
         el boton sirve aunque este script no llegue a correr. */
      const numero = (p.cierre.dataset.numero ??= p.cierre.href.match(/wa\.me\/(\d+)/)?.[1] ?? '');
      p.cierre.href = destinoDelPedido(carrito, envio, numero);
    }
  };

  /* --- Pulsar -------------------------------------------------------------- */
  lista.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    const li = b?.closest<HTMLElement>('[data-linea]');
    const handle = li?.dataset.handle;
    const varianteId = li?.dataset.variante;
    if (!b || !li || !handle || !varianteId) return;
    const actual = Number(li.dataset.cantidad ?? '1');

    if (b.hasAttribute('data-linea-quitar')) {
      const nombre = li.querySelector('[data-linea-enlace]')?.textContent ?? 'El producto';
      quitar(handle, varianteId);
      decir(`${nombre} quitado del carrito.`);
    } else if (b.hasAttribute('data-linea-mas')) {
      const res = cambiarCantidad(handle, varianteId, actual + 1);
      /* Si el `+` ya no sube, se dice POR QUE: un "Cantidad: 10." repetido
         cuando nada cambio afirma que algo paso. */
      decir(
        res.recortado
          ? `Máximo ${res.tope} por pedido. Para más, escríbenos por WhatsApp.`
          : `Cantidad: ${res.total}.`,
      );
    } else if (b.hasAttribute('data-linea-menos')) {
      decir(`Cantidad: ${cambiarCantidad(handle, varianteId, actual - 1).total}.`);
    }
  });

  /* --- Teclear la cantidad. `change` y no `input`: no se repinta en cada
     tecla, que haria perder el foco a media cifra. ------------------------ */
  lista.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.matches('[data-linea-cantidad]')) return;
    const li = input.closest<HTMLElement>('[data-linea]');
    const handle = li?.dataset.handle;
    const varianteId = li?.dataset.variante;
    if (!handle || !varianteId) return;
    const n = Number(input.value);
    /* Vacio o basura: se vuelve a 1, no se borra la linea por un teclazo.
       El tope lo aplica `cambiarCantidad()`: teclear 69 tampoco pasa. */
    const res = cambiarCantidad(handle, varianteId, Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);
    decir(
      res.recortado
        ? `Máximo ${res.tope} por pedido: la cantidad queda en ${res.total}.`
        : `Cantidad: ${res.total}.`,
    );
  });

  /* --- Pintar todo ------------------------------------------------------ */
  return (catalogo: Catalogo) => {
    const foco = recordarFoco();
    const carrito = resolver(leerGuardado(), catalogo);
    p.alResolver?.(carrito);

    if (!carrito.lineas.length) {
      lista.replaceChildren();
      restaurarFoco(foco, true);
      return carrito;
    }

    const frag = document.createDocumentFragment();
    for (const l of carrito.lineas) frag.append(pintarLinea(p.plantilla, l));
    lista.replaceChildren(frag);
    restaurarFoco(foco, false);
    pintarResumen(carrito);
    return carrito;
  };
}
