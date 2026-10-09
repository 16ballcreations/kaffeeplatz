/**
 * productos/guardar.ts — del borrador validado a un guardado, bloque a bloque,
 * y lo que se le dice a Andreina si no se pudo.
 *
 * LA FICHA SE GUARDA POR BLOQUES
 * ===========================================================================
 * Pedido del cliente (9 oct 2026): «producto → fotos generales / versión 1 →
 * fotos propias / versión 2 → fotos propias, cada uno con su botón de
 * guardado independiente». Así que cada bloque tiene su borrador, su
 * validación, su cerrojo (migrations/0009) y su guardado:
 *
 *   «Producto»        `guardarBloqueProducto`  (aquí)
 *   una versión       `guardarBloqueVersion`   (aquí)
 *   «Versiones»       `guardarBloqueVersiones` (guardar-versiones.ts)
 *
 * Las páginas quedan finas (leen el formulario, llaman aquí, pintan o
 * redirigen) y lo que hay que poder leer de una vez —qué cuenta como cambio,
 * qué se audita, qué pasa si otra pestaña guardó antes— está en un sitio.
 */

import type { BaseAdmin } from '../base';
import type { BaseD1Escritura } from '../../datos/consultas/inventario-formas';
import { guardarDatosProducto, type MotivoFallo } from '../../datos/consultas/productos-escribir';
import { guardarVariante } from '../../datos/consultas/variantes-escribir';
import { formatearPrecio } from '../../datos/formas';
import type { ProductoPanel, VariantePanel } from './leer';
import { validarBasicos, leerPrecio, MAX_NOMBRE_VARIANTE, type Borrador, type Errores } from './forma';
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

/** Cómo se llama una versión en los mensajes. */
export const nombreVersion = (t: string) => (t === SIN_VARIANTES ? 'el producto' : `«${t}»`);

export type ResultadoBloque =
  | { ok: true; sinCambios: boolean }
  | { ok: false; estado: 400 | 409 | 500; errores: Errores; desaparecida?: boolean };

/** Las sentencias de fotos de un bloque, ya construidas, y qué hacen. */
export interface FotosDelBloque {
  sentencias: unknown[];
  cambiadas: number;
  publicadas: number;
}

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
    versionVariantes: p.versionVariantes,
    opcion: p.opcionNombre || null,
    variantes: p.variantes.map((v) => ({
      id: v.id,
      titulo: v.titulo,
      precio: v.precio,
      disponible: v.disponible,
      orden: v.orden,
      version: v.version,
    })),
  };
}

/* ------------------------------------------------------------- «Producto» */

/** El borrador del bloque «Producto»: lo guardado, como texto. */
export function borradorProducto(p: ProductoPanel): Borrador {
  return {
    titulo: p.titulo,
    descripcion: htmlATexto(p.descripcionHtml),
    categoria: p.categoria,
    destacado: p.destacado,
    opcionNombre: p.opcionNombre,
    handle: p.handle,
    version: p.version,
    filas: [],
  };
}

/** Lo que dicen las fotos de un bloque en «Últimos cambios». */
function notaFotos(f: FotosDelBloque): string[] {
  const c: string[] = [];
  if (f.publicadas) c.push(f.publicadas === 1 ? '1 foto publicada' : `${f.publicadas} fotos publicadas`);
  if (f.cambiadas) c.push(f.cambiadas === 1 ? '1 foto cambiada' : `${f.cambiadas} fotos cambiadas`);
  return c;
}

/** Guarda el bloque «Producto». */
export async function guardarBloqueProducto(
  db: BaseD1Escritura,
  actual: ProductoPanel,
  b: Borrador,
  categorias: string[],
  fotos: FotosDelBloque,
): Promise<ResultadoBloque> {
  const errores = validarBasicos(b, categorias);
  if (Object.keys(errores).length) return { ok: false, estado: 400, errores };
  /* La comprobación ANTES del batch da el mensaje bueno en el caso normal
     (dos pestañas); la carrera exacta la cubre el cerrojo del batch. */
  if (b.version !== actual.version) return { ok: false, estado: 409, errores: {} };

  const desc = descripcionAGuardar(b.descripcion, actual.descripcionHtml);
  const c: string[] = [];
  if (b.titulo !== actual.titulo) c.push(`nombre: «${actual.titulo}» → «${b.titulo}»`);
  if (desc.cambio) c.push('descripción');
  if (b.categoria !== actual.categoria) c.push(`categoría: ${actual.categoria} → ${b.categoria}`);
  if (b.destacado !== actual.destacado) c.push(b.destacado ? 'destacado en la portada' : 'ya no destacado');
  c.push(...notaFotos(fotos));
  if (!c.length) return { ok: true, sinCambios: true };

  const r = await guardarDatosProducto(db, {
    productoId: actual.id,
    versionEsperada: actual.version,
    datos: {
      titulo: b.titulo,
      descripcionHtml: desc.html,
      descripcionTexto: desc.texto,
      categoria: b.categoria,
      destacado: b.destacado,
    },
    fotos: fotos.sentencias,
    antes: instantanea(actual),
    nota: c.join('; '),
  });
  return r.ok ? { ok: true, sinCambios: false } : fallo(r.motivo);
}

/** En qué se diferencia lo guardado AHORA de lo que ella escribió. */
export function diferenciasProducto(ahora: ProductoPanel, b: Borrador): string[] {
  const d: string[] = [];
  if (ahora.titulo !== b.titulo) d.push(`El nombre guardado es «${ahora.titulo}».`);
  if (htmlATexto(ahora.descripcionHtml).trim() !== b.descripcion.replace(/\r\n?/g, '\n').trim()) {
    d.push('La descripción guardada es distinta de la tuya.');
  }
  if (ahora.categoria !== b.categoria) d.push(`La categoría guardada es otra (${ahora.categoria}).`);
  if (ahora.destacado !== b.destacado) d.push(ahora.destacado ? 'Está guardado como destacado.' : 'Está guardado sin destacar.');
  return d;
}

/* ------------------------------------------------------- una versión sola */

/** El borrador de la tarjeta de UNA versión, como texto. */
export interface BorradorVersion {
  id: number;
  version: number;
  titulo: string;
  precioTexto: string;
  aLaVenta: boolean;
}

export function borradorVersion(v: VariantePanel): BorradorVersion {
  return {
    id: v.id,
    version: v.version,
    /* 'Default Title' no se enseña: para ella es «sin nombre», no un nombre. */
    titulo: v.titulo === SIN_VARIANTES ? '' : v.titulo,
    precioTexto: v.precio.toLocaleString('es-CO'),
    aLaVenta: v.disponible,
  };
}

export function leerVersion(f: FormData): BorradorVersion {
  const t = (k: string) => String(f.get(k) ?? '');
  return {
    id: parseInt(t('v'), 10) || 0,
    version: parseInt(t('version'), 10) || 0,
    titulo: t('titulo').trim(),
    precioTexto: t('precio').trim(),
    aLaVenta: f.get('venta') === '1',
  };
}

const largo = (s: string) => [...s].length;

/** Guarda la tarjeta de una versión: nombre, precio, a la venta y sus fotos. */
export async function guardarBloqueVersion(
  db: BaseD1Escritura,
  actual: ProductoPanel,
  bv: BorradorVersion,
  fotos: FotosDelBloque,
): Promise<ResultadoBloque> {
  const v = actual.variantes.find((x) => x.id === bv.id);
  /* Quitada desde otra pantalla: no hay fila que guardar. Se dice, y lo
     escrito se queda en pantalla para poder copiarlo. */
  if (!v) return { ok: false, estado: 409, errores: {}, desaparecida: true };

  const errores: Errores = {};
  const unica = actual.variantes.length === 1;
  if (!unica && !bv.titulo) errores.titulo = 'Escribe el nombre de esta versión, por ejemplo «Negro» o «6 tazas».';
  else if (largo(bv.titulo) > MAX_NOMBRE_VARIANTE) errores.titulo = `Es muy largo (máximo ${MAX_NOMBRE_VARIANTE} letras).`;
  else if (
    bv.titulo &&
    actual.variantes.some((x) => x.id !== v.id && x.titulo.toLocaleLowerCase('es') === bv.titulo.toLocaleLowerCase('es'))
  ) {
    errores.titulo = `Ya hay otra versión llamada «${bv.titulo}». Cada una necesita un nombre distinto.`;
  }
  const p = leerPrecio(bv.precioTexto);
  if (!p.ok) errores.precio = p.error;
  if (Object.keys(errores).length || !p.ok) return { ok: false, estado: 400, errores };
  if (bv.version !== v.version) return { ok: false, estado: 409, errores: {} };

  const titulo = bv.titulo || SIN_VARIANTES;
  const c: string[] = [];
  if (v.titulo !== titulo) c.push(`${nombreVersion(v.titulo)} ahora se llama ${nombreVersion(titulo)}`);
  if (v.precio !== p.valor) c.push(`precio de ${nombreVersion(titulo)}: ${formatearPrecio(v.precio)} → ${formatearPrecio(p.valor)}`);
  if (v.disponible !== bv.aLaVenta) c.push(`${nombreVersion(titulo)} ${bv.aLaVenta ? 'a la venta' : 'retirado de la venta'}`);
  const f = notaFotos(fotos);
  if (f.length) c.push(`${f.join(', ')} en ${nombreVersion(titulo)}`);
  if (!c.length) return { ok: true, sinCambios: true };

  const r = await guardarVariante(db, {
    productoId: actual.id,
    varianteId: v.id,
    versionEsperada: v.version,
    titulo,
    precio: p.valor,
    disponible: bv.aLaVenta,
    fotos: fotos.sentencias,
    antes: { variante: { id: v.id, titulo: v.titulo, precio: v.precio, disponible: v.disponible, version: v.version } },
    nota: c.join('; '),
  });
  return r.ok ? { ok: true, sinCambios: false } : fallo(r.motivo);
}

/** Para el aviso de conflicto de una tarjeta. */
export function diferenciasVersion(ahora: VariantePanel, bv: BorradorVersion): string[] {
  const d: string[] = [];
  const titulo = bv.titulo || SIN_VARIANTES;
  if (ahora.titulo !== titulo) d.push(`El nombre guardado es ${nombreVersion(ahora.titulo)}.`);
  const p = leerPrecio(bv.precioTexto);
  if (!p.ok || p.valor !== ahora.precio) d.push(`El precio guardado es ${formatearPrecio(ahora.precio)}.`);
  if (ahora.disponible !== bv.aLaVenta) d.push(`Está guardado como ${ahora.disponible ? 'a la venta' : 'retirado'}.`);
  return d;
}

/* ------------------------------------------------------------- comunes */

/** El motivo de la base, en palabras. Lo comparten los tres bloques. */
export function fallo(motivo: MotivoFallo): ResultadoBloque {
  switch (motivo) {
    case 'conflicto':
      return { ok: false, estado: 409, errores: {} };
    case 'con-historial':
      return {
        ok: false,
        estado: 400,
        errores: {
          general:
            'Una de las versiones que quieres quitar acaba de tener una venta o un movimiento de inventario, ' +
            'así que ya no se puede quitar. No se guardó nada. Desmarca «Quitar» y, si ya no la vendes, desmarca «A la venta» en su tarjeta.',
        },
      };
    case 'nombre-repetido':
      return {
        ok: false,
        estado: 400,
        errores: { general: 'Dos versiones quedaron con el mismo nombre. Cambia uno y vuelve a guardar.' },
      };
    default:
      return {
        ok: false,
        estado: 500,
        errores: {
          general: 'No se pudo guardar en este momento. No se perdió nada de lo que escribiste: vuelve a intentarlo en un minuto.',
        },
      };
  }
}
