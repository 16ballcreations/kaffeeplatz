/**
 * /admin/fotos — ya no es una pantalla: las fotos viven en la ficha de cada
 * producto (pedido del cliente, 9 oct 2026: «se me hace confuso que por un
 * lado se suban las imágenes y por otro se suban los datos»).
 *
 * Se redirige con 301 para que un favorito o un enlace viejo sigan llevando a
 * un sitio útil: la lista de productos, que ahora enseña lo que enseñaba esta
 * (sin fotos, fotos sin publicar, versiones sin foto propia). La puerta va
 * antes: sin sesión, esto lleva a entrar como cualquier otra ruta del panel.
 */
import type { APIRoute } from 'astro';
import { ruta } from '../../../datos/sitio';
import { cabecerasPanel } from '../../../admin/puerta';

export const prerender = false;

export const GET: APIRoute = () =>
  new Response(null, { status: 301, headers: cabecerasPanel({ Location: ruta('/admin/productos') }) });
