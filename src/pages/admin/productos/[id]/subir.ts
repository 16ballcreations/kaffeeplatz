/**
 * POST /admin/productos/<id>/subir — guardar fotos nuevas de un producto.
 *
 * A DÓNDE VA CADA FOTO (campo `destino`)
 * ===========================================================================
 *   '<id de versión>'  se subió en la tarjeta de esa versión: va ahí, sin
 *                      sugerencia. La versión está decidida.
 *   'producto'         se subió en «Fotos generales».
 *   'nombre'           «Subir varias»: la versión la PROPONE el nombre del
 *                      fichero (convención aprobada, fotos-nombre.ts); si el
 *                      nombre no la dice, va a las generales.
 *
 * La toma se sugiere SIEMPRE por el nombre, y el alt se prerrellena
 * («Aeropress Clear — Verde, armado»). La foto entra `por_revisar`: no se
 * publica hasta que se guarde el bloque donde quedó. Así un nombre mal
 * escrito no publica nada en el color equivocado: deja la foto, sin publicar,
 * en una tarjeta donde salta a la vista y desde donde se cambia de versión.
 *
 * UNA FOTO POR PETICION, Y CADA UNA SE GUARDA EN CUANTO LLEGA
 * ===========================================================================
 * Es el punto 2 de B.7 y la prueba 11b del plan: «subir 9 fotos de golpe y que
 * ninguna se pierda si falla la última». El navegador de la dueña manda las
 * fotos de una en una (varias a la vez, cada una en su petición), y esta ruta
 * guarda en R2 y en D1 la que recibe antes de responder. Si se va el wifi en
 * la novena, las ocho primeras ya están en la base. Una subida todo-o-nada
 * desde un celular es una subida que falla.
 *
 * SIN JAVASCRIPT TAMBIEN FUNCIONA
 * ---------------------------------------------------------------------------
 * El formulario de la página es un `<form enctype="multipart/form-data">` de
 * verdad. Sin JS manda TODAS las fotos en una petición, sin miniatura; esta
 * ruta las procesa una a una igual (cada una con su propio guardado) y vuelve
 * a la página con el resultado en la URL. Con JS pide JSON y la página pinta
 * el progreso.
 *
 * VALIDACION EN EL SERVIDOR, SIEMPRE
 * ---------------------------------------------------------------------------
 * Tipo por los bytes, tamaño, medidas (src/admin/fotos-validar.ts). Lo que
 * comprueba el navegador es comodidad; lo que cuenta es esto. Los rechazos
 * vuelven con un MENSAJE CLARO (prueba 10: «nunca un error en blanco»).
 *
 * La puerta ya garantizó sesión y `Origin` (src/admin/puerta.ts): esta ruta no
 * lo vuelve a comprobar, por la misma razón que no lo hace ninguna del panel.
 */
import type { APIRoute } from 'astro';
import { ruta } from '../../../../datos/sitio';
import { baseAdmin } from '../../../../admin/base';
import { cabecerasPanel } from '../../../../admin/puerta';
import { comprobar, guardarEnR2, medios, FotoRechazada } from '../../../../admin/fotos-subida';
import { insertarFoto } from '../../../../datos/consultas/imagenes-escribir';
import { sugerir } from '../../../../admin/fotos-nombre';
import { altAutomatico } from '../../../../admin/fotos-asignar';
import { versionesConFotos } from '../../../../admin/productos/ficha';
import { productoParaEditar } from '../../../../admin/productos/leer';

export const prerender = false;

/** Tope de la petición entera (la subida sin JS trae todas las fotos juntas). */
const MAX_PETICION = 95 * 1024 * 1024;

interface Resultado {
  nombre: string;
  ok: boolean;
  id?: number;
  error?: string;
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: cabecerasPanel({ 'Content-Type': 'application/json; charset=utf-8' }),
  });

export const POST: APIRoute = async ({ request, locals, params }) => {
  const quiereJson = (request.headers.get('Accept') ?? '').includes('application/json');
  const productoId = Number(params.id);
  const volver = (q: string) =>
    new Response(null, {
      status: 303,
      headers: cabecerasPanel({ Location: ruta(`/admin/productos/${productoId}${q}`) }),
    });
  const fallo = (mensaje: string, status: number) =>
    quiereJson ? json({ ok: false, error: mensaje }, status) : volver(`?error-fotos=${encodeURIComponent(mensaje)}`);

  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_PETICION) {
    return fallo('Son demasiadas fotos de una vez. Súbelas en tandas más pequeñas.', 413);
  }

  let db, bucket;
  try {
    db = baseAdmin(locals);
    bucket = medios(locals);
  } catch (e) {
    console.error('[fotos] sin configuración:', e instanceof Error ? e.message : e);
    return fallo('El almacén de fotos no está configurado todavía. Avisa a soporte.', 503);
  }

  const producto = Number.isInteger(productoId) && productoId > 0 ? await productoParaEditar(db, productoId) : null;
  if (!producto) return fallo('Ese producto no existe.', 404);
  const handle = producto.handle;
  const versiones = versionesConFotos(producto);
  const roles = (await db.prepare('SELECT id, nombre FROM roles_imagen ORDER BY orden, id').all<{ id: string; nombre: string }>())
    .results;

  let datos: FormData;
  try {
    datos = await request.formData();
  } catch {
    return fallo('La subida llegó incompleta. Inténtalo otra vez.', 400);
  }

  const fotos = datos.getAll('foto').filter((f): f is File => typeof f !== 'string' && f.size > 0);
  if (!fotos.length) return fallo('No llegó ninguna foto.', 400);
  /* La miniatura solo tiene sentido con UNA foto por petición (la vía con JS). */
  const mini = fotos.length === 1 ? (datos.get('mini') as File | null) : null;
  const nombreDado = fotos.length === 1 ? String(datos.get('nombre') ?? '') : '';
  const destino = String(datos.get('destino') ?? 'nombre');
  const fija = versiones.find((v) => String(v.id) === destino);
  if (destino !== 'producto' && destino !== 'nombre' && !fija) {
    return fallo('Esa versión ya no existe. Recarga la página.', 409);
  }

  const resultados: Resultado[] = [];
  for (const foto of fotos) {
    /* El nombre original se guarda para la sugerencia (0006). Recortado y sin
       rutas: algunos navegadores viejos mandaban "C:\fakepath\..." */
    const nombre = (nombreDado || foto.name || 'foto').split(/[\\/]/).pop()!.slice(0, 200);
    let claves: string[] = [];
    try {
      const c = await comprobar(foto, mini instanceof File ? mini : null);
      const r2 = await guardarEnR2(bucket, handle, c);
      claves = r2.claves;
      const s = sugerir(nombre, handle, versiones, roles);
      const varianteId = fija ? fija.id : destino === 'nombre' ? (s.varianteId ?? null) : null;
      const rol = s.rol ?? null;
      const id = await insertarFoto(db, producto.id, {
        clave: r2.clave,
        /* Prerrellenado (B.7, punto 6): «Producto — Versión, toma». */
        alt: altAutomatico(
          producto.titulo,
          versiones.find((v) => v.id === varianteId)?.titulo ?? null,
          roles.find((r) => r.id === rol)?.nombre ?? null,
        ),
        varianteId,
        rol,
        ancho: c.medidas.ancho,
        alto: c.medidas.alto,
        nombreOriginal: nombre,
      });
      resultados.push({ nombre, ok: true, id });
    } catch (e) {
      /* Si R2 guardó y D1 no, se borra lo de R2: un fichero sin fila no lo
         encuentra nadie y nunca se limpiaría. */
      if (claves.length) await bucket.delete(claves).catch(() => undefined);
      const mensaje =
        e instanceof FotoRechazada ? e.message : 'No se pudo guardar. Inténtalo otra vez en un momento.';
      if (!(e instanceof FotoRechazada)) {
        console.error('[fotos] fallo al guardar', nombre, e instanceof Error ? e.message : e);
      }
      resultados.push({ nombre, ok: false, error: mensaje });
    }
  }

  if (quiereJson) {
    const r = resultados[0]!;
    return fotos.length === 1 ? json(r, r.ok ? 200 : 422) : json({ resultados });
  }
  const bien = resultados.filter((r) => r.ok).length;
  const mal = resultados.filter((r) => !r.ok);
  const q = new URLSearchParams();
  if (bien) q.set('hecho', 'fotos');
  if (mal.length) q.set('error-fotos', mal.map((r) => `${r.nombre}: ${r.error}`).join(' · ').slice(0, 600));
  return volver(`?${q}`);
};

/** Un GET aquí no sube nada: vuelve a la ficha del producto. */
export const GET: APIRoute = ({ params }) =>
  new Response(null, {
    status: 303,
    headers: cabecerasPanel({ Location: ruta(`/admin/productos/${encodeURIComponent(String(params.id ?? ''))}`) }),
  });
