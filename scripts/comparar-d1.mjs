#!/usr/bin/env node
/**
 * comparar-d1.mjs — compara CAMPO A CAMPO los JSON/MD contra D1.
 *
 * Es la red del riesgo R5 del plan: "25 productos y 16 artículos a mano no se
 * revisan bien". No vale "parece que está": se compara, y si algo no cuadra el
 * script SALE CON CÓDIGO 1 y dice exactamente qué campo de qué registro.
 *
 *   node scripts/comparar-d1.mjs            # contra la base local
 *
 * POR QUE COMPARA CONTRA LOS FICHEROS Y NO CONTRA OTRA CONSULTA
 * ===========================================================================
 * Los JSON y los MD se quedan en el repositorio después de migrar: son el
 * respaldo y la referencia (R5, y F.4). Esta comparación es la razón práctica
 * de que no se borren — sin ellos no hay contra qué comparar.
 *
 * Lee el origen con `scripts/lib/contenido.mjs`, el MISMO módulo que usa la
 * semilla. Eso puede parecer circular, y conviene explicar por qué no lo es:
 * lo que se comprueba aquí no es "¿leí bien el fichero?" sino "¿llegó a la base
 * lo que leí, entero y sin deformarse?". Los dos puntos donde de verdad se
 * pierden datos en una migración son la generación del SQL (una comilla mal
 * escapada, un NULL que se vuelve la cadena 'NULL', un entero que viaja como
 * texto) y la carga. Los dos están DESPUÉS del punto que se comparte.
 *
 * QUÉ COMPRUEBA, EN ORDEN
 * ---------------------------------------------------------------------------
 *   1. Recuentos de todas las tablas contra lo contado en los ficheros.
 *   2. Cada producto: los 11 campos, incluido `descripcionHtml` completo.
 *   3. Las variantes de cada producto: orden, id de Shopify, precio, sku...
 *   4. Las opciones y sus valores, con el orden de los valores.
 *   5. Las imágenes: ruta, alt, orden y EL VÍNCULO A SU VARIANTE.
 *   6. Cada artículo: los 7 campos, incluido `cuerpo_md` íntegro, y que
 *      `cuerpo_html` corresponda a ese Markdown.
 *   7. Las dos anomalías de B.0, que deben seguir ahí.
 *   8. Integridad: ninguna fila huérfana, ningún id_externo repetido.
 */

import { leerProductos, leerArticulos, recuentos } from './lib/contenido.mjs';
import { abrirLocal } from './lib/d1-cli.mjs';
import { comprobarProductos, comprobarArticulos } from './lib/comparar-entidades.mjs';

if (process.argv.includes('--remote')) {
  console.error(
    'comparar-d1: --remote no está implementado y es deliberado.\n' +
      'Esta fase trabaja solo en local y no crea nada en Cloudflare. Para comprobar\n' +
      'contra remoto hace falta una sesión con credenciales y es trabajo de la fase 8.',
  );
  process.exit(2);
}

/** Acumulador de diferencias. */
const dif = [];
const anota = (donde, campo, origen, base) =>
  dif.push({ donde, campo, origen: muestra(origen), base: muestra(base) });

/** Recorta para que una diferencia en un texto largo siga siendo legible. */
function muestra(v) {
  if (v === null || v === undefined) return String(v);
  const s = String(v);
  return s.length > 120 ? `${s.slice(0, 117)}…(${s.length} car.)` : s;
}

/** Compara un valor y anota si no coincide. `null` y `undefined` son lo mismo. */
function igual(donde, campo, origen, base) {
  const a = origen === undefined ? null : origen;
  const b = base === undefined ? null : base;
  if (a === b) return true;
  anota(donde, campo, a, b);
  return false;
}

async function main() {
  const productos = leerProductos();
  const articulos = leerArticulos();
  const cuenta = recuentos(productos, articulos);
  const db = await abrirLocal();

  try {
    recuentosTabla(db, cuenta);
    comprobarProductos(db, productos, { igual, anota });
    await comprobarArticulos(db, articulos, { igual, anota });
    integridad(db);
    anomalias(db);
  } finally {
    db.cerrar();
  }

  informe(cuenta);
}

/** 1. Recuentos. Una diferencia aquí explica casi siempre las de abajo. */
function recuentosTabla(db, cuenta) {
  const n = (sql) => db.todas(sql)[0].n;
  const esperado = {
    productos: cuenta.productos,
    variantes: cuenta.variantes,
    opciones: cuenta.opciones,
    imagenes: cuenta.imagenesProducto,
    articulos: cuenta.articulos,
  };
  for (const [tabla, esp] of Object.entries(esperado)) {
    igual('recuentos', tabla, esp, n(`SELECT COUNT(*) AS n FROM ${tabla}`));
  }
  igual(
    'recuentos',
    'vínculos imagen↔variante',
    cuenta.vinculosImagenVariante,
    n('SELECT COUNT(*) AS n FROM imagenes WHERE variante_id IS NOT NULL'),
  );
  igual(
    'recuentos',
    'portadas del diario',
    cuenta.portadasDiario,
    n('SELECT COUNT(*) AS n FROM articulos WHERE imagen IS NOT NULL'),
  );
}

/** 8. Integridad referencial y unicidad. */
function integridad(db) {
  const vacio = (etiqueta, sql) => {
    const filas = db.todas(sql);
    if (filas.length) anota('integridad', etiqueta, 'ninguna fila', `${filas.length} fila(s)`);
  };
  vacio(
    'imágenes sin producto',
    'SELECT i.id FROM imagenes i LEFT JOIN productos p ON p.id = i.producto_id WHERE p.id IS NULL',
  );
  vacio(
    'variantes sin producto',
    'SELECT v.id FROM variantes v LEFT JOIN productos p ON p.id = v.producto_id WHERE p.id IS NULL',
  );
  vacio(
    'opciones sin producto',
    'SELECT o.id FROM opciones o LEFT JOIN productos p ON p.id = o.producto_id WHERE p.id IS NULL',
  );
  vacio(
    'imágenes con variante_id de otro producto',
    `SELECT i.id FROM imagenes i JOIN variantes v ON v.id = i.variante_id
      WHERE v.producto_id <> i.producto_id`,
  );
  vacio(
    'categorías referenciadas que no existen',
    `SELECT p.handle FROM productos p LEFT JOIN categorias c ON c.id = p.categoria WHERE c.id IS NULL
     UNION ALL
     SELECT a.handle FROM articulos a LEFT JOIN categorias c ON c.id = a.categoria WHERE c.id IS NULL`,
  );
  /* El id de Shopify repetido rompería la resolución del carrito. La columna es
     UNIQUE, así que esto no puede pasar; se comprueba igual porque el coste es
     cero y el fallo sería invisible y caro. */
  vacio(
    'id_externo repetido',
    'SELECT id_externo FROM variantes WHERE id_externo IS NOT NULL GROUP BY id_externo HAVING COUNT(*) > 1',
  );
  vacio(
    'variantes sin id_externo',
    "SELECT id FROM variantes WHERE id_externo IS NULL OR id_externo = ''",
  );
}

/** 7. Las dos anomalías de B.0 tienen que SEGUIR ahí. */
function anomalias(db) {
  const webp = db.todas(
    `SELECT i.clave FROM imagenes i JOIN productos p ON p.id = i.producto_id
      WHERE p.handle = 'servex-hario'`,
  );
  if (webp.length !== 1 || !webp[0].clave.endsWith('.webp')) {
    anota(
      'anomalía 1 (B.0)',
      'servex-hario conserva su .webp',
      '1 imagen .webp',
      JSON.stringify(webp.map((r) => r.clave)),
    );
  }
  const sinPortada = db.todas('SELECT handle FROM articulos WHERE imagen IS NULL');
  if (sinPortada.length !== 1) {
    anota(
      'anomalía 2 (B.0)',
      'exactamente 1 artículo sin portada',
      '1 artículo',
      `${sinPortada.length} artículo(s)`,
    );
  }
}

function informe(cuenta) {
  if (dif.length) {
    console.error(`\n✘ ${dif.length} diferencia(s) entre los ficheros y D1:\n`);
    for (const d of dif) {
      console.error(`  ${d.donde} · ${d.campo}`);
      console.error(`      origen: ${d.origen}`);
      console.error(`      en D1 : ${d.base}`);
    }
    console.error('\nLa migración NO está completa. Revisa lo de arriba antes de seguir.\n');
    process.exit(1);
  }
  console.log('comparar-d1: los ficheros y D1 coinciden campo a campo.\n');
  const linea = (k, v) => console.log(`  ${String(v).padStart(4)}  ${k}`);
  linea('productos, con sus 11 campos', cuenta.productos);
  linea('variantes (orden, id de Shopify, precio, sku)', cuenta.variantes);
  linea('opciones (con el orden de sus valores)', cuenta.opciones);
  linea('imágenes de producto (ruta, alt, orden)', cuenta.imagenesProducto);
  linea('vínculos imagen↔variante, resueltos por id', cuenta.vinculosImagenVariante);
  linea('artículos (cuerpo_md íntegro y cuerpo_html al día)', cuenta.articulos);
  linea('portadas del diario', cuenta.portadasDiario);
  console.log('\n  Anomalías de B.0 conservadas:');
  console.log('     servex-hario mantiene su .webp como único origen');
  console.log('     1 artículo sigue sin portada (15 portadas para 16 artículos)');
  console.log('\n  Integridad: sin filas huérfanas, sin id_externo repetido ni vacío.\n');
}

main().catch((e) => {
  console.error(`\ncomparar-d1: ${e.message}\n`);
  process.exit(1);
});
