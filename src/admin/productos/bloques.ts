/**
 * productos/bloques.ts — el POST de /admin/productos/<id>, sin el HTML.
 *
 * Cada bloque de la ficha es su propio `<form>` con un campo `bloque`:
 *
 *   bloque=producto    nombre, descripción, categoría, destacado + fotos generales
 *   bloque=variante    UNA versión (campo `v`): nombre, precio, a la venta + sus fotos
 *   bloque=versiones   añadir, quitar, reordenar y «qué cambia entre ellas»
 *
 * Y el desenlace es siempre uno de dos, como en el resto del panel:
 *
 *   - Guardado (o nada que guardar): 303 a la ficha con `?hecho=…&bloque=…`
 *     (PRG, patrón 4 de A.6). Recargar no reenvía nada.
 *   - No se guardó: se re-pinta la ficha con ESE bloque tal como ella lo dejó
 *     y el error al lado; los demás bloques salen de la base.
 *
 * SIN JAVASCRIPT eso significa que un error en «Verde» repinta la página y lo
 * que hubiera sin guardar en OTRO bloque se pierde: el navegador solo envía el
 * formulario que se pulsó. Es la contrapartida aceptada de que cada bloque
 * tenga su botón. CON JavaScript no pasa: el envío va por `fetch`, y de la
 * respuesta (la misma página) se toma solo el bloque enviado; los otros, con
 * lo que ella esté escribiendo, no se tocan (ver cliente-bloques.ts).
 *
 * La puerta ya garantizó sesión y `Origin` de todo POST: no se repite.
 */

import type { BaseAdmin } from '../base';
import { ruta } from '../../datos/sitio';
import type { ProductoFotos } from '../../datos/consultas/imagenes-panel';
import { sentenciasAsignaciones, sincronizarPortadas } from '../../datos/consultas/imagenes-escribir';
import { leerFotos, type FotoBorrador } from '../fotos-asignar';
import { productoParaEditar, type ProductoPanel } from './leer';
import { leerFormulario, aplicarAccion, type Borrador, type Errores } from './forma';
import {
  baseEscritura,
  guardarBloqueProducto,
  guardarBloqueVersion,
  diferenciasProducto,
  diferenciasVersion,
  leerVersion,
  type BorradorVersion,
  type FotosDelBloque,
  type ResultadoBloque,
} from './guardar';
import {
  guardarBloqueVersiones,
  diferenciasVersiones,
  reconciliarVersiones,
  completar,
} from './guardar-versiones';
import { invalidarProducto } from './cache';

/** Lo que hace falta para repintar el bloque enviado tal como ella lo dejó. */
export interface Repinte {
  /** 'producto', 'v<id>' o 'versiones'. */
  bloque: string;
  estado: number;
  errores: Errores;
  /** Diferencias con lo guardado ahora, si fue un conflicto. */
  conflicto: string[] | null;
  /** «Todavía no se ha guardado» tras subir/bajar/añadir sin guardar. */
  aviso: string;
  producto?: Borrador;
  version?: BorradorVersion;
  versiones?: Borrador;
  fotos: Map<number, FotoBorrador>;
  /** La versión que se intentó guardar ya no existe. */
  desaparecida?: boolean;
}

export type Desenlace =
  | { tipo: 'redirigir'; a: string }
  | { tipo: 'repintar'; r: Repinte; actual: ProductoPanel };

const hecho = (id: number, r: { sinCambios: boolean }, bloque: string) =>
  ruta(`/admin/productos/${id}?hecho=${r.sinCambios ? 'sin-cambios' : 'guardado'}&bloque=${bloque}#bloque-${bloque}`);

/** Las fotos del bloque, validadas y convertidas en sentencias. */
function fotosDe(db: BaseAdmin, forma: FormData, p: ProductoFotos) {
  const l = leerFotos(forma, p);
  const s = sentenciasAsignaciones(db, p.id, p.fotos, l.asignaciones);
  const fotos: FotosDelBloque = {
    sentencias: s.sentencias.length ? [...s.sentencias, ...sincronizarPortadas(db, p.id)] : [],
    cambiadas: s.cambiadas,
    publicadas: s.publicadas,
  };
  return { fotos, borrador: l.borrador, errores: l.errores };
}

/** Atiende el POST de un bloque. Lanza solo si la base no responde. */
export async function postBloque(
  db: BaseAdmin,
  actual: ProductoPanel,
  fotosProducto: ProductoFotos,
  categorias: string[],
  forma: FormData,
  origen: string,
): Promise<Desenlace> {
  const bloque = String(forma.get('bloque') ?? '');
  const accion = String(forma.get('accion') ?? 'guardar');
  const w = baseEscritura(db);
  const base = { conflicto: null, aviso: '', errores: {} as Errores, estado: 200 };

  /** Común a los tres: guardado → 303; si no, qué repintar. */
  const tras = async (
    r: ResultadoBloque,
    nombre: string,
    repinte: Omit<Repinte, 'estado' | 'errores' | 'conflicto' | 'aviso'>,
    conflicto: (ahora: ProductoPanel) => string[],
  ): Promise<Desenlace> => {
    if (r.ok) {
      if (!r.sinCambios) await invalidarProducto(origen, actual.handle);
      return { tipo: 'redirigir', a: hecho(actual.id, r, nombre) };
    }
    if (r.estado !== 409) {
      return { tipo: 'repintar', r: { ...base, ...repinte, estado: r.estado, errores: r.errores }, actual };
    }
    /* Se relee: el `actual` de arriba puede ser ya viejo si la carrera fue
       exacta. Lo que se le enseña tiene que ser lo de AHORA. */
    const ahora = (await productoParaEditar(db, actual.id)) ?? actual;
    return {
      tipo: 'repintar',
      r: { ...base, ...repinte, estado: 409, errores: {}, conflicto: conflicto(ahora), desaparecida: r.desaparecida },
      actual: ahora,
    };
  };

  if (bloque === 'producto') {
    const b = leerFormulario(forma);
    b.filas = [];
    const f = fotosDe(db, forma, fotosProducto);
    const r: ResultadoBloque = Object.keys(f.errores).length
      ? { ok: false, estado: 400, errores: f.errores }
      : await guardarBloqueProducto(w, actual, b, categorias, f.fotos);
    /* Un error de un campo y otro de una foto se enseñan juntos. */
    if (!r.ok && r.estado === 400) Object.assign(r.errores, f.errores);
    return tras(r, 'producto', { bloque: 'producto', producto: b, fotos: f.borrador }, (ahora) => {
      b.version = ahora.version;
      return diferenciasProducto(ahora, b);
    });
  }

  if (bloque === 'variante') {
    const bv = leerVersion(forma);
    const f = fotosDe(db, forma, fotosProducto);
    const r: ResultadoBloque = Object.keys(f.errores).length
      ? { ok: false, estado: 400, errores: f.errores }
      : await guardarBloqueVersion(w, actual, bv, f.fotos);
    if (!r.ok && r.estado === 400) Object.assign(r.errores, f.errores);
    return tras(r, `v${bv.id}`, { bloque: `v${bv.id}`, version: bv, fotos: f.borrador }, (ahora) => {
      const v = ahora.variantes.find((x) => x.id === bv.id);
      if (!v) return [];
      bv.version = v.version;
      return diferenciasVersion(v, bv);
    });
  }

  if (bloque === 'versiones') {
    const b = leerFormulario(forma);
    if (accion !== 'guardar') {
      /* Subir, bajar, añadir: se re-pinta SIN guardar, y se dice, para que no
         crea que ya está hecho. */
      completar(b, actual);
      const movio = aplicarAccion(b, accion);
      return {
        tipo: 'repintar',
        r: {
          ...base,
          bloque: 'versiones',
          versiones: b,
          fotos: new Map(),
          aviso: movio ? 'Todavía no se ha guardado: pulsa «Guardar versiones» cuando termines.' : '',
        },
        actual,
      };
    }
    const r = await guardarBloqueVersiones(w, actual, b);
    return tras(r, 'versiones', { bloque: 'versiones', versiones: b, fotos: new Map() }, (ahora) => {
      const d = diferenciasVersiones(ahora, b);
      reconciliarVersiones(b, ahora);
      return d;
    });
  }

  return {
    tipo: 'repintar',
    r: { ...base, bloque: '', estado: 400, fotos: new Map(), errores: { general: 'No se entendió qué guardar. Recarga la página.' } },
    actual,
  };
}
