/**
 * fotos-cliente-rejilla.ts — los atajos de la rejilla de asignación.
 *
 * Todo lo que hay aquí es una MEJORA sobre un formulario que ya funciona solo
 * (ver src/pages/admin/fotos/[handle]/cambios.ts):
 *
 *   - «Copiar a las siguientes N»: el atajo que convierte asignar 9 fotos en
 *     un minuto (B.7, punto 4). Solo cambia desplegables: no guarda nada hasta
 *     que ella pulse «Guardar», igual que si los hubiera cambiado a mano.
 *   - La descripción (alt) se rehace sola al cambiar color o toma, MIENTRAS
 *     ella no la haya escrito a mano. Si la tocó, es suya y no se pisa.
 *   - Subir, bajar, portada y quitar se hacen sin recargar: así no se pierde
 *     lo que esté sin guardar en otras tarjetas. Las estrellas de portada se
 *     ponen con lo que DEVUELVE el servidor, no con lo que se supone aquí.
 *   - Arrastrar para ordenar dentro de un grupo, en escritorio. En el celular
 *     arrastrar es incómodo y no es el único camino: están ↑ y ↓ (B.7, punto 5).
 *
 * Los eventos se escuchan DELEGADOS en el formulario: las tarjetas que añade la
 * subida (fotos-cliente-subir.ts) funcionan sin engancharles nada.
 */

const form = document.querySelector<HTMLFormElement>('[data-f-rejilla]');
const mensajes = document.querySelector<HTMLElement>('[data-f-mensajes]');

let sinGuardar = false;

function avisar(texto: string, error = false) {
  if (!mensajes) return;
  const p = document.createElement('p');
  p.className = error ? 'p-error' : 'f-ok';
  p.setAttribute('role', error ? 'alert' : 'status');
  p.textContent = texto;
  mensajes.replaceChildren(p);
}

const tarjetas = () => Array.from(form!.querySelectorAll<HTMLLIElement>('[data-f-foto]'));
const texto = (s: HTMLSelectElement | null) =>
  s && s.value ? (s.selectedOptions[0]?.textContent ?? '').trim() : '';

/** El mismo alt automático que pinta el servidor: «Producto — Color, toma». */
function rehacerAlt(li: HTMLElement) {
  const alt = li.querySelector<HTMLInputElement>('[data-f-alt]');
  if (!alt || alt.dataset.fAltAuto !== 'true') return;
  const color = texto(li.querySelector('[data-f-variante]'));
  const toma = texto(li.querySelector('[data-f-rol]')).toLowerCase();
  const partes = [color, toma].filter(Boolean).join(', ');
  alt.value = partes ? `${form!.dataset.producto} — ${partes}` : (form!.dataset.producto ?? '');
}

function marcarSinGuardar() {
  sinGuardar = true;
}

function copiarASiguientes(li: HTMLElement) {
  const que = li.querySelector<HTMLSelectElement>('[data-f-aplicar-que]')?.value ?? 'variante';
  const n = Math.max(1, Math.min(50, Number(li.querySelector<HTMLInputElement>('[data-f-aplicar-cuantas]')?.value) || 1));
  const todas = tarjetas();
  const desde = todas.indexOf(li as HTMLLIElement);
  const destino = todas.slice(desde + 1, desde + 1 + n);
  const color = li.querySelector<HTMLSelectElement>('[data-f-variante]')?.value;
  const toma = li.querySelector<HTMLSelectElement>('[data-f-rol]')?.value;
  for (const t of destino) {
    const sv = t.querySelector<HTMLSelectElement>('[data-f-variante]');
    const sr = t.querySelector<HTMLSelectElement>('[data-f-rol]');
    if (sv && color !== undefined && que !== 'rol') sv.value = color;
    if (sr && toma !== undefined && que !== 'variante') sr.value = toma;
    rehacerAlt(t);
  }
  marcarSinGuardar();
  avisar(
    destino.length
      ? `Copiado a ${destino.length} ${destino.length === 1 ? 'foto' : 'fotos'}. Falta pulsar «Guardar».`
      : 'No hay fotos después de esta.',
  );
}

/** Pone las estrellas de portada según lo que respondió el servidor. */
function pintarPortadas(portada: number | null, portadas: Record<string, number | null>) {
  const nombres = new Map<string, string>();
  for (const o of form!.querySelectorAll<HTMLOptionElement>('[data-f-variante] option')) {
    if (o.value) nombres.set(o.value, (o.textContent ?? '').trim());
  }
  const deVariante = new Map<number, string>();
  for (const [v, id] of Object.entries(portadas)) if (id !== null) deVariante.set(id, nombres.get(v) ?? '');
  for (const li of tarjetas()) {
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

function contar() {
  for (const g of form!.querySelectorAll<HTMLElement>('[data-f-grupo]')) {
    const c = g.querySelector('.f-cuenta');
    if (c) c.textContent = String(g.querySelectorAll('[data-f-foto]').length);
  }
}

async function enviar(datos: FormData): Promise<{ ok: boolean; mensaje: string; portada?: number | null; portadas?: Record<string, number | null> }> {
  try {
    const r = await fetch(form!.action, { method: 'POST', body: datos, headers: { Accept: 'application/json' } });
    return await r.json();
  } catch {
    return { ok: false, mensaje: 'No se pudo guardar: revisa la conexión o recarga la página.' };
  }
}

/** Una acción de botón (subir, bajar, portada, quitar), sin recargar. */
async function accion(boton: HTMLButtonElement) {
  const li = boton.closest<HTMLLIElement>('[data-f-foto]');
  if (!li) return;
  const [tipo] = boton.value.split(':');
  if (tipo === 'quitar' && !confirm('¿Quitar esta foto del producto? Dejará de verse en la tienda.')) return;

  const datos = new FormData();
  datos.set('accion', boton.value);
  boton.disabled = true;
  const r = await enviar(datos);
  boton.disabled = false;
  if (!r.ok) return avisar(r.mensaje, true);

  const lista = li.parentElement!;
  if (tipo === 'subir' && li.previousElementSibling) lista.insertBefore(li, li.previousElementSibling);
  else if (tipo === 'bajar' && li.nextElementSibling) lista.insertBefore(li.nextElementSibling, li);
  else if (tipo === 'portada' || tipo === 'portada-variante') lista.prepend(li);
  else if (tipo === 'quitar') li.remove();
  /* Mover un nodo le quita el foco al botón: se le devuelve, para que quien
     usa teclado pueda pulsar ↑ varias veces seguidas. */
  if (tipo !== 'quitar') boton.focus();

  pintarPortadas(r.portada ?? null, r.portadas ?? {});
  contar();
  avisar(r.mensaje);
}

/* --- Arrastrar, dentro de un grupo -------------------------------------- */

let arrastrada: HTMLLIElement | null = null;
let ordenInicial = '';
const ordenDe = (lista: HTMLElement) => Array.from(lista.children, (li) => (li as HTMLElement).dataset.fFoto).join(',');

function prepararArrastre() {
  for (const li of tarjetas()) {
    /* «Por revisar» no se ordena: todavía no es de ningún grupo. */
    li.draggable = li.closest('[data-f-grupo]')?.getAttribute('data-f-grupo') !== 'revisar';
  }
}

async function guardarArrastre(lista: HTMLElement) {
  const datos = new FormData();
  datos.set('accion', 'orden');
  datos.set('grupo', lista.dataset.fLista ?? '');
  datos.set('ids', ordenDe(lista));
  const r = await enviar(datos);
  if (!r.ok) {
    avisar(r.mensaje, true);
    return;
  }
  pintarPortadas(r.portada ?? null, r.portadas ?? {});
  avisar(r.mensaje);
}

if (form) {
  prepararArrastre();
  form.addEventListener('f:nuevas', prepararArrastre);

  form.addEventListener('change', (e) => {
    const el = e.target as HTMLElement;
    if (el.matches('[data-f-variante], [data-f-rol]')) {
      rehacerAlt(el.closest('[data-f-foto]')!);
      marcarSinGuardar();
    }
  });

  form.addEventListener('input', (e) => {
    const el = e.target as HTMLElement;
    if (el.matches('[data-f-alt]')) {
      /* La escribió ella: desde ahora es suya y no se rehace sola. */
      el.dataset.fAltAuto = 'false';
      marcarSinGuardar();
    }
  });

  form.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-f-aplicar-boton]');
    if (b) copiarASiguientes(b.closest('[data-f-foto]')!);
  });

  form.addEventListener('submit', (e) => {
    const b = (e as SubmitEvent).submitter as HTMLButtonElement | null;
    /* Guardar va por el camino normal: el servidor guarda y la página vuelve
       a pintarse con los grupos nuevos. */
    if (!b || b.value === 'guardar') {
      sinGuardar = false;
      return;
    }
    e.preventDefault();
    void accion(b);
  });

  form.addEventListener('dragstart', (e) => {
    arrastrada = (e.target as HTMLElement).closest<HTMLLIElement>('[data-f-foto]');
    if (!arrastrada) return;
    ordenInicial = ordenDe(arrastrada.parentElement!);
    e.dataTransfer?.setData('text/plain', arrastrada.dataset.fFoto ?? '');
  });
  form.addEventListener('dragover', (e) => {
    const sobre = (e.target as HTMLElement).closest<HTMLLIElement>('[data-f-foto]');
    if (!arrastrada || !sobre || sobre === arrastrada || sobre.parentElement !== arrastrada.parentElement) return;
    e.preventDefault();
    const caja = sobre.getBoundingClientRect();
    const antes = e.clientY < caja.top + caja.height / 2;
    sobre.parentElement!.insertBefore(arrastrada, antes ? sobre : sobre.nextElementSibling);
  });
  form.addEventListener('drop', (e) => e.preventDefault());
  form.addEventListener('dragend', () => {
    const lista = arrastrada?.parentElement;
    arrastrada = null;
    /* Solo si cambió algo: soltarla donde estaba no es una escritura. */
    if (lista && ordenDe(lista) !== ordenInicial) void guardarArrastre(lista);
  });

  /* Salir con cambios sin guardar: el navegador pregunta. Con 9 fotos
     asignadas a mano, perderlas por un toque en «atrás» es lo peor que puede
     pasar en esta pantalla. */
  window.addEventListener('beforeunload', (e) => {
    if (sinGuardar) e.preventDefault();
  });
}
