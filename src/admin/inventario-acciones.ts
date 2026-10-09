/**
 * inventario-acciones.ts — lo que hace cada botón del inventario y de los
 * despachos, y a dónde vuelve.
 *
 * TODOS LOS FORMULARIOS SON POST + 303 (PRG)
 * ===========================================================================
 * Es el patrón 4 de A.6 y aquí importa por algo muy concreto: «Vendí 1» es un
 * POST que DESCUENTA. Si la respuesta fuera la página pintada, recargar con el
 * pulgar (el gesto de bajar la pantalla en el móvil) reenviaría el formulario y
 * descontaría otra unidad. Con 303 a un GET, recargar solo vuelve a mirar.
 *
 * Y funcionan sin JavaScript: son `<form>` de toda la vida. El JS, si lo hay,
 * solo puede hacerlos más cómodos, nunca hacerlos posibles.
 *
 * LO QUE VIAJA EN LA URL DE VUELTA SON CLAVES, NUNCA TEXTOS
 * ---------------------------------------------------------------------------
 * `?hecho=m&m=123` y no `?msg=Cargaste 10 filtros`: la página relee el
 * movimiento 123 de la base y escribe ella la frase. Así nadie puede fabricar
 * un enlace que pinte un mensaje inventado dentro del panel, y la frase dice
 * siempre lo que de verdad pasó.
 *
 * LA COMPROBACIÓN DE `Origin` NO ESTÁ AQUÍ, Y ES A PROPÓSITO
 * ---------------------------------------------------------------------------
 * La hace la puerta (`puerta.ts`) para TODO POST de /admin antes de que esto
 * se ejecute. Repetirla aquí invitaría a pensar que en la puerta es opcional.
 */

import { inventarioDelPanel, type InventarioDelPanel } from '../datos/inventario';

/** Un entero del formulario dentro de [min, max], o `null`. */
function entero(form: FormData, campo: string, min: number, max: number): number | null {
  const crudo = String(form.get(campo) ?? '').trim();
  if (!/^-?\d{1,6}$/.test(crudo)) return null;
  const n = Number(crudo);
  return n >= min && n <= max ? n : null;
}

function texto(form: FormData, campo: string, max = 200): string {
  return String(form.get(campo) ?? '').trim().slice(0, max);
}

/** Construye `?a=1&b=2#ancla` sin los vacíos. */
function destino(base: string, params: Record<string, string | number | null | undefined>, ancla?: string): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return `${base}${s ? `?${s}` : ''}${ancla ? `#${ancla}` : ''}`;
}

const INV = '/admin/inventario';
const DESP = '/admin/despachos';

/**
 * Un POST de /admin/inventario/accion → la URL a la que volver.
 * Nunca lanza: un fallo vuelve con `?error=fallo` y el log dice qué pasó.
 */
export async function accionInventario(form: FormData, locals: unknown): Promise<string> {
  const accion = texto(form, 'accion', 20);
  const v = entero(form, 'v', 1, 1e6);
  const paquete = entero(form, 'paquete', 1, 1e6);
  const ancla = v ? `v${v}` : undefined;
  try {
    const inv = inventarioDelPanel(locals);
    switch (accion) {
      case 'whatsapp':
        return await vender(inv, form, v, paquete, entero(form, 'n', 1, 999) ?? 1);

      case 'sumar': {
        const n = entero(form, 'n', 1, 999);
        if (!v || !n) return destino(INV, { error: 'cantidad', paquete }, ancla);
        const motivo = texto(form, 'motivo', 20);
        if (motivo === 'whatsapp') return await vender(inv, form, v, paquete, n);
        const r =
          motivo === 'rotura'
            ? await inv.ajustar({ varianteId: v, delta: -n, motivo: 'ajuste', nota: 'Se rompió o se perdió' })
            : motivo === 'devolucion' || motivo === 'entrada'
              ? await inv.ajustar({ varianteId: v, delta: n, motivo })
              : null;
        if (!r) return destino(INV, { error: 'fallo' }, ancla);
        return r.ok
          ? destino(INV, { paquete, hecho: 'm', m: r.movimientoId }, ancla)
          : destino(INV, { paquete, error: r.error }, ancla);
      }

      case 'corregir': {
        const anterior = entero(form, 'anterior', -99_999, 99_999);
        const nuevo = entero(form, 'nuevo', -99_999, 99_999);
        if (!v || anterior === null || nuevo === null) return destino(INV, { error: 'cantidad' }, ancla);
        const r = await inv.fijar({ varianteId: v, anterior, nuevo, nota: texto(form, 'nota') });
        return r.ok
          ? destino(INV, { paquete, hecho: 'm', m: r.movimientoId }, ancla)
          : destino(INV, { paquete, error: r.error, abrir: v }, ancla);
      }

      case 'alaventa': {
        if (!v) return destino(INV, { error: 'no-existe' });
        const si = texto(form, 'si', 1) === '1';
        await inv.ponerALaVenta(v, si);
        return destino(INV, { paquete, hecho: si ? 'a-la-venta' : 'retirado', v }, ancla);
      }

      case 'deshacer': {
        const m = entero(form, 'm', 1, 1e9);
        if (!m) return destino(INV, { error: 'no-deshacible' }, ancla);
        const r = await inv.deshacer(m);
        return r.ok
          ? destino(INV, { paquete, hecho: 'deshecho' }, ancla)
          : destino(INV, { paquete, error: r.error }, ancla);
      }

      case 'nombrar': {
        const d = entero(form, 'd', 1, 1e6);
        if (d) await inv.nombrarDespacho(d, texto(form, 'cliente', 80));
        return destino(INV, { paquete, hecho: 'nombrado', d }, ancla);
      }

      case 'interruptor': {
        const activo = texto(form, 'activo', 1) === '1';
        /* Encender exige la casilla marcada, y lo comprueba el SERVIDOR: la
           confirmación no puede depender de un `required` que un navegador
           viejo ignora. Apagar no la pide: es la vuelta atrás (R13) y tiene
           que costar un toque. */
        if (activo && texto(form, 'confirmo', 2) !== 'si') {
          return destino(`${INV}/interruptor`, { error: 'confirmar' });
        }
        await inv.cambiarInterruptor(activo);
        return destino(INV, { hecho: activo ? 'encendido' : 'apagado' });
      }

      default:
        return destino(INV, { error: 'fallo' });
    }
  } catch (fallo) {
    console.error(
      `[admin] inventario: «${accion}» falló:`,
      fallo instanceof Error ? fallo.message : fallo,
    );
    return destino(INV, { error: 'fallo', paquete }, ancla);
  }
}

/** «Vendí por WhatsApp»: o descuenta, o vuelve PREGUNTANDO (G.4.2). */
async function vender(
  inv: InventarioDelPanel,
  form: FormData,
  v: number | null,
  paquete: number | null,
  n: number,
): Promise<string> {
  if (!v) return destino(INV, { error: 'no-existe' });
  const r = await inv.venderPorWhatsapp({
    varianteId: v,
    cantidad: n,
    despachoId: paquete,
    forzar: texto(form, 'forzar', 1) === '1',
  });
  if (r.ok) return destino(INV, { paquete, hecho: 'm', m: r.movimientoId }, `v${v}`);
  if (r.motivo === 'reservado' || r.motivo === 'sin-stock') {
    return destino(INV, { paquete, pregunta: r.motivo, v, n }, 'pregunta');
  }
  return destino(INV, { paquete, error: r.motivo ?? 'fallo' }, `v${v}`);
}

/** Un POST de /admin/despachos/accion → la URL a la que volver. Nunca lanza. */
export async function accionDespacho(form: FormData, locals: unknown): Promise<string> {
  const accion = texto(form, 'accion', 20);
  const d = entero(form, 'd', 1, 1e6);
  if (!d) return destino(DESP, { error: 'fallo' });
  try {
    const inv = inventarioDelPanel(locals);
    switch (accion) {
      case 'salio':
        return (await inv.cerrarDespacho(d, 'despachado'))
          ? destino(DESP, { hecho: 'salio', d })
          : destino(DESP, { error: 'paquete-cerrado' });
      case 'anular':
        /* Anular devuelve unidades a la estantería y no tiene «Deshacer»: por
           eso exige la casilla, igual que encender el inventario. */
        if (texto(form, 'confirmo', 2) !== 'si') return destino(DESP, { error: 'confirmar' }, `d${d}`);
        return (await inv.cerrarDespacho(d, 'anulado', texto(form, 'nota') || null))
          ? destino(DESP, { hecho: 'anulado' })
          : destino(DESP, { error: 'paquete-cerrado' });
      case 'reabrir':
        return (await inv.reabrirDespacho(d))
          ? destino(DESP, { hecho: 'reabierto' }, `d${d}`)
          : destino(DESP, { error: 'no-deshacible' });
      case 'nombrar':
        await inv.nombrarDespacho(d, texto(form, 'cliente', 80));
        return destino(DESP, {}, `d${d}`);
      default:
        return destino(DESP, { error: 'fallo' });
    }
  } catch (fallo) {
    console.error(
      `[admin] despachos: «${accion}» falló:`,
      fallo instanceof Error ? fallo.message : fallo,
    );
    return destino(DESP, { error: 'fallo' });
  }
}
