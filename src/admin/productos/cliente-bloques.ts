/**
 * productos/cliente-bloques.ts — guardar cada bloque de la ficha SIN recargar
 * y sin perder lo escrito en los demás.
 *
 * EL PROBLEMA QUE RESUELVE
 * ===========================================================================
 * La ficha tiene varios formularios (Producto, una tarjeta por versión,
 * Versiones). Sin JS, el navegador envía SOLO el que se pulsó y pinta la
 * respuesta: lo que hubiera a medio escribir en otro bloque se pierde. Es la
 * contrapartida aceptada del modo sin JS (ver productos/bloques.ts). Con JS,
 * esto no puede pasar:
 *
 *   1. Cada envío de un bloque va por `fetch`. La respuesta es la MISMA
 *      página que vería sin JS (repintada con el error, o la de después del
 *      303 con «Guardado»), así que no hay una segunda plantilla ni un JSON
 *      que mantener: de esa página se toma el bloque enviado y se pone en su
 *      sitio.
 *   2. Los demás bloques se refrescan desde esa misma respuesta SOLO si no
 *      tienen nada sin guardar ni el foco dentro. Si lo tienen, se quedan
 *      como están, y solo se les añaden las fotos nuevas que no tuvieran.
 *   3. Cada bloque con cambios lleva la marca «Sin guardar», y salir de la
 *      página con alguno así pide confirmación al navegador.
 *
 * Las acciones de foto (↑↓, portada, quitar) las resuelve
 * fotos-cliente-rejilla.ts; el inventario, cliente-inventario.ts.
 */
import { accionFoto, contarFotos, prepararArrastre } from '../fotos-cliente-rejilla';
import '../cliente-inventario';

const seccionDe = (el: Element | null) => el?.closest<HTMLElement>('[data-bloque]') ?? null;

function marcar(seccion: HTMLElement, sucio: boolean) {
  if (sucio) seccion.dataset.sucio = '1';
  else delete seccion.dataset.sucio;
  const marca = seccion.querySelector<HTMLElement>('[data-sin-guardar]');
  if (marca) marca.hidden = !sucio;
}

/* Cualquier cosa escrita en el formulario de un bloque lo deja «sin guardar».
   Los formularios de inventario y de subida no cuentan: se aplican al pulsar. */
for (const tipo of ['input', 'change']) {
  document.addEventListener(tipo, (e) => {
    const el = e.target as HTMLElement;
    if (!el.closest('[data-bloque-form]') || el.matches('[type="file"]')) return;
    const s = seccionDe(el);
    if (s) marcar(s, true);
  });
}

window.addEventListener('beforeunload', (e) => {
  if (document.querySelector('[data-bloque][data-sucio]')) e.preventDefault();
});

/** Copia las barras de progreso de subida al bloque nuevo: que no se pierda el «Guardada». */
function conservarProgreso(viejo: HTMLElement, nuevo: HTMLElement) {
  const listas = viejo.querySelectorAll('[data-f-progreso]');
  const nuevas = nuevo.querySelectorAll('[data-f-progreso]');
  listas.forEach((l, i) => nuevas[i]?.replaceChildren(...Array.from(l.childNodes)));
}

/** Añade a un bloque con cambios las fotos que la respuesta trae y él no. */
function anadirFotos(local: HTMLElement, remoto: Element) {
  const lista = local.querySelector('[data-f-lista]');
  if (!lista) return;
  for (const li of remoto.querySelectorAll<HTMLElement>('[data-f-foto]')) {
    if (!document.getElementById(li.id)) lista.append(document.importNode(li, true));
  }
}

/**
 * Pone en la página lo que trae `doc` (la ficha repintada por el servidor).
 * `enviado` es el bloque que se acaba de enviar: ese se sustituye siempre.
 */
function aplicar(doc: Document, enviado: string | null) {
  const cont = document.querySelector<HTMLElement>('[data-bloques]');
  const remoto = doc.querySelector('[data-bloques]');
  if (!cont || !remoto) return false;
  const vistos = new Set<string>();
  let anterior: HTMLElement | null = null;
  for (const r of remoto.querySelectorAll<HTMLElement>(':scope > [data-bloque]')) {
    const clave = r.dataset.bloque!;
    vistos.add(clave);
    let local = cont.querySelector<HTMLElement>(`:scope > [data-bloque="${clave}"]`);
    const ocupado =
      local &&
      (local.dataset.sucio || local.contains(document.activeElement) || local.querySelector('[data-subiendo]'));
    if (!local) {
      local = document.importNode(r, true);
    } else if (clave === enviado || !ocupado) {
      const nuevo = document.importNode(r, true);
      conservarProgreso(local, nuevo);
      local.replaceWith(nuevo);
      local = nuevo;
    } else {
      anadirFotos(local, r);
      /* El inventario no tiene nada «a medio escribir» que perder. */
      const inv = r.querySelector('[data-inv-bloque]');
      if (inv) local.querySelector('[data-inv-bloque]')?.replaceWith(document.importNode(inv, true));
    }
    /* En el orden de la respuesta (reordenar versiones). Solo se mueve lo que
       no está ya en su sitio, para no quitarle el foco a nadie. */
    const sitio: ChildNode | null = anterior ? anterior.nextSibling : cont.firstChild;
    if (local !== sitio) cont.insertBefore(local, sitio);
    anterior = local;
  }
  /* Bloques que ya no existen (una versión quitada): fuera, salvo que tengan
     algo sin guardar — al guardarlos, el servidor dirá que ya no existen. */
  for (const s of cont.querySelectorAll<HTMLElement>(':scope > [data-bloque]')) {
    if (!vistos.has(s.dataset.bloque!) && !s.dataset.sucio) s.remove();
  }
  for (const zona of ['avisos', 'historial']) {
    const aqui = document.querySelector(`[data-region="${zona}"]`);
    const alli = doc.querySelector(`[data-region="${zona}"]`);
    if (aqui && alli) aqui.replaceWith(document.importNode(alli, true));
  }
  /* El enlace a la tienda con un sello nuevo: ver productos/cache.ts. */
  const ver = document.querySelector<HTMLAnchorElement>('[data-ver-ficha]');
  if (ver) {
    const u = new URL(ver.href);
    u.searchParams.set('v', Date.now().toString(36));
    ver.href = u.toString();
  }
  prepararArrastre();
  contarFotos();
  return true;
}

async function pedir(url: string, init?: RequestInit): Promise<Document | null> {
  const r = await fetch(url, { ...init, headers: { Accept: 'text/html' } });
  if (new URL(r.url).pathname.endsWith('/admin/entrar')) return null;
  return new DOMParser().parseFromString(await r.text(), 'text/html');
}

function avisarEn(seccion: HTMLElement, texto: string) {
  const zona = seccion.querySelector<HTMLElement>('[data-bloque-estado]');
  if (!zona) return;
  const p = document.createElement('p');
  p.className = 'p-error';
  p.setAttribute('role', 'alert');
  p.textContent = texto;
  zona.replaceChildren(p);
  zona.focus();
}

async function enviarBloque(form: HTMLFormElement, boton: HTMLButtonElement | null) {
  const seccion = seccionDe(form)!;
  const clave = seccion.dataset.bloque!;
  const datos = new FormData(form, boton);
  const botones = document.querySelectorAll<HTMLButtonElement>(`#${seccion.id} button`);
  botones.forEach((b) => (b.disabled = true));
  try {
    const doc = await pedir(form.action, { method: 'POST', body: datos });
    if (!doc) return avisarEn(seccion, 'La sesión caducó. No se guardó nada: entra otra vez en otra pestaña y vuelve a pulsar «Guardar».');
    if (!aplicar(doc, clave)) return avisarEn(seccion, 'No se pudo leer la respuesta. Recarga la página.');
    const nueva = document.querySelector<HTMLElement>(`[data-bloque="${clave}"]`);
    if (!nueva) return;
    /* Ir al primer campo con error; si no hay, al resultado del bloque. */
    const destino =
      nueva.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      nueva.querySelector<HTMLElement>('[data-bloque-estado]');
    destino?.focus();
  } catch {
    avisarEn(seccion, 'No se pudo guardar: revisa la conexión. Lo que escribiste sigue aquí.');
  } finally {
    botones.forEach((b) => (b.disabled = false));
  }
}

document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  if (!form.matches('[data-bloque-form]')) return;
  const boton = (e as SubmitEvent).submitter as HTMLButtonElement | null;
  e.preventDefault();
  /* Los botones de foto llevan `formaction` a /fotos: se aplican al pulsar. */
  if (boton?.hasAttribute('formaction')) void accionFoto(boton);
  else void enviarBloque(form, boton);
});

/* Tras una subida: traer la ficha y repartir las fotos nuevas. */
document.addEventListener('pb:sincronizar', async () => {
  try {
    const doc = await pedir(location.pathname);
    if (doc) aplicar(doc, null);
  } catch {
    /* La foto ya está guardada; al recargar se verá. */
  }
});
