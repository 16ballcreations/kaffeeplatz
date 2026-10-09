/**
 * /admin/inventario — ya no es una pantalla aparte. El cliente pidió (9 oct
 * 2026) el inventario «en la misma vista de productos», así que vive:
 *
 *   - en la LISTA de productos: cuántas se pueden vender de cada versión,
 *     filtros «Stock en negativo», «Poco stock», «Sin unidades», y en la
 *     cabecera el interruptor y el cuadre;
 *   - en la FICHA de cada producto: el sub-bloque «Inventario» de cada
 *     versión, con «Vendí 1 por WhatsApp», cargar, descontar y corregir;
 *   - en «Contar la bodega» (/admin/productos/contar), para el día del conteo.
 *
 * Esta dirección redirige a la lista para que un favorito siga sirviendo. Se
 * conservan la búsqueda (`q`) y el paquete abierto (`paquete`, «Añadir otra
 * cosa»): un enlace a medio flujo no pierde el paquete. Lo demás de la URL
 * vieja (`hecho`, `pregunta`…) no tiene sentido fuera de su pantalla.
 *
 * 301: es un cambio de sitio permanente. La puerta va antes (sin sesión, a
 * entrar), y `/admin/inventario/accion`, `/interruptor` y `/<variante>`
 * siguen existiendo.
 */
import type { APIRoute } from 'astro';
import { ruta } from '../../../datos/sitio';
import { cabecerasPanel } from '../../../admin/puerta';

export const prerender = false;

export const GET: APIRoute = ({ url }) => {
  const q = new URLSearchParams();
  const buscado = url.searchParams.get('q');
  const paquete = url.searchParams.get('paquete');
  if (buscado) q.set('q', buscado.slice(0, 80));
  if (paquete && /^\d{1,9}$/.test(paquete)) q.set('paquete', paquete);
  const s = q.toString();
  return new Response(null, {
    status: 301,
    headers: cabecerasPanel({ Location: ruta(`/admin/productos${s ? `?${s}` : ''}`) }),
  });
};
