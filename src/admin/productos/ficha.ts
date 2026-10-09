/**
 * productos/ficha.ts — de lo leído (y de lo que ella escribió, si se repinta)
 * a lo que pinta cada bloque de la ficha. Sin base ni HTML: así la página
 * queda en «leer, decidir, pintar».
 */
import type { ProductoFotos } from '../../datos/consultas/imagenes-panel';
import { sugerir } from '../fotos-nombre';
import { altAutomatico } from '../fotos-asignar';
import type { Repinte } from './bloques';
import { SIN_VARIANTES } from './guardar';
import type { ProductoPanel } from './leer';

/** Una foto como la pinta su bloque (FotosBloque.astro). */
export interface FotoVista {
  id: number;
  clave: string;
  alt: string;
  varianteId: number | null;
  rol: string | null;
  porRevisar: boolean;
  nombreOriginal: string | null;
  /** ¿El alt es el automático? Si ella lo escribe, deja de rehacerse solo. */
  auto: boolean;
  portada: boolean;
  /** Nombre de la versión de la que es portada, si lo es. */
  portadaDe: string | null;
}

/** Mensajes de `?hecho=` que hablan de UN bloque (van dentro de él). */
export const HECHO_BLOQUE: Record<string, string> = {
  guardado: 'Guardado. Ya se ve así en la tienda.',
  'sin-cambios': 'No había nada que cambiar: todo estaba ya guardado así.',
  fotos: 'Fotos subidas. Revísalas y pulsa «Guardar» en su bloque para publicarlas.',
};

/** Mensajes de `?hecho=` de la ficha entera (van arriba). */
export const HECHO_FICHA: Record<string, string> = {
  creado:
    'Producto creado. Ahora sube sus fotos y, si viene en varios colores o tamaños, añade sus versiones abajo.',
  restaurado: 'Restaurado: el producto vuelve a verse en la tienda.',
  archivado: 'Archivado: ya no se ve en la tienda. Puedes restaurarlo cuando quieras.',
  fallo: 'No se pudo completar en este momento. Vuelve a intentarlo en un minuto.',
};

/**
 * Las versiones que tienen tarjeta con fotos. Con menos de dos no hay color
 * que elegir (la ficha pública tampoco pinta selector): la única variante ES
 * el producto, se llame «Default Title», «NEGRO» o «32000» como en la
 * semilla, y todas sus fotos son del producto.
 */
export function versionesConFotos(p: ProductoPanel): { id: number; titulo: string }[] {
  const reales = p.variantes.filter((v) => v.titulo !== SIN_VARIANTES);
  return p.variantes.length > 1 ? reales.map((v) => ({ id: v.id, titulo: v.titulo })) : [];
}

/**
 * Las fotos de cada bloque ('producto' o 'v<id>'), con lo que ella escribió
 * si es el bloque que se repinta.
 *
 * Las portadas se DERIVAN del orden, igual que las recalcula cada escritura
 * (src/admin/fotos-orden.ts): la primera foto PUBLICADA del producto, y la
 * primera publicada de cada versión. Es lo que se ve en la tienda.
 */
export function fotosPorBloque(
  p: ProductoFotos,
  versiones: { id: number; titulo: string }[],
  repinte: Repinte | null,
): Map<string, FotoVista[]> {
  const nombre = new Map(versiones.map((v) => [v.id, v.titulo]));
  const rol = new Map(p.roles.map((r) => [r.id, r.nombre]));
  const auto = (v: number | null, r: string | null) =>
    altAutomatico(p.titulo, v !== null ? (nombre.get(v) ?? null) : null, r ? (rol.get(r) ?? null) : null);
  const publicadas = p.fotos.filter((f) => !f.porRevisar);
  const portada = publicadas[0]?.id ?? null;
  const portadaDe = new Map<number, string>();
  for (const v of versiones) {
    const f = publicadas.find((x) => x.varianteId === v.id);
    if (f) portadaDe.set(f.id, v.titulo);
  }

  const salida = new Map<string, FotoVista[]>([['producto', []], ...versiones.map((v) => [`v${v.id}`, []] as [string, FotoVista[]])]);
  for (const f of p.fotos) {
    const grupo = f.varianteId !== null && nombre.has(f.varianteId) ? `v${f.varianteId}` : 'producto';
    let varianteId = f.varianteId !== null && nombre.has(f.varianteId) ? f.varianteId : null;
    let r = f.rol;
    let alt = f.alt;
    /* Fotos subidas con la pantalla anterior: entraban sin versión ni toma y
       la sugerencia se calculaba al pintar. Se sigue calculando, para que
       guardar el bloque las confirme donde dice su nombre. */
    if (f.porRevisar && f.varianteId === null && f.rol === null && f.nombreOriginal) {
      const s = sugerir(f.nombreOriginal, p.handle, versiones, p.roles);
      varianteId = s.varianteId ?? null;
      r = s.rol ?? null;
      alt = auto(varianteId, r);
    }
    const d = repinte?.fotos.get(f.id);
    if (d) ({ varianteId, rol: r, alt } = d);
    salida.get(grupo)!.push({
      id: f.id,
      clave: f.clave,
      alt,
      varianteId,
      rol: r,
      porRevisar: f.porRevisar,
      nombreOriginal: f.nombreOriginal,
      auto: alt === auto(varianteId, r),
      portada: f.id === portada,
      portadaDe: portadaDe.get(f.id) ?? null,
    });
  }
  return salida;
}
