/**
 * productos/texto.ts — la descripción como la escribe Andreina, y la dirección
 * del producto.
 *
 * LA DESCRIPCION SE EDITA COMO TEXTO, NO COMO HTML
 * ===========================================================================
 * En D1 vive `descripcion_html`, saneado al guardar (B.5). Pero Andreina no es
 * técnica, y un `<textarea>` lleno de `<p>` y `<br>` es justo lo que la regla
 * «nada de jerga» prohíbe. Así que el panel le enseña TEXTO: un párrafo por
 * bloque, una línea en blanco entre párrafos, `**negrita**` y listas con «- »
 * si quiere. Al guardar, ese texto pasa por `markdownASanado`, que es el único
 * camino a la base y termina SIEMPRE en el saneador.
 *
 * El viaje de vuelta (HTML guardado → texto del formulario) es `htmlATexto`.
 * Los 25 productos del respaldo usan solo `<p>`, `<br>` y `<span>`
 * (comprobado sobre los JSON), así que la conversión no pierde nada que
 * exista. Si algún día hubiera una etiqueta que no sabe convertir, se queda
 * su TEXTO —nunca la etiqueta—, y el saneador decidiría igual al guardar.
 *
 * NO REESCRIBIR LO QUE NO SE TOCO
 * ---------------------------------------------------------------------------
 * Si Andreina cambia el precio y no la descripción, la descripción NO se
 * reconvierte: se compara el texto recibido con el que se le enseñó y, si es
 * igual, se conserva el HTML guardado byte a byte. Sin esto, cada guardado
 * reformatearía las 25 descripciones del respaldo (espacios, saltos) y la
 * auditoría se llenaría de «cambios» que nadie hizo.
 */

import { markdownASanado } from '../markdown';

/** Las entidades que de verdad aparecen en el respaldo, y las numéricas. */
const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Entidad → carácter, PARA PINTARLA DENTRO DE UN <textarea>.
 *
 * Esto NO es el des-escape que prohíbe `escapar.ts`, y la diferencia es toda
 * la cuestión: el resultado no se pinta como HTML. Astro lo vuelve a escapar
 * al meterlo en el `<textarea>` (`{texto}` escapa solo), y al guardar entra
 * por `markdownASanado` → `sanearHtml`, que lo trata como cualquier otra
 * entrada. Un `&lt;script&gt;` guardado se ve en el formulario como el texto
 * «<script>» y vuelve a la base como `&lt;script&gt;`. Nunca pasa de inerte a
 * activo.
 */
function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

/** HTML guardado → texto editable. */
export function htmlATexto(html: string): string {
  return decodificar(
    html
      .replace(/\r\n?/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|h[2-4]|blockquote|ul|ol|figure)>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<(strong|b)>/gi, '**')
      .replace(/<\/(strong|b)>/gi, '**')
      .replace(/<[^>]*>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Texto plano para SEO (`descripcion_texto`): sin marcas, una sola línea. */
export function textoPlano(html: string): string {
  return htmlATexto(html).replace(/\*\*/g, '').replace(/^- /gm, '').replace(/\s+/g, ' ').trim();
}

/** Normaliza para comparar: saltos de línea y espacios al final no cuentan. */
const comparable = (s: string) => s.replace(/\r\n?/g, '\n').trim();

/**
 * La descripción a guardar. Si el texto no cambió respecto al que se enseñó,
 * el HTML guardado se conserva tal cual (ver la cabecera).
 */
export function descripcionAGuardar(
  textoRecibido: string,
  htmlGuardado: string | null,
): { html: string; texto: string; cambio: boolean } {
  if (htmlGuardado !== null && comparable(textoRecibido) === comparable(htmlATexto(htmlGuardado))) {
    return { html: htmlGuardado, texto: textoPlano(htmlGuardado), cambio: false };
  }
  const html = comparable(textoRecibido) ? markdownASanado(textoRecibido) : '';
  return { html, texto: textoPlano(html), cambio: true };
}

/**
 * La dirección del producto a partir del título: «Hario V60 Mugen» →
 * `hario-v60-mugen`.
 *
 * Mismas reglas que la convención de fotos aprobada por el cliente (8 oct):
 * minúsculas, sin tildes ni ñ, separado por guiones. Que coincidan importa:
 * los ficheros de fotos empiezan por el handle.
 */
export function aHandle(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** Para el buscador: sin tildes, sin mayúsculas. */
export function normalizarBusqueda(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
