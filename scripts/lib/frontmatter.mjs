/**
 * frontmatter.mjs — leer el frontmatter YAML de los .md del diario.
 *
 * Separado de `contenido.mjs` por responsabilidad: aquí no se sabe nada de
 * productos, de artículos ni de zod. Entra un bloque de texto entre `---` y
 * sale un objeto de claves planas. Es la pieza que más fácil se rompe en
 * silencio (ver el aviso de los escapes, abajo) y la que conviene poder leer
 * entera sin nada alrededor.
 */

/**
 * Frontmatter mínimo: `clave: valor` con comillas opcionales. NO es un parser
 * de YAML y no pretende serlo — los 16 ficheros los genera
 * `scripts/normalizar.mjs` con esta forma exacta (claves planas, sin listas ni
 * anidamiento). Si alguna vez apareciera una clave anidada, el valor saldría
 * como texto y el zod de arriba lo rechazaría en voz alta, que es el
 * comportamiento que se quiere: fallar, no adivinar.
 *
 * LAS SECUENCIAS DE ESCAPE SÍ HAY QUE TRATARLAS, Y CUESTA UN BUG DESCUBRIRLO
 * ---------------------------------------------------------------------------
 * La primera versión de esto devolvía el contenido de las comillas tal cual, y
 * el HTML generado salió distinto en UN artículo de los 16:
 * `que-es-el-cafe-de-especialidad-y-por-que-deberias-probarlo.md`, cuyo
 * `resumen` lleva comillas dentro del texto y en el fichero aparecen como
 * `\\\"`. YAML lo interpreta como `\"` (barra + comilla); sin desescapar,
 * llegaban las tres barras a la base y de ahí a la etiqueta `<meta
 * name="description">` — que además se corta a 160 caracteres, así que el texto
 * perdía palabras por el final.
 *
 * O sea: un escape sin tratar no daba un error, daba una descripción de SEO
 * ligeramente distinta en una página. Es exactamente el tipo de pérdida
 * silenciosa que R5 teme y la razón de que la comparación antes/después se haga
 * byte a byte en vez de "mirar si la página carga".
 *
 * Se tratan solo los escapes que YAML define para cadenas entre comillas
 * DOBLES. Las comillas simples en YAML no procesan escapes (salvo `''` para una
 * comilla literal), y así se hace aquí.
 *
 * La `fecha` se devuelve como TEXTO (no como Date) a propósito: el esquema de
 * D1 la guarda como 'YYYY-MM-DD' y convertirla a Date y de vuelta es la forma
 * clásica de perder un día por zona horaria.
 */
export function frontmatter(bloque) {
  const datos = {};
  for (const linea of bloque.split(/\r?\n/)) {
    if (!linea.trim() || linea.trimStart().startsWith('#')) continue;
    const m = linea.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) throw new Error(`línea no reconocida: ${linea.slice(0, 60)}`);
    const v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
      datos[m[1]] = desescaparDobles(v.slice(1, -1));
    } else if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
      /* YAML: entre comillas simples, lo único que se escapa es '' → '. */
      datos[m[1]] = v.slice(1, -1).replace(/''/g, "'");
    } else {
      datos[m[1]] = v;
    }
  }
  return datos;
}

/** Los escapes de una cadena YAML entre comillas dobles. */
function desescaparDobles(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, esc) => {
    switch (esc[0]) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case '0':
        return '\0';
      case 'u':
      case 'x':
        return String.fromCodePoint(parseInt(esc.slice(1), 16));
      default:
        /* \\ → \ , \" → " , y cualquier otro: el carácter tal cual. */
        return esc;
    }
  });
}
