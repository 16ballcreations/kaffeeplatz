/**
 * fotos-asignar.ts — leer y validar las fotos que llegan dentro de un bloque
 * de la ficha del producto (versión, toma y descripción de cada una).
 *
 * Antes era la acción «guardar» de /admin/fotos/<handle>/cambios, que lanzaba
 * al primer error. Ahora las fotos se guardan con SU bloque («Guardar
 * producto», «Guardar esta versión»), y el bloque se repinta con lo escrito y
 * el error al lado de cada campo: por eso aquí se juntan los errores por foto
 * en vez de cortar en el primero.
 *
 * Todo se valida CONTRA LO QUE HAY EN LA BASE AHORA, no contra lo que dice el
 * formulario: que la foto sea de este producto, que la versión también, que
 * la toma exista. Un id manipulado no puede tocar la foto de otro producto
 * (además, cada UPDATE lleva `AND producto_id = ?`).
 */
import type { ProductoFotos } from '../datos/consultas/imagenes-panel';
import type { Asignacion } from '../datos/consultas/imagenes-escribir';

/** Largo máximo del alt: una frase, no un párrafo. */
export const MAX_ALT = 200;

/** Lo que se escribió en una foto, tal cual, para repintarlo. */
export interface FotoBorrador {
  varianteId: number | null;
  rol: string | null;
  alt: string;
}

export interface FotosLeidas {
  asignaciones: Asignacion[];
  /** Por id de foto. */
  borrador: Map<number, FotoBorrador>;
  /** `alt-<id>` o `foto-<id>` → mensaje. */
  errores: Record<string, string>;
}

/** Lee las fotos de un bloque. Las quitadas en otra pestaña se ignoran. */
export function leerFotos(d: FormData, p: ProductoFotos): FotosLeidas {
  const variantes = new Set(p.variantes.map((v) => v.id));
  const roles = new Set(p.roles.map((r) => r.id));
  const existen = new Set(p.fotos.map((f) => f.id));
  const salida: FotosLeidas = { asignaciones: [], borrador: new Map(), errores: {} };
  for (const crudo of new Set(d.getAll('foto').map(String))) {
    const id = Number(crudo);
    if (!existen.has(id)) continue; // quitada en otra pestaña: no es un error
    const v = String(d.get(`variante-${id}`) ?? '');
    const r = String(d.get(`rol-${id}`) ?? '');
    /* Sin el desplegable (producto de una sola versión) la foto es del
       producto: no hay color que elegir. */
    const varianteId = v === '' ? null : Number(v);
    const alt = String(d.get(`alt-${id}`) ?? '').replace(/\s+/g, ' ').trim();
    salida.borrador.set(id, { varianteId, rol: r || null, alt });
    if (varianteId !== null && !variantes.has(varianteId)) {
      salida.errores[`foto-${id}`] = 'Esa versión ya no existe. Elige otra.';
      continue;
    }
    if (r !== '' && !roles.has(r)) {
      salida.errores[`foto-${id}`] = 'Ese tipo de toma ya no existe. Elige otro.';
      continue;
    }
    /* `alt` es NOT NULL en el esquema y obligatorio en el zod de hoy (B.7,
       punto 6). Vacío no se guarda: se dice cuál. */
    if (!alt) {
      salida.errores[`alt-${id}`] = 'Escribe qué se ve en la foto: lo leen los lectores de pantalla y Google.';
      continue;
    }
    if ([...alt].length > MAX_ALT) {
      salida.errores[`alt-${id}`] = `Es muy larga: el máximo son ${MAX_ALT} letras.`;
      continue;
    }
    salida.asignaciones.push({ id, varianteId, rol: r || null, alt });
  }
  return salida;
}

/** «Producto — Verde, armado»: el alt prerrellenado de B.7, punto 6. */
export function altAutomatico(producto: string, variante: string | null, rol: string | null): string {
  const partes = [variante ?? '', rol ? rol.toLowerCase() : ''].filter(Boolean).join(', ');
  return partes ? `${producto} — ${partes}` : producto;
}
