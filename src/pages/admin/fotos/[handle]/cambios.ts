/**
 * POST /admin/fotos/<handle>/cambios — todo lo que se hace con fotos ya subidas.
 *
 *   accion=guardar              variante, rol y alt de cada foto (y confirmar)
 *   accion=subir:<id>|bajar:<id> mover una foto dentro de su grupo
 *   accion=orden, grupo, ids    el orden de un grupo entero (arrastrar)
 *   accion=portada:<id>         portada del producto (la del catálogo)
 *   accion=portada-variante:<id> portada de su color
 *   accion=quitar:<id>          quitar la foto del producto
 *
 * UN SOLO FORMULARIO, CON Y SIN JAVASCRIPT
 * ===========================================================================
 * La rejilla de la página es UN `<form>` y cada botón (subir, bajar, portada,
 * quitar) es un `<button name="accion" value="subir:12">`. Sin JS el
 * navegador lo envía tal cual y esta ruta responde con 303 a la página, con el
 * resultado en la URL. Con JS se manda lo mismo por `fetch` pidiendo JSON, y la
 * respuesta trae las portadas recalculadas para que la página mueva las
 * estrellas sin recargar (ver src/admin/fotos-cliente-rejilla.ts).
 *
 * Todo se valida CONTRA LO QUE HAY EN LA BASE AHORA, no contra lo que dice el
 * formulario: que la foto sea de este producto, que la variante también, que
 * el rol exista. Un id manipulado no puede mover la foto de otro producto
 * (además, cada UPDATE lleva `AND producto_id = ?`).
 */
import type { APIRoute } from 'astro';
import { ruta } from '../../../../datos/sitio';
import { baseAdmin } from '../../../../admin/base';
import { cabecerasPanel } from '../../../../admin/puerta';
import { productoConFotos, type ProductoFotos } from '../../../../datos/consultas/imagenes-panel';
import {
  guardarAsignaciones,
  guardarOrden,
  quitarFoto,
  type Asignacion,
} from '../../../../datos/consultas/imagenes-escribir';
import { grupoDe, mover, ordenarGrupo, alFrente, alFrenteDelGrupo } from '../../../../admin/fotos-orden';

export const prerender = false;

/** Largo máximo del alt: una frase, no un párrafo. */
const MAX_ALT = 200;

class Invalido extends Error {}

/** Lee las asignaciones del formulario y las valida contra la base. */
function leerAsignaciones(d: FormData, p: ProductoFotos): Asignacion[] {
  const variantes = new Set(p.variantes.map((v) => v.id));
  const roles = new Set(p.roles.map((r) => r.id));
  const fotos = new Set(p.fotos.map((f) => f.id));
  const salida: Asignacion[] = [];
  for (const crudo of d.getAll('foto')) {
    const id = Number(crudo);
    if (!fotos.has(id)) continue; // quitada en otra pestaña: se ignora, no es un error
    const v = String(d.get(`variante-${id}`) ?? '');
    const r = String(d.get(`rol-${id}`) ?? '');
    const alt = String(d.get(`alt-${id}`) ?? '').replace(/\s+/g, ' ').trim();
    const varianteId = v === '' ? null : Number(v);
    if (varianteId !== null && !variantes.has(varianteId)) throw new Invalido('Una de las variantes ya no existe. Recarga la página.');
    if (r !== '' && !roles.has(r)) throw new Invalido('Uno de los roles ya no existe. Recarga la página.');
    /* `alt` es NOT NULL en el esquema y obligatorio en el zod de hoy (B.7,
       punto 6). Vacío no se guarda: se dice cuál. */
    if (!alt) throw new Invalido('Falta la descripción de una foto: todas necesitan una (la leen los lectores de pantalla y Google).');
    if (alt.length > MAX_ALT) throw new Invalido(`Una descripción pasa de ${MAX_ALT} letras. Acórtala.`);
    salida.push({ id, varianteId, rol: r === '' ? null : r, alt });
  }
  return salida;
}

export const POST: APIRoute = async ({ request, locals, params }) => {
  const quiereJson = (request.headers.get('Accept') ?? '').includes('application/json');
  const handle = String(params.handle ?? '');
  const responder = (ok: boolean, mensaje: string, extra: Record<string, unknown> = {}, status = 200) =>
    quiereJson
      ? new Response(JSON.stringify({ ok, mensaje, ...extra }), {
          status: ok ? 200 : status,
          headers: cabecerasPanel({ 'Content-Type': 'application/json; charset=utf-8' }),
        })
      : new Response(null, {
          status: 303,
          headers: cabecerasPanel({
            Location: ruta(`/admin/fotos/${encodeURIComponent(handle)}?${ok ? 'ok' : 'error'}=${encodeURIComponent(mensaje)}`),
          }),
        });

  let db;
  try {
    db = baseAdmin(locals);
  } catch {
    return responder(false, 'La base de datos no responde.', {}, 503);
  }

  try {
    const p = await productoConFotos(db, handle);
    if (!p) return responder(false, 'Ese producto no existe.', {}, 404);
    const d = await request.formData();
    const [accion = '', idTxt = ''] = String(d.get('accion') ?? '').split(':');
    const id = Number(idTxt);
    const foto = p.fotos.find((f) => f.id === id);
    const lista = p.fotos.map((f) => ({ id: f.id, grupo: grupoDe(f) }));
    let mensaje = '';

    if (accion === 'guardar') {
      const n = await guardarAsignaciones(db, p.id, p.fotos, leerAsignaciones(d, p));
      mensaje = n === 0 ? 'No había cambios que guardar.' : n === 1 ? 'Guardada 1 foto.' : `Guardadas ${n} fotos.`;
    } else if (accion === 'orden') {
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
          throw new Invalido('Primero asígnale un color y guarda; después podrás hacerla portada de ese color.');
        }
        await guardarOrden(db, p.id, p.fotos, alFrenteDelGrupo(lista, id)!, 'portada de variante');
        mensaje = 'Portada del color cambiada.';
      } else if (accion === 'quitar') {
        await quitarFoto(db, p.id, foto);
        mensaje = 'Foto quitada del producto.';
      } else {
        throw new Invalido('Acción desconocida.');
      }
    }

    /* El estado de portadas DESPUES del cambio, leído de la base: la página lo
       pinta tal cual en vez de adivinarlo. */
    const tras = await productoConFotos(db, handle);
    return responder(true, mensaje, {
      portada: tras?.portadaId ?? null,
      portadas: Object.fromEntries((tras?.variantes ?? []).map((v) => [v.id, v.portadaId])),
    });
  } catch (e) {
    if (e instanceof Invalido) return responder(false, e.message, {}, 422);
    console.error('[fotos] cambio fallido:', e instanceof Error ? e.message : e);
    return responder(false, 'No se pudo guardar. Inténtalo otra vez en un momento.', {}, 500);
  }
};

export const GET: APIRoute = ({ params }) =>
  new Response(null, {
    status: 303,
    headers: cabecerasPanel({ Location: ruta(`/admin/fotos/${encodeURIComponent(String(params.handle ?? ''))}`) }),
  });
