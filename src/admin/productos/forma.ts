/**
 * productos/forma.ts — leer el formulario de producto y validarlo.
 *
 * EL BORRADOR GUARDA LO QUE SE ESCRIBIO, TAL CUAL
 * ===========================================================================
 * El patrón bueno de A.5 (`newProspectPage` de 16bc) es re-pintar el
 * formulario con lo que la persona había tecleado. Para eso el borrador guarda
 * los CAMPOS COMO TEXTO —`precioTexto: '315.000'`, no `315000`— y la
 * conversión a número es un paso aparte. Si el precio no se entiende, el
 * formulario vuelve con «315,5» escrito donde estaba, y el error al lado; no
 * con el campo vacío ni con un número que ella no escribió.
 *
 * VALIDAR ES DEVOLVER EL ERROR, NUNCA ARREGLAR EN SILENCIO
 * ---------------------------------------------------------------------------
 * Hallazgo 4 de A.6 y R7: 16bc truncaba lo que pasaba del límite. Aquí ningún
 * campo se recorta, ningún precio se redondea y ningún nombre repetido se
 * renombra solo. Si algo no vale, el mensaje dice QUÉ hacer, en sus palabras
 * («El precio no puede ser 0»), no qué falló.
 */

/** Límites. Generosos: están para frenar un pegado accidental, no para molestar. */
export const MAX_TITULO = 120;
export const MAX_DESCRIPCION = 20_000;
export const MAX_NOMBRE_VARIANTE = 60;
export const MAX_FILAS = 40;
export const MAX_PRECIO = 100_000_000;

/** Una fila de «precio y opciones» tal como llegó del formulario. */
export interface FilaBorrador {
  /** Id de la variante en D1, o `null` si es una fila nueva. */
  id: number | null;
  titulo: string;
  precioTexto: string;
  aLaVenta: boolean;
  quitar: boolean;
}

export interface Borrador {
  titulo: string;
  descripcion: string;
  categoria: string;
  destacado: boolean;
  opcionNombre: string;
  /** Solo en el alta: la dirección escrita a mano, si la cambió. */
  handle: string;
  version: number;
  filas: FilaBorrador[];
}

/** Errores por nombre de campo. `general` para lo que no es de un campo. */
export type Errores = Record<string, string>;

const texto = (f: FormData, k: string) => String(f.get(k) ?? '');

/** El formulario → borrador. No valida nada: solo lee. */
export function leerFormulario(f: FormData): Borrador {
  const n = Math.min(Math.max(parseInt(texto(f, 'filas'), 10) || 0, 0), MAX_FILAS);
  const filas: FilaBorrador[] = [];
  for (let i = 0; i < n; i++) {
    const id = parseInt(texto(f, `v${i}_id`), 10);
    filas.push({
      id: Number.isInteger(id) && id > 0 ? id : null,
      titulo: texto(f, `v${i}_titulo`).trim(),
      precioTexto: texto(f, `v${i}_precio`).trim(),
      aLaVenta: f.get(`v${i}_venta`) === '1',
      quitar: f.get(`v${i}_quitar`) === '1',
    });
  }
  return {
    titulo: texto(f, 'titulo').trim(),
    /* La descripción NO se recorta por dentro: los saltos de línea son su
       formato (un párrafo por bloque). */
    descripcion: texto(f, 'descripcion'),
    categoria: texto(f, 'categoria'),
    destacado: f.get('destacado') === '1',
    opcionNombre: texto(f, 'opcion_nombre').trim(),
    handle: texto(f, 'handle').trim(),
    version: parseInt(texto(f, 'version'), 10) || 0,
    filas,
  };
}

/**
 * «315.000», «$315.000», «315000», «315 000» → 315000.
 *
 * En Colombia el punto separa miles, así que se quita. La COMA sería un
 * decimal, y el peso no tiene centavos en la práctica: en vez de redondear en
 * silencio, se devuelve el error. Un precio que se guarda distinto de como se
 * escribió es exactamente el tipo de cosa que no se descubre hasta que un
 * cliente lo reclama.
 */
export function leerPrecio(t: string): { ok: true; valor: number } | { ok: false; error: string } {
  const limpio = t.replace(/[\s$]/g, '').replace(/^COP/i, '');
  if (!limpio) return { ok: false, error: 'Escribe el precio.' };
  if (limpio.includes(',')) {
    return { ok: false, error: 'Escribe el precio sin centavos, por ejemplo 315.000.' };
  }
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(limpio)) {
    return { ok: false, error: 'El precio solo puede llevar números, por ejemplo 315.000.' };
  }
  const valor = parseInt(limpio.replace(/\./g, ''), 10);
  if (valor <= 0) return { ok: false, error: 'El precio no puede ser 0.' };
  if (valor > MAX_PRECIO) return { ok: false, error: 'Ese precio parece tener ceros de más.' };
  return { ok: true, valor };
}

/** Cuenta caracteres como los cuenta una persona (una tilde no es dos). */
const largo = (s: string) => [...s].length;

/** Valida lo común al alta y a la edición. */
export function validarBasicos(b: Borrador, categorias: string[]): Errores {
  const e: Errores = {};
  if (!b.titulo) e.titulo = 'El producto necesita un nombre.';
  else if (largo(b.titulo) > MAX_TITULO) {
    e.titulo = `El nombre es muy largo: tiene ${largo(b.titulo)} letras y el máximo es ${MAX_TITULO}. Acórtalo.`;
  }
  if (largo(b.descripcion) > MAX_DESCRIPCION) {
    e.descripcion = `La descripción es muy larga: tiene ${largo(b.descripcion)} letras y el máximo es ${MAX_DESCRIPCION}.`;
  }
  if (!categorias.includes(b.categoria)) e.categoria = 'Elige una categoría de la lista.';
  return e;
}

/** Lo que sale de validar las filas: los errores y, si no hay, lo que se guarda. */
export interface FilasValidadas {
  errores: Errores;
  quedan: { fila: FilaBorrador; precio: number }[];
}

/**
 * Valida las filas de «precio y opciones».
 *
 * `conHistorial` son los ids que no se pueden quitar (tienen movimientos de
 * inventario, reservas o paquetes): marcarlos para quitar es un error con
 * instrucciones, no un fallo de base de datos.
 */
export function validarFilas(
  b: Borrador,
  conHistorial: Map<number, string>,
): FilasValidadas {
  const e: Errores = {};
  const quedan: FilasValidadas['quedan'] = [];

  b.filas.forEach((f, i) => {
    if (f.quitar) {
      if (f.id !== null && conHistorial.has(f.id)) {
        e[`v${i}_quitar`] =
          `«${conHistorial.get(f.id)}» ya tiene ventas o unidades registradas en el inventario y no se puede quitar. ` +
          'Si ya no lo vendes, desmarca «A la venta».';
      }
      return;
    }
    const p = leerPrecio(f.precioTexto);
    if (!p.ok) e[`v${i}_precio`] = p.error;
    quedan.push({ fila: f, precio: p.ok ? p.valor : 0 });
  });

  if (!quedan.length) {
    e.general = 'El producto necesita al menos un precio. Desmarca «Quitar» en alguna fila.';
    return { errores: e, quedan };
  }

  /* Con una sola fila, el nombre es opcional: es un producto que no viene en
     colores ni tamaños. Con dos o más, cada una necesita el suyo, y distinto
     (el UNIQUE de 0001 lo exige, y la ficha no podría distinguirlas). */
  if (quedan.length > 1) {
    const vistos = new Map<string, number>();
    for (const { fila } of quedan) {
      const i = b.filas.indexOf(fila);
      if (!fila.titulo) {
        e[`v${i}_titulo`] = 'Escribe el nombre de esta opción, por ejemplo «Negro» o «6 tazas».';
        continue;
      }
      const clave = fila.titulo.toLocaleLowerCase('es');
      if (vistos.has(clave)) {
        e[`v${i}_titulo`] = `Ya hay otra opción llamada «${fila.titulo}». Cada una necesita un nombre distinto.`;
      } else vistos.set(clave, i);
    }
    if (!b.opcionNombre) {
      e.opcion_nombre = 'Escribe qué cambia entre las opciones: «Color», «Tamaño»…';
    }
  }
  b.filas.forEach((f, i) => {
    if (!f.quitar && largo(f.titulo) > MAX_NOMBRE_VARIANTE) {
      e[`v${i}_titulo`] = `Este nombre es muy largo (máximo ${MAX_NOMBRE_VARIANTE} letras).`;
    }
  });
  if (largo(b.opcionNombre) > MAX_NOMBRE_VARIANTE) {
    e.opcion_nombre = `Es muy largo (máximo ${MAX_NOMBRE_VARIANTE} letras).`;
  }
  return { errores: e, quedan };
}

/**
 * Las acciones del formulario que NO guardan: subir, bajar y añadir fila.
 *
 * Funcionan SIN JavaScript: son botones `submit` con `name="accion"`, el
 * servidor mueve la fila en el borrador y re-pinta el formulario con todo lo
 * escrito, sin tocar la base. Reordenar con flechas en vez de arrastrar es
 * también lo que se puede hacer con un dedo en un teléfono de 375 px.
 * Devuelve `true` si había algo que hacer.
 */
export function aplicarAccion(b: Borrador, accion: string): boolean {
  const m = /^(subir|bajar):(\d+)$/.exec(accion);
  if (m) {
    const i = parseInt(m[2]!, 10);
    const j = m[1] === 'subir' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || i >= b.filas.length || j >= b.filas.length) return false;
    [b.filas[i], b.filas[j]] = [b.filas[j]!, b.filas[i]!];
    return true;
  }
  if (accion === 'anadir' && b.filas.length < MAX_FILAS) {
    b.filas.push({ id: null, titulo: '', precioTexto: '', aLaVenta: true, quitar: false });
    return true;
  }
  return false;
}
