/**
 * diario-categorias.ts — el POST de /admin/categorias, sin el HTML.
 *
 * Una pantalla, cuatro acciones (`accion`): guardar una categoría, guardar un
 * tipo de foto, crear uno y borrarlo. Todas por formulario normal, sin
 * JavaScript, con 303 al terminar bien y repintando con el error y lo escrito
 * cuando no.
 *
 * BORRAR UN TIPO DE FOTO PIDE UNA CASILLA, NO UN `confirm()`
 * ===========================================================================
 * A.5 lo señala como «malo» en 16bc: un confirmar que solo existe en el
 * navegador no existe para una petición directa ni sin JavaScript. Aquí la
 * confirmación es un campo del formulario (`confirmar=si`) que el SERVIDOR
 * exige. Y además solo se puede borrar un tipo que ninguna foto usa — la
 * condición va en el `WHERE` del DELETE (`borrarRol`).
 *
 * Las categorías NO se crean ni se borran desde aquí: su `id` vive dentro de
 * cada producto y artículo, y el encargo de la fase 7 es editarlas (nombre,
 * orden, descripción). Crear una categoría nueva tiene consecuencias en los
 * filtros de la tienda que merecen su propia pantalla.
 */

import type { BaseAdmin } from './base';
import { aHandle } from './diario-validar';
import { invalidarRutas } from './diario-cache';
import { PREFIJO_DIARIO } from '../datos/categorias';
import {
  guardarCategoria,
  guardarRol,
  crearRol,
  borrarRol,
  productosDeCategoria,
  type Edicion,
} from '../datos/consultas/diario-categorias';

export const TOPE_NOMBRE = 60;
export const TOPE_DESCRIPCION = 300;

/** Un fallo para repintar: en qué fila, qué escribió y qué decir. */
export interface Fallo {
  /** 'categoria:<id>', 'rol:<id>' o 'rol-nuevo'. */
  fila: string;
  escrito: Edicion;
  mensaje: string;
}

export type DesenlaceCategorias = { tipo: 'redirigir'; a: string } | { tipo: 'repintar'; fallo: Fallo; estado: 400 | 409 };

export const MENSAJES_OK: Record<string, string> = {
  categoria: 'Categoría guardada.',
  rol: 'Tipo de foto guardado.',
  'rol-creado': 'Tipo de foto añadido. Ya se puede elegir al clasificar fotos.',
  'rol-borrado': 'Tipo de foto borrado.',
};

const CAMBIADO =
  'Esto se cambió en otra pestaña o teléfono justo antes, así que no se guardó. Recarga la página para ver cómo quedó y vuelve a intentarlo.';

const texto = (f: FormData, n: string) => {
  const v = f.get(n);
  return typeof v === 'string' ? v.trim() : '';
};

/** Lee `<prefijo>nombre`, `<prefijo>orden` y `<prefijo>descripcion`. */
function leerEdicion(f: FormData, prefijo = ''): Edicion {
  const orden = Number.parseInt(texto(f, `${prefijo}orden`), 10);
  return {
    nombre: texto(f, `${prefijo}nombre`),
    orden: Number.isFinite(orden) ? orden : Number.NaN,
    descripcion: texto(f, `${prefijo}descripcion`).replace(/\r\n?/g, '\n'),
  };
}

/** El mensaje de error, o `null` si está bien. */
export function validarEdicion(e: Edicion): string | null {
  if (!e.nombre) return 'Escribe un nombre.';
  if (e.nombre.length > TOPE_NOMBRE) return `El nombre es demasiado largo: caben ${TOPE_NOMBRE} letras.`;
  if (!Number.isInteger(e.orden) || e.orden < 0 || e.orden > 999)
    return 'El orden tiene que ser un número entero entre 0 y 999 (el 1 sale primero).';
  if (e.descripcion.length > TOPE_DESCRIPCION)
    return `La descripción es demasiado larga: caben ${TOPE_DESCRIPCION} letras.`;
  return null;
}

/** Procesa el POST. Lanza solo si la base falla (la página lo atrapa). */
export async function procesarCategorias(
  db: BaseAdmin,
  f: FormData,
  origen: URL,
): Promise<DesenlaceCategorias> {
  const accion = texto(f, 'accion');
  const id = texto(f, 'id');
  const base = '/admin/categorias';

  if (accion === 'guardar-categoria' || accion === 'guardar-rol') {
    const esRol = accion === 'guardar-rol';
    const fila = `${esRol ? 'rol' : 'categoria'}:${id}`;
    const nuevo = leerEdicion(f);
    const visto = leerEdicion(f, 'visto_');
    const error = validarEdicion(nuevo);
    if (error) return { tipo: 'repintar', fallo: { fila, escrito: nuevo, mensaje: error }, estado: 400 };

    const ok = esRol ? await guardarRol(db, id, nuevo, visto) : await guardarCategoria(db, id, nuevo, visto);
    if (!ok) return { tipo: 'repintar', fallo: { fila, escrito: nuevo, mensaje: CAMBIADO }, estado: 409 };

    if (!esRol) {
      /* Lo que enseña el nombre de esta categoría en la tienda. Las fichas de
         producto lo pintan en las migas, así que van también. */
      const caminos = id.startsWith(PREFIJO_DIARIO)
        ? ['/diario']
        : ['/', '/catalogo', ...(await productosDeCategoria(db, id)).map((h) => `/producto/${h}`)];
      await invalidarRutas(origen, caminos);
    }
    return { tipo: 'redirigir', a: `${base}?ok=${esRol ? 'rol' : 'categoria'}#${esRol ? 'rol' : 'cat'}-${encodeURIComponent(id)}` };
  }

  if (accion === 'crear-rol') {
    const nuevo = leerEdicion(f);
    const error = validarEdicion(nuevo);
    const fila = 'rol-nuevo';
    if (error) return { tipo: 'repintar', fallo: { fila, escrito: nuevo, mensaje: error }, estado: 400 };
    /* El id sale del nombre, con la misma regla que las direcciones y que la
       convención de nombres de fotos (`<handle>-<variante>-<rol>.jpg`): así
       «En uso» es `en-uso` y el nombre del fichero se puede deducir. */
    const nuevoId = aHandle(nuevo.nombre);
    if (!nuevoId) {
      return { tipo: 'repintar', fallo: { fila, escrito: nuevo, mensaje: 'El nombre tiene que llevar alguna letra o número.' }, estado: 400 };
    }
    if (!(await crearRol(db, nuevoId, nuevo.nombre, nuevo.orden))) {
      return { tipo: 'repintar', fallo: { fila, escrito: nuevo, mensaje: 'Ya hay un tipo de foto con ese nombre.' }, estado: 409 };
    }
    return { tipo: 'redirigir', a: `${base}?ok=rol-creado#rol-${encodeURIComponent(nuevoId)}` };
  }

  if (accion === 'borrar-rol') {
    const fila = `rol:${id}`;
    const escrito = leerEdicion(f, 'visto_');
    if (texto(f, 'confirmar') !== 'si') {
      return { tipo: 'repintar', fallo: { fila, escrito, mensaje: 'Marca la casilla para confirmar que quieres borrarlo.' }, estado: 400 };
    }
    if (!(await borrarRol(db, id))) {
      return {
        tipo: 'repintar',
        fallo: { fila, escrito, mensaje: 'No se borró: alguna foto usa este tipo (o ya lo habían borrado).' },
        estado: 409,
      };
    }
    return { tipo: 'redirigir', a: `${base}?ok=rol-borrado#roles` };
  }

  return { tipo: 'redirigir', a: base };
}
