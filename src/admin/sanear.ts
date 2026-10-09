/**
 * sanear.ts — el saneador de HTML del panel. ESCRITO DE CERO, A PROPOSITO.
 *
 * POR QUE NO SE REUTILIZA EL `markdown()` DE 16bc
 * ===========================================================================
 * El plan lo prohíbe explícitamente (hallazgo 2 de A.6, y otra vez en B.5). El
 * fallo de aquel renderizador es sutil y vale la pena entenderlo, porque es
 * exactamente el error que este fichero no comete:
 *
 *     inline()  escapa el texto entero (línea 1262)   ← bien
 *               y después DES-ESCAPA `&lt;br&gt;` → `<br>` (1263)  ← el fallo
 *
 * Des-escapar algo después de escapar significa que el escape ya no es una
 * garantía, es una fase intermedia. Y entonces el que escribe el texto controla
 * qué sale al otro lado: si escribe literalmente `&lt;br&gt;` en su artículo, el
 * des-escape se lo convierte en una etiqueta real. En 16bc no es explotable
 * porque solo escribe su dueño; **aquí lo escribe la dueña y se publica en el
 * sitio público**, así que sería una inyección con pasos de sobra.
 *
 * LA REGLA DE ESTE FICHERO, EN UNA FRASE
 * ---------------------------------------------------------------------------
 * **Nada se des-escapa nunca.** Lo que no está en la lista blanca sale como
 * texto visible, no como etiqueta. No hay una sola operación que convierta
 * `&lt;` de vuelta en `<`.
 *
 * LISTA BLANCA, NO LISTA NEGRA
 * ---------------------------------------------------------------------------
 * Una lista negra («quita `<script>`») se rompe siempre, porque hay que acertar
 * con todas las formas de escribir lo peligroso: `<SCRIPT>`, `<scr\0ipt>`,
 * `<svg onload>`, `<iframe>`, los que se inventen mañana. Una lista blanca falla
 * al revés: si aparece una etiqueta nueva y no está en la lista, se cae, y lo
 * que se pierde es una etiqueta de formato, no la seguridad del sitio. Las
 * etiquetas y los atributos son los de B.5, literalmente.
 *
 * NO SE USA UN PARSEADOR DE HTML
 * ---------------------------------------------------------------------------
 * No hay DOM en un Worker, y `HTMLRewriter` (que sí hay) trabaja sobre un
 * stream de respuesta, no sobre una cadena que se quiere guardar en D1. Así que
 * esto es un recorrido de la cadena, carácter a carácter, con una máquina de
 * estados. Es más código que un `.replace()` con regex, y es a propósito: una
 * regex sobre HTML se equivoca con los casos raros (`<a href=">">`, comentarios,
 * `<![CDATA[`), y los casos raros son justo los que usa quien ataca.
 *
 * EL SANEADO ES AL GUARDAR, NO AL PINTAR
 * ---------------------------------------------------------------------------
 * Lo decidió el esquema (0001, comentario de `cuerpo_html`): se sanea una vez al
 * guardar y lo que vive en D1 ya está limpio. Ventaja de seguridad, no solo de
 * rendimiento: el HTML que llega al público pasó por aquí sin excepción, y no
 * depende de que la página pública se acuerde de llamar a nada.
 *
 * Y la regla que lo acompaña, de B.5: `set:html` SOLO con `cuerpo_html` y
 * `descripcion_html`, que salieron de aquí. En ningún otro sitio.
 *
 * EL SANEADOR SON TRES FICHEROS
 * ---------------------------------------------------------------------------
 *   escapar.ts   convertir texto en texto. La regla de «nada se des-escapa
 *                nunca» vive ahí y se puede auditar sin leer nada más.
 *   sanear.ts    ESTO: qué etiquetas y atributos pueden existir.
 *   markdown.ts  qué escribe la dueña y cómo se convierte, antes de pasar
 *                por aquí.
 *
 * Se partió por el límite de 300 líneas del encargo, pero la frontera elegida
 * no es arbitraria: la seguridad está en los dos primeros, y `markdown.ts`
 * depende de ellos y no al revés. Cambiar el Markdown no puede abrir un
 * agujero mientras su salida siga entrando por `sanearHtml`.
 */

import { escaparConservandoEntidades } from './escapar';

/* Etiquetas permitidas: las de B.5, exactamente. */
const PERMITIDAS = new Set([
  'p', 'br', 'strong', 'em', 'b', 'i', 'a', 'ul', 'ol', 'li',
  'h2', 'h3', 'h4', 'blockquote', 'code', 'pre', 'img', 'figure', 'figcaption',
]);

/** Las que se cierran solas: no llevan `</...>` ni contenido. */
const VACIAS = new Set(['br', 'img']);

/** Atributos permitidos POR etiqueta. Lo que no esté aquí se cae. */
const ATRIBUTOS: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title']),
};

/**
 * Esquemas permitidos en `href` y `src`.
 *
 * B.5: «`href`/`src` restringidos a `https:`, `/` o `mailto:` — nunca
 * `javascript:` ni `data:`».
 *
 * `data:` queda fuera aunque parezca inofensivo para una imagen: un
 * `data:text/html` en un `href` ejecuta script, y distinguir «data: de imagen»
 * de «data: peligroso» es otra lista negra. Para las imágenes del panel la
 * respuesta es R2 con su clave, no un data URI.
 */
const ESQUEMAS = ['https:', 'mailto:'];

/** ¿Es aceptable este destino de enlace o de imagen? */
function urlAceptable(valor: string): boolean {
  const v = valor.trim();
  if (!v) return false;

  /* Relativa del propio sitio. Se exige `/` inicial y se rechaza `//otro.com`,
     que es una URL absoluta disfrazada de relativa (protocol-relative) y
     llevaría a otro dominio. */
  if (v.startsWith('/')) return !v.startsWith('//');

  /* Un ancla dentro de la misma página. */
  if (v.startsWith('#')) return true;

  /* Absoluta: solo los esquemas de la lista. Se compara contra `protocol`, que
     ya viene normalizado en minúsculas por el parseador, así que `JavaScript:`
     y `jAvAsCrIpT:` no se cuelan por el caso de las letras. Tampoco sirven los
     trucos de espacios o tabuladores dentro del esquema (`java\tscript:`):
     `new URL` falla o normaliza, y lo que no acabe en un protocolo de la lista
     se rechaza. */
  try {
    return ESQUEMAS.includes(new URL(v).protocol);
  } catch {
    /* No parseable como URL absoluta y no empieza por `/` ni `#`: fuera.
       Esto cubre `javascript:alert(1)` si algún día dejara de parsear, y
       cualquier esquema raro. */
    return false;
  }
}

interface Atributo {
  nombre: string;
  valor: string;
}

/**
 * Lee los atributos de dentro de una etiqueta.
 *
 * Acepta `a="b"`, `a='b'` y `a=b` sin comillas, porque los tres son HTML válido
 * y quien ataca usa el que no se haya contemplado.
 */
function leerAtributos(dentro: string): Atributo[] {
  const salida: Atributo[] = [];
  let i = 0;
  while (i < dentro.length) {
    while (i < dentro.length && /[\s/]/.test(dentro[i]!)) i++;
    if (i >= dentro.length) break;

    let nombre = '';
    while (i < dentro.length && !/[\s=/]/.test(dentro[i]!)) nombre += dentro[i++]!;
    if (!nombre) break;

    while (i < dentro.length && /\s/.test(dentro[i]!)) i++;

    let valor = '';
    if (dentro[i] === '=') {
      i++;
      while (i < dentro.length && /\s/.test(dentro[i]!)) i++;
      const comilla = dentro[i];
      if (comilla === '"' || comilla === "'") {
        i++;
        while (i < dentro.length && dentro[i] !== comilla) valor += dentro[i++]!;
        i++;
      } else {
        while (i < dentro.length && !/\s/.test(dentro[i]!)) valor += dentro[i++]!;
      }
    }
    salida.push({ nombre: nombre.toLowerCase(), valor });
  }
  return salida;
}

/**
 * Reconstruye una etiqueta permitida con solo sus atributos permitidos.
 *
 * Devuelve `''` —o sea, la etiqueta DESAPARECE— si no está en la lista blanca.
 * Desaparece la etiqueta, no su contenido: el texto de dentro sigue saliendo,
 * escapado. Quitar `<script>` pero dejar su texto visible es lo correcto: no
 * ejecuta y no se pierde nada que la dueña escribiera por error.
 */
function etiquetaSaneada(nombre: string, dentro: string, cierre: boolean): string {
  const etq = nombre.toLowerCase();
  if (!PERMITIDAS.has(etq)) return '';
  if (cierre) return VACIAS.has(etq) ? '' : `</${etq}>`;

  const admitidos = ATRIBUTOS[etq];
  let attrs = '';
  if (admitidos) {
    for (const { nombre: n, valor } of leerAtributos(dentro)) {
      /* Que `on*` no esté en ninguna lista de `ATRIBUTOS` ya basta para que
         `onerror`, `onload` y compañía se caigan: no hay lista negra que
         mantener, simplemente no están permitidos en ninguna etiqueta. */
      if (!admitidos.has(n)) continue;
      if ((n === 'href' || n === 'src') && !urlAceptable(valor)) continue;
      /* Mismo criterio que el texto: una entidad ya escrita se conserva, así
         que `?a=1&amp;b=2` en un href no se convierte en `&amp;amp;`. */
      attrs += ` ${n}="${escaparConservandoEntidades(valor)}"`;
    }
    /* Una imagen sin `src` utilizable no se pinta: `<img>` a secas es un icono
       roto en la página pública. Y un enlace sin `href` válido degrada a texto
       (se gestiona en el recorrido, no aquí). */
    if (etq === 'img' && !/ src="/.test(attrs)) return '';
  }

  return VACIAS.has(etq) ? `<${etq}${attrs}>` : `<${etq}${attrs}>`;
}

/**
 * Sanea HTML: deja pasar la lista blanca y escapa TODO lo demás.
 *
 * Este es el único camino por el que `descripcion_html` y `cuerpo_html` pueden
 * llegar a D1.
 */
export function sanearHtml(crudo: unknown): string {
  const texto = String(crudo ?? '');
  let salida = '';
  let i = 0;

  while (i < texto.length) {
    const menor = texto.indexOf('<', i);
    if (menor < 0) {
      salida += escaparConservandoEntidades(texto.slice(i));
      break;
    }
    salida += escaparConservandoEntidades(texto.slice(i, menor));

    /* Comentarios, `<!doctype>`, `<![CDATA[`: se tiran enteros. Un comentario
       puede esconder marcado que algunos parseadores resucitan, y no hay ningún
       motivo para que el panel guarde comentarios. */
    if (texto.startsWith('<!--', menor)) {
      const fin = texto.indexOf('-->', menor + 4);
      i = fin < 0 ? texto.length : fin + 3;
      continue;
    }
    if (texto.startsWith('<!', menor) || texto.startsWith('<?', menor)) {
      const fin = texto.indexOf('>', menor + 2);
      i = fin < 0 ? texto.length : fin + 1;
      continue;
    }

    /* ¿Es una etiqueta de verdad? Tras `<` tiene que venir una letra, o `/` y
       una letra. Si no, el `<` es texto: `a < b` se escapa y se ve. */
    const resto = texto.slice(menor + 1);
    const m = /^(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(resto);
    if (!m) {
      salida += '&lt;';
      i = menor + 1;
      continue;
    }

    /* El final de la etiqueta, saltando los `>` que estén DENTRO de un valor
       entre comillas: `<a href=">">` no termina en ese primer `>`. */
    let j = menor + 1 + m[0].length;
    let comilla: string | null = null;
    while (j < texto.length) {
      const c = texto[j]!;
      if (comilla) {
        if (c === comilla) comilla = null;
      } else if (c === '"' || c === "'") {
        comilla = c;
      } else if (c === '>') {
        break;
      }
      j++;
    }
    /* Etiqueta sin cerrar al final del texto: se escapa el `<` y se sigue, en
       vez de tragarse el resto del documento. */
    if (j >= texto.length) {
      salida += '&lt;';
      i = menor + 1;
      continue;
    }

    const dentro = texto.slice(menor + 1 + m[0].length, j);
    const etq = m[2]!.toLowerCase();

    /* `<script>` y `<style>`: se tira la etiqueta Y SU CONTENIDO. Es la única
       excepción a «la etiqueta se cae pero el texto se queda», y tiene motivo:
       el contenido de un `<style>` puede llevar `expression()` o un `@import`,
       y el de un `<script>` es código que, aunque escapado no ejecute, no
       aporta nada y ensucia el artículo con líneas de JavaScript visibles. */
    if (etq === 'script' || etq === 'style') {
      const cierreTag = `</${etq}`;
      const pos = texto.toLowerCase().indexOf(cierreTag, j);
      if (pos < 0) {
        i = j + 1;
      } else {
        const finCierre = texto.indexOf('>', pos);
        i = finCierre < 0 ? texto.length : finCierre + 1;
      }
      continue;
    }

    salida += etiquetaSaneada(etq, dentro, m[1] === '/');
    i = j + 1;
  }

  return salida;
}
