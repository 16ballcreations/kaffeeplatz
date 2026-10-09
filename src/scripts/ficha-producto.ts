/**
 * ficha-producto.ts — la maquina de estados de la ficha de producto.
 * ===========================================================================
 *
 * Estaba en linea dentro de `src/pages/producto/[handle].astro`, que ya iba
 * por 545 lineas antes de añadir el selector de cantidad. El limite del repo
 * son ~300 por fichero, asi que la pagina se queda con lo suyo (resolver el
 * handle en D1, el JSON-LD, la maqueta) y el comportamiento viene aqui.
 *
 * SON UNA SOLA MAQUINA, Y POR ESO ESTAN JUNTOS
 * ---------------------------------------------------------------------------
 * Elegir una variante cambia CINCO cosas a la vez: el precio (en la ficha y
 * en la barra movil), el estado de disponibilidad, que boton de WhatsApp se
 * ve, el tope del selector de cantidad y el boton de agregar. Partir esto en
 * un modulo por componente obligaria a inventar un canal entre las mitades
 * para algo que `elegir()` ya resuelve en un sitio.
 *
 * NO REIMPLEMENTA EL CARRITO. Importa `agregar` de `./carrito`, el mismo
 * modulo que usan las tarjetas del catalogo y la pagina /carrito.
 *
 * SIN JAVASCRIPT todo sigue en pie: los radios se ven, el WhatsApp generico
 * funciona, y los controles que necesitan JS (agregar, cantidad) salen del
 * build con `hidden` y es este fichero el que los enciende. Si no corre, no
 * queda ningun control muerto.
 */
import { agregar } from './carrito';
/* El selector de cantidad vive en su propio modulo: aqui solo se le
   pregunta cuanto hay que agregar y se le avisa de los cambios de
   variante. No reimplementa nada del carrito (no lo conoce). */
import {
  iniciar as iniciarCantidad,
  leer as leerCantidad,
  reiniciar as reiniciarCantidad,
  cambiarVariante as cantidadDeVariante,
} from './selector-cantidad';

const ficha = document.querySelector<HTMLElement>('[data-v-ficha]');
const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="variante"]'));
const agregarBotones = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-v-agregar]'),
);

/* ---------------------------------------------------------------------
   AGREGAR AL CARRITO

   Los botones salen del build con `hidden`: aqui es donde se encienden.
   Si este script no corre (sin JS, o error de red), la ficha se queda con
   WhatsApp en oro y sin un boton muerto.

   Cada boton lleva su `data-variante-id`, que el selector de variante va
   actualizando. Las variantes agotadas no se pueden agregar: el boton se
   desactiva, igual que en la ficha de un producto agotado entero.
   --------------------------------------------------------------------- */
const aviso = document.querySelector<HTMLElement>('[data-v-agregado]');
const avisoTexto = document.querySelector<HTMLElement>('[data-v-agregado-texto]');
let borrarAviso: number | undefined;

const confirmar = (texto: string) => {
  if (!aviso || !avisoTexto) return;
  avisoTexto.textContent = texto;
  aviso.hidden = false;
  window.clearTimeout(borrarAviso);
  /* Se retira a los 6 s: ya se anuncio y deja de ser informacion nueva.
     El carrito de la cabecera queda como la confirmacion permanente. */
  borrarAviso = window.setTimeout(() => {
    aviso.hidden = true;
    avisoTexto.textContent = '';
  }, 6000);
};

/* En la barra movil solo cabe una accion. Si el carrito esta disponible,
   la accion de la barra es agregar y su WhatsApp se retira (el de la ficha,
   mas arriba, sigue entero). La ficha de escritorio mantiene los dos. */
const hayAgregar = agregarBotones.length > 0;
if (hayAgregar) {
  for (const w of document.querySelectorAll<HTMLElement>('[data-v-wa-barra]')) {
    w.remove();
  }
}

/* El selector de cantidad se enciende con los botones: los dos son la misma
   decision (hay carrito, se puede agregar) y encenderlo antes dejaria un
   contador que no cuenta para nada. */
if (hayAgregar) iniciarCantidad();

for (const b of agregarBotones) {
  b.hidden = false;
  b.addEventListener('click', () => {
    const handle = b.dataset.handle;
    const varianteId = b.dataset.varianteId;
    if (!handle || !varianteId || b.disabled) return;
    /* LA CANTIDAD ELEGIDA, no una unidad. `leerCantidad()` ya viene acotada
       al tope de la variante, y `agregar()` del modulo del carrito la suma
       a lo que hubiera de esa misma variante (y aplica su propio techo de
       99 por linea). */
    const cuantas = leerCantidad();
    const res = agregar(handle, varianteId, cuantas);
    /* El texto nombra la variante elegida Y cuantas unidades: es la unica
       forma de que la persona compruebe que se agrego LA QUE queria y en la
       cantidad que pidio. */
    const r = radios.find((x) => x.checked);
    const nombre = r ? ` (${r.value})` : '';

    /* SI HUBO RECORTE SE DICE. El selector ya acota a lo que cabe, asi que
       llegar aqui con recorte es el caso raro —el carrito cambio en otra
       pestaña entre que se teclo y se pulso— y es justo el que no se puede
       adivinar mirando la pantalla. Lo que NO se hace es callarlo ni rechazar
       la agregada entera: entra lo que cabe y se explica el resto. */
    if (res.agregadas === 0) {
      confirmar(
        `Ya tienes ${res.total} en el carrito${nombre}, el máximo por pedido. ` +
          `Para más, escríbenos por WhatsApp.`,
      );
    } else if (res.recortado) {
      confirmar(
        `Agregadas ${res.agregadas} de ${res.pedidas}${nombre}: ` +
          `el carrito queda en ${res.total}, el máximo por pedido.`,
      );
    } else {
      confirmar(
        res.agregadas === 1
          ? `Agregado al carrito${nombre}.`
          : `Agregadas ${res.agregadas} unidades al carrito${nombre}.`,
      );
    }
    /* Vuelve a 1: la cantidad era de ESTA agregada. Dejarla en 3 haria que
       el siguiente clic agregara otras 3 sin que nadie lo pidiera. */
    reiniciarCantidad();
  });
}

/* ---------------------------------------------------------------------
   SELECTOR DE VARIANTE
   Sin JS: los radios se ven, el boton generico de WhatsApp funciona y el
   mensaje no incluye la variante. Con JS: todo se sincroniza.
   --------------------------------------------------------------------- */
if (ficha && radios.length) {
  const precios = document.querySelectorAll<HTMLElement>('[data-v-precio]');
  const estado = document.querySelector<HTMLElement>('[data-v-estado-variante]');
  const botones = Array.from(document.querySelectorAll<HTMLElement>('[data-v-wa]'));
  const minis = Array.from(document.querySelectorAll<HTMLElement>('[data-kp-galeria-mini][data-variante]'));

  const elegir = (r: HTMLInputElement, desdeGaleria: boolean) => {
    r.checked = true;
    for (const p of precios) p.textContent = r.dataset.precio ?? '';
    const disp = r.dataset.disponible === 'true';
    if (estado) {
      estado.textContent = disp ? 'Disponible' : 'Agotado por ahora';
      estado.dataset.kpDisponible = String(disp);
    }
    for (const b of botones) b.hidden = b.dataset.vWa !== r.value;

    /* El boton de agregar apunta a la variante marcada y se desactiva si
       esa variante concreta esta agotada. */
    for (const b of agregarBotones) {
      b.dataset.varianteId = r.dataset.varianteId ?? '';
      b.disabled = !disp;
      const etiqueta = b.querySelector('span');
      if (etiqueta) {
        const corto = b.classList.contains('v-boton--sm');
        etiqueta.textContent = disp
          ? corto
            ? 'Agregar'
            : 'Agregar al carrito'
          : corto
            ? 'Agotado'
            : 'Variante agotada';
      }
    }

    /* El selector de cantidad sigue a la variante: nuevo tope y, si la
       variante elegida esta agotada, queda bloqueado (tope 0). Con el
       boton de agregar ya desactivado arriba, no hay forma de agregar una
       variante agotada ni por el contador ni por el boton. */
    if (hayAgregar) cantidadDeVariante(r.dataset.varianteId ?? '', !disp);

    /* Foto de la variante, si la galeria tiene el vinculo. */
    if (!desdeGaleria) {
      minis.find((m) => m.dataset.variante === r.value)?.click();
    }
  };

  for (const r of radios) r.addEventListener('change', () => elegir(r, false));

  /* Sentido inverso: pulsar la miniatura de una variante la selecciona. */
  for (const m of minis) {
    m.addEventListener('click', () => {
      const r = radios.find((x) => x.value === m.dataset.variante);
      if (r && !r.checked) elegir(r, true);
    });
  }

  const marcado = radios.find((r) => r.checked) ?? radios[0];
  elegir(marcado, marcado === radios[0]);
}
