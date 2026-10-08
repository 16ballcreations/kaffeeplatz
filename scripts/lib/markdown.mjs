/**
 * markdown.mjs — Markdown → HTML para `articulos.cuerpo_html`.
 *
 * POR QUE EL PROCESADOR DE ASTRO Y NO UNO CUALQUIERA
 * ===========================================================================
 * El HTML que se guarde en D1 tiene que ser EL MISMO que el sitio pinta hoy
 * con `<Content />`, o la migración cambiaría el aspecto de los 16 artículos
 * sin que nadie lo hubiera pedido — y la comparación antes/después saldría en
 * rojo sin que haya un error de datos.
 *
 * `@astrojs/markdown-remark` es exactamente el módulo que usa Astro por
 * dentro, incluido `rehypeHeadingIds` (los `id` de los `<h2>`/`<h3>`, que el
 * sitio ya emite). Usar el mismo módulo con la configuración por defecto es lo
 * que hace que el HTML coincida. Un renderizador distinto (marked,
 * markdown-it) daría HTML parecido pero no igual: otros `id`, otro tratamiento
 * de los saltos, otras entidades.
 *
 * SANEADO: POR QUE AQUI NO SE SANEA, Y DONDE SI
 * ---------------------------------------------------------------------------
 * El plan (B.5) exige que `cuerpo_html` y `descripcion_html` pasen por una
 * lista blanca AL ESCRIBIR, porque lo que la dueña escriba sale en el sitio
 * público con `set:html`. Eso es cierto y es BLOQUEANTE... para el panel, que
 * es la fase 4.
 *
 * En esta fase el único escritor es ESTE script, y lo que escribe son los 16
 * `.md` del repositorio, que no los ha subido nadie por un formulario: son el
 * respaldo de Shopify, ya revisados, y hoy el sitio YA los renderiza con el
 * mismo procesador. Pasarlos por un saneador propio aquí tendría dos efectos y
 * ninguno bueno: cambiaría el HTML respecto al que el sitio sirve hoy (y la
 * verificación de la migración dejaría de poder distinguir un cambio
 * intencionado de un error), y dejaría un saneador escrito a medias, probado
 * contra 16 documentos que no son adversarios, listo para que la fase 4 lo
 * crea terminado.
 *
 * Lo que sí se hace es COMPROBAR, en `aHtml`, que el Markdown de origen no
 * traiga HTML peligroso: si alguno de los 16 lo trajera, este script falla y
 * se mira a mano, en vez de cargarlo en silencio. Hoy ninguno lo trae.
 *
 * La lista blanca de verdad —con sus pruebas, y aplicada a lo que llegue por
 * formulario— es trabajo de la fase 4, y el plan la especifica ahí: etiquetas
 * permitidas, atributos permitidos, y `href`/`src` restringidos a `https:`,
 * `/` o `mailto:`. No se adelanta aquí a medias.
 */

import { createMarkdownProcessor } from '@astrojs/markdown-remark';

let procesador;

/**
 * Patrones que NO deben aparecer en el HTML resultante. No es un saneador: es
 * una ALARMA. Si uno salta, el script se detiene y alguien mira el .md.
 *
 * Se comprueba sobre el HTML YA RENDERIZADO y no sobre el Markdown, porque lo
 * que importa es lo que acabaría en la página, no cómo se escribió.
 */
const PELIGROS = [
  [/<script\b/i, '<script>'],
  [/<iframe\b/i, '<iframe>'],
  [/<object\b/i, '<object>'],
  [/<embed\b/i, '<embed>'],
  [/<form\b/i, '<form>'],
  [/\son\w+\s*=/i, 'un atributo on* (onerror, onclick...)'],
  [/javascript:/i, 'una URL javascript:'],
  [/<[^>]+\ssrc\s*=\s*["']?data:/i, 'un src con data:'],
];

/**
 * Convierte el Markdown de un artículo en el HTML que se guarda en
 * `articulos.cuerpo_html`.
 *
 * Falla —en vez de limpiar— si el resultado trae algo de la lista de arriba:
 * en una migración, un dato raro es algo que mirar, no algo que arreglar sin
 * mirar.
 */
export async function aHtml(markdown) {
  procesador ??= await createMarkdownProcessor({});
  const { code } = await procesador.render(markdown);
  for (const [re, nombre] of PELIGROS) {
    if (re.test(code)) {
      throw new Error(
        `el Markdown de un artículo genera ${nombre}. La semilla NO lo carga en silencio: ` +
          'míralo en src/content/diario/ y decide. (El saneador con lista blanca es la fase 4, B.5.)',
      );
    }
  }
  return code;
}
