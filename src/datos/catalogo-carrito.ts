/**
 * catalogo-carrito.ts — el catalogo REDUCIDO a lo que el carrito pinta.
 * ===========================================================================
 *
 * Lo leen dos sitios y tienen que leer EXACTAMENTE lo mismo:
 *
 *   - /carrito, que lo serializa en su HTML.
 *   - /api/carrito/catalogo.json, que se lo da al mini carrito (el panel que
 *     abre el boton flotante) en cualquier otra pagina.
 *
 * Antes el mapeo vivia en el frontmatter de carrito.astro. Si el panel tuviera
 * su copia, el dia que una de las dos ganara un campo (o lo perdiera) el panel
 * y la pagina enseñarian precios o topes distintos del mismo carrito, y eso no
 * lo nota nadie hasta que una clienta lo cuenta por WhatsApp.
 *
 * Mismo origen que /catalogo y la ficha (`obtenerProductos`, de D1) y los
 * mismos topes (`conStock`): con el inventario apagado `conStock` devuelve el
 * mismo array y nada cambia; encendido, cada variante lleva su
 * `stockDisponible` y el `+` de una linea no pasa de lo que hay.
 *
 * Nunca lanza: devuelve la `Lectura` de `obtenerProductos` para que quien
 * llama decida como responder si D1 falla (la pagina, con su cortesia; el
 * endpoint, con un 503 en JSON).
 */
import type { Catalogo } from '../scripts/carrito';
import { obtenerProductos, type Lectura } from './catalogo';
import { conStock } from './inventario';

export interface CatalogoCarrito {
  catalogo: Catalogo;
  /** true si alguna variante trae stock: el inventario esta encendido. */
  conInventario: boolean;
}

/** Lee el catalogo y lo reduce a lo que el carrito necesita pintar. */
export async function leerCatalogoCarrito(
  locals: unknown,
): Promise<{ lectura: Lectura<unknown>; datos: CatalogoCarrito | null }> {
  const lectura = await obtenerProductos(locals);
  if (lectura.estado !== 'ok' || !lectura.datos) return { lectura, datos: null };

  const conTopes = await conStock(locals, lectura.datos);
  let conInventario = false;

  /* Nada mas que esto: viaja en el HTML de /carrito y en el JSON del panel. */
  const catalogo: Catalogo = Object.fromEntries(
    conTopes.map((d) => {
      const img = d.imagenes[0];
      return [
        d.handle,
        {
          handle: d.handle,
          titulo: d.titulo,
          disponible: d.disponible,
          conVariantes: d.variantes.length > 1,
          variantes: d.variantes.map((v) => {
            if (v.stockDisponible !== undefined) conInventario = true;
            return {
              id: v.id,
              titulo: v.titulo,
              precio: v.precio,
              precioFormateado: v.precioFormateado,
              disponible: v.disponible,
              ...(v.stockDisponible !== undefined ? { stockDisponible: v.stockDisponible } : {}),
            };
          }),
          ...(img ? { imagen: { src: img.src, alt: img.alt } } : {}),
        },
      ];
    }),
  );

  return { lectura, datos: { catalogo, conInventario } };
}
