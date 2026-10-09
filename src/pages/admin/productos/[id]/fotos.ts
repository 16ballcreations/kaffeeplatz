/**
 * POST /admin/productos/<id>/fotos — lo que se hace con UNA foto y se aplica
 * al pulsar, sin esperar al botón de guardar del bloque:
 *
 *   accion=subir:<id>|bajar:<id>   mover una foto dentro de su bloque
 *   accion=orden, grupo, ids       el orden de un bloque entero (arrastrar)
 *   accion=portada:<id>            portada del producto (la del catálogo)
 *   accion=portada-variante:<id>   portada de su versión
 *   accion=quitar:<id>             quitar la foto del producto
 *
 * Versión, toma y descripción NO están aquí: se guardan con su bloque (ver
 * productos/bloques.ts), que además publica las fotos que esperaban.
 *
 * CON Y SIN JAVASCRIPT
 * ===========================================================================
 * Los botones son `formaction` dentro del formulario del bloque. Sin JS el
 * navegador lo envía tal cual y esta ruta responde con 303 a la ficha. Con JS
 * se manda solo la acción por `fetch` pidiendo JSON, y la respuesta trae las
 * portadas recalculadas para mover las estrellas sin recargar (ver
 * src/admin/fotos-cliente-rejilla.ts).
 *
 * Todo se valida CONTRA LO QUE HAY EN LA BASE AHORA, no contra el formulario:
 * que la foto sea de este producto. Un id manipulado no puede mover la foto
 * de otro producto (además, cada UPDATE lleva `AND producto_id = ?`).
 *
 * Mover y quitar cambian lo que enseña la tienda (la portada es «la
 * primera»), así que se invalida la copia de respaldo de la ficha pública.
 */
import type { APIRoute } from 'astro';
import { ruta } from '../../../../datos/sitio';
import { baseAdmin } from '../../../../admin/base';
import { cabecerasPanel } from '../../../../admin/puerta';
import { productoConFotos } from '../../../../datos/consultas/imagenes-panel';
import { guardarOrden, quitarFoto } from '../../../../datos/consultas/imagenes-escribir';
import { grupoDe, mover, ordenarGrupo, alFrente, alFrenteDelGrupo } from '../../../../admin/fotos-orden';
import { invalidarProducto } from '../../../../admin/productos/cache';

export const prerender = false;

class Invalido extends Error {}

export const POST: APIRoute = async ({ request, locals, params, url }) => {
  const quiereJson = (request.headers.get('Accept') ?? '').includes('application/json');
  const productoId = Number(params.id);
  const responder = (ok: boolean, mensaje: string, extra: Record<string, unknown> = {}, status = 200, ancla = '') =>
    quiereJson
      ? new Response(JSON.stringify({ ok, mensaje, ...extra }), {
          status: ok ? 200 : status,
          headers: cabecerasPanel({ 'Content-Type': 'application/json; charset=utf-8' }),
        })
      : new Response(null, {
          status: 303,
          headers: cabecerasPanel({
            Location: ruta(
              `/admin/productos/${productoId}?${ok ? 'aviso-fotos' : 'error-fotos'}=${encodeURIComponent(mensaje)}${ancla}`,
            ),
          }),
        });

  let db;
  try {
    db = baseAdmin(locals);
  } catch {
    return responder(false, 'La base de datos no responde.', {}, 503);
  }

  try {
    const p = Number.isInteger(productoId) && productoId > 0 ? await productoConFotos(db, productoId) : null;
    if (!p) return responder(false, 'Ese producto no existe.', {}, 404);
    const d = await request.formData();
    const [accion = '', idTxt = ''] = String(d.get('accion') ?? '').split(':');
    const id = Number(idTxt);
    const foto = p.fotos.find((f) => f.id === id);
    /* El grupo es la SECCIÓN donde está la foto (su versión, o el producto),
       publicada o no: dentro de una tarjeta se ordenan todas juntas. */
    const lista = p.fotos.map((f) => ({ id: f.id, grupo: grupoDe(f) }));
    let mensaje = '';

    if (accion === 'orden') {
      const ids = String(d.get('ids') ?? '').split(',').map(Number);
      const nuevo = ordenarGrupo(lista, String(d.get('grupo') ?? ''), ids);
      if (!nuevo) throw new Invalido('Las fotos cambiaron en otra pestaña. Recarga la página.');
      await guardarOrden(db, p.id, p.fotos, nuevo, 'arrastrar');
      mensaje = 'Orden guardado.';
    } else {
      if (!foto) throw new Invalido('Esa foto ya no está. Recarga la página.');
      if (accion === 'subir' || accion === 'bajar') {
        const nuevo = mover(lista, id, accion === 'subir' ? -1 : 1);
        if (nuevo) await guardarOrden(db, p.id, p.fotos, nuevo, accion);
        mensaje = 'Orden guardado.';
      } else if (accion === 'portada') {
        await guardarOrden(db, p.id, p.fotos, alFrente(lista, id)!, 'portada del producto');
        mensaje = 'Portada del producto cambiada: es la foto del catálogo.';
      } else if (accion === 'portada-variante') {
        if (foto.varianteId === null || foto.porRevisar) {
          throw new Invalido('Primero guarda su versión para publicarla; después podrás hacerla portada.');
        }
        await guardarOrden(db, p.id, p.fotos, alFrenteDelGrupo(lista, id)!, 'portada de variante');
        mensaje = 'Portada de la versión cambiada.';
      } else if (accion === 'quitar') {
        await quitarFoto(db, p.id, foto);
        mensaje = 'Foto quitada del producto.';
      } else {
        throw new Invalido('Acción desconocida.');
      }
    }
    await invalidarProducto(url.origin, p.handle);

    /* El estado de portadas DESPUES del cambio, leído de la base: la página lo
       pinta tal cual en vez de adivinarlo. */
    const tras = await productoConFotos(db, productoId);
    return responder(
      true,
      mensaje,
      {
        portada: tras?.portadaId ?? null,
        portadas: Object.fromEntries((tras?.variantes ?? []).map((v) => [v.id, v.portadaId])),
      },
      200,
      foto ? `#bloque-${grupoDe(foto)}` : '',
    );
  } catch (e) {
    if (e instanceof Invalido) return responder(false, e.message, {}, 422);
    console.error('[fotos] cambio fallido:', e instanceof Error ? e.message : e);
    return responder(false, 'No se pudo guardar. Inténtalo otra vez en un momento.', {}, 500);
  }
};

export const GET: APIRoute = ({ params }) =>
  new Response(null, {
    status: 303,
    headers: cabecerasPanel({ Location: ruta(`/admin/productos/${encodeURIComponent(String(params.id ?? ''))}`) }),
  });
