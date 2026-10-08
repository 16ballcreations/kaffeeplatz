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
 */

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

/** Limite por linea: evita cantidades absurdas por teclazo o por URL. */
const MAX_CANTIDAD = 99;

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
    if (ya) ya.cantidad = Math.min(MAX_CANTIDAD, ya.cantidad + cantidad);
    else limpias.push({ handle, varianteId, cantidad: Math.min(MAX_CANTIDAD, cantidad) });
  }
  return limpias;
}

/** Lee las lineas guardadas. Nunca lanza: devuelve [] en el peor caso. */
export function leerGuardado(): LineaGuardada[] {
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
 * Agrega unidades de una variante. Si la variante ya estaba, suma.
 * Devuelve el carrito guardado resultante.
 */
export function agregar(handle: string, varianteId: string, cantidad = 1): LineaGuardada[] {
  const n = Math.max(1, Math.floor(cantidad));
  const lineas = leerGuardado();
  const ya = lineas.find((l) => l.handle === handle && l.varianteId === varianteId);
  if (ya) ya.cantidad = Math.min(MAX_CANTIDAD, ya.cantidad + n);
  else lineas.push({ handle, varianteId, cantidad: Math.min(MAX_CANTIDAD, n) });
  return aplicar(lineas);
}

/** Fija la cantidad exacta de una variante. Cantidad <= 0 quita la linea. */
export function cambiarCantidad(
  handle: string,
  varianteId: string,
  cantidad: number,
): LineaGuardada[] {
  const n = Math.floor(cantidad);
  if (n < 1) return quitar(handle, varianteId);
  const lineas = leerGuardado();
  const ya = lineas.find((l) => l.handle === handle && l.varianteId === varianteId);
  if (!ya) return lineas;
  ya.cantidad = Math.min(MAX_CANTIDAD, n);
  return aplicar(lineas);
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
