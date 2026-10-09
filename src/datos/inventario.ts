/**
 * inventario.ts — LA ÚNICA FRONTERA CON D1 PARA EL STOCK
 * ===========================================================================
 * Mismo papel que `catalogo.ts` hace con el catálogo, y por la misma razón
 * (regla F.1: "si en dos años hay que cambiar de D1 a otra cosa, se toca un
 * módulo"). Ningún `.astro` ni ninguna ruta del panel ejecuta SQL de stock:
 * todo sale de aquí.
 *
 * Diseño completo en la sección G de `planes/kaffeeplatz-panel-admin.md`.
 *
 * EL REPARTO, QUE ES EL DE SIEMPRE
 * ---------------------------------------------------------------------------
 *   inventario.ts            ← esto: la cara pública del stock, con try/catch
 *   consultas/inventario.ts  ← el SQL, sin resiliencia alrededor
 *
 * TODA LECTURA VA ENVUELTA; LAS ESCRITURAS NO
 * ---------------------------------------------------------------------------
 * Las lecturas pasan por `leer()` de `resiliencia.ts`, que nunca lanza: una
 * página no puede reventar porque la base tuvo un mal rato, y el plan pide
 * try/catch en TODA lectura. La forma de garantizarlo no es la disciplina: es
 * que la única puerta ya lo tenga.
 *
 * Las ESCRITURAS no se envuelven, y es deliberado: quien descuenta una unidad
 * necesita saber si se descontó. Un fallo silencioso al escribir stock es
 * exactamente el modo de fallo de R11 ("no se cae, miente"). Devuelven su
 * resultado y quien llama decide; el panel muestra el error, el webhook
 * registra y reintenta.
 */

/* El vocabulario y las dos lecturas de `ajustes`. */
import {
  type BaseD1Escritura,
  type StockVariante,
  type FilaInventario,
  type FilaMovimiento,
  type FilaCuadre,
  type FilaDespacho,
  type ResultadoReserva,
  type ResultadoConfirmacion,
  type ResultadoVentaWhatsapp,
  type MotivoMovimiento,
  type Autor,
  inventarioActivo,
  reservaMinutos,
} from './consultas/inventario-formas';
/* Las consultas. No escriben nunca. */
import {
  stockExacto,
  stockDeProducto,
  stockDeTodo,
  movimientosDeVariante,
  cuadre,
  variantesEnNegativo,
  despachosPendientes,
  itemsDeDespacho,
  compromisosDeProducto,
} from './consultas/inventario-leer';
/* Los cambios. Llevan su condición en el `WHERE`. */
import { reservar, confirmarPago, liberarReservas } from './consultas/inventario-escribir';
import { caducarVencidas } from './consultas/inventario-caducar';
/* Lo que hace Andreina a mano (todo en batch) y lo que leen sus pantallas. */
import {
  ajustarFisico,
  fijarFisico,
  venderPorWhatsapp,
  deshacerMovimiento,
  ponerALaVenta,
  cerrarDespacho,
  reabrirDespacho,
  nombrarDespacho,
  cambiarInterruptor,
  MINUTOS_PARA_DESHACER,
  type ResultadoAjuste,
} from './consultas/inventario-panel';
import {
  paquetes,
  paquete,
  movimientoContado,
  yaDeshecho,
  varianteDelPanel,
  ultimoCambioDelInterruptor,
  type PaqueteDespacho,
  type MovimientoContado,
} from './consultas/inventario-panel-leer';
import type { Producto } from './formas';
import { leer, type Lectura } from './resiliencia';

export type {
  StockVariante,
  FilaInventario,
  FilaMovimiento,
  FilaCuadre,
  FilaDespacho,
  ResultadoReserva,
  ResultadoConfirmacion,
  ResultadoVentaWhatsapp,
  MotivoMovimiento,
  Autor,
};

/**
 * El binding de D1 con capacidad de escritura, de `Astro.locals`.
 *
 * Mismo criterio que `base()` en `catalogo.ts`, incluido el mensaje: si el
 * binding no está es un error de CONFIGURACIÓN, no un fallo de la base, y
 * confundirlos haría que un despliegue mal configurado se viera como "D1 está
 * caído".
 */
function base(locals: unknown): BaseD1Escritura {
  const env = (locals as { runtime?: { env?: Record<string, unknown> } })?.runtime?.env;
  const db = env?.DB as BaseD1Escritura | undefined;
  if (!db?.prepare) {
    throw new Error(
      'El binding DB no está disponible. Comprueba `d1_databases` en wrangler.jsonc ' +
        'y que la base local exista (npm run d1:migrar && npm run d1:sembrar).',
    );
  }
  return db;
}

/* ------------------------------------------------------------------ lecturas */

/**
 * ¿Está el inventario activo? La mitigación de R13, y la vuelta atrás.
 *
 * Devuelve el booleano directamente y no una `Lectura`, porque ya tiene su
 * propio try/catch y su propio fallo seguro: si no se puede leer, devuelve
 * `false`, o sea "el sitio se comporta como antes del inventario". Envolverlo
 * en una `Lectura` obligaría a cada quien a decidir qué hacer con el fallo, y
 * esa decisión ya está tomada y es siempre la misma.
 */
export function estaActivoElInventario(locals: unknown): Promise<boolean> {
  try {
    return inventarioActivo(base(locals));
  } catch {
    /* Ni siquiera hay binding: como hoy. */
    return Promise.resolve(false);
  }
}

/** Los minutos de vida de una reserva, de `ajustes` (G.2). */
export function obtenerReservaMinutos(locals: unknown): Promise<Lectura<number>> {
  return leer(() => reservaMinutos(base(locals)));
}

/**
 * El stock EXACTO de las variantes de un producto, por handle.
 *
 * La clave del mapa es el id PÚBLICO de la variante: el mismo `Variante.id`
 * que ya trae `obtenerProducto`. Así la ficha cruza las dos cosas sin conocer
 * ningún id interno de D1.
 *
 * Descuenta solo las reservas vigentes (`vence_en > now`), no la columna: una
 * reserva vencida no bloquea la venta aunque el cron no haya pasado (G.2).
 */
export function obtenerStockDeProducto(
  locals: unknown,
  handle: string,
): Promise<Lectura<Map<string, StockVariante>>> {
  return leer(() => stockDeProducto(base(locals), handle));
}

/** El stock exacto de unas variantes por id interno. Para el checkout. */
export function obtenerStockExacto(
  locals: unknown,
  varianteIds: number[],
): Promise<Lectura<Map<number, StockVariante>>> {
  return leer(() => stockExacto(base(locals), varianteIds));
}

/** Las 30 variantes con su stock: la pantalla de inventario (G.6). */
export function obtenerInventario(locals: unknown): Promise<Lectura<FilaInventario[]>> {
  return leer(() => stockDeTodo(base(locals)));
}

/** El historial de una variante: "Qué pasó" (G.6). */
export function obtenerMovimientos(
  locals: unknown,
  varianteId: number,
  limite?: number,
): Promise<Lectura<FilaMovimiento[]>> {
  return leer(() => movimientosDeVariante(base(locals), varianteId, limite));
}

/**
 * EL CUADRE (G.4.4). Cero filas es lo correcto; una sola fila es un BUG.
 *
 * Lo llama el cron diario y el mosaico de avisos de `/admin`. Va envuelto en
 * `leer()` por la razón explícita del plan: "con try/catch alrededor del
 * recuento, porque un panel que no se pinta porque no pudo contar es un panel
 * inútil".
 */
export function obtenerCuadre(locals: unknown): Promise<Lectura<FilaCuadre[]>> {
  return leer(() => cuadre(base(locals)));
}

/** Las variantes en negativo, para el mosaico de avisos (G.4.4). */
export function obtenerNegativos(locals: unknown): Promise<Lectura<FilaInventario[]>> {
  return leer(() => variantesEnNegativo(base(locals)));
}

/** "Productos a despachar": lo pendiente, lo roto primero (G.6). */
export function obtenerDespachosPendientes(
  locals: unknown,
): Promise<Lectura<FilaDespacho[]>> {
  return leer(() => despachosPendientes(base(locals)));
}

/** Los artículos de un despacho de WhatsApp. */
export function obtenerItemsDeDespacho(
  locals: unknown,
  despachoId: number,
): Promise<Lectura<{ varianteId: number; cantidad: number; titulo: string; precioUnitario: number | null }[]>> {
  return leer(() => itemsDeDespacho(base(locals), despachoId));
}

/** Reservas activas y paquetes sin despachar: el aviso de archivar (G.4.6). */
export function obtenerCompromisos(
  locals: unknown,
  handle: string,
): Promise<Lectura<{ reservasActivas: number; despachosPendientes: number }>> {
  return leer(() => compromisosDeProducto(base(locals), handle));
}

/* ----------------------------------------------------------------- escrituras */

/**
 * Reservar las líneas de un checkout, o ninguna (G.3, paso 3).
 *
 * `ok: false` trae en `faltantes` qué no alcanzó, para decírselo al cliente
 * ANTES de pagar, que es lo único que importa (G.4.1).
 */
export function reservarParaPedido(
  locals: unknown,
  pedidoId: string,
  lineas: { varianteId: number; cantidad: number }[],
): Promise<ResultadoReserva> {
  return reservar(base(locals), pedidoId, lineas, 'panel');
}

/**
 * Confirmar un pago: baja el físico, cierra reservas, crea el despacho.
 *
 * `estado: 'repetido'` es el webhook duplicado y significa que NO se tocó
 * nada: el llamante debe devolver 200 sin más (G.3).
 */
export function confirmarPagoDePedido(
  locals: unknown,
  pedidoId: string,
  lineas: { varianteId: number; cantidad: number; titulo?: string }[],
): Promise<ResultadoConfirmacion> {
  return confirmarPago(base(locals), pedidoId, lineas, 'webhook');
}

/** Liberar las reservas de un pedido rechazado o cancelado (G.3). */
export function liberarReservasDePedido(
  locals: unknown,
  pedidoId: string,
  nota?: string,
): Promise<number> {
  return liberarReservas(base(locals), pedidoId, 'webhook', nota);
}

/** El barrido del cron. Devuelve cuántas caducó (G.2). */
export function caducarReservasVencidas(locals: unknown, limite?: number): Promise<number> {
  return caducarVencidas(base(locals), limite);
}

/* ------------------------------------------------------------ el panel (G.6) */

/**
 * Lo que usan las pantallas del panel, con el binding ya resuelto.
 *
 * UN OBJETO Y NO DIEZ FUNCIONES SUELTAS: cada acción del panel hace una o dos
 * cosas sobre la misma base, y repetir `(locals, ...)` en cada envoltorio
 * duplicaría esta fachada sin decir nada nuevo. Lanza si no hay binding (es
 * configuración, ver `base()`); quien la llama ya tiene su try/catch.
 *
 * Las ESCRITURAS no se envuelven (ver la cabecera: quien descuenta necesita
 * saber si se descontó). Las LECTURAS sí, con `leer()`: la pantalla se pinta
 * aunque una consulta falle, y dice cuál.
 */
export function inventarioDelPanel(locals: unknown) {
  const db = base(locals);
  return {
    /* escrituras: todas en un batch(), ver consultas/inventario-panel.ts */
    ajustar: (e: Parameters<typeof ajustarFisico>[1]) => ajustarFisico(db, e),
    fijar: (e: Parameters<typeof fijarFisico>[1]) => fijarFisico(db, e),
    venderPorWhatsapp: (e: Parameters<typeof venderPorWhatsapp>[1]) => venderPorWhatsapp(db, e),
    deshacer: (movimientoId: number) => deshacerMovimiento(db, movimientoId),
    ponerALaVenta: (varianteId: number, si: boolean) => ponerALaVenta(db, varianteId, si),
    cerrarDespacho: (id: number, accion: 'despachado' | 'anulado', nota?: string | null) =>
      cerrarDespacho(db, id, accion, nota),
    reabrirDespacho: (id: number) => reabrirDespacho(db, id),
    nombrarDespacho: (id: number, cliente: string) => nombrarDespacho(db, id, cliente),
    cambiarInterruptor: (activo: boolean) => cambiarInterruptor(db, activo),
    /* lecturas */
    activo: () => inventarioActivo(db),
    todo: () => leer(() => stockDeTodo(db)),
    cuadre: () => leer(() => cuadre(db)),
    variante: (id: number) => leer(() => varianteDelPanel(db, id)),
    movimientos: (id: number, limite?: number) => leer(() => movimientosDeVariante(db, id, limite)),
    movimiento: (id: number) => leer(() => movimientoContado(db, id)),
    yaDeshecho: (m: { id: number; varianteId: number }) => leer(() => yaDeshecho(db, m)),
    paquetes: () => leer(() => paquetes(db)),
    paquete: (id: number) => leer(() => paquete(db, id)),
    ultimoCambioDelInterruptor: () => ultimoCambioDelInterruptor(db),
  };
}

export type InventarioDelPanel = ReturnType<typeof inventarioDelPanel>;
export type { PaqueteDespacho, MovimientoContado, ResultadoAjuste };
export { MINUTOS_PARA_DESHACER };

/* ------------------------------------------------------- el tope de cantidad */

/**
 * EL DATO QUE NECESITA EL TOPE DE CANTIDAD — conectado.
 * ===========================================================================
 * `src/scripts/topes.ts` es el ÚNICO sitio que decide cuántas unidades se
 * pueden pedir, y su `topeDe()` lee `stockDisponible` de la variante. Esto es
 * el lado de los datos: pone ese número en las variantes que ya trae la
 * página.
 *
 * ESTE FICHERO NO IMPORTA `topes.ts` NI AL CONTRARIO, A PROPÓSITO. `topes.ts`
 * es TypeScript puro sin DOM para que lo puedan importar el frontmatter de un
 * `.astro` y el navegador; si importara de aquí, arrastraría la capa de datos
 * al navegador. El dato viaja como número dentro de `Variante`, no como
 * dependencia.
 *
 * CON EL INVENTARIO APAGADO NO TOCA NADA, y eso es lo que mantiene la promesa
 * del interruptor (R13): sin `stockDisponible`, `topeDe()` cae en su valor de
 * siempre y el HTML sale idéntico, byte a byte (comprobado comparando las
 * páginas antes y después de esta fase).
 *
 * El "Agotado" con stock 0 NO sale de aquí: ya lo resuelve el SQL de
 * `consultas/productos.ts` (`sqlVendible`), que es la única fórmula de
 * disponibilidad del sitio. Esto solo añade el CUÁNTO para el tope.
 */

/** Unidades pedibles de una variante: lo vendible, nunca negativo, 0 si está retirada. */
function pedibles(s: StockVariante): number {
  /* `aLaVenta` apagado ⇒ 0, igual que una variante no disponible da 0 en
     `topeDe()`. Y nunca negativo: un stock en −1 es 0 unidades pedibles, no
     "menos una". */
  return s.aLaVenta ? Math.max(0, s.vendible) : 0;
}

/**
 * Los productos de una página, con `stockDisponible` en cada variante.
 *
 * Una sola consulta para todas las variantes (las 30, con el descuento EXACTO
 * de reservas vigentes de `stockDeTodo`), venga la página con un producto o
 * con veinticinco: la ficha la necesita para sus relacionados y el catálogo
 * para sus tarjetas.
 *
 * Inventario apagado, o cualquier fallo ⇒ devuelve EL MISMO ARRAY, sin copiar.
 * Ante la duda, como hoy: un fallo aquí no puede dejar a nadie sin poder
 * añadir al carrito, y la verdad la sigue diciendo el `WHERE` de la reserva.
 */
export async function conStock(locals: unknown, productos: Producto[]): Promise<Producto[]> {
  try {
    const db = base(locals);
    if (!(await inventarioActivo(db))) return productos;
    const stock = new Map<string, number>();
    for (const s of await stockDeTodo(db)) {
      stock.set(`${s.productoHandle}\u0000${s.idPublico}`, pedibles(s));
    }
    return productos.map((p) => ({
      ...p,
      variantes: p.variantes.map((v) => {
        const n = stock.get(`${p.handle}\u0000${v.id}`);
        return n === undefined ? v : { ...v, stockDisponible: n };
      }),
    }));
  } catch (fallo) {
    console.error(
      '[inventario] no se pudo leer el stock para los topes; se usa el tope de hoy:',
      fallo instanceof Error ? fallo.message : fallo,
    );
    return productos;
  }
}

/**
 * Los topes de UN producto, por id público de variante. Mapa vacío con el
 * inventario apagado. Para quien solo tenga un handle (el checkout de la fase
 * 2 del carrito); las páginas usan `conStock`, que deja el dato en su sitio.
 */
export async function topesPorVariante(
  locals: unknown,
  handle: string,
): Promise<Map<string, number>> {
  const topes = new Map<string, number>();
  try {
    const db = base(locals);
    if (!(await inventarioActivo(db))) return topes;
    for (const [idPublico, s] of await stockDeProducto(db, handle)) topes.set(idPublico, pedibles(s));
    return topes;
  } catch (fallo) {
    console.error(
      '[inventario] no se pudieron calcular los topes por variante; se usa el tope de hoy:',
      fallo instanceof Error ? fallo.message : fallo,
    );
    return new Map();
  }
}
