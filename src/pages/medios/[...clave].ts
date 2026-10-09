/**
 * GET /medios/<clave> — las fotos que la dueña sube desde el panel, servidas
 * desde R2 por el propio Worker.
 *
 * POR QUE A TRAVES DEL WORKER Y NO UN BUCKET PUBLICO
 * ===========================================================================
 * Es la opción 2 de B.4, la recomendada: todo bajo un dominio, sin zona nueva
 * que configurar, y el `r2.dev` público está limitado por tasa y es solo para
 * desarrollo. El coste es una invocación del Worker por foto NO cacheada; con
 * la caché de abajo, eso es una vez por foto y por punto de presencia.
 *
 * FUERA DE /admin, Y SOLO LECTURA
 * ---------------------------------------------------------------------------
 * La puerta protege todo `/admin` por prefijo (src/admin/puerta.ts). Las fotos
 * las ve cualquier cliente, así que no pueden vivir ahí. Esta ruta solo LEE: el
 * tipo de bucket de aquí abajo no tiene `put` ni `delete`, por el mismo motivo
 * por el que `BaseD1` del sitio público no tiene `run()` (ver
 * src/admin/base.ts). Y solo sirve claves con la forma exacta que genera el
 * panel: ni listados, ni rutas con `..`, ni nada que no sea una foto suya.
 *
 * CACHE DE UN AÑO, `immutable`
 * ---------------------------------------------------------------------------
 * La clave lleva un UUID y no se reutiliza nunca: una foto nueva es una clave
 * nueva. Así que lo que se sirve en una URL no cambia jamás, y se le puede
 * decir al navegador y al borde que no vuelvan a preguntar. Además se guarda en
 * la Cache API del punto de presencia: un Worker no pasa por la caché de
 * Cloudflare por su cuenta, y sin esto cada visita leería de R2.
 *
 * EL ALIAS .webp
 * ---------------------------------------------------------------------------
 * La página del carrito pide la miniatura de cada línea cambiando `.jpg` por
 * `.webp` (src/pages/carrito.astro: así encuentra el WebP de las fotos de
 * public/img). Las de R2 no tienen versión .webp aparte; en vez de dar 404, se
 * sirve la que existe. El navegador mira el `Content-Type`, no la extensión.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

interface ObjetoR2 {
  body: ReadableStream;
  httpEtag: string;
  size: number;
  httpMetadata?: { contentType?: string };
}

/** Solo lectura, a propósito. Ver la cabecera. */
interface BucketLectura {
  get(clave: string): Promise<ObjetoR2 | null>;
}

const CLAVE = /^productos\/[a-z0-9-]+\/[0-9a-f-]{36}-\d{1,5}x\d{1,5}(-mini)?\.(jpg|png|webp)$/;
const TIPOS: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const UN_ANO = 'public, max-age=31536000, immutable';

const noEncontrada = () =>
  new Response('No existe.\n', {
    status: 404,
    /* Corto: si la foto aparece (una subida a medias que se reintenta), que se
       vea pronto. */
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
  });

export const GET: APIRoute = async ({ params, request, locals }) => {
  const clave = String(params.clave ?? '');
  if (!CLAVE.test(clave)) return noEncontrada();

  const env = (locals as { runtime?: { env?: Record<string, unknown> } }).runtime?.env;
  const bucket = env?.MEDIOS as BucketLectura | undefined;
  if (!bucket?.get) {
    console.error('[medios] falta el binding MEDIOS (r2_buckets en wrangler).');
    return new Response('Fotos no disponibles.\n', { status: 503, headers: { 'Retry-After': '300' } });
  }

  /* `caches.default` existe en Workers; en otros entornos (astro dev) no, y
     entonces simplemente no se cachea aquí. */
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const claveCache = new Request(new URL(request.url).toString(), { method: 'GET' });
  const guardada = await cache?.match(claveCache).catch(() => undefined);
  if (guardada) return guardada;

  let objeto = await bucket.get(clave);
  if (!objeto && clave.endsWith('.webp')) {
    for (const ext of ['jpg', 'png']) {
      objeto = await bucket.get(clave.replace(/\.webp$/, `.${ext}`));
      if (objeto) break;
    }
  }
  if (!objeto) return noEncontrada();

  const ext = clave.split('.').pop()!;
  const cabeceras = new Headers({
    'Content-Type': objeto.httpMetadata?.contentType ?? TIPOS[ext] ?? 'application/octet-stream',
    'Content-Length': String(objeto.size),
    'Cache-Control': UN_ANO,
    ETag: objeto.httpEtag,
    /* Que el navegador no «adivine» otro tipo: lo que se sirve aquí es una
       imagen y solo una imagen. */
    'X-Content-Type-Options': 'nosniff',
  });

  if (request.headers.get('If-None-Match') === objeto.httpEtag) {
    return new Response(null, { status: 304, headers: cabeceras });
  }

  const respuesta = new Response(objeto.body, { status: 200, headers: cabeceras });
  if (cache) {
    const copia = respuesta.clone();
    const esperar = (locals as { runtime?: { ctx?: { waitUntil?: (p: Promise<unknown>) => void } } }).runtime?.ctx
      ?.waitUntil;
    const guardar = cache.put(claveCache, copia).catch(() => undefined);
    if (esperar) esperar.call((locals as { runtime: { ctx: object } }).runtime.ctx, guardar);
    else await guardar;
  }
  return respuesta;
};
