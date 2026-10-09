/**
 * probar-saneador-markdown.mjs — idempotencia, solidez y Markdown.
 *
 * La otra mitad de las pruebas del saneador; los casos de XSS están en
 * `probar-saneador.mjs`. Lo que se comprueba aquí es que convertir el Markdown
 * de la dueña NO pueda abrir el agujero que el saneador cierra: un `<script>`
 * pegado por accidente, un enlace `javascript:`, HTML de Word.
 *
 * Y la idempotencia, que es sutil y por eso tiene pruebas propias: sanear dos
 * veces no puede corromper el texto NI puede hacer que una entidad escapada
 * gane poder. La segunda mitad de esa frase es justo el fallo de 16bc.
 *
 * Uso: node scripts/probar-saneador-markdown.mjs
 */

import { caso, sinNadaDe, contiene, y, resumir, markdownASanado, escapar, sanearHtml } from './saneador-util.mjs';

console.log('\n=== 5. IDEMPOTENCIA Y SOLIDEZ ===\n');

caso(
  'sanear dos veces da lo mismo que una (no hay des-escape acumulativo)',
  '<p>hola <strong>mundo</strong> & "comillas" <script>x</script></p>',
  (unaVez) => {
    const dosVeces = sanearHtml(unaVez);
    return unaVez === dosVeces
      ? true
      : `una vez: ${JSON.stringify(unaVez)} / dos veces: ${JSON.stringify(dosVeces)}`;
  },
);

caso('null y undefined dan cadena vacía', null, (s) => (s === '' ? true : 'no es vacía'));
caso('un número no revienta', 12345, contiene('12345'));

caso(
  'escapar() cubre las cinco entidades',
  `& < > " '`,
  contiene('&amp;', '&lt;', '&gt;', '&quot;', '&#39;'),
  escapar,
);

caso(
  'texto normal de la dueña pasa intacto',
  'La Chemex de 6 tazas: café limpio, sin amargor.',
  contiene('La Chemex de 6 tazas', 'café limpio'),
);

console.log('\n=== 6. MARKDOWN -> HTML SANEADO ===\n');

caso(
  'markdown con <script> pegado por accidente',
  'Un parrafo normal.\n\n<script>alert(1)</script>\n\nOtro parrafo.',
  y(sinNadaDe('<script', 'alert'), contiene('<p>', 'Un parrafo normal', 'Otro parrafo')),
  markdownASanado,
);

caso(
  'markdown: enlace con javascript: se cae',
  'Pulsa [aqui](javascript:alert(1)) ahora.',
  y(sinNadaDe('javascript:', 'alert'), contiene('aqui')),
  markdownASanado,
);

caso(
  'markdown: cabeceras, negrita, listas y cita',
  '## Metodos\n\nEl **cafe** es *mejor* asi.\n\n- uno\n- dos\n\n> una cita',
  contiene('<h2>', 'Metodos', '<strong>cafe</strong>', '<em>mejor</em>', '<ul>', '<li>uno</li>', '<blockquote>'),
  markdownASanado,
);

caso(
  'markdown: enlace https permitido',
  'Mira el [catalogo](https://kaffeeplatz.co/catalogo).',
  contiene('href="https://kaffeeplatz.co/catalogo"'),
  markdownASanado,
);

caso(
  'markdown: HTML de Word pegado no rompe nada',
  '<p class="MsoNormal"><span style="font-family:Calibri">Texto pegado de Word</span></p>',
  y(sinNadaDe('class=', 'style=', '<span'), contiene('Texto pegado de Word')),
  markdownASanado,
);

resumir();
