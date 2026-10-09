/**
 * fotos-nombre.ts — la convención de nombres aprobada por el cliente, leída.
 *
 *     <handle>-<variante>-<rol>.jpg        aeropress-clear-morado-armado.jpg
 *     <handle>-<rol>.jpg                   chemex-detalle.jpg  (del producto)
 *     ...-<rol>-2.jpg                      varias del mismo rol
 *
 * (planes/kaffeeplatz-panel-admin.md, «CONVENCIÓN DE NOMBRES DE FOTOS»,
 * aprobada el 8 oct 2026.)
 *
 * PROPONE, NO DECIDE
 * ===========================================================================
 * Esto devuelve una SUGERENCIA. Quien la guarda es la dueña, con un clic: un
 * nombre mal escrito no debe publicar una foto en el color equivocado. Por eso
 * la foto entra en la base sin variante ni rol (`por_revisar = 1`, ver
 * migrations/0006_fotos.sql) y esta función solo decide qué aparece
 * preseleccionado en los desplegables.
 *
 * Y si el nombre no encaja, no pasa nada: la foto se sube igual y queda sin
 * asignar. Nombrar bien es un atajo, no un requisito para poder trabajar.
 *
 * COMO SE COMPARA
 * ---------------------------------------------------------------------------
 * Todo se normaliza igual que pide la convención: minúsculas, sin tildes ni ñ,
 * guiones en vez de espacios. Así «6 tazas» casa con `6-tazas` y «Extrayendo
 * café» (el nombre del rol `en-uso`) casa con `extrayendo-cafe` y también con
 * su primera palabra, `extrayendo`, que es como lo escribe el ejemplo
 * aprobado. Se prueba el rol al FINAL del nombre y la variante con lo que
 * queda en medio: el orden de la convención es fijo y leerlo así evita que
 * una variante que contenga la palabra de un rol se confunda.
 *
 * Es código puro, sin base ni DOM: se usa al pintar la página del panel.
 */

export interface VarianteNombre {
  id: number;
  titulo: string;
}

export interface RolNombre {
  id: string;
  nombre: string;
}

export interface Sugerencia {
  /** `null` = del producto en general; `undefined` = no se pudo deducir. */
  varianteId?: number | null;
  rol?: string;
  /** ¿El nombre siguió la convención entera? */
  encaja: boolean;
}

/** Minúsculas, sin tildes, ñ→n, todo lo que no sea letra o cifra → guion. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Las formas en que puede venir escrito un rol, de la más larga a la más corta. */
function alias(r: RolNombre): string[] {
  const nombre = normalizar(r.nombre);
  const primera = nombre.split('-')[0] ?? '';
  return [...new Set([normalizar(r.id), nombre, primera].filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
}

/**
 * Lee un nombre de fichero y propone variante y rol.
 *
 * Un producto de una sola variante («Default Title») no tiene variante que
 * proponer: todas sus fotos son del producto, y basta con el rol.
 */
export function sugerir(
  nombreFichero: string,
  handle: string,
  variantes: VarianteNombre[],
  roles: RolNombre[],
): Sugerencia {
  let resto = normalizar(nombreFichero.replace(/\.[a-z0-9]+$/i, ''));
  const h = normalizar(handle);
  if (resto !== h && !resto.startsWith(`${h}-`)) return { encaja: false };
  resto = resto.slice(h.length + 1);

  /* El sufijo numérico de «varias del mismo rol» (-2, -3...). Se quita solo si
     después queda algo: `chemex-6-tazas` no lleva sufijo, lleva un 6 que es
     parte de la variante, y no termina en número. */
  const sinSufijo = resto.replace(/-\d+$/, '');

  const reales = variantes.filter((v) => v.titulo !== 'Default Title');
  const porNombre = new Map(reales.map((v) => [normalizar(v.titulo), v.id]));

  for (const candidato of sinSufijo === resto ? [resto] : [sinSufijo, resto]) {
    for (const r of roles) {
      for (const a of alias(r)) {
        if (candidato !== a && !candidato.endsWith(`-${a}`)) continue;
        const medio = candidato.slice(0, Math.max(0, candidato.length - a.length - 1));
        if (!medio) return { varianteId: null, rol: r.id, encaja: true };
        const v = porNombre.get(medio);
        if (v !== undefined) return { varianteId: v, rol: r.id, encaja: true };
        /* El rol casó pero lo de en medio no es ninguna variante: se propone el
           rol solo. La variante queda por decidir, que es lo honesto. */
        return { rol: r.id, encaja: false };
      }
    }
    /* Sin rol reconocible: puede ser solo la variante (`<handle>-morado.jpg`). */
    const v = porNombre.get(candidato);
    if (v !== undefined) return { varianteId: v, encaja: false };
  }
  return { encaja: false };
}
