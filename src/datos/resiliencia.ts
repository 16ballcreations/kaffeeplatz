/**
 * RESILIENCIA — que la tienda no cierre porque la base tuvo un mal rato
 * ===========================================================================
 * Es la mitigación del riesgo R1 del plan, que es el riesgo grave de toda esta
 * migración y la razón de que exista este fichero.
 *
 * EL PROBLEMA, DICHO SIN ADORNOS
 * ---------------------------------------------------------------------------
 * Hoy el sitio es estático: no tiene cómo caerse por datos. Un fichero HTML en
 * el borde se sirve o no se sirve, y si se sirve está completo. Mañana,
 * `/catalogo` es una consulta a D1 y un render: si la consulta falla, lo que
 * antes era imposible pasa a ser una tienda cerrada.
 *
 * Y el patrón de 16bc NO resuelve esto (A.4 del plan): casi ningún
 * `await env.DB` está en try/catch, así que un fallo de la base devuelve un
 * **500 sin cuerpo**. En un panel privado se tolera. En `/catalogo` es una
 * página rota para un cliente que venía a comprar.
 *
 * LAS TRES CAPAS, EN ORDEN DE PREFERENCIA
 * ---------------------------------------------------------------------------
 *   1. D1 responde  → se sirve la página y se GUARDA una copia en la Cache API.
 *   2. D1 falla y hay copia → se sirve **la copia, aunque esté vencida**
 *      (`stale-if-error`), y se registra el fallo. La tienda sigue en pie con
 *      datos de hace unos minutos, que es infinitamente mejor que un error.
 *   3. D1 falla y no hay copia → página de cortesía con el WhatsApp de la
 *      dueña y **503 con `Retry-After`**.
 *
 * POR QUE 503 Y NO 500, Y POR QUE NUNCA UN 200 VACIO
 * ---------------------------------------------------------------------------
 * Un 500 le dice a Google "esta página está rota"; un 503 con `Retry-After` le
 * dice "vuelve en un minuto", y Google lo respeta sin desindexar. Y un 200 con
 * la tienda vacía es lo PEOR de los tres: Google lo indexa como una tienda sin
 * productos y la quita de los resultados, que es un daño que se paga en ventas
 * durante meses (R3). Entre los tres, el 503 es el único honesto.
 *
 * POR QUE LA CACHE API Y NO SOLO `Cache-Control`
 * ---------------------------------------------------------------------------
 * `Cache-Control: s-maxage` deja que el borde guarde la respuesta, pero el
 * Worker no puede LEER esa copia: si D1 falla, no tiene de dónde sacar el
 * último HTML bueno. La Cache API (`caches.default`) sí es legible desde el
 * código, y eso es justo lo que hace posible la capa 2. Se usan las dos cosas:
 * `Cache-Control` para que el borde sirva sin despertar al Worker, y la Cache
 * API para tener un respaldo que el Worker pueda leer cuando la base no está.
 */

/** Qué pasó al intentar leer. Lo usa la página para elegir qué responde. */
export type Estado = 'ok' | 'cache-vencida' | 'sin-datos';

export interface Lectura<T> {
  estado: Estado;
  datos: T | null;
  /** El error real, para registrarlo. Nunca se le muestra a nadie. */
  fallo?: unknown;
}

/**
 * Envuelve una lectura de D1. NUNCA lanza: devuelve el estado.
 *
 * Que no lance es el punto. Una página que llama a esto no puede reventar por
 * un fallo de la base, así que no hace falta recordar poner un try/catch en
 * cada `.astro` — el plan pide try/catch en TODA lectura, y la forma de
 * garantizarlo no es la disciplina, es que la única puerta a la base ya lo
 * tenga.
 */
export async function leer<T>(consulta: () => Promise<T>): Promise<Lectura<T>> {
  try {
    return { estado: 'ok', datos: await consulta() };
  } catch (fallo) {
    /* `console.error` llega a los logs del Worker, que están activados en
       wrangler.jsonc (`observability`). Es lo que convierte "la tienda se
       sirvió de caché" en algo que alguien puede ver y arreglar, en vez de un
       silencio que dura semanas. */
    console.error('[d1] lectura fallida:', fallo instanceof Error ? fallo.message : fallo);
    return { estado: 'sin-datos', datos: null, fallo };
  }
}

/* --------------------------------------------------------------- caché de borde */

/**
 * Cuánto vive una página en el borde antes de revalidarse.
 *
 * 300 s (5 min) es el techo, no el objetivo: la invalidación por etiqueta al
 * guardar en el panel (fase 4) es lo que hará que la dueña vea su cambio al
 * instante. Este número es la red por si esa invalidación falla — y el plan es
 * explícito en eso (R9): "si la invalidación falla, la caché no puede durar más
 * de unos minutos". Cinco minutos de desfase en el peor caso es aceptable para
 * un catálogo que cambia unas veces por semana; una hora no lo sería.
 */
export const SEGUNDOS_CACHE = 300;

/**
 * Cuánto se tolera servir una copia VENCIDA cuando D1 no responde.
 *
 * Un día. Generoso a propósito: si la base lleva horas caída, una ficha de
 * producto con el precio de ayer sigue vendiendo, y una página de cortesía no.
 * El precio real se confirma por WhatsApp en esta tienda (no hay pago en
 * línea), así que el riesgo de un precio de hace horas es bajo y el de una
 * tienda cerrada es alto.
 */
export const SEGUNDOS_RESPALDO = 86_400;

/**
 * La vida en el borde de una página que dice «Queda 1» (R15).
 *
 * Esa página afirma algo que caduca rápido: Andreina vende la última por
 * WhatsApp y la ficha cacheada seguiría diciendo «Queda 1» cinco minutos. La
 * verdad está en el `WHERE` de la reserva, así que nadie compra lo que no
 * existe, pero un aviso de escasez que miente es justo lo que hace que se deje
 * de creer en él. Un minuto acota ese desfase y sigue ahorrando casi todas las
 * consultas: las fichas con 1 o 2 unidades son pocas, y solo esas lo pagan.
 */
export const SEGUNDOS_CACHE_CORTA = 60;

/**
 * Cabeceras de una respuesta buena.
 *
 * `etiquetas` son las Cache Tags de Cloudflare: permiten purgar por etiqueta
 * al guardar en el panel ("purga todo lo que lleve `producto:chemex`") en vez
 * de purgar el sitio entero. Es la base de la invalidación de R2/R9. La cabecera
 * `Cache-Tag` solo la honra Cloudflare en planes Enterprise; en los demás es
 * inofensiva y queda como documentación de qué depende de qué, lista para el
 * día que se use. La invalidación real de la fase 4 se hará borrando de la
 * Cache API las claves afectadas, que sí funciona en cualquier plan.
 */
export function cabecerasOk(etiquetas: string[], corta = false): Record<string, string> {
  /* `corta`: la página pinta un «Queda 1» (ver `SEGUNDOS_CACHE_CORTA`). El
     `stale-while-revalidate` baja con ella; dejarlo en 60 doblaría el minuto. */
  const vida = corta
    ? `s-maxage=${SEGUNDOS_CACHE_CORTA}, stale-while-revalidate=15`
    : `s-maxage=${SEGUNDOS_CACHE}, stale-while-revalidate=60`;
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': `public, max-age=0, ${vida}, stale-if-error=${SEGUNDOS_RESPALDO}`,
    'Cache-Tag': etiquetas.join(','),
  };
}

/** Cabeceras de una copia vencida servida porque D1 no estaba. */
export function cabecerasVencida(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    /* No se vuelve a cachear una respuesta de emergencia: la siguiente
       petición debe intentar D1 otra vez, por si ya volvió. */
    'Cache-Control': 'public, max-age=0, s-maxage=30',
    /* Para poder distinguir en los logs y desde fuera una página servida de
       respaldo de una normal. Sin esto, "la tienda funciona" y "la tienda
       funciona de milagro" se ven igual. */
    'X-KP-Origen': 'cache-vencida',
  };
}

/** Cabeceras de la página de cortesía. */
export function cabecerasCortesia(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    /* 60 s: le dice a Google "vuelve en un minuto" en vez de "está roto". */
    'Retry-After': '60',
    'X-KP-Origen': 'cortesia',
  };
}

/* ------------------------------------------------- la Cache API, con cuidado */

/**
 * La caché del borde, o `null` si no hay (p. ej. en `astro dev`).
 *
 * `caches` no existe fuera del runtime de Workers, y `caches.default` tampoco
 * en algunos entornos de prueba. Se comprueba en vez de suponerlo: una página
 * no puede fallar porque el entorno no tenga caché.
 */
function cacheDelBorde(): Cache | null {
  try {
    const c = (globalThis as { caches?: { default?: Cache } }).caches;
    return c?.default ?? null;
  } catch {
    return null;
  }
}

/**
 * Clave de caché de una petición. Se normaliza para que `?utm_source=...` no
 * multiplique las copias de la misma página.
 *
 * `/catalogo?categoria=metodos` SÍ debe tener su propia copia... pero no la
 * tiene: el filtrado del catálogo es en cliente (el HTML es el mismo para
 * todas las categorías y JavaScript oculta los `<li>`). Así que se guarda una
 * sola copia por ruta y el parámetro se ignora. Si algún día el filtrado pasara
 * al servidor, esto es lo que habría que cambiar.
 */
export function claveDeCache(url: URL): Request {
  const limpia = new URL(url.pathname, url.origin);
  return new Request(limpia.toString(), { method: 'GET' });
}

/** Guarda una copia buena. Un fallo al guardar NO rompe la respuesta. */
export async function guardarCopia(
  url: URL,
  html: string,
  etiquetas: string[],
  esperar?: (p: Promise<unknown>) => void,
): Promise<void> {
  const cache = cacheDelBorde();
  if (!cache) return;
  /* Se guarda con una vida larga (la del respaldo), no la de `s-maxage`: el
     objetivo de ESTA copia no es ahorrar una consulta, es tener algo que servir
     si la base desaparece. La frescura para el visitante la gobiernan las
     cabeceras de la respuesta real, no esta copia. */
  const copia = new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': `public, s-maxage=${SEGUNDOS_RESPALDO}`,
      'Cache-Tag': etiquetas.join(','),
    },
  });
  const tarea = cache.put(claveDeCache(url), copia).catch((e) => {
    console.error('[cache] no se pudo guardar la copia:', e instanceof Error ? e.message : e);
  });
  /* `waitUntil` deja que la respuesta salga sin esperar a que se escriba la
     copia. Si no está disponible, se espera: es más lento pero correcto. */
  if (esperar) esperar(tarea);
  else await tarea;
}

/** Recupera la copia guardada, aunque esté vencida. `null` si no hay. */
export async function copiaGuardada(url: URL): Promise<string | null> {
  const cache = cacheDelBorde();
  if (!cache) return null;
  try {
    const r = await cache.match(claveDeCache(url));
    return r ? await r.text() : null;
  } catch (e) {
    console.error('[cache] no se pudo leer la copia:', e instanceof Error ? e.message : e);
    return null;
  }
}
