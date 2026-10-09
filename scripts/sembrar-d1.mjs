#!/usr/bin/env node
/**
 * sembrar-d1.mjs — carga el catálogo y el diario de src/content/ en D1.
 *
 * ###########################################################################
 * #  AVISO (riesgo R8 del plan). LÉELO ANTES DE EJECUTAR ESTO CONTRA REMOTO. #
 * ###########################################################################
 *
 * Recargar la semilla PISA LO QUE LA DUEÑA HAYA EDITADO EN EL PANEL.
 *
 * A diferencia de los prospectos de 16bc —donde la investigación y el
 * seguimiento son columnas distintas y por eso recargar era seguro— aquí la
 * semilla y la edición escriben LOS MISMOS CAMPOS. Si Andreina corrige el
 * precio de la Chemex en el panel y después alguien corre este script, el
 * precio vuelve al del JSON y no queda constancia salvo en `auditoria`.
 *
 * Después de la fase 2, este script es una HERRAMIENTA DE RECUPERACIÓN, NO DE
 * RUTINA:
 *   - contra `--local`, úsalo libremente: es tu copia de desarrollo;
 *   - contra `--remote`, solo con respaldo hecho y a sabiendas.
 *
 * Lo mismo vale, por la misma razón, para `scripts/normalizar.mjs`: regenerar
 * los JSON y resembrar es la combinación que borra el trabajo de la dueña.
 * Antes de la fase 2 la regla era "los JSON los genera el script, no se editan
 * a mano"; después de la fase 2 la fuente de verdad es D1 y esa regla queda al
 * revés. Está escrito también en el README.
 *
 * ###########################################################################
 *
 * QUÉ HACE
 * ---------------------------------------------------------------------------
 * Escribe un fichero SQL y NO toca la base. Se ejecuta aparte, a propósito
 * (patrón de `prospectos-sql.mjs` de 16bc): así el SQL se puede LEER antes de
 * ejecutarlo contra producción, que es justo lo que hace falta cuando el
 * destino es una tienda en pie.
 *
 *   node scripts/sembrar-d1.mjs                               # escribe tmp/semilla.sql
 *   npx wrangler d1 execute kaffeeplatz --local  --file tmp/semilla.sql
 *   npx wrangler d1 execute kaffeeplatz --remote --file tmp/semilla.sql
 *
 * El SQL sale a `tmp/`, FUERA del repositorio (está en .gitignore): es un
 * artefacto reproducible, no código, y versionarlo invitaría a editarlo a mano.
 *
 * IDEMPOTENCIA
 * ---------------------------------------------------------------------------
 * Los padres (productos, articulos, categorias, roles) usan
 * `INSERT ... ON CONFLICT DO UPDATE`, así que recargar actualiza en vez de
 * duplicar y los ids no cambian (importa: `imagenes.variante_id` los usa).
 *
 * Para las hijas (variantes, opciones, imágenes) el ON CONFLICT no basta,
 * porque recargar debe poder QUITAR una variante que ya no está en el JSON.
 * Patrón: borrar las hijas de ese producto y reinsertarlas. Todo el fichero va
 * dentro de una única transacción, así que no hay estado intermedio visible:
 * o queda el catálogo entero o no cambia nada.
 *
 * LAS IMÁGENES NO SE SUBEN A R2 EN ESTA FASE
 * ---------------------------------------------------------------------------
 * `imagenes.clave` se rellena con la MISMA ruta de public/img que ya está en
 * los JSON, así que el sitio sigue sirviendo las fotos exactamente como hoy.
 * R2 es la fase 6; subirlas ahora sería cambiar dos cosas a la vez y no poder
 * saber cuál rompió qué.
 *
 * LAS FOTOS SUBIDAS DESDE EL PANEL SE CONSERVAN
 * ---------------------------------------------------------------------------
 * Desde la fase 6 hay fotos que NO vienen del JSON: las que la dueña sube por
 * el panel (clave '/medios/...' en R2, y `nombre_original` relleno; ver
 * migrations/0006_fotos.sql). El JSON no las conoce, así que «borrar las hijas
 * y reinsertarlas» las perdía para siempre: la fila desaparecía y el fichero
 * se quedaba en R2 sin que nadie supiera de qué producto era. Resembrar en
 * local para probar algo no puede costar las fotos de una sesión.
 *
 * Por eso aquí solo se borran las fotos de la semilla, y las del panel:
 *   - recuperan su color por TÍTULO de variante, porque las variantes sí se
 *     borran y reinsertan (con ids nuevos) y su ON DELETE SET NULL las dejaría
 *     como «del producto»; si ese color ya no está en el JSON, se quedan del
 *     producto, que es lo mismo que haría borrarlo en el panel;
 *   - van DETRÁS de las de la semilla, en el orden relativo que tenían. Si
 *     una era portada (la primera), deja de serlo: la semilla pisa el orden
 *     como pisa todo lo demás (R8), pero no la foto;
 *   - y, en los productos que las tienen, las portadas se recalculan desde el
 *     orden, igual que hace el panel en cada escritura (`sincronizarPortadas`).
 *     Los demás quedan con `portada_id` NULL, como siempre.
 *
 * El color se aparta en una tabla de paso (`semilla_fotos_panel`) porque hay
 * que leerlo ANTES de borrar las variantes y usarlo DESPUÉS de reinsertarlas.
 * Se crea y se tira dentro de la misma transacción.
 */

import fs from 'node:fs';
import path from 'node:path';
import { leerProductos, leerArticulos, recuentos, RAIZ, IDS } from './lib/contenido.mjs';
import { aHtml } from './lib/markdown.mjs';
import { categoriasSemilla, rolesSemilla, PREFIJO_DIARIO } from './lib/semilla-catalogos.mjs';

/** Literal SQL. Es la ÚNICA forma en que un valor entra en el SQL. */
const txt = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (!Number.isFinite(v)) throw new Error(`número inválido en el SQL: ${v}`);
  return String(Math.trunc(v));
};
const bool = (v) => (v ? '1' : '0');

/** Una foto subida desde el panel (ver la cabecera). Sin `LIKE`: igualdad
    sobre el prefijo, como el resto de consultas del proyecto. */
const ES_DEL_PANEL = "(substr(clave, 1, 8) = '/medios/' OR nombre_original IS NOT NULL)";
const PASO = 'semilla_fotos_panel';

async function main() {
  const productos = leerProductos();
  const articulos = leerArticulos();
  const cuenta = recuentos(productos, articulos);

  const L = [];
  L.push('-- GENERADO por scripts/sembrar-d1.mjs. No editar a mano: se regenera.');
  L.push(`-- ${new Date().toISOString()}`);
  L.push('--');
  L.push('-- AVISO (R8): ejecutar esto PISA lo que la dueña haya editado en el panel.');
  L.push('-- Contra --remote, solo con respaldo hecho. Ver la cabecera del script.');
  L.push('');
  /* Una sola transacción: o entra el catálogo entero, o no cambia nada. Sin
     esto, un fallo a mitad dejaría productos sin sus variantes — es decir,
     productos sin precio, que es peor que no haber cargado nada. */
  L.push('BEGIN TRANSACTION;');
  L.push('');

  L.push(
    `CREATE TABLE IF NOT EXISTS ${PASO} (imagen_id INTEGER PRIMARY KEY,\n` +
      '  variante_titulo TEXT, orden_anterior INTEGER NOT NULL);',
  );
  L.push('');
  catalogos(L);
  for (const p of productos) producto(L, p);
  for (const a of articulos) await articulo(L, a);
  L.push(`DROP TABLE ${PASO};`);

  L.push('COMMIT;');
  L.push('');

  const destino = path.join(RAIZ, 'tmp/semilla.sql');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, L.join('\n'));

  console.log(`Escrito ${path.relative(RAIZ, destino)}`);
  console.log('Recuento de lo leído (CONTADO, no escrito a mano):');
  for (const [k, v] of Object.entries(cuenta)) console.log(`  ${k.padEnd(24)} ${v}`);
  console.log('\nPara cargarlo:');
  console.log('  npx wrangler d1 execute kaffeeplatz --local --file tmp/semilla.sql');
  console.log('\nY después, SIEMPRE:');
  console.log('  node scripts/comparar-d1.mjs --local');
}

/* Categorías y roles. Los dos son catálogos editables desde el panel, así que
   la semilla NO los pisa si ya existen más allá de nombre/orden: se usa
   ON CONFLICT DO UPDATE solo en los campos que vienen del código. */
function catalogos(L) {
  L.push('-- Categorías (de src/datos/categorias.ts, los dos ámbitos).');
  for (const c of categoriasSemilla()) {
    L.push(
      `INSERT INTO categorias (id, nombre, orden, descripcion, ambito) VALUES (${txt(c.id)}, ${txt(c.nombre)}, ${num(c.orden)}, ${txt(c.descripcion)}, ${txt(c.ambito)})\n` +
        '  ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre, orden = excluded.orden,\n' +
        '    descripcion = excluded.descripcion, ambito = excluded.ambito;',
    );
  }
  L.push('');
  L.push('-- Roles de imagen (B.7). Los 30 originales quedan SIN rol: no se inventa.');
  for (const r of rolesSemilla()) {
    L.push(
      `INSERT INTO roles_imagen (id, nombre, orden) VALUES (${txt(r.id)}, ${txt(r.nombre)}, ${num(r.orden)})\n` +
        '  ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre, orden = excluded.orden;',
    );
  }
  L.push('');
}

/**
 * Un producto con sus variantes, opciones e imágenes.
 *
 * Las hijas se borran y se reinsertan (ver la cabecera). El `variante_id` de
 * cada imagen se resuelve EN SQL, con una subconsulta por título, en vez de
 * calcularlo aquí: así no hace falta conocer los ids que AUTOINCREMENT va a
 * asignar, y el fichero sigue siendo válido contra una base que ya tiene datos.
 */
function producto(L, p) {
  const h = txt(p.handle);
  L.push(`-- ${'='.repeat(70)}`);
  L.push(`-- ${p.handle}`);
  L.push(
    `INSERT INTO productos (handle, titulo, vendor, descripcion_html, descripcion_texto,\n` +
      `    categoria, coleccion, destacado, precio, disponible)\n` +
      `  VALUES (${h}, ${txt(p.titulo)}, ${txt(p.vendor)}, ${txt(p.descripcionHtml)},\n` +
      `    ${txt(p.descripcionTexto)}, ${txt(p.categoria)}, ${txt(p.coleccion ?? null)},\n` +
      `    ${bool(p.destacado)}, ${num(p.precio)}, ${bool(p.disponible)})\n` +
      '  ON CONFLICT (handle) DO UPDATE SET titulo = excluded.titulo, vendor = excluded.vendor,\n' +
      '    descripcion_html = excluded.descripcion_html,\n' +
      '    descripcion_texto = excluded.descripcion_texto, categoria = excluded.categoria,\n' +
      '    coleccion = excluded.coleccion, destacado = excluded.destacado,\n' +
      '    precio = excluded.precio, disponible = excluded.disponible,\n' +
      "    updated_at = datetime('now');",
  );

  /* Las hijas, siempre desde cero para este producto. El orden importa:
     imágenes antes que variantes, porque `imagenes.variante_id` apunta a
     `variantes` con ON DELETE SET NULL y no se quiere dejar fotos sueltas ni
     un instante. Al ir todo en una transacción da igual para el resultado,
     pero el orden correcto hace que el SQL se pueda leer sin dudar. */
  const idp = `(SELECT id FROM productos WHERE handle = ${h})`;
  /* Las fotos del panel se quedan; antes de borrar las variantes se aparta
     de qué color era cada una (ver la cabecera). */
  L.push(`DELETE FROM ${PASO};`);
  L.push(
    `INSERT INTO ${PASO} (imagen_id, variante_titulo, orden_anterior)\n` +
      `  SELECT i.id, v.titulo, i.orden FROM imagenes i LEFT JOIN variantes v ON v.id = i.variante_id\n` +
      `   WHERE i.producto_id = ${idp} AND ${ES_DEL_PANEL.replace(/clave|nombre_original/g, 'i.$&')};`,
  );
  L.push(`DELETE FROM imagenes  WHERE producto_id = ${idp} AND NOT ${ES_DEL_PANEL};`);
  L.push(`DELETE FROM variantes WHERE producto_id = ${idp};`);
  L.push(`DELETE FROM opciones  WHERE producto_id = ${idp};`);

  p.variantes.forEach((v, i) => {
    L.push(
      `INSERT INTO variantes (producto_id, id_externo, titulo, precio, disponible, sku, orden)\n` +
        `  VALUES (${idp}, ${txt(v.id)}, ${txt(v.titulo)}, ${num(v.precio)}, ${bool(v.disponible)}, ${txt(v.sku)}, ${num(i)});`,
    );
  });
  p.opciones.forEach((o, i) => {
    L.push(
      `INSERT INTO opciones (producto_id, nombre, valores, orden)\n` +
        `  VALUES (${idp}, ${txt(o.nombre)}, ${txt(JSON.stringify(o.valores))}, ${num(i)});`,
    );
  });
  p.imagenes.forEach((img, i) => {
    /* `variante_id` resuelto en SQL. Si el título no existiera, la subconsulta
       daría NULL y la foto quedaría como "del producto" — pero eso no puede
       pasar aquí: `leerProductos()` ya falló si algún vínculo no casaba. */
    const vid = img.variante
      ? `(SELECT id FROM variantes WHERE producto_id = ${idp} AND titulo = ${txt(img.variante)})`
      : 'NULL';
    /* `WHERE NOT EXISTS`: si una foto del panel conservada tuviera la misma
       clave, el UNIQUE (producto_id, clave) tumbaría la transacción entera.
       Es la misma foto: con la que ya está basta. */
    L.push(
      `INSERT INTO imagenes (producto_id, variante_id, rol, clave, alt, orden)\n` +
        `  SELECT ${idp}, ${vid}, NULL, ${txt(img.src)}, ${txt(img.alt)}, ${num(i)}\n` +
        `   WHERE NOT EXISTS (SELECT 1 FROM imagenes WHERE producto_id = ${idp} AND clave = ${txt(img.src)});`,
    );
  });
  /* Las del panel: su color por título, y detrás de las de la semilla en su
     orden de antes. El puesto se cuenta sobre la tabla de paso (el orden
     ANTERIOR), no sobre `imagenes`, porque este mismo UPDATE la va cambiando. */
  L.push(
    `UPDATE imagenes SET\n` +
      `    variante_id = (SELECT v.id FROM ${PASO} s JOIN variantes v ON v.titulo = s.variante_titulo\n` +
      `                    WHERE s.imagen_id = imagenes.id AND v.producto_id = imagenes.producto_id),\n` +
      `    orden = ${num(p.imagenes.length)} + (SELECT COUNT(*) FROM ${PASO} s, ${PASO} yo\n` +
      `                    WHERE yo.imagen_id = imagenes.id AND (s.orden_anterior < yo.orden_anterior\n` +
      `                      OR (s.orden_anterior = yo.orden_anterior AND s.imagen_id < yo.imagen_id)))\n` +
      `  WHERE id IN (SELECT imagen_id FROM ${PASO});`,
  );
  /* Las portadas, desde el orden: la misma regla que `sincronizarPortadas`
     (src/datos/consultas/imagenes-escribir.ts). SOLO si el producto tiene
     fotos del panel: sin ellas, `portada_id` se queda NULL como siempre dejó
     la semilla (el respaldo «primera foto», que es lo que comprueba
     `comparar-d1.mjs`). Una portada que apuntaba a una foto de la semilla ya
     la dejó en NULL el ON DELETE SET NULL al borrarla. */
  L.push(
    `UPDATE productos SET portada_id =\n` +
      `    (SELECT id FROM imagenes WHERE producto_id = productos.id ORDER BY orden, id LIMIT 1)\n` +
      `  WHERE handle = ${h} AND EXISTS (SELECT 1 FROM ${PASO});`,
  );
  L.push(
    `UPDATE variantes SET portada_id =\n` +
      `    (SELECT i.id FROM imagenes i WHERE i.variante_id = variantes.id AND i.por_revisar = 0\n` +
      `      ORDER BY i.orden, i.id LIMIT 1)\n` +
      `  WHERE producto_id = ${idp} AND EXISTS (SELECT 1 FROM ${PASO});`,
  );
  L.push('');
}

/** Un artículo, con el Markdown íntegro y el HTML ya renderizado y saneado. */
async function articulo(L, a) {
  const html = await aHtml(a.cuerpoMd);
  L.push(`-- ${'='.repeat(70)}`);
  L.push(`-- diario/${a.handle}`);
  L.push(
    `INSERT INTO articulos (handle, titulo, fecha, autor, resumen, cuerpo_md, cuerpo_html,\n` +
      `    imagen, categoria, publicado)\n` +
      `  VALUES (${txt(a.handle)}, ${txt(a.titulo)}, ${txt(a.fecha)}, ${txt(a.autor)},\n` +
      `    ${txt(a.resumen)}, ${txt(a.cuerpoMd)}, ${txt(html)}, ${txt(a.imagen ?? null)},\n` +
      /* Prefijado: los temas del diario y las categorías de producto comparten
         ids ('metodos', 'otros') y en D1 van a la misma tabla. La capa de
         datos quita el prefijo al leer, así que el sitio sigue viendo
         'metodos'. Ver scripts/lib/semilla-catalogos.mjs. */
      `    ${txt(PREFIJO_DIARIO + a.categoria)}, 1)\n` +
      '  ON CONFLICT (handle) DO UPDATE SET titulo = excluded.titulo, fecha = excluded.fecha,\n' +
      '    autor = excluded.autor, resumen = excluded.resumen, cuerpo_md = excluded.cuerpo_md,\n' +
      '    cuerpo_html = excluded.cuerpo_html, imagen = excluded.imagen,\n' +
      "    categoria = excluded.categoria, updated_at = datetime('now');",
  );
  L.push('');
}

main().catch((e) => {
  console.error(`\nsembrar-d1: ${e.message}\n`);
  process.exit(1);
});
