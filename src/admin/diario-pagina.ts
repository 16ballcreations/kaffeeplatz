/**
 * diario-pagina.ts — lo que hacen los POST de /admin/diario, sin el HTML.
 *
 * POR QUE LA LOGICA NO ESTA EN LOS `.astro`
 * ===========================================================================
 * Alta (`nuevo.astro`) y edición (`[id].astro`) comparten casi todo: leer el
 * formulario, validar, comprobar que la dirección esté libre, renderizar el
 * cuerpo, guardar, invalidar la caché y decidir a dónde redirigir. Repartido
 * en dos frontmatters serían dos copias que divergen con el primer arreglo.
 * Aquí la página solo pregunta «¿redirijo o repinto?» y pinta.
 *
 * EL PATRON, PASO A PASO (A.5)
 * ---------------------------------------------------------------------------
 *   - Error de validación → se REPINTA con 400 y con lo que escribió intacto.
 *   - Choque con otra pestaña → se repinta con 409, lo escrito intacto, y la
 *     `version` puesta al día: si vuelve a guardar, sabe que reemplaza.
 *   - Todo bien → 303 (POST-redirect-GET): recargar no reenvía el formulario.
 */

import type { BaseAdmin } from './base';
import { ruta } from '../datos/sitio';
import {
  leerFormulario,
  validarArticulo,
  hayErrores,
  type ValoresArticulo,
  type Errores,
} from './diario-validar';
import { cuerpoAHtml } from './diario-markdown';
import { portadasDisponibles } from './diario-portadas';
import { invalidarRutas, rutasDeArticulo } from './diario-cache';
import {
  articuloParaEditar,
  handleOcupado,
  temasDelDiario,
  type ArticuloEditable,
  type Tema,
} from '../datos/consultas/diario-panel';
import { crearArticulo, guardarArticulo, archivarArticulo } from '../datos/consultas/diario-escribir';

export const BASE_DIARIO = '/admin/diario';

export type Desenlace =
  | { tipo: 'redirigir'; a: string }
  | { tipo: 'repintar'; valores: ValoresArticulo; errores: Errores; estado: 400 | 409 };

/** Los mensajes de vuelta tras un 303. La URL solo lleva la clave, nunca texto. */
export const MENSAJES_OK: Record<string, string> = {
  'creado-borrador': 'Listo: el artículo quedó guardado como borrador. No se ve en la tienda.',
  'creado-publicado': 'Listo: el artículo está publicado y ya se ve en la tienda.',
  guardado: 'Cambios guardados.',
  publicado: 'Listo: el artículo está publicado y ya se ve en la tienda.',
  despublicado: 'El artículo pasó a borrador: ya no se ve en la tienda.',
  archivado: 'Artículo archivado: ya no se ve en la tienda. Lo puedes restaurar cuando quieras.',
  restaurado: 'Artículo restaurado.',
};

/** Cuando la base falla con el formulario a medias: lo escrito vuelve. */
export const ERROR_AL_GUARDAR =
  'No se pudo guardar en este momento. Tu texto sigue aquí abajo: espera un minuto y pulsa «Guardar» otra vez.';
export const ERROR_AL_CARGAR =
  'La tienda no responde ahora mismo. Puedes ir escribiendo, pero espera un minuto antes de pulsar «Guardar».';

export const AVISOS: Record<string, string> = {
  cambiado:
    'Este artículo se cambió en otra pestaña o en otro teléfono justo antes. No se hizo nada: revisa cómo quedó y vuelve a intentarlo.',
};

/** Los valores de un formulario vacío. */
export function valoresNuevos(hoy: string, temaPorDefecto: string): ValoresArticulo {
  return {
    titulo: '',
    handle: '',
    fecha: hoy,
    autor: 'Andreina Morales',
    resumen: '',
    cuerpoMd: '',
    imagen: '',
    categoria: temaPorDefecto,
    publicado: false,
    version: 0,
  };
}

/** Lo que hay en la base → lo que lleva el formulario. */
export function valoresDe(a: ArticuloEditable): ValoresArticulo {
  return {
    titulo: a.titulo,
    handle: a.handle,
    fecha: a.fecha,
    autor: a.autor,
    resumen: a.resumen,
    cuerpoMd: a.cuerpo_md,
    imagen: a.imagen ?? '',
    categoria: a.categoria,
    publicado: a.publicado === 1,
    version: a.version,
  };
}

/** El tema 'otros' si existe; si no, el primero. */
export function temaPorDefecto(temas: Tema[]): string {
  return temas.find((t) => t.id === 'otros')?.id ?? temas[0]?.id ?? 'otros';
}

const MENSAJE_HANDLE_OCUPADO =
  'Ya hay otro artículo con esa dirección (puede estar archivado o en borrador). Cambia una palabra del título o de la dirección.';

/** Valida + dirección libre. Común a crear y guardar. */
async function validarContraLaBase(
  db: BaseAdmin,
  v: ValoresArticulo,
  temas: Tema[],
  imagenActual: string | null,
  excepto: number,
): Promise<{ valores: ValoresArticulo; errores: Errores }> {
  const portadas = new Set(portadasDisponibles(imagenActual).map((p) => p.clave));
  const r = validarArticulo(v, { temas: temas.map((t) => t.id), portadas });
  if (!r.errores.handle && r.valores.handle && (await handleOcupado(db, r.valores.handle, excepto))) {
    r.errores.handle = MENSAJE_HANDLE_OCUPADO;
  }
  return r;
}

/** POST /admin/diario/nuevo. */
export async function procesarAlta(db: BaseAdmin, forma: FormData, origen: URL): Promise<Desenlace> {
  const temas = await temasDelDiario(db);
  const { valores, errores } = await validarContraLaBase(db, leerFormulario(forma), temas, null, 0);
  if (hayErrores(errores)) return { tipo: 'repintar', valores, errores, estado: 400 };

  const r = await crearArticulo(db, valores, cuerpoAHtml(valores.cuerpoMd));
  if (!r.ok) {
    return { tipo: 'repintar', valores, errores: { handle: MENSAJE_HANDLE_OCUPADO }, estado: 409 };
  }
  await invalidarRutas(origen, rutasDeArticulo(valores.handle));
  const ok = valores.publicado ? 'creado-publicado' : 'creado-borrador';
  return { tipo: 'redirigir', a: `${BASE_DIARIO}/${r.id}?ok=${ok}` };
}

/** POST /admin/diario/<id>. `actual` es la fila leída al entrar en la página. */
export async function procesarEdicion(
  db: BaseAdmin,
  actual: ArticuloEditable,
  forma: FormData,
  origen: URL,
): Promise<Desenlace> {
  const accion = String(forma.get('accion') ?? 'guardar');
  const aqui = `${BASE_DIARIO}/${actual.id}`;

  if (accion === 'archivar' || accion === 'restaurar') {
    const version = Number.parseInt(String(forma.get('version') ?? ''), 10) || 0;
    const r = await archivarArticulo(db, actual.id, version, accion === 'archivar');
    if (!r.ok) return { tipo: 'redirigir', a: `${aqui}?aviso=cambiado` };
    await invalidarRutas(origen, rutasDeArticulo(actual.handle));
    return { tipo: 'redirigir', a: `${aqui}?ok=${accion === 'archivar' ? 'archivado' : 'restaurado'}` };
  }

  const escrito = leerFormulario(forma);
  /* La dirección de un artículo que ya estuvo publicado NO se cambia, diga lo
     que diga el formulario: la URL ya circula (Google, WhatsApp, Instagram) y
     moverla la dejaría en 404 (R3). El campo ni se pinta editable; esto es la
     garantía del servidor por si llega igual. */
  if (!actual.handle_libre) escrito.handle = actual.handle;

  if (actual.archivado_en) {
    return {
      tipo: 'repintar',
      valores: escrito,
      errores: { general: 'Este artículo está archivado. Restáuralo para poder cambiarlo.' },
      estado: 409,
    };
  }

  const temas = await temasDelDiario(db);
  const { valores, errores } = await validarContraLaBase(db, escrito, temas, actual.imagen, actual.id);
  if (hayErrores(errores)) return { tipo: 'repintar', valores, errores, estado: 400 };

  const r = await guardarArticulo(db, actual.id, valores, cuerpoAHtml(valores.cuerpoMd));
  if (!r.ok && r.motivo === 'handle') {
    return { tipo: 'repintar', valores, errores: { handle: MENSAJE_HANDLE_OCUPADO }, estado: 409 };
  }
  if (!r.ok) {
    /* Otra pestaña guardó antes. Se relee para poner al día la `version`: lo
       escrito se queda en pantalla y, si vuelve a guardar, reemplaza a sabiendas
       — el aviso se lo dice. Sin esto, cada intento chocaría otra vez y la
       única salida sería perder lo escrito. */
    const ahora = await articuloParaEditar(db, actual.id);
    return {
      tipo: 'repintar',
      valores: { ...valores, version: ahora?.version ?? valores.version },
      errores: {
        general:
          'Mientras escribías, este artículo se guardó desde otra pestaña o teléfono. Lo tuyo sigue aquí abajo y NO se ha guardado. ' +
          'Si pulsas «Guardar» otra vez, tu versión reemplaza a la otra. Si prefieres comparar primero, abre el artículo en otra pestaña.',
      },
      estado: 409,
    };
  }

  await invalidarRutas(origen, rutasDeArticulo(actual.handle, valores.handle));
  const antes = actual.publicado === 1;
  const ok = !antes && valores.publicado ? 'publicado' : antes && !valores.publicado ? 'despublicado' : 'guardado';
  return { tipo: 'redirigir', a: `${aqui}?ok=${ok}` };
}

/** Un 303 del panel. `a` es una ruta del sitio, sin el `base`. */
export function redirigir(a: string): Response {
  return new Response(null, { status: 303, headers: { Location: ruta(a), 'Cache-Control': 'no-store' } });
}
