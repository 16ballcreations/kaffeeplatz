/**
 * catalogo.ts — LA ÚNICA FRONTERA CON D1 PARA EL CATÁLOGO
 * ===========================================================================
 * Ningún `.astro` ejecuta SQL. Ninguna página sabe que existe una tabla
 * `variantes`. Todo lo que el sitio necesita del catálogo sale de aquí, con la
 * MISMA forma que hasta ayer devolvía `getCollection('productos')`.
 *
 * Es la regla 1 de mantenimiento a dos años del plan (F.1): "si en dos años hay
 * que cambiar de D1 a otra cosa, o volver a estático, se toca un módulo". Y es
 * la previsión que `src/datos/categorias.ts` ya había dejado escrita: "solo
 * cambia el ORIGEN, no la forma ni el consumo".
 *
 * COMO SE USA EN UNA PAGINA
 * ---------------------------------------------------------------------------
 *     const r = await obtenerProductos(Astro.locals);
 *     if (r.estado !== 'ok') return respuestaDeEmergencia(Astro, r);
 *     const productos = r.datos;
 *
 * Las dos primeras líneas son el patrón completo. `obtenerProductos` nunca
 * lanza (ver `resiliencia.ts`), así que no hay try/catch que olvidar; y
 * `respuestaDeEmergencia` decide entre copia vencida y página de cortesía sin
 * que la página tenga que saber de caché.
 *
 * EL REPARTO DE FICHEROS, Y POR QUE
 * ---------------------------------------------------------------------------
 *   catalogo.ts         ← esto: la cara pública de productos
 *   diario.ts           ← la cara pública del diario
 *   consultas/*.ts      ← el SQL, sin resiliencia alrededor
 *   resiliencia.ts      ← try/catch, caché de borde, cabeceras
 *   cortesia.ts         ← la página de último recurso
 *   formas.ts           ← los tipos: el contrato con los componentes
 *
 * Se partió por RESPONSABILIDAD, no por tamaño: cada fichero se puede leer
 * entero sin tener los otros en la cabeza, y el SQL no está enterrado entre
 * try/catch. El cliente pidió que los ficheros no crezcan sin control, y la
 * forma de cumplirlo que no empeora el código es esta.
 */

import type { Producto } from './formas';
import type { BaseD1 } from './consultas/productos';
import { categoriasDeProducto } from './consultas/categorias';
import { CATEGORIAS, type Categoria } from './categorias';
import {
  todosLosProductos,
  productoPorHandle,
  handleArchivado,
} from './consultas/productos';
import {
  leer,
  type Lectura,
  copiaGuardada,
  guardarCopia,
  cabecerasVencida,
  cabecerasCortesia,
  cabecerasOk,
} from './resiliencia';
import { paginaDeCortesia } from './cortesia';

export type { Producto, Lectura };
export { cabecerasOk, guardarCopia };

/**
 * El binding de D1, sacado de `Astro.locals`.
 *
 * `@astrojs/cloudflare` pone los bindings en `locals.runtime.env`. En
 * `astro dev` los pone `platformProxy` (activado en astro.config.mjs), así que
 * el mismo código vale en desarrollo y en el borde.
 *
 * Si el binding no está, se lanza: significa que `wrangler.jsonc` no declara la
 * base o que se está ejecutando fuera del runtime. Es un error de
 * configuración, no un fallo de la base, y confundirlos haría que un despliegue
 * mal configurado se viera como "D1 está caído" y se sirviera caché vieja para
 * siempre sin que nadie se enterara. `leer()` lo captura igual y la página
 * responde 503, pero el mensaje del log dice la verdad.
 */
function base(locals: unknown): BaseD1 {
  const env = (locals as { runtime?: { env?: Record<string, unknown> } })?.runtime?.env;
  const db = env?.DB as BaseD1 | undefined;
  if (!db?.prepare) {
    throw new Error(
      'El binding DB no está disponible. Comprueba `d1_databases` en wrangler.jsonc ' +
        'y que la base local exista (npm run d1:migrar && npm run d1:sembrar).',
    );
  }
  return db;
}

/** Todos los productos vivos, sin ordenar: el orden es decisión de la página. */
export function obtenerProductos(locals: unknown): Promise<Lectura<Producto[]>> {
  return leer(() => todosLosProductos(base(locals)));
}

/** Un producto por handle. `datos: null` con estado 'ok' significa "no existe". */
export function obtenerProducto(
  locals: unknown,
  handle: string,
): Promise<Lectura<Producto | null>> {
  return leer(() => productoPorHandle(base(locals), handle));
}

/**
 * Qué hacer con el handle de un producto que no está vivo.
 *
 * Devuelve la categoría si está ARCHIVADO (para redirigir ahí) o `null` si
 * nunca existió (404 legítimo). La distinción es de R3: una URL que Google ya
 * indexó no puede volverse un 404 silencioso porque la dueña archivó el
 * producto; tiene que llevar a algún sitio útil.
 */
export function obtenerDestinoDeArchivado(
  locals: unknown,
  handle: string,
): Promise<Lectura<{ categoria: string } | null>> {
  return leer(() => handleArchivado(base(locals), handle));
}

/* ----------------------------------------------------------------- categorías */

/** Una lectura por petición: la página y cada tarjeta comparten la misma. */
const categoriasDePeticion = new WeakMap<object, Promise<Categoria[]>>();

/**
 * Las categorías de producto, de D1: lo que la dueña edita en /admin/categorias.
 *
 * Antes la tienda leía `CATEGORIAS` del código, así que renombrar una categoría
 * en el panel se guardaba en la base y la tienda seguía diciendo lo de antes.
 *
 * NUNCA LANZA Y NUNCA DEVUELVE VACÍO. Si la base falla (o no devuelve ninguna
 * categoría, que sería un dato roto y no un catálogo sin categorías) se usa
 * `CATEGORIAS`, que es exactamente lo que había en la base al sembrarla. Un
 * nombre de categoría desactualizado es un adorno viejo; una página que no se
 * pinta porque no pudo leerlo sería una tienda cerrada por un rótulo. Por eso
 * no pasa por `respuestaDeEmergencia`: los productos sí son la página, esto no.
 *
 * UNA SOLA CONSULTA POR PETICIÓN. La pide la página y la pide cada
 * `TarjetaProducto` (que pinta la categoría y se usa en cuatro páginas); en vez
 * de pasar la lista por props a cada tarjeta, se recuerda la promesa colgada de
 * `locals`, que es un objeto nuevo en cada petición. El `WeakMap` la suelta
 * cuando la petición termina.
 */
export function obtenerCategorias(locals: unknown): Promise<Categoria[]> {
  const clave = (locals && typeof locals === 'object' ? locals : null) as object | null;
  const guardada = clave ? categoriasDePeticion.get(clave) : undefined;
  if (guardada) return guardada;
  const lectura = leer(() => categoriasDeProducto(base(locals))).then((r) =>
    r.estado === 'ok' && r.datos?.length ? r.datos : CATEGORIAS,
  );
  if (clave) categoriasDePeticion.set(clave, lectura);
  return lectura;
}

/* ------------------------------------------------------------ emergencia (R1) */

/**
 * La respuesta cuando la lectura falló: copia vencida si hay, cortesía si no.
 *
 * Devuelve una `Response` que la página retorna tal cual. Las páginas de Astro
 * pueden devolver una `Response` desde el frontmatter, así que esto corta el
 * render antes de intentar pintar con datos que no existen.
 *
 * NUNCA devuelve 500, y nunca un 200 con la tienda vacía. Las dos cosas están
 * prohibidas por R1 y por R3 respectivamente, y por razones distintas: el 500
 * le dice a Google "roto" y el 200 vacío le dice "aquí no hay nada que
 * indexar", que es peor.
 */
export async function respuestaDeEmergencia(
  url: URL,
  _lectura: Lectura<unknown>,
): Promise<Response> {
  const copia = await copiaGuardada(url);
  if (copia) {
    console.warn(`[r1] ${url.pathname}: D1 no respondió, se sirve la copia de caché (vencida).`);
    return new Response(copia, { status: 200, headers: cabecerasVencida() });
  }
  console.error(`[r1] ${url.pathname}: D1 no respondió y no hay copia. Página de cortesía, 503.`);
  return new Response(paginaDeCortesia(), { status: 503, headers: cabecerasCortesia() });
}

/**
 * ETIQUETAS DE CACHÉ: cómo una página declara de qué depende.
 *
 * La página escribe `Astro.locals.etiquetasCache = ['producto:chemex']` y el
 * middleware (`src/middleware.ts`) se encarga del resto: poner las cabeceras y
 * guardar la copia de respaldo.
 *
 * POR QUE EN EL MIDDLEWARE Y NO EN CADA PAGINA
 * ---------------------------------------------------------------------------
 * Guardar la copia requiere el HTML ya renderizado, y una página de Astro no se
 * ve a sí misma renderizada: devuelve contenido, no una `Response`. El
 * middleware sí recibe la `Response` completa de `next()`.
 *
 * Y, más importante: si cachear dependiera de que cada página se acuerde de
 * llamar a algo al final, la página que se olvide no tendrá respaldo, y eso no
 * se nota hasta que D1 falla — o sea, en el peor momento posible. En el
 * middleware es automático para todo lo dinámico.
 *
 * Estas etiquetas son lo que permitirá, en la fase 4, purgar solo lo que cambió
 * cuando la dueña guarde (R2/R9) en vez de tirar la caché entera.
 */
export function marcarEtiquetas(locals: unknown, etiquetas: string[]): void {
  (locals as { etiquetasCache?: string[] }).etiquetasCache = etiquetas;
}
