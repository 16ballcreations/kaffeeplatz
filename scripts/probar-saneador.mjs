/**
 * probar-saneador.mjs — XSS: lo que NO puede pasar por el saneador.
 *
 * Cubre los tres casos que nombra la prueba obligatoria 6 del plan
 * (`<script>`, `onerror=`, `javascript:`) y el caso del `<br>` que falla en
 * 16bc, que es el motivo por el que este saneador se escribió de cero
 * (hallazgo 2 de A.6).
 *
 * La otra mitad —idempotencia, solidez y Markdown— está en
 * `probar-saneador-markdown.mjs`. Se partieron por el límite de 300 líneas del
 * encargo, y la frontera es la natural: aquí lo que protege, allí lo que
 * convierte.
 *
 * POR QUE UN .mjs Y NO VITEST
 * ===========================================================================
 * El proyecto no tiene marco de pruebas y meter uno (vitest + configuración +
 * dependencias) para probar tres ficheros sería más instalación que código
 * probado. Esto corre con `node` a secas, igual que `scripts/contraste.mjs`,
 * que es el precedente que este repositorio ya tiene para una comprobación que
 * falla el build.
 *
 * Uso: node scripts/probar-saneador.mjs   (sale con código 1 si algo falla)
 */

import { caso, sinNadaDe, contiene, y, resumir, markdownASanado, escapar, sanearHtml } from './saneador-util.mjs';

console.log('\n=== 1. LOS TRES CASOS DE LA PRUEBA OBLIGATORIA 6 ===\n');

caso(
  '<script> no sobrevive como etiqueta',
  '<script>alert(1)</script>',
  sinNadaDe('<script', 'alert(1)'),
);

caso(
  '<script> con mayúsculas y atributos tampoco',
  '<SCRIPT type="text/javascript">alert(1)</SCRIPT>',
  sinNadaDe('<script', 'alert(1)'),
);

caso(
  '<script> dentro de texto legítimo: se va solo él',
  'Hola <script>alert(1)</script> mundo',
  y(sinNadaDe('<script', 'alert'), contiene('Hola', 'mundo')),
);

caso(
  'onerror= se cae (img con src trampa)',
  '<img src=x onerror=alert(1)>',
  sinNadaDe('onerror', 'alert'),
);

caso(
  'onerror= con comillas y espacios tampoco pasa',
  '<img src="/foto.jpg" onerror = "alert(1)" alt="x">',
  y(sinNadaDe('onerror', 'alert'), contiene('src="/foto.jpg"', 'alt="x"')),
);

caso(
  'onload, onclick y onmouseover: ninguno está en la lista blanca',
  '<p onclick="x()" onmouseover="y()">texto</p><img src="/a.jpg" onload="z()">',
  y(sinNadaDe('onclick', 'onmouseover', 'onload'), contiene('texto')),
);

caso(
  'href="javascript:" se cae y el enlace degrada a texto',
  '<a href="javascript:alert(1)">pulsa</a>',
  y(sinNadaDe('javascript:', 'alert'), contiene('pulsa')),
);

caso(
  'javascript: con mayúsculas mezcladas',
  '<a href="JaVaScRiPt:alert(1)">pulsa</a>',
  sinNadaDe('javascript:', 'alert'),
);

caso(
  'javascript: con espacios y tabuladores dentro del esquema',
  '<a href="java\tscript:alert(1)">pulsa</a>',
  sinNadaDe('javascript:', 'alert'),
);

caso(
  'data: URI rechazado en href y en src',
  '<a href="data:text/html,<script>alert(1)</script>">x</a><img src="data:image/svg+xml,abc">',
  sinNadaDe('data:', '<script'),
);

console.log('\n=== 2. EL CASO DEL <br> QUE FALLA EN 16bc ===\n');

/* ESTE ES EL CASO QUE JUSTIFICA TODO EL FICHERO.
 *
 * `inline()` de 16bc escapa el texto y después des-escapa `&lt;br&gt;` a
 * `<br>`. Consecuencia: quien escribe el texto puede inyectar una etiqueta
 * escribiendo literalmente `&lt;br&gt;`. Aquí tiene que salir como TEXTO
 * VISIBLE, no como etiqueta. */
caso(
  'literal "&lt;br&gt;" NO se convierte en etiqueta (el fallo de 16bc)',
  'primera linea&lt;br&gt;segunda linea',
  (salida) => {
    /* Lo único que importa, y es lo contrario de lo que hace 16bc: de un texto
       escapado NO puede salir una etiqueta. La entidad se conserva tal cual
       (`&lt;br&gt;`), así que en la página se LEE "<br>" como texto, que es
       justo lo que la dueña escribió. */
    if (/<br\s*\/?>/i.test(salida)) return 'se generó una etiqueta <br> desde texto escapado';
    if (!salida.includes('&lt;br&gt;')) return 'el literal no se conservó como entidad';
    return true;
  },
);

caso(
  'y tampoco con entidades numéricas',
  '&#60;br&#62;&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;',
  (salida) => {
    if (/<br\s*\/?>/i.test(salida)) return 'se generó <br>';
    if (/<script/i.test(salida)) return 'se generó <script>';
    return true;
  },
);

caso(
  'un <br> DE VERDAD sí pasa (está en la lista blanca de B.5)',
  'una<br>dos',
  contiene('<br>'),
);

caso(
  'el <br> del Markdown se genera como etiqueta, no des-escapando',
  'una\ndos',
  contiene('<br>'),
  markdownASanado,
);

/* Conservar las entidades ya escritas es lo que hace el saneador idempotente.
   Estas tres pruebas fijan que esa conservación NO se convierta, por un
   descuido futuro, en el des-escape que hace vulnerable a 16bc. */
caso(
  'una entidad conservada NO gana poder al sanear otra vez',
  'texto&lt;br&gt;mas&lt;script&gt;alert(1)&lt;/script&gt;',
  (unaVez) => {
    const dosVeces = sanearHtml(unaVez);
    const tresVeces = sanearHtml(dosVeces);
    if (/<br\s*\/?>|<script/i.test(dosVeces)) return 'apareció una etiqueta al segundo saneado';
    if (/<br\s*\/?>|<script/i.test(tresVeces)) return 'apareció una etiqueta al tercer saneado';
    if (unaVez !== dosVeces || dosVeces !== tresVeces) return 'no es estable';
    return true;
  },
);

caso(
  'un & suelto SI se escapa (no se confunde con entidad)',
  'cafe & leche, 100% & algo',
  (salida) => (salida.includes('&amp;') ? true : 'el & suelto no se escapó'),
);

caso(
  '"&notaunaentidad" no se trata como entidad',
  'a &noesto; b &amp; c',
  (salida) => {
    if (/<[a-z]/i.test(salida)) return 'generó una etiqueta';
    return salida.includes('&amp;') ? true : 'no quedó nada escapado';
  },
);

console.log('\n=== 3. LISTA BLANCA: LO QUE SI PASA ===\n');

caso(
  'las etiquetas de B.5 sobreviven',
  '<p>uno</p><strong>dos</strong><em>tres</em><ul><li>a</li></ul><h2>t</h2><blockquote><p>c</p></blockquote><code>x</code>',
  contiene('<p>', '<strong>', '<em>', '<ul>', '<li>', '<h2>', '<blockquote>', '<code>'),
);

caso(
  'enlace https con title',
  '<a href="https://kaffeeplatz.co/catalogo" title="Catálogo">ver</a>',
  contiene('href="https://kaffeeplatz.co/catalogo"', 'title="Catálogo"'),
);

caso('enlace relativo del propio sitio', '<a href="/catalogo">ver</a>', contiene('href="/catalogo"'));

caso('mailto permitido', '<a href="mailto:hola@kaffeeplatz.co">correo</a>', contiene('mailto:'));

caso('ancla permitida', '<a href="#metodos">ir</a>', contiene('href="#metodos"'));

caso(
  'imagen con src y alt',
  '<img src="/img/chemex.jpg" alt="Chemex de 6 tazas">',
  contiene('src="/img/chemex.jpg"', 'alt="Chemex de 6 tazas"'),
);

console.log('\n=== 4. LO QUE NO PASA ===\n');

caso(
  'http:// (sin la s) no está permitido',
  '<a href="http://insegura.test/x">x</a>',
  sinNadaDe('http://insegura'),
);

caso(
  '//otro-dominio.com: relativa de protocolo, es absoluta disfrazada',
  '<a href="//malo.test/x">x</a>',
  sinNadaDe('//malo.test'),
);

caso(
  '<iframe>, <object>, <embed>, <form>: fuera de la lista blanca',
  '<iframe src="https://malo.test"></iframe><object data="x"></object><embed src="y"><form action="/z"><input name="q"></form>',
  sinNadaDe('<iframe', '<object', '<embed', '<form', '<input'),
);

caso(
  '<svg onload> no pasa',
  '<svg onload="alert(1)"><circle r="10"/></svg>',
  sinNadaDe('<svg', 'onload', 'alert'),
);

caso(
  '<style> se va con su contenido',
  '<style>body{background:url(javascript:alert(1))}</style>texto',
  y(sinNadaDe('<style', 'javascript:', 'background'), contiene('texto')),
);

caso(
  'comentario HTML se descarta entero',
  'antes<!-- <script>alert(1)</script> -->despues',
  y(sinNadaDe('<script', 'alert', '<!--'), contiene('antes', 'despues')),
);

caso(
  'etiqueta sin cerrar al final no se traga el resto',
  'visible <img src="/a.jpg" alt="x"',
  contiene('visible'),
);

caso(
  '">" dentro de un valor entrecomillado no cierra la etiqueta',
  '<a href="/a?x=1" title="dice > asi">texto</a>',
  (salida) => {
    if (/onerror|<script/i.test(salida)) return 'se escapó algo peligroso';
    return salida.includes('texto') ? true : 'se perdió el texto';
  },
);

caso(
  'style= y class= no están permitidos en ninguna etiqueta',
  '<p style="position:fixed;top:0" class="robo">x</p>',
  y(sinNadaDe('style=', 'class='), contiene('x')),
);

caso(
  'un < suelto es texto, no etiqueta',
  'si 3 < 5 entonces',
  y(contiene('&lt;'), (s) => (/<[a-z]/i.test(s) ? 'generó una etiqueta' : true)),
);

caso(
  'img sin src utilizable no se pinta',
  '<img alt="sin fuente"><img src="javascript:alert(1)" alt="mala">',
  sinNadaDe('<img', 'javascript:'),
);

caso(
  'etiqueta de cierre huérfana de algo no permitido',
  '</script></iframe>texto',
  y(sinNadaDe('</script', '</iframe'), contiene('texto')),
);

resumir();
