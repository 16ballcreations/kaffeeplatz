/**
 * productos/guardar.ts — del borrador validado a un guardado, y lo que se le
 * dice a Andreina si no se pudo.
 *
 * Las páginas del panel quedan finas (leen el formulario, llaman aquí, pintan
 * o redirigen) y la lógica que hay que poder leer de una vez —qué cuenta como
 * cambio, qué se audita, qué pasa si otra pestaña guardó antes— está en un
 * solo sitio.
 */

import type { BaseAdmin } from '../base';
import type { BaseD1Escritura } from '../../datos/consultas/inventario-formas';
import { guardarProducto, type VarianteAGuardar } from '../../datos/consultas/productos-escribir';
import { formatearPrecio } from '../../datos/formas';
import type { ProductoPanel } from './leer';
import { validarBasicos, validarFilas, leerPrecio, type Borrador, type Errores } from './forma';
import { descripcionAGuardar, htmlATexto } from './texto';

/**
 * El binding del panel, visto como lo que necesitan las escrituras.
 *
 * `BaseAdmin` declara `batch` como opcional (la fase 4 no lo usaba). Aquí es
 * imprescindible —es toda la atomicidad del guardado—, así que se comprueba
 * en vez de suponerlo: sin `batch`, mejor no escribir que escribir a medias.
 */
export function baseEscritura(db: BaseAdmin): BaseD1Escritura {
  if (typeof db.batch !== 'function') {
    throw new Error('El binding DB no ofrece batch(): no se puede guardar de forma atómica.');
  }
  return db as unknown as BaseD1Escritura;
}

/** El título interno de «este producto no viene en colores ni tamaños» (B.1). */
export const SIN_VARIANTES = 'Default Title';

export type ResultadoEdicion =
  | { ok: true; sinCambios: boolean }
  | { ok: false; estado: 400 | 409 | 500; errores: Errores };

/** La foto de un producto antes de guardar, para `auditoria.antes`. */
export function instantanea(p: ProductoPanel) {
  return {
    titulo: p.titulo,
    descripcionHtml: p.descripcionHtml,
    categoria: p.categoria,
    destacado: p.destacado,
    precio: p.precio,
    disponible: p.disponible,
    archivadoEn: p.archivadoEn,
    version: p.version,
    opcion: p.opcionNombre || null,
    variantes: p.variantes.map((v) => ({
      id: v.id,
      titulo: v.titulo,
      precio: v.precio,
      disponible: v.disponible,
      orden: v.orden,
    })),
  };
}

/** El borrador inicial del formulario de edición: lo guardado, como texto. */
export function borradorDesde(p: ProductoPanel): Borrador {
  return {
    titulo: p.titulo,
    descripcion: htmlATexto(p.descripcionHtml),
    categoria: p.categoria,
    destacado: p.destacado,
    opcionNombre: p.opcionNombre,
    handle: p.handle,
    version: p.version,
    filas: p.variantes.map((v) => ({
      id: v.id,
      /* 'Default Title' no se enseña: para ella es «sin nombre», no un nombre. */
      titulo: v.titulo === SIN_VARIANTES ? '' : v.titulo,
      precioTexto: v.precio.toLocaleString('es-CO'),
      aLaVenta: v.disponible,
      quitar: false,
    })),
  };
}

/** Guarda la edición de un producto. Todo lo que puede salir mal, explicado. */
export async function guardarEdicion(
  db: BaseD1Escritura,
  actual: ProductoPanel,
  b: Borrador,
  categorias: string[],
): Promise<ResultadoEdicion> {
  const historial = new Map(
    actual.variantes.filter((v) => v.conHistorial).map((v) => [v.id, v.titulo] as const),
  );
  const filas = validarFilas(b, historial);
  const errores: Errores = { ...validarBasicos(b, categorias), ...filas.errores };

  /* Toda variante guardada tiene que venir en el formulario. Si falta alguna,
     el formulario no es el que pintó el panel (o está cortado), y guardar
     dejaría variantes con un orden que nadie eligió. Mejor no guardar. */
  const enFormulario = new Set(b.filas.map((f) => f.id).filter((id): id is number => id !== null));
  if (actual.variantes.some((v) => !enFormulario.has(v.id))) {
    errores.general = 'El formulario llegó incompleto. Recarga la página y vuelve a intentarlo.';
  }
  if (Object.keys(errores).length) return { ok: false, estado: 400, errores };

  /* La comprobación de `version` ANTES del batch da el mensaje bueno en el caso
     normal (dos pestañas). La carrera de verdad la cubre el cerrojo dentro del
     batch: ver la cabecera de `productos-escribir.ts`. */
  if (b.version !== actual.version) return { ok: false, estado: 409, errores: {} };

  const porId = new Map(actual.variantes.map((v) => [v.id, v] as const));
  const unica = filas.quedan.length === 1;
  const variantes: VarianteAGuardar[] = filas.quedan.map(({ fila, precio }) => ({
    id: fila.id !== null && porId.has(fila.id) ? fila.id : null,
    titulo: fila.titulo || SIN_VARIANTES,
    precio,
    disponible: fila.aLaVenta,
  }));
  const quitar = b.filas
    .filter((f) => f.quitar && f.id !== null && porId.has(f.id))
    .map((f) => ({ id: f.id!, antes: porId.get(f.id!)! }));
  const renombradas = variantes
    .filter((v) => v.id !== null && porId.get(v.id)!.titulo !== v.titulo)
    .map((v) => v.id!);

  const desc = descripcionAGuardar(b.descripcion, actual.descripcionHtml);
  /* Con una sola variante y sin nombre propio no hay opción que enseñar. Con
     una sola variante CON nombre (el «Color: Negro» del dripper de loto) se
     conserva, porque es lo que la ficha usa para decir de qué color es. */
  const opcionNombre =
    !unica || (variantes[0]!.titulo !== SIN_VARIANTES && b.opcionNombre) ? b.opcionNombre : null;

  const ordenAntes = actual.variantes.map((v) => v.id).filter((id) => !quitar.some((q) => q.id === id));
  const ordenAhora = variantes.map((v) => v.id).filter((id): id is number => id !== null);
  const reordenado = ordenAntes.join(',') !== ordenAhora.join(',');

  const cambios = describirCambios(actual, b, variantes, quitar.map((q) => q.antes.titulo), desc.cambio);
  if (reordenado) cambios.push('orden de las opciones');
  if ((opcionNombre ?? '') !== actual.opcionNombre) cambios.push('nombre de la opción');
  if (!cambios.length) return { ok: true, sinCambios: true };

  const r = await guardarProducto(db, {
    productoId: actual.id,
    versionEsperada: actual.version,
    datos: {
      titulo: b.titulo,
      descripcionHtml: desc.html,
      descripcionTexto: desc.texto,
      categoria: b.categoria,
      destacado: b.destacado,
    },
    variantes,
    quitar,
    renombradas,
    opcionNombre,
    antes: instantanea(actual),
    nota: cambios.join('; '),
    reordenado,
  });
  if (r.ok) return { ok: true, sinCambios: false };

  switch (r.motivo) {
    case 'conflicto':
      return { ok: false, estado: 409, errores: {} };
    case 'con-historial':
      return {
        ok: false,
        estado: 400,
        errores: {
          general:
            'Una de las opciones que quieres quitar acaba de tener una venta o un movimiento de inventario, ' +
            'así que ya no se puede quitar. No se guardó nada. Desmarca «Quitar» y, si ya no la vendes, desmarca «A la venta».',
        },
      };
    case 'nombre-repetido':
      return {
        ok: false,
        estado: 400,
        errores: { general: 'Dos opciones quedaron con el mismo nombre. Cambia uno y vuelve a guardar.' },
      };
    default:
      return {
        ok: false,
        estado: 500,
        errores: { general: 'No se pudo guardar en este momento. No se perdió nada de lo que escribiste: vuelve a intentarlo en un minuto.' },
      };
  }
}

/**
 * Lo que cambió, en palabras: «precio de Morado: $315.000 → $300.000».
 *
 * Va a `auditoria.nota` y es lo que se lee en «Últimos cambios». El JSON de
 * `antes` guarda el estado completo; esto es el resumen que una persona lee.
 */
function describirCambios(
  actual: ProductoPanel,
  b: Borrador,
  variantes: VarianteAGuardar[],
  quitadas: string[],
  descripcionCambio: boolean,
): string[] {
  const c: string[] = [];
  if (b.titulo !== actual.titulo) c.push(`nombre: «${actual.titulo}» → «${b.titulo}»`);
  if (descripcionCambio) c.push('descripción');
  if (b.categoria !== actual.categoria) c.push(`categoría: ${actual.categoria} → ${b.categoria}`);
  if (b.destacado !== actual.destacado) c.push(b.destacado ? 'destacado en la portada' : 'ya no destacado');
  const nombre = (t: string) => (t === SIN_VARIANTES ? 'el producto' : t);
  for (const v of variantes) {
    const a = v.id !== null ? actual.variantes.find((x) => x.id === v.id) : undefined;
    if (!a) {
      c.push(`nueva opción «${v.titulo}» a ${formatearPrecio(v.precio)}`);
      continue;
    }
    if (a.titulo !== v.titulo) c.push(`«${nombre(a.titulo)}» ahora se llama «${nombre(v.titulo)}»`);
    if (a.precio !== v.precio) {
      c.push(`precio de ${nombre(v.titulo)}: ${formatearPrecio(a.precio)} → ${formatearPrecio(v.precio)}`);
    }
    if (a.disponible !== v.disponible) {
      c.push(`${nombre(v.titulo)} ${v.disponible ? 'a la venta' : 'retirado de la venta'}`);
    }
  }
  for (const q of quitadas) c.push(`quitada la opción «${q}»`);
  return c;
}

/**
 * Para el aviso de conflicto: en qué se diferencia lo que hay guardado AHORA de
 * lo que ella escribió. Así decide con datos si vuelve a guardar lo suyo.
 */
export function diferenciasConLoGuardado(ahora: ProductoPanel, b: Borrador): string[] {
  const d: string[] = [];
  if (ahora.titulo !== b.titulo) d.push(`El nombre guardado es «${ahora.titulo}».`);
  if (htmlATexto(ahora.descripcionHtml).trim() !== b.descripcion.replace(/\r\n?/g, '\n').trim()) {
    d.push('La descripción guardada es distinta de la tuya.');
  }
  if (ahora.categoria !== b.categoria) d.push(`La categoría guardada es otra (${ahora.categoria}).`);
  for (const v of ahora.variantes) {
    const f = b.filas.find((x) => x.id === v.id);
    const nombre = v.titulo === SIN_VARIANTES ? 'El producto' : `«${v.titulo}»`;
    if (!f) {
      d.push(`${nombre} es una opción nueva que tú no tienes en pantalla.`);
      continue;
    }
    const p = leerPrecio(f.precioTexto);
    if (p.ok && p.valor !== v.precio) d.push(`${nombre} tiene guardado el precio ${formatearPrecio(v.precio)}.`);
    if (f.aLaVenta !== v.disponible) d.push(`${nombre} está guardado como ${v.disponible ? 'a la venta' : 'retirado'}.`);
  }
  for (const f of b.filas) {
    if (f.id !== null && !ahora.variantes.some((v) => v.id === f.id)) {
      d.push(`«${f.titulo || 'Una opción'}» ya no existe: la quitaron desde la otra pantalla.`);
    }
  }
  return d;
}

/**
 * Tras un conflicto, deja el borrador listo para volver a guardar sobre lo que
 * hay AHORA: toma la `version` actual, convierte en «nueva» la fila de una
 * variante que la otra pestaña quitó, y añade al final las que la otra pestaña
 * creó (con sus datos guardados), para que el siguiente guardado no las borre
 * sin que ella lo vea. Nada de lo que escribió se descarta.
 */
export function reconciliar(b: Borrador, ahora: ProductoPanel): void {
  b.version = ahora.version;
  const existen = new Set(ahora.variantes.map((v) => v.id));
  for (const f of b.filas) if (f.id !== null && !existen.has(f.id)) f.id = null;
  for (const v of ahora.variantes) {
    if (!b.filas.some((f) => f.id === v.id)) {
      b.filas.push({
        id: v.id,
        titulo: v.titulo === SIN_VARIANTES ? '' : v.titulo,
        precioTexto: v.precio.toLocaleString('es-CO'),
        aLaVenta: v.disponible,
        quitar: false,
      });
    }
  }
}
