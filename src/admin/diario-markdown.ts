/**
 * diario-markdown.ts — el cuerpo de un artículo, de lo que escribe la dueña al
 * HTML que se guarda en `articulos.cuerpo_html`.
 *
 * POR QUE NO BASTA CON `markdownASanado` A SECAS
 * ===========================================================================
 * `markdown.ts` (fase 4) es deliberadamente pequeño: párrafos, `##`–`####`,
 * listas, citas, negrita, cursiva y enlaces, cada bloque separado por una
 * línea en blanco. Es la base correcta. Pero los 16 artículos que YA existen
 * se escribieron en Shopify con hábitos que esa base no entiende, y la primera
 * vez que Andreina abra uno y pulse «Guardar» sin tocar nada, el artículo
 * cambiaría de aspecto en la tienda. Medido sobre los 16 `.md` del repositorio:
 *
 *   - LISTAS «SUELTAS»: los pasos van separados por líneas en blanco
 *     (`1. …` / línea vacía / `2. …`). `markdown.ts` parte por líneas en
 *     blanco, así que cada paso sería una lista de un elemento y TODOS se
 *     numerarían «1.». Una receta con siete pasos «1.» es un error que se ve.
 *   - LISTAS QUE EMPIEZAN EN 2: un número, un párrafo, el siguiente número.
 *     El saneador no admite `start` (B.5), así que un `<ol>` empezaría en 1.
 *     Se pintan como párrafo con el número en negrita: el número que se lee es
 *     el que ella escribió.
 *   - `#####` (cinco artículos de la Chemex lo usan) no es un encabezado para
 *     `markdown.ts` y saldría literal, con las almohadillas. Se baja a `####`,
 *     el nivel más pequeño que admite la lista blanca.
 *   - `#` suelto se sube a `##`: el `<h1>` de la página es el título y no
 *     puede haber dos.
 *   - `---` (separador) no está en la lista blanca: se quita en vez de salir
 *     como tres guiones.
 *
 * Todo esto es una TRADUCCION de lo escrito a lo que `markdown.ts` ya sabe
 * pintar. No se toca `cuerpo_md`: lo que se guarda para reeditar es lo que ella
 * escribió, letra por letra. Y la salida sigue pasando ENTERA por
 * `markdownASanado` → `sanearHtml`: este fichero no genera ni una etiqueta, así
 * que no puede abrir un agujero que el saneador no vea.
 *
 * LA VISTA PREVIA Y EL GUARDADO USAN ESTA MISMA FUNCION
 * ---------------------------------------------------------------------------
 * Es la garantía de «lo que ves es lo que se publica»: no hay un render para
 * previsualizar y otro para guardar que puedan divergir.
 */

import { markdownASanado } from './markdown';

type TipoLista = 'ul' | 'ol' | null;

const VINETA = /^\s*[-*+]\s+/;
const NUMERO = /^\s*(\d+)[.)]\s+/;

/** ¿Es este bloque una lista entera? ¿De qué tipo? */
function tipoDeLista(bloque: string): TipoLista {
  const lineas = bloque.split('\n');
  if (lineas.every((l) => VINETA.test(l))) return 'ul';
  if (lineas.every((l) => NUMERO.test(l))) return 'ol';
  return null;
}

/** El primer número de un bloque de lista numerada. */
function primerNumero(bloque: string): number {
  return Number(NUMERO.exec(bloque)?.[1] ?? 1);
}

/** El último número de un bloque de lista numerada. */
function ultimoNumero(bloque: string): number {
  const lineas = bloque.split('\n');
  return Number(NUMERO.exec(lineas[lineas.length - 1]!)?.[1] ?? 0);
}

/**
 * Traduce los hábitos de escritura de arriba a lo que `markdown.ts` entiende.
 * Exportada para las pruebas; el resto del panel usa `cuerpoAHtml`.
 */
export function normalizarMarkdown(md: unknown): string {
  const texto = String(md ?? '')
    .replace(/\r\n?/g, '\n')
    /* Separadores fuera: no hay `<hr>` en la lista blanca. */
    .replace(/^\s{0,3}([-*_])(\s*\1){2,}\s*$/gm, '')
    /* `#` → `##` (el h1 es el título). `#####`/`######` → `####`. */
    .replace(/^#\s+/gm, '## ')
    .replace(/^#{5,6}\s+/gm, '#### ')
    /* `+` también es viñeta en Markdown; `markdown.ts` solo mira `-` y `*`. */
    .replace(/^(\s*)\+\s+/gm, '$1- ');

  const salida: string[] = [];
  let anterior: TipoLista = null;

  for (const bruto of texto.split(/\n{2,}/)) {
    const bloque = bruto.replace(/^\n+|\n+$/g, '');
    if (!bloque.trim()) continue;
    const tipo = tipoDeLista(bloque);

    /* Lista suelta: si este bloque es la continuación de la lista anterior,
       se pega a ella con un salto simple en vez de una línea en blanco, y
       `markdown.ts` la ve como UNA lista. En las numeradas, solo si sigue la
       cuenta (3 después de 2): un «1.» nuevo es otra lista a propósito. */
    const continua =
      tipo !== null &&
      tipo === anterior &&
      (tipo === 'ul' || primerNumero(bloque) === ultimoNumero(salida[salida.length - 1]!) + 1);

    if (continua) salida[salida.length - 1] += `\n${bloque}`;
    else salida.push(bloque);
    anterior = tipo;
  }

  /* Una lista numerada que no empieza en 1 no se puede pintar como `<ol>` sin
     `start` (que el saneador quita). Se escribe como párrafo con el número en
     negrita, que es lo que el ojo espera ver. Y la de UN solo elemento, igual:
     es el patrón «1. Idea / párrafo / 2. Idea / párrafo», y si el «1.» saliera
     como lista y el «2.» como párrafo, los puntos se verían cada uno con su
     sangría. */
  return salida
    .map((b) =>
      tipoDeLista(b) === 'ol' && (primerNumero(b) !== 1 || !b.includes('\n'))
        ? b
            .split('\n')
            .map((l) => l.replace(NUMERO, (_m, n) => `**${n}.** `))
            .join('\n')
        : b,
    )
    .join('\n\n');
}

/** Markdown de la dueña → HTML saneado, listo para `cuerpo_html`. */
export function cuerpoAHtml(md: unknown): string {
  return markdownASanado(normalizarMarkdown(md));
}
