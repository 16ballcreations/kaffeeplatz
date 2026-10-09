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
 */

import { MAX_POR_LINEA, margen, topeDe } from './topes';

/* ===========================================================================
   TIPOS
   =========================================================================== */

/** Una linea tal como se GUARDA: lo minimo, sin titulo ni precio. */
export interface LineaGuardada {
  handle: string;
  varianteId: string;
  cantidad: number;
}

/** Una variante del catalogo, con lo que el carrito necesita de ella. */
export interface VarianteCatalogo {
  id: string;
  titulo: string;
  precio: number;
  precioFormateado: string;
  disponible: boolean;
}

/** Un producto del catalogo, reducido a lo que el carrito necesita. */
export interface ProductoCatalogo {
  handle: string;
  titulo: string;
  disponible: boolean;
  variantes: VarianteCatalogo[];
  /** Primera imagen, si la hay: la miniatura de la linea. */
  imagen?: { src: string; alt: string };
  /** true cuando el producto tiene mas de una variante (se muestra el nombre). */
  conVariantes: boolean;
}

/** El catalogo indexado por handle, tal como lo serializa /carrito. */
export type Catalogo = Record<string, ProductoCatalogo>;

/** Una linea ya RESUELTA contra el catalogo: lista para pintar. */
export interface LineaResuelta {
  handle: string;
  varianteId: string;
  cantidad: number;
  titulo: string;
  /** Titulo de la variante, o null si el producto no tiene variantes reales. */
  varianteTitulo: string | null;
  precioUnitario: number;
  precioUnitarioFormateado: string;
  /** precioUnitario * cantidad */
  subtotal: number;
  subtotalFormateado: string;
  disponible: boolean;
  imagen?: { src: string; alt: string };
  url: string;
}

/** El carrito completo, resuelto. */
export interface CarritoResuelto {
  lineas: LineaResuelta[];
  /** Suma de cantidades (lo que muestra el contador). */
  unidades: number;
  subtotal: number;
}

/* ===========================================================================
   ALMACENAMIENTO
   =========================================================================== */

export const CLAVE = 'kp.carrito.v1';

/* ===========================================================================
   LOS TOPES POR VARIANTE

   Este modulo corre en el navegador y NO conoce el catalogo: no puede
   preguntarle a nadie cuanto admite una variante. Asi que cada pagina le pasa
   los topes de lo que ha pintado (`registrarTopes()`), y lo que no esta
   registrado usa el tope de sensatez, que hoy es el valor de CUALQUIER
   variante disponible.

   Por que el valor de reserva es el tope y no «sin limite»: si una pagina se
   olvidara de registrar, el agujero volveria a abrirse en silencio. Caer del
   lado del limite deja, como peor caso, un tope correcto para el dato de hoy.

   La clave es `handle\u0000varianteId`: el tope es POR VARIANTE, no por
   producto. Dos colores del mismo producto no comparten tope.
   =========================================================================== */

/** Topes conocidos de esta pagina. Clave `handle\u0000varianteId`. */
const topes = new Map<string, number>();

/** La clave compuesta. El \0 no puede aparecer en un handle ni en un id. */
function clave(handle: string, varianteId: string): string {
  return `${handle}\u0000${varianteId}`;
}

/**
 * Da a conocer los topes de las variantes que esta pagina ha pintado.
 *
 * Lo llaman /carrito (con su catalogo serializado) y la ficha de producto (con
 * sus variantes). Se puede llamar varias veces: lo registrado se acumula.
 */
export function registrarTopes(
  entradas: Iterable<{ handle: string; varianteId: string; tope: number }>,
): void {
  for (const e of entradas) {
    const n = Math.floor(e.tope);
    if (Number.isFinite(n) && n >= 0) topes.set(clave(e.handle, e.varianteId), n);
  }
}

/**
 * El tope de una variante: lo registrado, o el de sensatez si no se registro.
 *
 * Es la funcion que la interfaz consulta para pintar (desactivar el `+`, decir
 * cuanto queda). El limite de verdad lo aplican `agregar()` y
 * `cambiarCantidad()`, no quien pinta.
 */
export function tope(handle: string, varianteId: string): number {
  const registrado = topes.get(clave(handle, varianteId));
  if (registrado !== undefined) return registrado;
  /* Sin registro no se sabe si la variante esta disponible, asi que se asume
     que si: es el caso normal (lo agotado no se puede agregar de todas formas,
     porque el boton que lo haria esta desactivado) y da el tope de sensatez,
     que es el valor correcto para el dato de hoy. Pasa por `topeDe()` y no por
     la constante para que el dia del inventario no quede un camino que
     devuelva un numero que `topeDe()` ya no daria. */
  return topeDe({ disponible: true });
}

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
function leerCrudo(): LineaGuardada[] {
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
function escribir(lineas: LineaGuardada[]): void {
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
   RESOLUCION CONTRA EL CATALOGO
   =========================================================================== */

/** Prefija una ruta con el `base` del sitio, igual que `ruta()` del servidor. */
function conBase(camino: string): string {
  const base = document.documentElement.dataset.kpBase ?? '';
  const limpio = camino.startsWith('/') ? camino : `/${camino}`;
  return `${base.replace(/\/$/, '')}${limpio}` || '/';
}

/**
 * Cruza las lineas guardadas con el catalogo.
 *
 * Lo que ya no existe (handle retirado, variante retirada) se DESCARTA EN
 * SILENCIO: no es un error del que avisar a la persona, es un catalogo que
 * cambio. Si al descartar cambia el contenido, se reescribe el almacen para
 * que la basura no se arrastre en la siguiente visita.
 */
export function resolver(guardadas: LineaGuardada[], catalogo: Catalogo): CarritoResuelto {
  const lineas: LineaResuelta[] = [];
  let descartadas = false;

  for (const l of guardadas) {
    const p = catalogo[l.handle];
    if (!p) {
      descartadas = true;
      continue;
    }
    const v = p.variantes.find((x) => x.id === l.varianteId);
    if (!v) {
      descartadas = true;
      continue;
    }
    const subtotal = v.precio * l.cantidad;
    lineas.push({
      handle: l.handle,
      varianteId: l.varianteId,
      cantidad: l.cantidad,
      titulo: p.titulo,
      varianteTitulo: p.conVariantes ? v.titulo : null,
      precioUnitario: v.precio,
      precioUnitarioFormateado: v.precioFormateado,
      subtotal,
      subtotalFormateado: pesos(subtotal),
      disponible: p.disponible && v.disponible,
      imagen: p.imagen,
      url: conBase(`/producto/${l.handle}`),
    });
  }

  if (descartadas) {
    escribir(lineas.map(({ handle, varianteId, cantidad }) => ({ handle, varianteId, cantidad })));
  }

  return {
    lineas,
    unidades: lineas.reduce((n, l) => n + l.cantidad, 0),
    subtotal: lineas.reduce((n, l) => n + l.subtotal, 0),
  };
}

/**
 * Formatea un entero en COP: "$315.000".
 *
 * Mismo formato que `precioFormateado` del catalogo. Se repite aqui (y no se
 * importa de src/datos/envio.ts) porque este modulo corre en el navegador y
 * conviene que no arrastre dependencias.
 */
export function pesos(valor: number): string {
  const entero = Math.round(valor);
  return `$${entero.toLocaleString('es-CO', { useGrouping: true }).replace(/,/g, '.')}`;
}

/* ===========================================================================
   API PUBLICA
   =========================================================================== */

/** Nombre del evento que se emite en `window` con cada cambio. */
export const EVENTO = 'kp:carrito';

/** Lo que viaja en `detail` del evento. */
export interface DetalleEvento {
  lineas: LineaGuardada[];
  unidades: number;
}

/** Suma de cantidades de lo guardado, sin necesidad del catalogo. */
export function unidades(): number {
  return leerGuardado().reduce((n, l) => n + l.cantidad, 0);
}

/** Emite `kp:carrito` con el estado ya guardado. */
function avisar(lineas: LineaGuardada[]): void {
  const detalle: DetalleEvento = {
    lineas,
    unidades: lineas.reduce((n, l) => n + l.cantidad, 0),
  };
  window.dispatchEvent(new CustomEvent<DetalleEvento>(EVENTO, { detail: detalle }));
}

/** Guarda y avisa, en ese orden: quien escuche ya lee el estado nuevo. */
function aplicar(lineas: LineaGuardada[]): LineaGuardada[] {
  escribir(lineas);
  avisar(lineas);
  return lineas;
}

/**
 * QUE PASO al intentar agregar o cambiar una cantidad.
 *
 * Existe porque un limite que falla en silencio es peor que no tenerlo: las
 * tres vias necesitan poder decir «se quedo en 10» en vez de no hacer nada.
 * `pedidas` contra `agregadas` es la unica forma de que quien llama sepa si
 * hubo recorte sin volver a leer el carrito y restar.
 */
export interface Resultado {
  /** El carrito guardado resultante. Lo que devolvia antes esta API. */
  lineas: LineaGuardada[];
  /** Cuantas unidades se pidieron. */
  pedidas: number;
  /** Cuantas entraron de verdad. 0 si ya estaba en el tope. */
  agregadas: number;
  /** En cuantas unidades quedo la linea de esa variante. */
  total: number;
  /** El tope vigente de esa variante. */
  tope: number;
  /** true si entro menos de lo pedido: la interfaz tiene que avisar. */
  recortado: boolean;
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

/* ===========================================================================
   MENSAJE DE WHATSAPP
   =========================================================================== */

/**
 * Arma el mensaje del pedido completo.
 *
 * Va con saltos de linea reales: `encodeURIComponent` los convierte en %0A,
 * que es lo que wa.me entiende como linea nueva. Las tildes y la ñ salen en
 * UTF-8 percent-encoded, igual que en BotonWhatsApp.astro.
 */
export function mensajePedido(
  carrito: CarritoResuelto,
  envio: { costo: number; gratis: boolean },
): string {
  const lineas = carrito.lineas.map((l) => {
    const nombre = l.varianteTitulo ? `${l.titulo} (${l.varianteTitulo})` : l.titulo;
    return `• ${l.cantidad} × ${nombre} — ${l.precioUnitarioFormateado} c/u = ${l.subtotalFormateado}`;
  });
  const total = carrito.subtotal + envio.costo;
  return [
    'Hola KaffeePlatz, quiero pedir:',
    '',
    ...lineas,
    '',
    `Subtotal: ${pesos(carrito.subtotal)}`,
    `Envío: ${envio.gratis ? 'gratis' : pesos(envio.costo)}`,
    `Total: ${pesos(total)}`,
    '',
    '¿Me confirman disponibilidad y envío?',
  ].join('\n');
}

/** Enlace de wa.me ya codificado, para el pedido completo. */
export function enlaceWhatsApp(numero: string, mensaje: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
