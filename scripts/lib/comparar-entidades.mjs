/**
 * comparar-entidades.mjs — la comparación campo a campo de productos y
 * artículos.
 *
 * Separado de `comparar-d1.mjs` por responsabilidad: el script principal se
 * ocupa de ORQUESTAR (abrir la base, decidir el orden, imprimir el informe y
 * salir con el código que toca) y este módulo de COMPARAR. Así se puede leer
 * "qué campos se comparan y con qué criterio" sin el ruido de la salida por
 * pantalla alrededor, que es justo lo que alguien querrá revisar el día que la
 * comparación salga en rojo.
 *
 * Las funciones reciben `igual` y `anota` como parámetros en vez de importarlos:
 * el acumulador de diferencias vive en el script principal y así este módulo no
 * tiene estado propio.
 */

import { PREFIJO_DIARIO } from './semilla-catalogos.mjs';
import { aHtml } from './markdown.mjs';

/** 2–5. Productos con sus variantes, opciones e imágenes. */
export function comprobarProductos(db, productos, { igual, anota }) {
  const filas = db.todas('SELECT * FROM productos');
  const porHandle = new Map(filas.map((f) => [f.handle, f]));

  for (const p of productos) {
    const donde = `producto/${p.handle}`;
    const f = porHandle.get(p.handle);
    if (!f) {
      anota(donde, '(la fila entera)', 'existe en el JSON', 'NO ESTÁ en D1');
      continue;
    }
    porHandle.delete(p.handle);

    igual(donde, 'titulo', p.titulo, f.titulo);
    igual(donde, 'vendor', p.vendor, f.vendor);
    igual(donde, 'descripcionHtml', p.descripcionHtml, f.descripcion_html);
    igual(donde, 'descripcionTexto', p.descripcionTexto, f.descripcion_texto);
    igual(donde, 'precio', p.precio, f.precio);
    igual(donde, 'disponible', p.disponible ? 1 : 0, f.disponible);
    igual(donde, 'destacado', p.destacado ? 1 : 0, f.destacado);
    igual(donde, 'categoria', p.categoria, f.categoria);
    igual(donde, 'coleccion', p.coleccion ?? null, f.coleccion);
    /* La migración no archiva nada ni toca las portadas: los 25 quedan
       visibles y con portada NULL, que es lo que mantiene el comportamiento
       "la primera foto" idéntico al de hoy (B.7). */
    igual(donde, 'archivado_en', null, f.archivado_en);
    igual(donde, 'portada_id', null, f.portada_id);

    variantes(db, donde, p, f.id, igual);
    opciones(db, donde, p, f.id, igual);
    imagenes(db, donde, p, f.id, igual);
  }
  for (const sobrante of porHandle.keys()) {
    anota(`producto/${sobrante}`, '(la fila entera)', 'NO existe en los JSON', 'está en D1');
  }
}

function variantes(db, donde, p, idp, igual) {
  const filas = db.todas('SELECT * FROM variantes WHERE producto_id = ? ORDER BY orden', idp);
  if (!igual(donde, 'nº de variantes', p.variantes.length, filas.length)) return;
  p.variantes.forEach((v, i) => {
    const f = filas[i];
    const d = `${donde}/variante[${i}]`;
    /* `orden` tiene que ser la POSICIÓN en el array del JSON: es lo que hace
       que el selector de la ficha ofrezca los colores en el mismo orden. */
    igual(d, 'orden', i, f.orden);
    igual(d, 'titulo', v.titulo, f.titulo);
    /* El id de Shopify. Si esto se pierde, todo carrito guardado en
       localStorage se vacía en silencio el día del despliegue (sección D). */
    igual(d, 'id_externo (id de Shopify)', v.id, f.id_externo);
    igual(d, 'precio', v.precio, f.precio);
    igual(d, 'disponible', v.disponible ? 1 : 0, f.disponible);
    igual(d, 'sku', v.sku, f.sku);
  });
}

function opciones(db, donde, p, idp, igual) {
  const filas = db.todas('SELECT * FROM opciones WHERE producto_id = ? ORDER BY orden', idp);
  if (!igual(donde, 'nº de opciones', p.opciones.length, filas.length)) return;
  p.opciones.forEach((o, i) => {
    const f = filas[i];
    const d = `${donde}/opcion[${i}]`;
    igual(d, 'nombre', o.nombre, f.nombre);
    /* El ORDEN de los valores es un dato, no un detalle: por eso se guardan
       explícitos en vez de derivarlos de las variantes (B.1). Se compara el
       JSON ya serializado para que un reordenamiento salte. */
    igual(d, 'valores', JSON.stringify(o.valores), f.valores);
  });
}

function imagenes(db, donde, p, idp, igual) {
  const filas = db.todas(
    `SELECT i.*, v.titulo AS variante_titulo
       FROM imagenes i LEFT JOIN variantes v ON v.id = i.variante_id
      WHERE i.producto_id = ? ORDER BY i.orden`,
    idp,
  );
  if (!igual(donde, 'nº de imágenes', p.imagenes.length, filas.length)) return;
  p.imagenes.forEach((img, i) => {
    const f = filas[i];
    const d = `${donde}/imagen[${i}]`;
    igual(d, 'orden', i, f.orden);
    /* `clave` es HOY la ruta de public/img, tal cual venía en el JSON: en esta
       fase las fotos se siguen sirviendo como siempre y R2 es la fase 6. */
    igual(d, 'clave (= src del JSON)', img.src, f.clave);
    igual(d, 'alt', img.alt, f.alt);
    /* El vínculo se guarda por `variante_id`, no por título, para que
       renombrar un color no deje fotos huérfanas (B.1). Se comprueba
       resolviendo el id de vuelta al título: así se verifica el vínculo de
       verdad, no solo que la columna no esté vacía. */
    igual(d, 'variante (resuelta desde variante_id)', img.variante ?? null, f.variante_titulo);
    igual(d, 'rol', null, f.rol); // las 30 quedan sin rol: no se inventa (B.7)
  });
}

/** 6. Artículos. */
export async function comprobarArticulos(db, articulos, { igual, anota }) {
  const filas = db.todas('SELECT * FROM articulos');
  const porHandle = new Map(filas.map((f) => [f.handle, f]));

  for (const a of articulos) {
    const donde = `diario/${a.handle}`;
    const f = porHandle.get(a.handle);
    if (!f) {
      anota(donde, '(la fila entera)', 'existe en el MD', 'NO ESTÁ en D1');
      continue;
    }
    porHandle.delete(a.handle);

    igual(donde, 'titulo', a.titulo, f.titulo);
    /* La fecha viaja como texto 'YYYY-MM-DD' de punta a punta, sin pasar por
       Date: convertirla y devolverla es la forma clásica de perder un día. */
    igual(donde, 'fecha', a.fecha, f.fecha);
    igual(donde, 'autor', a.autor, f.autor);
    igual(donde, 'resumen', a.resumen, f.resumen);
    igual(donde, 'cuerpo_md (íntegro)', a.cuerpoMd, f.cuerpo_md);
    igual(donde, 'imagen (portada)', a.imagen ?? null, f.imagen);
    igual(donde, 'categoria', PREFIJO_DIARIO + a.categoria, f.categoria);
    igual(donde, 'publicado', 1, f.publicado);
    igual(donde, 'archivado_en', null, f.archivado_en);
    /* `cuerpo_html` no se compara contra el fichero (no existe en el fichero),
       sino contra el resultado de renderizar su propio Markdown: comprueba que
       el HTML guardado CORRESPONDE al cuerpo, y no es el de otro artículo ni
       uno viejo de antes de una edición. */
    igual(donde, 'cuerpo_html (vs. render de su cuerpo_md)', await aHtml(a.cuerpoMd), f.cuerpo_html);
  }
  for (const sobrante of porHandle.keys()) {
    anota(`diario/${sobrante}`, '(la fila entera)', 'NO existe en los MD', 'está en D1');
  }
}
