/**
 * carrito.ts — estado del carrito de KaffeePlatz. Fase 1 del plan de Bold.
 * ===========================================================================
 *
 * QUE SE GUARDA, Y POR QUE TAN POCO
 * ---------------------------------------------------------------------------
 * En `localStorage` solo viven tres datos por linea: `handle`, `varianteId` y
 * `cantidad`. NI el titulo NI el precio. Los dos se releen del catalogo cada
 * vez que se pinta (`resolver()`), por tres razones:
 *
 *   1. Si la dueña cambia un precio y regenera el sitio, un carrito guardado
 *      la semana pasada muestra el precio NUEVO, no el viejo. Un carrito que
 *      recuerda precios es un carrito que miente.
 *   2. Alinea con la regla de seguridad no negociable del plan: "el precio
 *      nunca se toma del navegador". Aqui el navegador no tiene ningun precio
 *      que ofrecer, asi que cuando llegue la fase 2 no hay nada que manipular.
 *   3. Si un producto o una variante desaparece del catalogo, la linea se
 *      descarta SOLA al resolver, sin migraciones ni limpiezas.
 *
 * EL ALMACENAMIENTO PUEDE NO EXISTIR
 * ---------------------------------------------------------------------------
 * En modo privado, con cookies de terceros bloqueadas o con la cuota llena,
 * `localStorage` LANZA: tanto al leer como al escribir, e incluso al limpiar
 * el objeto `window.localStorage`. Todo acceso va dentro de try/catch y el
 * modulo cae a un carrito EN MEMORIA: el sitio sigue funcionando, el carrito
 * funciona durante la visita y simplemente no sobrevive a la recarga. Nada se
 * rompe y nada avisa con un error en consola que no sirva de nada.
 *
 * CLAVE VERSIONADA
 * ---------------------------------------------------------------------------
 * `kp.carrito.v1`. Si algun dia cambia la forma de las lineas, se sube a v2 y
 * el carrito viejo se ignora en vez de intentar leerse mal.
 *
 * COMO SE ENTERA EL RESTO DE LA PAGINA
 * ---------------------------------------------------------------------------
 * Cada cambio emite el evento `kp:carrito` en `window`, con el carrito ya
 * resuelto en `detail`. El contador de la cabecera y la pagina /carrito solo
 * escuchan: no se consultan entre si ni se recarga nada.
 *
 * EL TOPE SE APLICA AQUI, Y SOLO AQUI
 * ---------------------------------------------------------------------------
 * Hay TRES entradas al carrito: la ficha de producto, la tarjeta del catalogo
 * y el `+` de /carrito. Antes el limite vivia en el selector de cantidad de la
 * ficha, que es una de las tres: las otras dos no sabian que existia, y la
 * propia ficha solo limitaba lo que se añadia DE UNA VEZ (poner 10 y pulsar
 * «Agregar» tres veces dejaba 30 en el carrito).
 *
 * Ahora `agregar()` y `cambiarCantidad()` SUMAN lo que ya hay de esa variante
 * y recortan al tope. Venga la llamada de donde venga, es imposible pasarse:
 * no hace falta que las tres vias se acuerden de comprobar nada.
 *
 * Las dos devuelven un `Resultado` que dice QUE PASO (cuanto se pidio, cuanto
 * entro, en cuanto quedo la linea, si se recorto), porque un limite que falla
 * en silencio es peor que no tenerlo: la interfaz tiene que poder avisar.
 *
 * El tope de cada variante lo decide `topeDe()` de `./topes`, que es el unico
 * sitio donde se decide y el unico que habra que tocar cuando exista el stock.
 * Este modulo no conoce el catalogo, asi que las paginas le DAN los topes con
 * `registrarTopes()`; sin registro usa el tope de sensatez, que es el valor de
 * hoy para toda variante disponible.
 *
 * PARTIDO EN MODULOS, CON LA MISMA PUERTA
 * ---------------------------------------------------------------------------
 * Iba por 661 lineas, por encima del limite del repo. Se partio por
 * responsabilidad y este fichero sigue siendo la UNICA puerta: todo lo que
 * las paginas importaban de `./carrito` se sigue importando de aqui, con el
 * mismo nombre y el mismo comportamiento.
 *
 *   carrito.ts           ← esto: las operaciones (agregar, cambiar, quitar...)
 *   carrito-almacen.ts   ← localStorage, recorte al leer, evento `kp:carrito`
 *   carrito-topes.ts     ← el registro de topes de la pagina y `tope()`
 *   carrito-resolver.ts  ← cruce con el catalogo, `pesos()` y WhatsApp
 *   carrito-tipos.ts     ← las formas
 */

import { MAX_POR_LINEA, margen } from './topes';
import { tope } from './carrito-topes';
import { leerGuardado, aplicar, CLAVE, EVENTO } from './carrito-almacen';
import type { LineaGuardada, DetalleEvento, Resultado } from './carrito-tipos';

/* La API de siempre, reexportada: quien importaba de `./carrito` no cambia. */
export type {
  LineaGuardada,
  VarianteCatalogo,
  ProductoCatalogo,
  Catalogo,
  LineaResuelta,
  CarritoResuelto,
  DetalleEvento,
  Resultado,
} from './carrito-tipos';
export { registrarTopes, registrarTopesVivos, tope } from './carrito-topes';
export {
  CLAVE,
  EVENTO,
  enCarrito,
  disponibleParaAgregar,
  recortarGuardado,
  leerGuardado,
} from './carrito-almacen';
export { resolver, pesos, mensajePedido, enlaceWhatsApp } from './carrito-resolver';

/* ===========================================================================
   API PUBLICA
   =========================================================================== */

/** Suma de cantidades de lo guardado, sin necesidad del catalogo. */
export function unidades(): number {
  return leerGuardado().reduce((n, l) => n + l.cantidad, 0);
}

/**
 * Agrega unidades de una variante, SIN PASAR DEL TOPE.
 *
 * Suma lo que ya hubiera de esa variante y recorta: si hay 8 y el tope es 10,
 * pedir 5 agrega 2 y devuelve `recortado: true`. Si ya hay 10, agrega 0. No
 * rechaza la operacion entera ni la hace en silencio: deja lo que cabe y dice
 * lo que paso.
 *
 * Es el punto por el que pasan las TRES vias, asi que da igual de donde venga
 * la llamada: la ficha, la tarjeta del catalogo o el `+` de /carrito.
 */
export function agregar(handle: string, varianteId: string, cantidad = 1): Resultado {
  const pedidas = Math.max(1, Math.floor(cantidad));
  const lineas = leerGuardado();
  const max = tope(handle, varianteId);
  const ya = lineas.find((l) => l.handle === handle && l.varianteId === varianteId);
  const habia = ya?.cantidad ?? 0;
  const agregadas = Math.min(pedidas, margen(max, habia));

  if (agregadas > 0) {
    if (ya) ya.cantidad = habia + agregadas;
    else lineas.push({ handle, varianteId, cantidad: agregadas });
  }

  const total = habia + agregadas;
  /* Si no entro nada, no se escribe ni se avisa al resto de la pagina: el
     estado no cambio y repintar la lista entera movería el foco por nada.
     Quien llamo se entera por el Resultado, que es para lo que esta. */
  return {
    lineas: agregadas > 0 ? aplicar(lineas) : lineas,
    pedidas,
    agregadas,
    total,
    tope: max,
    recortado: agregadas < pedidas,
  };
}

/**
 * Fija la cantidad exacta de una variante, SIN PASAR DEL TOPE.
 * Cantidad <= 0 quita la linea.
 *
 * Es por donde entra el `+` de /carrito, que no tenia techo ninguno: el
 * cliente llego a 69 unidades desde ahi. Ahora se queda en el tope y lo dice.
 */
export function cambiarCantidad(handle: string, varianteId: string, cantidad: number): Resultado {
  const pedidas = Math.floor(cantidad);
  const max = tope(handle, varianteId);

  if (pedidas < 1) {
    const lineas = quitar(handle, varianteId);
    return { lineas, pedidas: 0, agregadas: 0, total: 0, tope: max, recortado: false };
  }

  const lineas = leerGuardado();
  const ya = lineas.find((l) => l.handle === handle && l.varianteId === varianteId);
  if (!ya) {
    return { lineas, pedidas, agregadas: 0, total: 0, tope: max, recortado: false };
  }

  const habia = ya.cantidad;
  /* El suelo es 1 por lo mismo que en `conTope()`: una variante agotada (tope
     0) con linea guardada no desaparece por teclear un numero. */
  const total = Math.max(1, Math.min(Math.min(MAX_POR_LINEA, max), pedidas));
  ya.cantidad = total;

  return {
    lineas: total !== habia ? aplicar(lineas) : lineas,
    pedidas,
    agregadas: total - habia,
    total,
    tope: max,
    recortado: total < pedidas,
  };
}

/** Quita una linea entera. */
export function quitar(handle: string, varianteId: string): LineaGuardada[] {
  const lineas = leerGuardado().filter(
    (l) => !(l.handle === handle && l.varianteId === varianteId),
  );
  return aplicar(lineas);
}

/** Vacia el carrito. */
export function vaciar(): LineaGuardada[] {
  return aplicar([]);
}

/**
 * Se suscribe a los cambios. Devuelve la funcion para darse de baja.
 *
 * Escucha tambien `storage`, asi que el carrito se sincroniza entre pestanas
 * del mismo sitio: agregar algo en una actualiza el contador de la otra.
 */
export function suscribir(fn: (detalle: DetalleEvento) => void): () => void {
  const propio = (e: Event) => fn((e as CustomEvent<DetalleEvento>).detail);
  const ajeno = (e: StorageEvent) => {
    if (e.key !== null && e.key !== CLAVE) return;
    const lineas = leerGuardado();
    fn({ lineas, unidades: lineas.reduce((n, l) => n + l.cantidad, 0) });
  };
  window.addEventListener(EVENTO, propio);
  window.addEventListener('storage', ajeno);
  return () => {
    window.removeEventListener(EVENTO, propio);
    window.removeEventListener('storage', ajeno);
  };
}
