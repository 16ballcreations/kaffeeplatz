/**
 * productos/guardar-versiones.ts — el bloque «Versiones» de la ficha: cuáles
 * hay, en qué orden, y cómo se llama lo que cambia entre ellas.
 *
 * QUÉ ESCRIBE ESTE BLOQUE Y QUÉ NO
 * ===========================================================================
 * Añadir (con nombre y precio), quitar, reordenar, y el nombre de la opción
 * («Color»). NO el nombre, el precio ni «a la venta» de una versión que ya
 * existe: eso es de su tarjeta, que tiene su propio botón y su propio
 * cerrojo. Por eso aquí esos datos se toman de la base y no del formulario
 * (`completar`): aunque alguien manipulara el formulario, este bloque no
 * puede pisar el precio que otra pestaña acaba de guardar en «Verde».
 *
 * La única excepción es la fila sin nombre (la «Default Title» de un producto
 * que hasta hoy no venía en colores): al añadirle una segunda versión, la
 * primera necesita nombre, y se escribe aquí mismo.
 *
 * Todo funciona SIN JavaScript: subir, bajar y añadir fila son botones
 * `submit` que re-pintan el bloque con lo escrito, sin guardar
 * (`aplicarAccion` en forma.ts).
 */

import type { BaseD1Escritura } from '../../datos/consultas/inventario-formas';
import { guardarVariantes, type FilaFinal } from '../../datos/consultas/variantes-escribir';
import { formatearPrecio } from '../../datos/formas';
import type { ProductoPanel } from './leer';
import { validarFilas, type Borrador } from './forma';
import { SIN_VARIANTES, instantanea, nombreVersion, fallo, type ResultadoBloque } from './guardar';

/** El borrador del bloque: las filas guardadas, en su orden. */
export function borradorVersiones(p: ProductoPanel): Borrador {
  return {
    titulo: p.titulo,
    descripcion: '',
    categoria: p.categoria,
    destacado: p.destacado,
    opcionNombre: p.opcionNombre,
    handle: p.handle,
    version: p.versionVariantes,
    filas: p.variantes.map((v) => ({
      id: v.id,
      titulo: v.titulo === SIN_VARIANTES ? '' : v.titulo,
      precioTexto: v.precio.toLocaleString('es-CO'),
      aLaVenta: v.disponible,
      quitar: false,
    })),
  };
}

/**
 * Rellena las filas que ya existen con lo GUARDADO (ver la cabecera). La fila
 * sin nombre conserva el que ella escribió.
 */
export function completar(b: Borrador, p: ProductoPanel): void {
  const porId = new Map(p.variantes.map((v) => [v.id, v] as const));
  for (const f of b.filas) {
    const v = f.id !== null ? porId.get(f.id) : undefined;
    if (!v) continue;
    if (v.titulo !== SIN_VARIANTES) f.titulo = v.titulo;
    f.precioTexto = v.precio.toLocaleString('es-CO');
    f.aLaVenta = v.disponible;
  }
}

/** Guarda el bloque «Versiones». */
export async function guardarBloqueVersiones(
  db: BaseD1Escritura,
  actual: ProductoPanel,
  b: Borrador,
): Promise<ResultadoBloque> {
  completar(b, actual);
  const historial = new Map(
    actual.variantes.filter((v) => v.conHistorial).map((v) => [v.id, v.titulo] as const),
  );
  const filas = validarFilas(b, historial);
  if (Object.keys(filas.errores).length) return { ok: false, estado: 400, errores: filas.errores };
  if (b.version !== actual.versionVariantes) return { ok: false, estado: 409, errores: {} };

  /* Toda versión guardada tiene que venir en el formulario. Si falta alguna
     con el mismo cerrojo, el formulario no es el que pintó el panel (o llegó
     cortado), y guardar dejaría un orden que nadie eligió. */
  const enFormulario = new Set(b.filas.map((f) => f.id).filter((id): id is number => id !== null));
  if (actual.variantes.some((v) => !enFormulario.has(v.id))) {
    return {
      ok: false,
      estado: 400,
      errores: { general: 'El formulario llegó incompleto. Recarga la página y vuelve a intentarlo.' },
    };
  }

  const porId = new Map(actual.variantes.map((v) => [v.id, v] as const));
  const finales: FilaFinal[] = filas.quedan.map(({ fila, precio }) =>
    fila.id !== null && porId.has(fila.id)
      ? { tipo: 'existe', id: fila.id }
      : { tipo: 'nueva', titulo: fila.titulo || SIN_VARIANTES, precio, disponible: fila.aLaVenta },
  );
  const quitar = b.filas
    .filter((f) => f.quitar && f.id !== null && porId.has(f.id))
    .map((f) => ({ id: f.id!, antes: porId.get(f.id!)! }));
  const nombrar = filas.quedan
    .filter(({ fila }) => fila.id !== null && porId.get(fila.id)?.titulo === SIN_VARIANTES && fila.titulo)
    .map(({ fila }) => ({ id: fila.id!, titulo: fila.titulo }));

  /* Con una sola versión y sin nombre propio no hay opción que enseñar. Con
     una sola CON nombre (el «Color: Negro» del dripper de loto) se conserva:
     es lo que la ficha usa para decir de qué color es. */
  const unica = finales.length === 1;
  const tituloUnica = unica
    ? finales[0]!.tipo === 'nueva'
      ? finales[0]!.titulo
      : (nombrar[0]?.titulo ?? porId.get((finales[0] as { id: number }).id)!.titulo)
    : '';
  const opcionNombre = !unica || (tituloUnica !== SIN_VARIANTES && b.opcionNombre) ? b.opcionNombre : null;

  const c: string[] = [];
  for (const f of finales) {
    if (f.tipo === 'nueva') c.push(`nueva versión ${nombreVersion(f.titulo)} a ${formatearPrecio(f.precio)}`);
  }
  for (const n of nombrar) c.push(`la versión sin nombre ahora se llama «${n.titulo}»`);
  for (const q of quitar) c.push(`quitada la versión ${nombreVersion(q.antes.titulo)}`);
  const antes = actual.variantes.map((v) => v.id).filter((id) => !quitar.some((q) => q.id === id));
  const ahora = finales.flatMap((f) => (f.tipo === 'existe' ? [f.id] : []));
  if (antes.join(',') !== ahora.join(',')) c.push('orden de las versiones');
  if ((opcionNombre ?? '') !== actual.opcionNombre) c.push('nombre de lo que cambia entre versiones');
  if (!c.length) return { ok: true, sinCambios: true };

  const r = await guardarVariantes(db, {
    productoId: actual.id,
    versionEsperada: actual.versionVariantes,
    filas: finales,
    quitar,
    nombrar,
    opcionNombre,
    antes: instantanea(actual),
    nota: c.join('; '),
  });
  return r.ok ? { ok: true, sinCambios: false } : fallo(r.motivo);
}

/** Para el aviso de conflicto: qué cambió en la lista mientras ella editaba. */
export function diferenciasVersiones(ahora: ProductoPanel, b: Borrador): string[] {
  const d: string[] = [];
  for (const v of ahora.variantes) {
    if (!b.filas.some((f) => f.id === v.id)) d.push(`${nombreVersion(v.titulo)} es una versión nueva que tú no tenías en pantalla.`);
  }
  for (const f of b.filas) {
    if (f.id !== null && !ahora.variantes.some((v) => v.id === f.id)) {
      d.push(`«${f.titulo || 'Una versión'}» ya no existe: la quitaron desde otra pantalla.`);
    }
  }
  const orden = (ids: (number | null)[]) => ids.filter((x) => x !== null && ahora.variantes.some((v) => v.id === x)).join(',');
  if (!d.length && orden(b.filas.map((f) => f.id)) !== orden(ahora.variantes.map((v) => v.id))) {
    d.push('El orden guardado es otro.');
  }
  if (ahora.opcionNombre !== b.opcionNombre) d.push(`Lo que cambia entre versiones está guardado como «${ahora.opcionNombre || 'nada'}».`);
  return d;
}

/**
 * Tras un conflicto, deja el borrador listo para volver a guardar sobre lo que
 * hay AHORA: toma el cerrojo actual, suelta las filas que la otra pantalla
 * quitó (ya no existen: quitarlas otra vez no tiene sentido y recrearlas sin
 * querer sería peor) y añade al final las que creó. Lo nuevo que ella había
 * escrito, sus marcas de «Quitar» y su orden se conservan.
 */
export function reconciliarVersiones(b: Borrador, ahora: ProductoPanel): void {
  b.version = ahora.versionVariantes;
  const existen = new Set(ahora.variantes.map((v) => v.id));
  b.filas = b.filas.filter((f) => f.id === null || existen.has(f.id));
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
  completar(b, ahora);
}
