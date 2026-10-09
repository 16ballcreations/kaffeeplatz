/**
 * fotos-cliente-rejilla.ts — las fotos de cada bloque de la ficha, en el
 * navegador.
 *
 * Todo lo que hay aquí es una MEJORA sobre formularios que ya funcionan solos
 * (ver src/pages/admin/productos/[id]/fotos.ts y productos/bloques.ts):
 *
 *   - La descripción (alt) se rehace sola al cambiar versión o toma, MIENTRAS
 *     ella no la haya escrito a mano. Si la tocó, es suya y no se pisa.
 *   - Subir, bajar, portada y quitar se hacen sin recargar: así no se pierde
 *     lo que esté sin guardar en ningún bloque. Las estrellas de portada se
 *     ponen con lo que DEVUELVE el servidor, no con lo que se supone aquí.
 *   - Arrastrar para ordenar dentro de un bloque, en escritorio. En el
 *     celular arrastrar es incómodo y no es el único camino: están ↑ y ↓
 *     (B.7, punto 5).
 *
 * «Copiar a las siguientes N» (la pantalla anterior de fotos) ya no está: su
 * uso era poner el COLOR a una tanda, y ahora el color lo da la tarjeta donde
 * se sube, o el nombre en «Subir varias». La toma la sigue proponiendo el
 * nombre del fichero.
 *
 * Los eventos se escuchan DELEGADOS en el documento: las tarjetas que añade la
 * subida o que repinta un guardado funcionan sin engancharles nada. El envío
 * de los botones de foto lo decide productos/cliente-bloques.ts, que es quien
 * escucha los `submit` de los bloques, y llama aquí a `accionFoto`.
 */

const texto = (s: HTMLSelectElement | null) =>
  s && s.value ? (s.selectedOptions[0]?.textContent ?? '').trim() : '';

/** El mismo alt automático que pinta el servidor: «Producto — Versión, toma». */
function rehacerAlt(li: HTMLElement) {
  const alt = li.querySelector<HTMLInputElement>('[data-f-alt]');
  if (!alt || alt.dataset.fAltAuto !== 'true') return;
  const producto = document.querySelector<HTMLElement>('[data-producto-titulo]')?.dataset.productoTitulo ?? '';
  const color = texto(li.querySelector('[data-f-variante]'));
  const toma = texto(li.querySelector('[data-f-rol]')).toLowerCase();
  const partes = [color, toma].filter(Boolean).join(', ');
  alt.value = partes ? `${producto} — ${partes}` : producto;
}

/** Un mensaje dentro del bloque de la foto. */
function avisar(seccion: HTMLElement | null, mensaje: string, error = false) {
  const zona = seccion?.querySelector<HTMLElement>('[data-bloque-estado]');
  if (!zona) return;
  const p = document.createElement('p');
  p.className = error ? 'p-error' : 'pp-hecho';
  p.setAttribute('role', error ? 'alert' : 'status');
  p.textContent = mensaje;
  zona.replaceChildren(p);
}

/** Pone las estrellas de portada según lo que respondió el servidor. */
function pintarPortadas(portada: number | null, portadas: Record<string, number | null>) {
  const nombres = new Map<string, string>();
  for (const s of document.querySelectorAll<HTMLElement>('[data-bloque^="v"]')) {
    nombres.set(s.dataset.bloque!.slice(1), s.dataset.nombre ?? '');
  }
  const deVariante = new Map<number, string>();
  for (const [v, id] of Object.entries(portadas)) if (id !== null) deVariante.set(id, nombres.get(v) ?? '');
  for (const li of document.querySelectorAll<HTMLElement>('[data-f-foto]')) {
    const id = Number(li.dataset.fFoto);
    const mp = li.querySelector<HTMLElement>('[data-f-marca-producto]');
    const mv = li.querySelector<HTMLElement>('[data-f-marca-variante]');
    if (mp) mp.hidden = id !== portada;
    if (mv) {
      mv.hidden = !deVariante.has(id);
      mv.textContent = `★ Portada de ${deVariante.get(id) ?? ''}`;
    }
  }
}

/** Cuenta las fotos de cada bloque y enseña o esconde «sin fotos». */
export function contarFotos() {
  for (const s of document.querySelectorAll<HTMLElement>('[data-bloque]')) {
    const lista = s.querySelector('[data-f-lista]');
    if (!lista) continue;
    const n = lista.querySelectorAll('[data-f-foto]').length;
    const c = s.querySelector('[data-f-cuenta]');
    if (c) c.textContent = String(n);
    const vacio = s.querySelector<HTMLElement>('[data-f-vacio]');
    if (vacio) vacio.hidden = n > 0;
    const pend = s.querySelector<HTMLElement>('[data-f-pendientes]');
    const np = lista.querySelectorAll('.f-foto--revisar').length;
    if (pend) {
      pend.hidden = np === 0;
      pend.textContent = np === 1 ? '1 foto sin publicar' : `${np} fotos sin publicar`;
    }
  }
}

interface RespuestaFoto {
  ok: boolean;
  mensaje: string;
  portada?: number | null;
  portadas?: Record<string, number | null>;
}

async function enviar(accion: string, datos: FormData): Promise<RespuestaFoto> {
  try {
    const r = await fetch(accion, { method: 'POST', body: datos, headers: { Accept: 'application/json' } });
    return await r.json();
  } catch {
    return { ok: false, mensaje: 'No se pudo guardar: revisa la conexión o recarga la página.' };
  }
}

/** Una acción de botón (subir, bajar, portada, quitar), sin recargar. */
export async function accionFoto(boton: HTMLButtonElement) {
  const li = boton.closest<HTMLLIElement>('[data-f-foto]');
  const seccion = boton.closest<HTMLElement>('[data-bloque]');
  if (!li) return;
  const [tipo] = boton.value.split(':');
  if (tipo === 'quitar' && !confirm('¿Quitar esta foto del producto? Dejará de verse en la tienda.')) return;

  const datos = new FormData();
  datos.set('accion', boton.value);
  boton.disabled = true;
  const r = await enviar(boton.formAction, datos);
  boton.disabled = false;
  if (!r.ok) return avisar(seccion, r.mensaje, true);

  const lista = li.parentElement!;
  if (tipo === 'subir' && li.previousElementSibling) lista.insertBefore(li, li.previousElementSibling);
  else if (tipo === 'bajar' && li.nextElementSibling) lista.insertBefore(li.nextElementSibling, li);
  else if (tipo === 'portada' || tipo === 'portada-variante') lista.prepend(li);
  else if (tipo === 'quitar') li.remove();
  /* Mover un nodo le quita el foco al botón: se le devuelve, para que quien
     usa teclado pueda pulsar ↑ varias veces seguidas. */
  if (tipo !== 'quitar') boton.focus();

  pintarPortadas(r.portada ?? null, r.portadas ?? {});
  contarFotos();
  avisar(seccion, r.mensaje);
}

/* --- Arrastrar, dentro de un bloque ------------------------------------- */

let arrastrada: HTMLLIElement | null = null;
let ordenInicial = '';
const ordenDe = (lista: HTMLElement) => Array.from(lista.children, (li) => (li as HTMLElement).dataset.fFoto).join(',');

/** Marca las fotos como arrastrables. Se llama al cargar y tras cada repintado. */
export function prepararArrastre() {
  for (const li of document.querySelectorAll<HTMLLIElement>('[data-f-foto]')) li.draggable = true;
}

async function guardarArrastre(lista: HTMLElement) {
  const seccion = lista.closest<HTMLElement>('[data-bloque]');
  const ruta = lista.closest('form')?.querySelector<HTMLButtonElement>('[formaction]')?.formAction;
  if (!ruta) return;
  const datos = new FormData();
  datos.set('accion', 'orden');
  datos.set('grupo', lista.dataset.fLista ?? '');
  datos.set('ids', ordenDe(lista));
  const r = await enviar(ruta, datos);
  if (!r.ok) return avisar(seccion, r.mensaje, true);
  pintarPortadas(r.portada ?? null, r.portadas ?? {});
  avisar(seccion, r.mensaje);
}

prepararArrastre();

document.addEventListener('change', (e) => {
  const el = e.target as HTMLElement;
  if (el.matches('[data-f-variante], [data-f-rol]')) rehacerAlt(el.closest('[data-f-foto]')!);
});

document.addEventListener('input', (e) => {
  const el = e.target as HTMLElement;
  /* La escribió ella: desde ahora es suya y no se rehace sola. */
  if (el.matches('[data-f-alt]')) el.dataset.fAltAuto = 'false';
});

document.addEventListener('dragstart', (e) => {
  arrastrada = (e.target as HTMLElement).closest<HTMLLIElement>('[data-f-foto]');
  if (!arrastrada) return;
  ordenInicial = ordenDe(arrastrada.parentElement!);
  e.dataTransfer?.setData('text/plain', arrastrada.dataset.fFoto ?? '');
});
document.addEventListener('dragover', (e) => {
  const sobre = (e.target as HTMLElement).closest<HTMLLIElement>('[data-f-foto]');
  if (!arrastrada || !sobre || sobre === arrastrada || sobre.parentElement !== arrastrada.parentElement) return;
  e.preventDefault();
  const caja = sobre.getBoundingClientRect();
  const antes = e.clientY < caja.top + caja.height / 2;
  sobre.parentElement!.insertBefore(arrastrada, antes ? sobre : sobre.nextElementSibling);
});
document.addEventListener('drop', (e) => {
  if (arrastrada) e.preventDefault();
});
document.addEventListener('dragend', () => {
  const lista = arrastrada?.parentElement;
  arrastrada = null;
  /* Solo si cambió algo: soltarla donde estaba no es una escritura. */
  if (lista && ordenDe(lista) !== ordenInicial) void guardarArrastre(lista);
});
