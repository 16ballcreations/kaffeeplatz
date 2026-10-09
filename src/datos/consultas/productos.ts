/**
 * consultas/productos.ts — el SQL del catálogo y la ficha, y nada más.
 *
 * Este fichero SOLO sabe de SQL y de cómo convertir filas en las formas de
 * `src/datos/formas.ts`. No sabe de caché, ni de respaldos, ni de qué hacer si
 * D1 falla: eso es `src/datos/catalogo.ts`, que es la cara pública. Separarlo
 * así es lo que mantiene los dos ficheros por debajo de las 300 líneas y, sobre
 * todo, lo que permite leer el SQL sin el ruido de la resiliencia alrededor.
 *
 * TRES CONSULTAS EN VEZ DE UN JOIN GRANDE
 * ===========================================================================
 * El catálogo necesita 25 productos con sus variantes y sus imágenes. Un solo
 * JOIN devolvería una fila por combinación (25 productos × variantes ×
 * imágenes) y habría que deshacer la multiplicación en memoria, pagando filas
 * leídas por cada duplicado — y en D1 las filas leídas se pagan de verdad (R4).
 *
 * Tres consultas planas (productos, variantes, imágenes) devuelven 25 + 30 + 30
 * = 85 filas, cada dato una sola vez, y se cosen por `producto_id` con un Map.
 * Es más código y menos filas; en una base que cobra por filas, gana.
 *
 * EL ORDEN LO PONE SIEMPRE EL SQL, Y SIEMPRE ES TOTAL
 * ---------------------------------------------------------------------------
 * Todos los ORDER BY acaban en una columna única (`handle` o `id`). Sin eso,
 * SQLite puede devolver dos filas empatadas en cualquier orden y la página
 * cambiaría entre peticiones sin que cambiara ningún dato. Es el mismo
 * problema que se arregló en los `sort()` de las páginas, y hay que arreglarlo
 * en los dos sitios: aquí para que la consulta sea estable, y allí para que el
 * criterio de negocio no dependa del orden de llegada.
 */

import type { Producto, Variante, Opcion, ImagenProducto } from '../formas';
import { formatearPrecio } from '../formas';

/**
 * Lo que el Worker recibe como binding. Tipado al mínimo que se usa.
 *
 * `first()` existe en los DOS niveles —con `bind` y sin él— porque las dos
 * formas se usan de verdad: con `bind` para todo lo que lleva parámetros, y
 * sin él para las consultas que no tienen ninguno (el interruptor
 * `inventario_activo` de `ajustes`, cuya clave es un literal). Faltaba el
 * segundo, y faltaba solo porque hasta ahora ninguna consulta sin parámetros
 * necesitaba una sola fila.
 */
export interface BaseD1 {
  prepare(sql: string): {
    bind(...valores: unknown[]): {
      all<T = unknown>(): Promise<{ results: T[] }>;
      first<T = unknown>(): Promise<T | null>;
    };
    all<T = unknown>(): Promise<{ results: T[] }>;
    first<T = unknown>(): Promise<T | null>;
  };
}

/* Solo lo vivo: `archivado_en IS NULL`. Un producto archivado desaparece del
   catálogo, y su URL la trata aparte `src/datos/catalogo.ts` (R3: 301 a su
   categoría, nunca un 404 silencioso ni un 200 vacío). */
const CAMPOS = `handle, titulo, vendor, descripcion_html, descripcion_texto,
  precio, disponible, categoria, coleccion, destacado, id`;

/* ===========================================================================
 * `vendible`: LA ÚNICA FÓRMULA DE DISPONIBILIDAD DEL SITIO
 * ===========================================================================
 * Sección G.1 del plan. Hay dos conceptos que hasta ahora estaban colapsados
 * en una sola columna porque no hacía falta distinguirlos:
 *
 *   · «no se vende» es una DECISIÓN de la dueña. No se deriva de nada: es
 *     voluntad («esta Chemex está en el escaparate y no la vendo»). Es
 *     `variantes.disponible`, que se CONSERVA con su significado estrechado a
 *     interruptor manual: lo que la interfaz pinta es «A la venta / Retirado».
 *   · «no hay» es un HECHO de inventario. Se deriva:
 *     `stock_fisico - stock_reservado <= 0`.
 *
 * Y lo que el sitio usa es la conjunción:
 *
 *     vendible = disponible = 1  AND  (stock_fisico - stock_reservado) > 0
 *
 * EN UN SOLO SITIO, Y ESE SITIO ES ESTA CONSTANTE. Los componentes no la
 * calculan: siguen recibiendo `disponible: boolean` ya resuelto, y por eso
 * `src/datos/formas.ts` NO CAMBIA y el catálogo, la ficha, la galería y
 * `carrito.ts` no se tocan (G.5).
 *
 * POR QUÉ SE RESTAN LAS COLUMNAS Y NO SE MIRAN LAS RESERVAS VIGENTES
 * ---------------------------------------------------------------------------
 * Aquí se resta `stock_reservado` a secas, que es la caché transaccional. La
 * consulta exacta —la que descuenta solo las reservas con `vence_en > now`—
 * existe, está en `consultas/inventario.ts` (`stockExacto`) y se usa donde la
 * precisión importa: la ficha, el checkout y el tope de cantidad. En
 * `/catalogo` no, porque un `SUM()` agregado por cada una de las 30 variantes
 * en cada pintado son filas leídas que se pagan (R4), y es justo la decisión
 * que G.2 toma explícitamente: «/catalogo sigue usando las dos columnas, que
 * es lo que lo hace barato».
 *
 * EL NEGATIVO NUNCA LLEGA AL CLIENTE, SIN UNA RAMA EXTRA
 * ---------------------------------------------------------------------------
 * `stock_fisico` puede ser negativo a propósito (G.4.4, y la cabecera de
 * 0004). Como la fórmula exige `> 0` y −1 no es > 0, una variante en negativo
 * sale «Agotado» en el sitio y el error se ve SOLO en el panel. Ese reparto es
 * el correcto y no hace falta escribir nada para conseguirlo.
 * =========================================================================== */

/**
 * La fórmula, como trozo de SQL, para la variante con alias `v`.
 *
 * Es un literal constante: no interpola nada que venga de fuera. Lo único que
 * varía es SI se aplica, y eso lo decide `sqlVendible()` con el interruptor.
 */
const VENDIBLE_CON_STOCK = `(v.disponible = 1 AND (v.stock_fisico - v.stock_reservado) > 0)`;

/**
 * Qué columna se lee como «disponible», según el interruptor `inventario_activo`.
 *
 * APAGADO (el valor que deja la migración 0004, y el estado del día del
 * cambio) ⇒ devuelve `v.disponible` TAL CUAL. No es una aproximación ni un
 * camino parecido: es literalmente la misma expresión que había antes de esta
 * fase, así que el SQL que se ejecuta es el de siempre y el sitio **no puede**
 * comportarse distinto. Esa es la red de seguridad de R13 y la vuelta atrás en
 * un toque (G.6, paso 5): con las 30 variantes en 0, encender sin haber
 * contado la bodega apagaría la tienda entera.
 *
 * ENCENDIDO ⇒ se aplica la fórmula completa.
 */
function sqlVendible(activo: boolean): string {
  return activo ? VENDIBLE_CON_STOCK : 'v.disponible';
}

/**
 * ¿Mira el sitio el stock? Lee el interruptor de `ajustes`.
 *
 * SI FALLA, DEVUELVE `false`, o sea «compórtate como antes del inventario».
 * Es la decisión importante de esta función y va en la dirección segura: si la
 * tabla `ajustes` no existiera (base a medio migrar) o la consulta fallara,
 * asumir «encendido» dejaría el catálogo entero en «Agotado» — exactamente el
 * desastre que el interruptor existe para evitar. El modo seguro del fallo es
 * «como hoy», nunca «tienda apagada».
 *
 * Se duplica a propósito la de `consultas/inventario.ts` en vez de importarla:
 * este fichero es el del catálogo público y no debe depender del módulo de
 * inventario para pintar una página. Son cuatro líneas y la dirección del
 * fallo seguro es la misma en las dos.
 */
async function miraElStock(db: BaseD1): Promise<boolean> {
  try {
    const fila = await db
      .prepare("SELECT valor FROM ajustes WHERE clave = 'inventario_activo'")
      .first<{ valor: string }>();
    return fila?.valor === '1';
  } catch {
    return false;
  }
}

interface FilaProducto {
  id: number;
  handle: string;
  titulo: string;
  vendor: string;
  descripcion_html: string;
  descripcion_texto: string;
  precio: number;
  disponible: number;
  categoria: string;
  coleccion: string | null;
  destacado: number;
}

interface FilaVariante {
  producto_id: number;
  id_externo: string | null;
  titulo: string;
  precio: number;
  /**
   * `vendible`, YA CALCULADO POR EL SQL — no la columna `variantes.disponible`.
   *
   * Sigue siendo 0/1 y el mapeo de `aVariante` no cambia, que es justo lo que
   * mantiene intacta la forma de `formas.ts` (G.5). Lo que hay detrás es la
   * expresión de `sqlVendible()`: con el inventario apagado, la columna tal
   * cual; encendido, la columna Y el stock. Ver el bloque `vendible` arriba.
   */
  disponible: number;
  sku: string | null;
}

interface FilaImagen {
  producto_id: number;
  clave: string;
  alt: string;
  variante_titulo: string | null;
}

interface FilaOpcion {
  producto_id: number;
  nombre: string;
  valores: string;
}

/** Todos los productos vivos, con todo lo que cuelga de ellos. */
export async function todosLosProductos(db: BaseD1): Promise<Producto[]> {
  /* El interruptor primero: decide la fórmula de `disponible` de las variantes
     (ver `sqlVendible`). Apagado ⇒ el SQL de abajo es el de antes de esta fase. */
  const activo = await miraElStock(db);

  const productos = await db
    .prepare(`SELECT ${CAMPOS} FROM productos WHERE archivado_en IS NULL ORDER BY handle`)
    .all<FilaProducto>();

  const ids = productos.results.map((p) => p.id);
  if (!ids.length) return [];

  /* `IN (?, ?, ...)` con tantos marcadores como ids. Se construye la lista de
     marcadores, nunca los valores: los valores van siempre por `bind`. */
  const marcas = ids.map(() => '?').join(', ');
  const [variantes, opciones, imagenes] = await Promise.all([
    db
      .prepare(
        `SELECT producto_id, id_externo, titulo, precio, sku,
                ${sqlVendible(activo)} AS disponible
           FROM variantes v WHERE producto_id IN (${marcas}) ORDER BY producto_id, orden, id`,
      )
      .bind(...ids)
      .all<FilaVariante>(),
    db
      .prepare(
        `SELECT producto_id, nombre, valores
           FROM opciones WHERE producto_id IN (${marcas}) ORDER BY producto_id, orden, id`,
      )
      .bind(...ids)
      .all<FilaOpcion>(),
    /* `por_revisar = 0`: una foto recien subida cuya variante y rol solo
       estan SUGERIDOS no sale en la tienda hasta que la duena los confirma
       (migracion 0006). Ver planes/kaffeeplatz-panel-admin.md, convencion
       de nombres: el panel propone, nunca decide solo. */
    db
      .prepare(
        `SELECT i.producto_id, i.clave, i.alt, v.titulo AS variante_titulo
           FROM imagenes i LEFT JOIN variantes v ON v.id = i.variante_id
          WHERE i.producto_id IN (${marcas}) AND i.por_revisar = 0
          ORDER BY i.producto_id, i.orden, i.id`,
      )
      .bind(...ids)
      .all<FilaImagen>(),
  ]);

  return coser(productos.results, variantes.results, opciones.results, imagenes.results, activo);
}

/** Un producto por su handle, o `null` si no existe o está archivado. */
export async function productoPorHandle(db: BaseD1, handle: string): Promise<Producto | null> {
  const activo = await miraElStock(db);

  const fila = await db
    .prepare(`SELECT ${CAMPOS} FROM productos WHERE handle = ? AND archivado_en IS NULL`)
    .bind(handle)
    .first<FilaProducto>();
  if (!fila) return null;

  const [variantes, opciones, imagenes] = await Promise.all([
    db
      .prepare(
        `SELECT producto_id, id_externo, titulo, precio, sku,
                ${sqlVendible(activo)} AS disponible
           FROM variantes v WHERE producto_id = ? ORDER BY orden, id`,
      )
      .bind(fila.id)
      .all<FilaVariante>(),
    db
      .prepare(
        `SELECT producto_id, nombre, valores FROM opciones WHERE producto_id = ? ORDER BY orden, id`,
      )
      .bind(fila.id)
      .all<FilaOpcion>(),
    db
      .prepare(
        `SELECT i.producto_id, i.clave, i.alt, v.titulo AS variante_titulo
           FROM imagenes i LEFT JOIN variantes v ON v.id = i.variante_id
          WHERE i.producto_id = ? AND i.por_revisar = 0 ORDER BY i.orden, i.id`,
      )
      .bind(fila.id)
      .all<FilaImagen>(),
  ]);

  return (
    coser([fila], variantes.results, opciones.results, imagenes.results, activo)[0] ?? null
  );
}

/**
 * ¿Existe este handle aunque esté archivado?
 *
 * Lo necesita la ficha para distinguir dos casos que NO son el mismo (R3):
 * un handle que nunca existió es un 404 legítimo; uno archivado es una URL que
 * Google ya indexó y que debe redirigir a su categoría, no desaparecer.
 */
export async function handleArchivado(
  db: BaseD1,
  handle: string,
): Promise<{ categoria: string } | null> {
  return db
    .prepare('SELECT categoria FROM productos WHERE handle = ? AND archivado_en IS NOT NULL')
    .bind(handle)
    .first<{ categoria: string }>();
}

/** Las filas planas, cosidas en la forma que esperan los componentes. */
function coser(
  productos: FilaProducto[],
  variantes: FilaVariante[],
  opciones: FilaOpcion[],
  imagenes: FilaImagen[],
  /* Si el inventario está activo, `producto.disponible` se DERIVA de sus
     variantes (ver abajo). Apagado, se lee la columna como siempre. */
  inventarioActivo: boolean,
): Producto[] {
  const porProducto = <T extends { producto_id: number }>(filas: T[]) => {
    const m = new Map<number, T[]>();
    for (const f of filas) {
      const lista = m.get(f.producto_id);
      if (lista) lista.push(f);
      else m.set(f.producto_id, [f]);
    }
    return m;
  };
  const vs = porProducto(variantes);
  const os = porProducto(opciones);
  const is = porProducto(imagenes);

  return productos.map((p) => {
    const variantesDe = (vs.get(p.id) ?? []).map(aVariante);
    return {
      handle: p.handle,
      titulo: p.titulo,
      vendor: p.vendor,
      descripcionHtml: p.descripcion_html,
      descripcionTexto: p.descripcion_texto,
      precio: p.precio,
      precioFormateado: formatearPrecio(p.precio),
      /* `productos.disponible` PASA A SER DERIVADA (G.1): 1 si alguna variante
         es vendible. Un producto cuyas tres variantes están agotadas se
         muestra «Agotado» entero, que es lo que debe pasar.
         La columna sigue existiendo y se mantiene al guardar (como ya hacía
         `productos.precio` desde 0001); lo que cambia es que al LEER manda lo
         que digan las variantes, porque es la única de las dos que no puede
         quedarse vieja.
         Con el inventario APAGADO se lee la columna tal cual, que es el
         comportamiento de hoy: si una variante quedó desincronizada de su
         producto en el respaldo de Shopify, el sitio sigue pintando
         exactamente lo que pintaba. Encender el inventario es lo único que
         cambia esto. */
      disponible: inventarioActivo
        ? variantesDe.some((v) => v.disponible)
        : p.disponible === 1,
      variantes: variantesDe,
      opciones: (os.get(p.id) ?? []).map(aOpcion),
      imagenes: (is.get(p.id) ?? []).map(aImagen),
      /* `undefined` y no `null`: el tipo de hoy es `coleccion?: string` y los
         componentes comprueban con `?.`. Un `null` pasaría los `if` y rompería
         el `.slice()` de algún sitio. */
      ...(p.coleccion ? { coleccion: p.coleccion } : {}),
      categoria: p.categoria,
      ...(p.destacado === 1 ? { destacado: true } : {}),
    };
  });
}

function aVariante(v: FilaVariante): Variante {
  return {
    /* El id de Shopify. Si falta (variante creada desde el panel, sin
       respaldo), se cae al título: es estable dentro del producto por el
       UNIQUE (producto_id, titulo) y nunca vacío, que es lo que el selector de
       la ficha necesita para funcionar. */
    id: v.id_externo ?? v.titulo,
    titulo: v.titulo,
    precio: v.precio,
    precioFormateado: formatearPrecio(v.precio),
    disponible: v.disponible === 1,
    sku: v.sku,
  };
}

function aOpcion(o: FilaOpcion): Opcion {
  /* `valores` es un JSON array y el orden importa (B.1). Si viniera corrupto,
     una opción vacía degrada a "sin resumen de opciones" en la tarjeta, que es
     preferible a que reviente la página entera del catálogo. */
  let valores: string[] = [];
  try {
    const leido = JSON.parse(o.valores);
    if (Array.isArray(leido)) valores = leido.filter((v): v is string => typeof v === 'string');
  } catch {
    /* se queda vacía a propósito */
  }
  return { nombre: o.nombre, valores };
}

function aImagen(i: FilaImagen): ImagenProducto {
  return {
    src: i.clave,
    alt: i.alt,
    /* El componente compara contra TÍTULOS de variante, así que la capa
       devuelve el título ya resuelto desde `variante_id`. Que el vínculo se
       guarde por id (y no por título) es lo que hace que renombrar un color no
       deje fotos huérfanas; que se LEA como título es lo que hace que
       `GaleriaProducto` siga funcionando sin cambios. */
    ...(i.variante_titulo ? { variante: i.variante_titulo } : {}),
  };
}
