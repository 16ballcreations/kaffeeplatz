/**
 * consultas/imagenes-panel.ts — lo que el panel de fotos LEE de D1.
 *
 * Es SQL y nada más, como `consultas/productos.ts`. Las escrituras están en
 * `imagenes-escribir.ts`: separarlas deja este fichero legible de una vez y
 * hace evidente, al revisar un cambio, si toca algo que escribe.
 *
 * POR QUE NO SE REUTILIZA `productoPorHandle`
 * ---------------------------------------------------------------------------
 * Esa consulta es la de la tienda: solo lo vivo, la disponibilidad ya resuelta
 * con el inventario, y las fotos en la forma `{src, alt, variante}` que pintan
 * los componentes. El panel necesita lo contrario: ids (para escribir),
 * `variante_id` y `rol` crudos, `orden`, `por_revisar`, y también productos
 * archivados (una foto se puede preparar antes de restaurar el producto).
 *
 * Una sola regla de orden para todo el panel: `orden, id`. Es la MISMA que usa
 * la tienda (`ORDER BY i.orden, i.id` en `consultas/productos.ts`), y tiene que
 * serlo: lo que la dueña ve primero aquí es lo que el cliente ve primero allá.
 */
import type { BaseAdmin } from '../../admin/base';

export interface FotoPanel {
  id: number;
  /** La ruta servida: '/img/productos/...' (semilla) o '/medios/productos/...' (R2). */
  clave: string;
  alt: string;
  ancho: number | null;
  alto: number | null;
  orden: number;
  varianteId: number | null;
  rol: string | null;
  nombreOriginal: string | null;
  porRevisar: boolean;
}

export interface VariantePanel {
  id: number;
  titulo: string;
  portadaId: number | null;
}

export interface RolPanel {
  id: string;
  nombre: string;
}

export interface ProductoFotos {
  id: number;
  handle: string;
  titulo: string;
  archivado: boolean;
  portadaId: number | null;
  variantes: VariantePanel[];
  roles: RolPanel[];
  fotos: FotoPanel[];
}

interface FilaFoto {
  id: number;
  clave: string;
  alt: string;
  ancho: number | null;
  alto: number | null;
  orden: number;
  variante_id: number | null;
  rol: string | null;
  nombre_original: string | null;
  por_revisar: number;
}

/**
 * Un producto con sus variantes, sus fotos y los roles. `null` si no existe.
 *
 * Por id y no por handle desde que las fotos viven en la ficha del producto
 * (`/admin/productos/<id>`): es la misma clave que usa el resto de la ficha.
 */
export async function productoConFotos(db: BaseAdmin, id: number): Promise<ProductoFotos | null> {
  const p = await db
    .prepare('SELECT id, handle, titulo, archivado_en, portada_id FROM productos WHERE id = ?')
    .bind(id)
    .first<{ id: number; handle: string; titulo: string; archivado_en: string | null; portada_id: number | null }>();
  if (!p) return null;

  const [variantes, roles, fotos] = await Promise.all([
    db
      .prepare('SELECT id, titulo, portada_id FROM variantes WHERE producto_id = ? ORDER BY orden, id')
      .bind(p.id)
      .all<{ id: number; titulo: string; portada_id: number | null }>(),
    db.prepare('SELECT id, nombre FROM roles_imagen ORDER BY orden, id').all<RolPanel>(),
    db
      .prepare(
        `SELECT id, clave, alt, ancho, alto, orden, variante_id, rol, nombre_original, por_revisar
           FROM imagenes WHERE producto_id = ? ORDER BY orden, id`,
      )
      .bind(p.id)
      .all<FilaFoto>(),
  ]);

  return {
    id: p.id,
    handle: p.handle,
    titulo: p.titulo,
    archivado: p.archivado_en !== null,
    portadaId: p.portada_id,
    variantes: variantes.results.map((v) => ({ id: v.id, titulo: v.titulo, portadaId: v.portada_id })),
    roles: roles.results,
    fotos: fotos.results.map((f) => ({
      id: f.id,
      clave: f.clave,
      alt: f.alt,
      ancho: f.ancho,
      alto: f.alto,
      orden: f.orden,
      varianteId: f.variante_id,
      rol: f.rol,
      nombreOriginal: f.nombre_original,
      porRevisar: f.por_revisar === 1,
    })),
  };
}
