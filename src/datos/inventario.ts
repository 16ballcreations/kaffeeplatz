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
import {
  reservar,
  confirmarPago,
  liberarReservas,
  caducarVencidas,
  venderPorWhatsapp,
  ajustarFisico,
  ponerALaVenta,
  cerrarDespacho,
} from './consultas/inventario-escribir';
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

/** Descontar por una venta hablada. `ok: false` ⇒ el panel PREGUNTA (G.4.2). */
export function descontarPorWhatsapp(
  locals: unknown,
  entrada: {
    varianteId: number;
    cantidad?: number;
    cliente?: string | null;
    nota?: string | null;
    precioUnitario?: number | null;
    despachoIdExistente?: number | null;
    forzar?: boolean;
  },
): Promise<ResultadoVentaWhatsapp> {
  return venderPorWhatsapp(base(locals), entrada, 'panel');
}

/** Cargar, devolver o corregir el físico. `ajuste` exige nota (G.6). */
export function ajustarStock(
  locals: unknown,
  entrada: {
    varianteId: number;
    delta: number;
    motivo: Extract<MotivoMovimiento, 'entrada' | 'devolucion' | 'ajuste'>;
    nota?: string | null;
  },
): Promise<{ ok: boolean; error?: string; fisico?: number }> {
  return ajustarFisico(base(locals), entrada, 'panel');
}

/** El interruptor manual "A la venta / Retirado". No toca el stock (G.1). */
export function cambiarALaVenta(
  locals: unknown,
  varianteId: number,
  aLaVenta: boolean,
): Promise<boolean> {
  return ponerALaVenta(base(locals), varianteId, aLaVenta);
}

/** «Ya salió» o «Anular». Anular devuelve el físico (G.4.3). */
export function marcarDespacho(
  locals: unknown,
  despachoId: number,
  accion: 'despachado' | 'anulado',
  nota?: string,
): Promise<boolean> {
  return cerrarDespacho(base(locals), despachoId, accion, 'panel', nota);
}

/* ------------------------------------------------------- el tope de cantidad */

/**
 * EL DATO QUE NECESITA EL TOPE DE CANTIDAD — y cómo se conecta.
 * ===========================================================================
 * `src/scripts/topes.ts` (de otro trabajo en curso) ya dejó el enganche hecho
 * y documentado: su `topeDe()` es el ÚNICO sitio que decide cuántas unidades
 * se pueden pedir, y su interfaz `VarianteTopable` espera recibir el stock
 * disponible. Esta función es el lado de los datos de ese enganche.
 *
 * ESTE FICHERO NO IMPORTA `topes.ts` NI AL CONTRARIO, A PROPÓSITO. `topes.ts`
 * es TypeScript puro sin DOM para que lo puedan importar el frontmatter de un
 * `.astro` y el navegador; si importara de aquí, arrastraría la capa de datos
 * al navegador. El dato viaja como número, no como dependencia.
 *
 * CÓMO SE CONECTA (lo hace quien integre, no este trabajo):
 *
 *   1. En la ficha, junto al producto que ya se lee:
 *        const stock = await obtenerStockDeProducto(Astro.locals, handle);
 *        const topes = await topesPorVariante(Astro.locals, handle);
 *   2. `topes` es un Map de `Variante.id` → unidades vendibles, con la MISMA
 *      clave que ya usa `Variante.id`, así que se cruza sin ids internos.
 *   3. `topes.ts` recibe ese número en `VarianteTopable.stockDisponible` y su
 *      `topeDe()` pasa a ser:
 *        return Math.max(0, Math.min(TOPE_SENSATEZ, v.stockDisponible ?? TOPE_SENSATEZ));
 *      El `?? TOPE_SENSATEZ` es lo que hace que, con el inventario APAGADO o
 *      sin dato, el tope sea exactamente el de hoy.
 *
 * CON EL INVENTARIO APAGADO DEVUELVE UN MAPA VACÍO, y eso es lo que mantiene
 * la promesa del interruptor: sin dato de stock, `topeDe()` cae en su valor de
 * hoy y el selector se comporta igual que antes de esta fase.
 */
export async function topesPorVariante(
  locals: unknown,
  handle: string,
): Promise<Map<string, number>> {
  const vacio = new Map<string, number>();
  try {
    const db = base(locals);
    if (!(await inventarioActivo(db))) return vacio;
    const stock = await stockDeProducto(db, handle);
    const topes = new Map<string, number>();
    for (const [idPublico, s] of stock) {
      /* `aLaVenta` apagado ⇒ 0, igual que hoy una variante no disponible da 0
         en `topeDe()`. Y nunca negativo: un stock en −1 es 0 unidades
         pedibles, no "menos una". */
      topes.set(idPublico, s.aLaVenta ? Math.max(0, s.vendible) : 0);
    }
    return topes;
  } catch (fallo) {
    /* Igual que el interruptor: ante la duda, como hoy. Un fallo aquí NO puede
       dejar la ficha sin poder añadir al carrito. */
    console.error(
      '[inventario] no se pudieron calcular los topes por variante; se usa el tope de hoy:',
      fallo instanceof Error ? fallo.message : fallo,
    );
    return vacio;
  }
}
