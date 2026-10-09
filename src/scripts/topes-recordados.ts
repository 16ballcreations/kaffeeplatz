/**
 * topes-recordados.ts — el stock que vio la ficha, para que /carrito lo sepa.
 * ===========================================================================
 *
 * EL HUECO QUE CIERRA
 * ---------------------------------------------------------------------------
 * Hay tres vias para meter unidades en el carrito: la ficha, la tarjeta del
 * catalogo y el `+` de /carrito. Las dos primeras leen de D1 en cada visita y
 * conocen el stock (`stockDisponible`, fase 9). /carrito NO: su catalogo sale
 * del contenido del build, que no sabe nada de stock, y sin esto su `+`
 * dejaria subir hasta el tope de sensatez (10) una variante de la que quedan 3.
 *
 * La solucion barata y local: cuando la ficha o la tarjeta registran un tope
 * QUE VIENE DEL STOCK, se apunta aqui. `carrito.ts` usa el menor entre lo que
 * registro la pagina y lo apuntado. Como solo se puede añadir algo al carrito
 * desde la ficha o la tarjeta, TODA linea del carrito tiene su tope apuntado
 * desde el momento en que entro.
 *
 * LO QUE NO ES: una garantia. El dato puede envejecer (se vendio otra unidad
 * por WhatsApp despues de que la persona viera la ficha). La garantia la da el
 * servidor al reservar, con la condicion en el `WHERE` (G.4.1): esto solo
 * evita que el carrito prometa lo que la tienda ya sabia que no tenia.
 *
 * POR QUE CADUCA
 * ---------------------------------------------------------------------------
 * Un tope apuntado hace una semana no dice nada de hoy, y si el stock SUBIO
 * (llego mercancia) dejaria a alguien sin poder pedir lo que si hay. Doce
 * horas: cubre una sesion de compra larga y un «lo pienso esta noche», y
 * despues manda el servidor.
 *
 * CON EL INVENTARIO APAGADO NO SE APUNTA NADA, y lo que hubiera se BORRA en
 * cuanto la ficha o la tarjeta pintan esa variante sin dato de stock. Asi
 * apagar el interruptor devuelve tambien el carrito al comportamiento de
 * siempre (R13), sin esperar a que caduque.
 *
 * Y COMO TODO ACCESO A `localStorage` DE ESTE SITIO, nunca lanza: en modo
 * privado o sin cuota se cae a memoria y sirve durante la visita.
 */

const CLAVE = 'kp.topes.v1';
const VIGENCIA_MS = 12 * 60 * 60 * 1000;

/** Lo apuntado: clave `handle\u0000varianteId` → [tope, cuando (ms)]. */
type Apuntes = Record<string, [number, number]>;

let enMemoria: Apuntes | null = null;

function clave(handle: string, varianteId: string): string {
  return `${handle}\u0000${varianteId}`;
}

function leer(): Apuntes {
  if (enMemoria) return enMemoria;
  try {
    const crudo = JSON.parse(window.localStorage.getItem(CLAVE) ?? '{}') as unknown;
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return {};
    /* Nada se da por bueno: un apunte que no sea [entero >= 0, numero] se
       ignora, igual que `sanear()` hace con las lineas del carrito. */
    const limpio: Apuntes = {};
    for (const [k, v] of Object.entries(crudo as Record<string, unknown>)) {
      if (
        Array.isArray(v) &&
        Number.isInteger(v[0]) &&
        (v[0] as number) >= 0 &&
        typeof v[1] === 'number'
      ) {
        limpio[k] = [v[0] as number, v[1]];
      }
    }
    return limpio;
  } catch {
    return {};
  }
}

function escribir(apuntes: Apuntes): void {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(apuntes));
    enMemoria = null;
  } catch {
    enMemoria = apuntes;
  }
}

/**
 * Apunta (o borra) los topes que una pagina VIVA acaba de pintar.
 *
 * `deStock: true` ⇒ el tope sale del inventario: se apunta. `false` ⇒ esa
 * pagina pinto la variante SIN dato de stock (inventario apagado): se borra lo
 * que hubiera. Solo escribe si algo cambia, para no tocar el almacen en cada
 * carga de una pagina con 25 tarjetas.
 */
export function recordarTopes(
  entradas: Iterable<{ handle: string; varianteId: string; tope: number; deStock?: boolean }>,
): void {
  const apuntes = leer();
  const ahora = Date.now();
  let cambio = false;
  for (const e of entradas) {
    const k = clave(e.handle, e.varianteId);
    const n = Math.floor(e.tope);
    if (e.deStock && Number.isFinite(n) && n >= 0) {
      apuntes[k] = [n, ahora];
      cambio = true;
    } else if (!e.deStock && k in apuntes) {
      delete apuntes[k];
      cambio = true;
    }
  }
  /* De paso, lo caducado se va: el almacen no crece sin fin. */
  for (const [k, [, cuando]] of Object.entries(apuntes)) {
    if (ahora - cuando > VIGENCIA_MS) {
      delete apuntes[k];
      cambio = true;
    }
  }
  if (cambio) escribir(apuntes);
}

/** El tope apuntado de una variante, si hay uno vigente. */
export function topeRecordado(handle: string, varianteId: string): number | undefined {
  const a = leer()[clave(handle, varianteId)];
  if (!a) return undefined;
  return Date.now() - a[1] > VIGENCIA_MS ? undefined : a[0];
}
