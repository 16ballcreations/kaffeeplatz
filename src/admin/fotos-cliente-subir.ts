/**
 * fotos-cliente-subir.ts — la subida de fotos con progreso, en el navegador.
 *
 * FOTO A FOTO, Y CADA UNA SE GUARDA EN CUANTO TERMINA
 * ===========================================================================
 * La dueña suelta las 9 fotos de golpe. Aquí se mandan una tras otra, cada
 * una en su propia petición y con su propia barra: si la novena falla o se va
 * el wifi, las ocho primeras ya están guardadas (prueba 11b del plan), y la que
 * falló se puede reintentar sola.
 *
 * SE ACHICAN AQUI, ANTES DE SUBIR
 * ---------------------------------------------------------------------------
 * Una foto de celular son 4–8 MB (B.4). En un Worker no corre `sharp`, así que
 * el único sitio donde se puede reducir sin servicios extra es este: el propio
 * navegador la redibuja a 1600 px de lado (el mismo tope que `npm run
 * imagenes`) y genera la miniatura de 480 px. Sube ~300 KB en vez de 6 MB, que
 * desde un celular es la diferencia entre esperar y no esperar. Y de paso la
 * foto queda ya girada según su EXIF, que es como se ve.
 *
 * Si el navegador no puede redibujarla (un formato que no conoce), se sube el
 * fichero tal cual, sin miniatura: el servidor lo valida y, si no es JPG, PNG
 * o WebP, contesta con un mensaje claro que se enseña en su fila.
 *
 * Sin JavaScript nada de esto corre y el formulario se envía entero (ver
 * src/pages/admin/fotos/[handle]/subir.ts). Lo primero que se hace aquí es
 * marcar la página como «con JS», que es lo que esconde el botón «Subir» y
 * enseña los atajos de la rejilla (panel-fotos.css).
 */
import { LADO_MAX, ladoMini } from '../datos/imagenes';

document.documentElement.classList.add('f-con-js');

const form = document.querySelector<HTMLFormElement>('[data-f-subida]');
const entrada = form?.querySelector<HTMLInputElement>('[data-f-ficheros]');
const zona = form?.querySelector<HTMLElement>('[data-f-soltar]');
const progreso = document.querySelector<HTMLUListElement>('[data-f-progreso]');

/**
 * De una en una, y por orden de nombre. Se probó con tres a la vez y la
 * rejilla quedaba en el orden en que TERMINABAN (la `-armado` antes que la
 * `-desarmado`): el orden de la base es el de llegada, y «copiar a las
 * siguientes N» depende de que las fotos estén en el orden en que se
 * hicieron. Ordenadas por nombre, la convención (`<handle>-<color>-...`) las
 * agrupa por color sola. Ya llegan achicadas (~300 KB), así que en serie
 * apenas se nota.
 */
const A_LA_VEZ = 1;
const CALIDAD = 0.85;

interface Preparada {
  foto: Blob;
  mini: Blob | null;
}

const aBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', CALIDAD));

function dibujar(img: ImageBitmap, ancho: number, alto: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  const g = c.getContext('2d')!;
  /* Fondo blanco: un PNG con transparencia pasado a JPG quedaría negro. Las
     fotos de producto van sobre fondo claro, y blanco es lo que se espera. */
  g.fillStyle = '#fff';
  g.fillRect(0, 0, ancho, alto);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, ancho, alto);
  return c;
}

/** La foto a ≤1600 px y su miniatura, en JPG. `null` si no se pudo. */
async function preparar(f: File): Promise<Preparada | null> {
  try {
    const img = await createImageBitmap(f, { imageOrientation: 'from-image' });
    const k = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
    const ancho = Math.max(1, Math.round(img.width * k));
    const alto = Math.max(1, Math.round(img.height * k));
    /* Las medidas de la miniatura salen de la MISMA cuenta que usa el
       servidor para comprobarla y la tienda para el `srcset`. */
    const [am, hm] = ladoMini(ancho, alto);
    const [foto, mini] = await Promise.all([aBlob(dibujar(img, ancho, alto)), aBlob(dibujar(img, am, hm))]);
    img.close();
    return foto ? { foto, mini } : null;
  } catch {
    return null;
  }
}

function fila(nombre: string) {
  const li = document.createElement('li');
  li.className = 'f-progreso__fila';
  const n = document.createElement('span');
  n.className = 'f-progreso__nombre';
  n.textContent = nombre;
  const barra = document.createElement('progress');
  barra.max = 100;
  barra.value = 0;
  barra.setAttribute('aria-label', `Subiendo ${nombre}`);
  const estado = document.createElement('span');
  estado.className = 'f-progreso__estado';
  estado.textContent = 'En espera';
  li.append(n, barra, estado);
  progreso?.append(li);
  return { li, barra, estado };
}

/** Sube una. XHR y no fetch: fetch todavía no informa del progreso de subida. */
function enviar(datos: FormData, barra: HTMLProgressElement): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolver) => {
    const x = new XMLHttpRequest();
    x.open('POST', form!.action);
    x.setRequestHeader('Accept', 'application/json');
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) barra.value = Math.round((e.loaded / e.total) * 100);
    };
    x.onload = () => {
      try {
        resolver(JSON.parse(x.responseText));
      } catch {
        /* La sesión caducó (303 a entrar) o algo devolvió HTML. */
        resolver({ ok: false, error: 'La sesión pudo caducar. Recarga la página y vuelve a entrar.' });
      }
    };
    x.onerror = () => resolver({ ok: false, error: 'Sin conexión. Pulsa «Reintentar» cuando vuelva.' });
    x.send(datos);
  });
}

async function subirUna(f: File): Promise<boolean> {
  const { li, barra, estado } = fila(f.name);
  const intentar = async (): Promise<boolean> => {
    estado.textContent = 'Preparando…';
    li.dataset.estado = 'subiendo';
    const p = await preparar(f);
    const datos = new FormData();
    datos.append('foto', p?.foto ?? f, f.name);
    if (p?.mini) datos.append('mini', p.mini, `mini-${f.name}`);
    datos.append('nombre', f.name);
    estado.textContent = 'Subiendo…';
    const r = await enviar(datos, barra);
    if (r.ok) {
      barra.value = 100;
      estado.textContent = 'Guardada';
      li.dataset.estado = 'ok';
      return true;
    }
    li.dataset.estado = 'error';
    estado.textContent = r.error ?? 'No se pudo subir.';
    const otra = document.createElement('button');
    otra.type = 'button';
    otra.className = 'f-boton';
    otra.textContent = 'Reintentar';
    otra.addEventListener('click', async () => {
      otra.remove();
      if (await intentar()) await traerNuevas();
    });
    li.append(otra);
    return false;
  };
  return intentar();
}

async function subirTodas(ficheros: File[]) {
  const cola = ficheros
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }));
  let alguna = false;
  const trabajador = async () => {
    for (let f = cola.shift(); f; f = cola.shift()) {
      if (await subirUna(f)) alguna = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, cola.length) }, trabajador));
  if (alguna) await traerNuevas();
}

/**
 * Pinta las tarjetas nuevas SIN recargar la página.
 *
 * Se pide la página otra vez y se copian solo las tarjetas que aquí no están
 * (todas caen en «Por revisar»). No se recarga entera para no perder lo que la
 * dueña estuviera cambiando más abajo mientras subían las fotos. La tarjeta la
 * pinta el servidor, con la sugerencia ya calculada: hay una sola plantilla.
 */
async function traerNuevas() {
  const rejilla = document.querySelector<HTMLFormElement>('[data-f-rejilla]');
  try {
    const html = await (await fetch(location.pathname, { headers: { Accept: 'text/html' } })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const remota = doc.querySelector<HTMLFormElement>('[data-f-rejilla]');
    if (!rejilla || !remota) return location.reload();
    const grupoRemoto = remota.querySelector('[data-f-grupo="revisar"]');
    if (!grupoRemoto) return;
    let grupo = rejilla.querySelector('[data-f-grupo="revisar"]');
    if (!grupo) {
      grupo = document.importNode(grupoRemoto, true);
      grupo.querySelector('ol')!.replaceChildren();
      rejilla.querySelector('[data-f-grupo]')?.before(grupo);
    }
    const lista = grupo.querySelector('ol')!;
    for (const li of grupoRemoto.querySelectorAll<HTMLElement>('[data-f-foto]')) {
      if (!document.getElementById(li.id)) lista.append(document.importNode(li, true));
    }
    /* Un producto que no tenía fotos tampoco tenía botón de guardar. */
    if (!rejilla.querySelector('.f-guardar')) {
      const g = remota.querySelector('.f-guardar');
      if (g) rejilla.append(document.importNode(g, true));
      rejilla.querySelector(':scope > p.p-entradilla')?.remove();
    }
    const cuenta = grupo.querySelector('.f-cuenta');
    if (cuenta) cuenta.textContent = String(lista.children.length);
    rejilla.dispatchEvent(new CustomEvent('f:nuevas'));
  } catch {
    location.reload();
  }
}

if (form && entrada && progreso) {
  entrada.addEventListener('change', () => {
    const fs = Array.from(entrada.files ?? []);
    entrada.value = '';
    if (fs.length) void subirTodas(fs);
  });

  /* Arrastrar y soltar sobre la zona. El <input> sigue siendo el camino con
     teclado y en el celular (abre la galería de fotos). */
  zona?.addEventListener('dragover', (e) => {
    e.preventDefault();
    zona.dataset.encima = 'true';
  });
  zona?.addEventListener('dragleave', () => delete zona.dataset.encima);
  zona?.addEventListener('drop', (e) => {
    e.preventDefault();
    delete zona.dataset.encima;
    const fs = Array.from(e.dataTransfer?.files ?? []);
    if (fs.length) void subirTodas(fs);
  });
}
