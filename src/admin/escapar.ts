/**
 * escapar.ts — convertir texto en texto. Nada más, y nada menos.
 *
 * POR QUE ESTE FICHERO ESTA SEPARADO DEL SANEADOR
 * ===========================================================================
 * El escape es la pieza que hay que poder auditar SOLA. El saneador decide qué
 * etiquetas existen; esto decide cómo deja de ser peligroso lo que no es una
 * etiqueta. Son 70 líneas que se leen de una vez, y el día que alguien quiera
 * comprobar «¿esto se puede des-escapar por algún camino?» no tiene que leer
 * el recorrido del HTML entero para responder.
 *
 * LA REGLA, QUE NO TIENE EXCEPCIONES
 * ---------------------------------------------------------------------------
 * **Nada se des-escapa nunca.** No hay en este fichero —ni puede haberla— una
 * operación que convierta `&lt;` de vuelta en `<`. Ese es exactamente el fallo
 * de `inline()` de 16bc (hallazgo 2 de A.6): escapa y luego des-escapa `<br>`,
 * y con eso el texto escapado vuelve a ser marcado vivo.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapa texto. Las cinco entidades, como el `esc()` de 16bc (que A.3 declara
 * correcto), y `null`/`undefined` como cadena vacía en vez de imprimir "null".
 *
 * Esto es lo único que se le hace al texto. No hay paso inverso.
 */
export function escapar(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/**
 * Una entidad HTML ya bien formada: `&amp;`, `&#39;`, `&#x2F;`, `&nbsp;`...
 *
 * Se usa SOLO para no volver a escapar el `&` de algo que ya era una entidad.
 * El nombre o el número no se interpretan ni se traducen a su carácter: la
 * entidad se copia TAL CUAL, byte a byte.
 */
const ENTIDAD = /^&(?:[a-zA-Z][a-zA-Z0-9]{1,30}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});/;

/**
 * Escapa texto SIN romper las entidades que ya estaban bien escritas.
 *
 * POR QUE ESTO EXISTE, Y POR QUE NO ES EL FALLO DE 16bc
 * ---------------------------------------------------------------------------
 * `escapar()` convierte todo `&` en `&amp;`. Correcto, pero no es idempotente:
 * sanear dos veces la misma cadena convierte `&amp;` en `&amp;amp;`, y la dueña
 * vería «&amp;» escrito en su artículo. Un saneador que se aplica al guardar
 * puede acabar aplicándose dos veces (una reedición, una migración que
 * reprocese), así que tiene que aguantarlo sin corromper el texto.
 *
 * Y AQUI ESTA LA DIFERENCIA CON 16bc, QUE ES TODA LA CUESTION:
 *
 *   16bc:  escapa `<br>` → `&lt;br&gt;` y luego lo DES-ESCAPA a `<br>`.
 *          De texto inerte saca una etiqueta viva. Eso es la vulnerabilidad.
 *
 *   aquí:  una entidad ya escrita se copia SIN TOCARLA. `&amp;` sigue siendo
 *          `&amp;`; nunca se convierte en `&`, y menos aún en una etiqueta.
 *
 * O sea: 16bc hace que el texto escapado gane poder; esto solo evita escaparlo
 * dos veces. `&lt;br&gt;` sigue saliendo como `&lt;br&gt;` —texto visible— que
 * es exactamente lo que la prueba del `<br>` comprueba. La dirección importa:
 * aquí nada pasa nunca de inerte a activo.
 */
export function escaparConservandoEntidades(s: string): string {
  let salida = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '&') {
      const m = ENTIDAD.exec(s.slice(i));
      if (m) {
        /* Ya era una entidad: se copia igual y se salta entera. No se
           interpreta, no se traduce, no se des-escapa. */
        salida += m[0];
        i += m[0].length - 1;
        continue;
      }
      salida += '&amp;';
      continue;
    }
    salida += ESCAPES[c] ?? c;
  }
  return salida;
}
