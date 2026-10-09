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
 * src/pages/admin/productos/[id]/subir.ts). Lo primero que se hace aquí es
 * marcar la página como «con JS», que es lo que esconde el botón «Subir»
 * (panel-fotos.css).
 *
 * La ficha tiene VARIAS zonas de carga (una por bloque y «Subir varias»):
 * cada una sube a su destino y pinta su propio progreso.
 */
import { LADO_MAX, ladoMini } from '../datos/imagenes';

document.documentElement.classList.add('f-con-js');


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

function fila(progreso: HTMLElement, nombre: string) {
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
  progreso.append(li);
  return { li, barra, estado };
}

/** Sube una. XHR y no fetch: fetch todavía no informa del progreso de subida. */
function enviar(form: HTMLFormElement, datos: FormData, barra: HTMLProgressElement): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolver) => {
    const x = new XMLHttpRequest();
    x.open('POST', form.action);
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

async function subirUna(form: HTMLFormElement, f: File): Promise<boolean> {
  const { li, barra, estado } = fila(form.querySelector<HTMLElement>('[data-f-progreso]')!, f.name);
  const intentar = async (): Promise<boolean> => {
    estado.textContent = 'Preparando…';
    li.dataset.estado = 'subiendo';
    const p = await preparar(f);
    const datos = new FormData();
    datos.append('foto', p?.foto ?? f, f.name);
    if (p?.mini) datos.append('mini', p.mini, `mini-${f.name}`);
    datos.append('nombre', f.name);
    datos.append('destino', form.querySelector<HTMLInputElement>('[name="destino"]')?.value ?? 'nombre');
    estado.textContent = 'Subiendo…';
    const r = await enviar(form, datos, barra);
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
      if (await intentar()) traerNuevas();
    });
    li.append(otra);
    return false;
  };
  return intentar();
}

async function subirTodas(form: HTMLFormElement, ficheros: File[]) {
  const cola = ficheros
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }));
  let alguna = false;
  /* Mientras sube, su bloque no se repinta (cliente-bloques.ts lo mira):
     perdería las barras de progreso. */
  form.dataset.subiendo = 'true';
  const trabajador = async () => {
    for (let f = cola.shift(); f; f = cola.shift()) {
      if (await subirUna(form, f)) alguna = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, cola.length) }, trabajador));
  delete form.dataset.subiendo;
  if (alguna) traerNuevas();
}

/**
 * Pinta las fotos nuevas SIN recargar la página.
 *
 * No se hace aquí: lo hace productos/cliente-bloques.ts, que es quien sabe
 * qué bloques tienen cosas sin guardar. Pide la ficha otra vez y añade cada
 * foto nueva a SU tarjeta (la que eligió el servidor), sin tocar lo que ella
 * esté escribiendo. La tarjeta la pinta el servidor, con la toma ya
 * sugerida: hay una sola plantilla.
 */
function traerNuevas() {
  document.dispatchEvent(new CustomEvent('pb:sincronizar'));
}

/* Delegado en el documento: un guardado puede repintar el bloque entero, y su
   zona de carga con él. Escuchando arriba, la zona nueva funciona sin
   engancharle nada. */
document.addEventListener('change', (e) => {
  const entrada = (e.target as HTMLElement).closest<HTMLInputElement>('[data-f-ficheros]');
  const form = entrada?.closest<HTMLFormElement>('[data-f-subida]');
  if (!entrada || !form) return;
  const fs = Array.from(entrada.files ?? []);
  entrada.value = '';
  if (fs.length) void subirTodas(form, fs);
});

/* Arrastrar y soltar sobre la zona. El <input> sigue siendo el camino con
   teclado y en el celular (abre la galería de fotos). */
const zonaDe = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('[data-f-soltar]');
document.addEventListener('dragover', (e) => {
  const zona = zonaDe(e);
  if (!zona || !e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  zona.dataset.encima = 'true';
});
document.addEventListener('dragleave', (e) => {
  const zona = zonaDe(e);
  if (zona) delete zona.dataset.encima;
});
document.addEventListener('drop', (e) => {
  const zona = zonaDe(e);
  const form = zona?.closest<HTMLFormElement>('[data-f-subida]');
  if (!zona || !form) return;
  e.preventDefault();
  delete zona.dataset.encima;
  const fs = Array.from(e.dataTransfer?.files ?? []);
  if (fs.length) void subirTodas(form, fs);
});
