/**
 * cliente-inventario.ts — los botones de inventario sin recargar la página.
 *
 * Los formularios de inventario (`data-inv`: «Vendí 1», cargar, corregir,
 * deshacer, «Venderlo igual»…) funcionan solos: POST a
 * /admin/inventario/accion y 303 de vuelta a la pantalla (PRG). Aquí se manda
 * lo mismo por `fetch`, que sigue ese 303 y trae la pantalla ya repintada; de
 * ella se toman SOLO las filas de inventario y las zonas de respuesta
 * (`data-region="pregunta"` y `"franja"`).
 *
 * POR QUÉ: en la ficha del producto, «Vendí 1» está en la tarjeta de una
 * versión, y encima puede haber una descripción a medio escribir en el
 * bloque «Producto». Recargar la página para enseñar «−1 Hervidor» la
 * borraría. Con esto, nada fuera de la fila de inventario cambia.
 *
 * Las confirmaciones siguen siendo las del servidor: si la unidad está
 * apartada, la respuesta trae la PREGUNTA (G.4.2) y aquí solo se pinta.
 */

/** Las zonas que se sustituyen tras un toque. */
const REGIONES = ['pregunta', 'franja'];

/**
 * Solo la fila del toque (`v`): en «Contar la bodega» las otras filas pueden
 * tener números tecleados y sin guardar todavía. Sin `v` (no pasa hoy), todas.
 */
function sustituir(doc: Document, v: string | null) {
  const filas = v
    ? document.querySelectorAll<HTMLElement>(`[data-inv-fila="${CSS.escape(v)}"]`)
    : document.querySelectorAll<HTMLElement>('[data-inv-fila]');
  for (const fila of filas) {
    const nueva = doc.querySelector(`[data-inv-fila="${fila.dataset.invFila}"]`);
    if (nueva) fila.replaceWith(document.importNode(nueva, true));
  }
  for (const r of REGIONES) {
    const aqui = document.querySelector(`[data-region="${r}"]`);
    const alli = doc.querySelector(`[data-region="${r}"]`);
    if (aqui && alli) aqui.replaceWith(document.importNode(alli, true));
  }
}

async function enviar(form: HTMLFormElement, boton: HTMLButtonElement | null) {
  const datos = new FormData(form, boton);
  const botones = form.querySelectorAll<HTMLButtonElement>('button');
  botones.forEach((b) => (b.disabled = true));
  try {
    const r = await fetch(form.action, { method: 'POST', body: datos, headers: { Accept: 'text/html' } });
    if (new URL(r.url).pathname.endsWith('/admin/entrar')) {
      alert('La sesión caducó. Recarga la página y vuelve a entrar; no se cambió nada.');
      return;
    }
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    sustituir(doc, datos.get('v') ? String(datos.get('v')) : null);
    /* Lo primero que hay que leer: la pregunta si la hay, si no la franja. */
    const foco =
      document.querySelector<HTMLElement>('[data-region="pregunta"] .pi-pregunta') ??
      document.querySelector<HTMLElement>('[data-region="franja"] .pi-franja');
    if (foco) {
      foco.tabIndex = -1;
      foco.focus({ preventScroll: foco.classList.contains('pi-franja') });
    }
  } catch {
    alert('No se pudo enviar: revisa la conexión. No se cambió nada.');
  } finally {
    botones.forEach((b) => (b.disabled = false));
  }
}

document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  if (!form.matches('[data-inv]')) return;
  e.preventDefault();
  void enviar(form, (e as SubmitEvent).submitter as HTMLButtonElement | null);
});

/* «Esperar» y la × de la franja: sin JS son enlaces a la misma pantalla sin
   el aviso. Con JS basta con vaciar la zona: recargar perdería lo escrito. */
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-inv-cerrar]');
  if (!a) return;
  e.preventDefault();
  a.closest('[data-region]')?.replaceChildren();
});
