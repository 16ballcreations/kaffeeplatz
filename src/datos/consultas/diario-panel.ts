/**
 * consultas/diario-panel.ts — lo que el PANEL lee del diario.
 *
 * POR QUE NO SE REUTILIZA `consultas/diario.ts`
 * ===========================================================================
 * Esa capa es la del sitio público y filtra `publicado = 1 AND archivado_en IS
 * NULL` en cada consulta: es la garantía de que un borrador no se cuela en
 * /diario. El panel necesita justo lo contrario —ver borradores y archivados,
 * y `cuerpo_md` y `version` para reeditar—, y añadirle un «modo panel» con un
 * parámetro sería poner un interruptor junto a esa garantía. Por eso son dos
 * ficheros: el público no sabe que existe otra forma de leer.
 *
 * Aquí solo hay lecturas. Las escrituras están en `diario-escribir.ts`.
 */

import type { BaseD1 } from './productos';
import { PREFIJO_DIARIO } from '../categorias';

export type EstadoLista = 'publicados' | 'borradores' | 'archivados';

/**
 * Lo que puede pedir la lista: una pestaña, o `sin-portada`, que NO es pestaña
 * sino un recorte de «Publicados». Existe porque la tarjeta «Artículos sin foto
 * de portada» de la portada del panel lleva aquí, y tiene que llegar a esos
 * artículos y no a los dieciséis.
 */
export type FiltroLista = EstadoLista | 'sin-portada';

/* Las tres pestañas son disjuntas y cubren todo: archivado manda sobre
   publicado (un artículo archivado no se ve, esté como esté marcado). */
const FILTRO: Record<FiltroLista, string> = {
  publicados: 'archivado_en IS NULL AND publicado = 1',
  borradores: 'archivado_en IS NULL AND publicado = 0',
  archivados: 'archivado_en IS NOT NULL',
  /* La MISMA condición que cuenta `src/admin/atencion.ts`: si una cambia, la
     cifra de la tarjeta y la lista a la que lleva dejarían de coincidir. */
  'sin-portada': "archivado_en IS NULL AND publicado = 1 AND (imagen IS NULL OR imagen = '')",
};

export interface FilaLista {
  id: number;
  handle: string;
  titulo: string;
  fecha: string;
  imagen: string | null;
  categoria: string;
  updated_at: string;
}

/**
 * Los artículos de una pestaña, SIN cuerpos (el mismo ahorro que el índice
 * público). Los borradores, por fecha de último cambio: lo que se está
 * escribiendo es lo que se busca. Los demás, por fecha del artículo.
 */
export async function articulosDelPanel(db: BaseD1, estado: FiltroLista): Promise<FilaLista[]> {
  const orden = estado === 'borradores' ? 'updated_at DESC, id DESC' : 'fecha DESC, handle';
  const { results } = await db
    .prepare(
      `SELECT id, handle, titulo, fecha, imagen, categoria, updated_at
         FROM articulos WHERE ${FILTRO[estado]} ORDER BY ${orden}`,
    )
    .all<FilaLista>();
  return results.map((f) => ({ ...f, categoria: sinPrefijo(f.categoria) }));
}

/** Cuántos hay en cada pestaña, en una sola consulta. */
export async function cuentasPorEstado(db: BaseD1): Promise<Record<EstadoLista, number>> {
  const fila = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN ${FILTRO.publicados} THEN 1 ELSE 0 END), 0) AS publicados,
         COALESCE(SUM(CASE WHEN ${FILTRO.borradores} THEN 1 ELSE 0 END), 0) AS borradores,
         COALESCE(SUM(CASE WHEN ${FILTRO.archivados} THEN 1 ELSE 0 END), 0) AS archivados
       FROM articulos`,
    )
    .first<Record<EstadoLista, number>>();
  return fila ?? { publicados: 0, borradores: 0, archivados: 0 };
}

export interface ArticuloEditable {
  id: number;
  handle: string;
  titulo: string;
  fecha: string;
  autor: string;
  resumen: string;
  cuerpo_md: string;
  imagen: string | null;
  /** Sin prefijo. */
  categoria: string;
  publicado: number;
  archivado_en: string | null;
  version: number;
  /**
   * ¿Se puede cambiar todavía la dirección? Solo si NUNCA estuvo publicado.
   * Ver `handleBloqueado` en la página: una URL que ya circuló no se mueve.
   */
  handle_libre: number;
}

/**
 * Un artículo para el formulario de edición, o `null`.
 *
 * `handle_libre` lo decide la base con el historial de auditoría: el artículo
 * nació como borrador (hay un 'crear' con nota 'borrador') y nunca se publicó
 * ni despublicó. Los 16 artículos sembrados no tienen 'crear' en la auditoría
 * (no los creó el panel) y por eso salen bloqueados, que es lo correcto: todos
 * están publicados e indexados.
 */
export async function articuloParaEditar(db: BaseD1, id: number): Promise<ArticuloEditable | null> {
  const fila = await db
    .prepare(
      `SELECT a.id, a.handle, a.titulo, a.fecha, a.autor, a.resumen, a.cuerpo_md, a.imagen,
              a.categoria, a.publicado, a.archivado_en, a.version,
              CASE WHEN a.publicado = 0
                    AND EXISTS (SELECT 1 FROM auditoria u
                                 WHERE u.entidad = 'articulo' AND u.entidad_id = CAST(a.id AS TEXT)
                                   AND u.accion = 'crear' AND u.nota = 'borrador')
                    AND NOT EXISTS (SELECT 1 FROM auditoria u
                                 WHERE u.entidad = 'articulo' AND u.entidad_id = CAST(a.id AS TEXT)
                                   AND u.accion IN ('publicar', 'despublicar'))
                   THEN 1 ELSE 0 END AS handle_libre
         FROM articulos a WHERE a.id = ?`,
    )
    .bind(id)
    .first<ArticuloEditable>();
  return fila ? { ...fila, categoria: sinPrefijo(fila.categoria) } : null;
}

/**
 * ¿Usa ya otro artículo esta dirección? Incluye archivados y borradores: la
 * columna es UNIQUE para todos, y una dirección «libre» que luego choca al
 * guardar sería un error que la dueña no entendería.
 */
export async function handleOcupado(db: BaseD1, handle: string, excepto = 0): Promise<boolean> {
  const fila = await db
    .prepare('SELECT 1 AS hay FROM articulos WHERE handle = ? AND id <> ?')
    .bind(handle, excepto)
    .first<{ hay: number }>();
  return fila !== null;
}

export interface Tema {
  /** Sin prefijo: 'metodos'. */
  id: string;
  nombre: string;
  orden: number;
  descripcion?: string;
}

/**
 * Los temas del diario, desde D1, sin prefijo y en su orden.
 *
 * La usan el formulario del panel y el índice público (/diario), así que el
 * nombre que la dueña cambia en «Categorías» es el que se ve en la tienda.
 */
export async function temasDelDiario(db: BaseD1): Promise<Tema[]> {
  const { results } = await db
    .prepare(
      `SELECT id, nombre, orden, descripcion FROM categorias
        WHERE ambito = 'diario' ORDER BY orden, nombre`,
    )
    .all<{ id: string; nombre: string; orden: number; descripcion: string | null }>();
  return results.map((f) => ({
    id: sinPrefijo(f.id),
    nombre: f.nombre,
    orden: f.orden,
    ...(f.descripcion ? { descripcion: f.descripcion } : {}),
  }));
}

/** 'diario:metodos' → 'metodos'. El prefijo no sale de la capa de datos. */
export function sinPrefijo(id: string): string {
  return id.startsWith(PREFIJO_DIARIO) ? id.slice(PREFIJO_DIARIO.length) : id;
}

/** 'metodos' → 'diario:metodos', para escribir. */
export function conPrefijo(id: string): string {
  return id.startsWith(PREFIJO_DIARIO) ? id : `${PREFIJO_DIARIO}${id}`;
}
