/**
 * markdown.ts — Markdown MUY reducido → HTML, y de ahí al saneador.
 *
 * SEPARADO DE `sanear.ts` A PROPOSITO
 * ===========================================================================
 * Son dos responsabilidades distintas y conviene que se lean por separado:
 *
 *   sanear.ts    decide QUE HTML puede existir. Es la frontera de seguridad,
 *                y es el fichero que hay que releer entero cuando alguien
 *                toque la lista blanca.
 *   markdown.ts  decide que ESCRIBE la dueña y cómo se convierte. Es comodidad
 *                de edición, y cambiarlo no puede abrir un agujero... siempre
 *                que su salida siga pasando por el saneador, que es lo que
 *                hace la última línea de `markdownASanado`.
 *
 * Esa dependencia va en UN SOLO SENTIDO: este fichero importa del saneador,
 * nunca al revés. Así el saneador se puede auditar sin leer esto.
 *
 * EL ORDEN DE LAS OPERACIONES ES LA PARTE IMPORTANTE
 * ---------------------------------------------------------------------------
 * Primero se convierte el Markdown a HTML y DESPUES se pasa todo por
 * `sanearHtml`. Nunca al revés, y nunca «escapar, convertir y des-escapar un
 * trocito», que es precisamente el fallo de 16bc (hallazgo 2 de A.6). Así, si
 * el Markdown de la dueña trae HTML pegado de Word o un `<script>` copiado por
 * accidente, el saneador lo ve igual que cualquier otra entrada.
 */

import { sanearHtml } from './sanear';


/**
 * Markdown MUY reducido → HTML saneado. Para `cuerpo_md` de los artículos.
 *
 * Soporta lo que la dueña va a usar de verdad: párrafos, `##`/`###`/`####`,
 * `**negrita**`, `*cursiva*`, listas, citas y enlaces. No es un Markdown
 * completo y no pretende serlo: la fase 7 es la que construye el editor del
 * diario, y esto es la base sobre la que colgarlo.
 *
 * EL ORDEN DE LAS OPERACIONES ES LA PARTE IMPORTANTE
 * ---------------------------------------------------------------------------
 * Primero se convierte el Markdown a HTML y DESPUES se pasa todo por
 * `sanearHtml`. Nunca al revés, y nunca «escapar, convertir y des-escapar un
 * trocito», que es precisamente el fallo de 16bc. Así, si el Markdown de la
 * dueña trae HTML pegado de Word o un `<script>` copiado por accidente, el
 * saneador lo ve igual que cualquier otra entrada y lo trata igual.
 */
export function markdownASanado(md: unknown): string {
  const texto = String(md ?? '').replace(/\r\n?/g, '\n');
  const bloques: string[] = [];

  for (const bruto of texto.split(/\n{2,}/)) {
    const bloque = bruto.trim();
    if (!bloque) continue;

    const cabecera = /^(#{2,4})\s+(.*)$/.exec(bloque);
    if (cabecera) {
      bloques.push(`<h${cabecera[1]!.length}>${enLinea(cabecera[2]!)}</h${cabecera[1]!.length}>`);
      continue;
    }

    const lineas = bloque.split('\n');
    if (lineas.every((l) => /^\s*[-*]\s+/.test(l))) {
      bloques.push(
        `<ul>${lineas.map((l) => `<li>${enLinea(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`,
      );
      continue;
    }
    if (lineas.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      bloques.push(
        `<ol>${lineas.map((l) => `<li>${enLinea(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`,
      );
      continue;
    }
    if (lineas.every((l) => /^\s*>\s?/.test(l))) {
      bloques.push(`<blockquote><p>${enLinea(lineas.map((l) => l.replace(/^\s*>\s?/, '')).join(' '))}</p></blockquote>`);
      continue;
    }

    /* Párrafo. El salto de línea simple dentro de un párrafo se convierte en
       `<br>` AQUI, generando la etiqueta de verdad — no des-escapando una
       entidad. Es la misma intención que el `<br>` de 16bc y la implementación
       que no abre el agujero. */
    bloques.push(`<p>${lineas.map((l) => enLinea(l)).join('<br>')}</p>`);
  }

  /* Y todo, sin excepción, por el saneador. */
  return sanearHtml(bloques.join('\n'));
}

/** Marcado de línea: negrita, cursiva, código y enlaces. */
function enLinea(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => `<a href="${u}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
