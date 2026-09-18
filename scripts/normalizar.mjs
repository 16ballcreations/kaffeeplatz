#!/usr/bin/env node
/**
 * normalizar.mjs — KaffeePlatz
 *
 * Lee contenido-original/ y genera:
 *   src/content/productos/<handle>.json
 *   src/content/diario/<handle>.md
 *   public/img/productos/<handle>/*
 *   public/img/diario/*
 *
 * Es IDEMPOTENTE: borra y regenera los destinos en cada ejecucion.
 * Al final imprime un informe de correcciones aplicadas y anomalias detectadas.
 *
 * NO EDITES los ficheros generados a mano: se pierden en la siguiente ejecucion.
 * Si hay que corregir contenido, se corrige AQUI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = path.join(RAIZ, 'contenido-original');
const DEST_PRODUCTOS = path.join(RAIZ, 'src/content/productos');
const DEST_DIARIO = path.join(RAIZ, 'src/content/diario');
const DEST_IMG_PRODUCTOS = path.join(RAIZ, 'public/img/productos');
const DEST_IMG_DIARIO = path.join(RAIZ, 'public/img/diario');

/** Acumulador del informe. */
const informe = {
  correccionesMarca: 0,
  correccionesVendor: [],
  handlesCorregidos: [],
  erratas: [],
  erratasNoEncontradas: [],
  sinImagen: [],
  agotados: [],
  anomalias: [],
};

// ---------------------------------------------------------------------------
// 1. Normalizacion del nombre de marca
// ---------------------------------------------------------------------------

/**
 * Sustituye "Kaffee Platz" / "Kaffeeplatz" / "KAFFEEPLATZ" -> "KaffeePlatz"
 * en la PROSA, respetando las URLs en minusculas (kaffeeplatz.co, el CDN, correos).
 *
 * Estrategia: se extraen primero los tramos que son URL/dominio/correo a
 * marcadores opacos, se normaliza el resto, y se reinyectan intactos.
 *
 * CASO ESPECIAL: en el blog hay menciones en prosa del tipo "Hoy en
 * Kaffeeplatz.co te contamos...". Ahi la marca va CAPITALIZADA y forma parte de
 * la frase, no de un enlace. Se normaliza la marca y se conserva el ".co".
 * Las URLs en MINUSCULAS (kaffeeplatz.co, www.kaffeeplatz.co) NO se tocan.
 */
export function normalizarMarca(texto) {
  if (typeof texto !== 'string' || texto === '') return texto;

  const protegidos = [];
  const proteger = (m) => {
    protegidos.push(m);
    return `P${protegidos.length - 1}`;
  };

  let t = texto
    // Mencion en prosa del dominio con la marca capitalizada, fuera de un enlace:
    // "Kaffeeplatz.co" -> "KaffeePlatz.co". Solo si NO va precedida de "//" ni "@"
    // ni "www." (eso ya seria una URL) y la K es mayuscula.
    .replace(/(?<![\/@.\w])Kaffee\s*platz(?=\.co\b)/g, 'KaffeePlatz')
    // URLs completas con protocolo
    .replace(/https?:\/\/[^\s"'<>)\]]+/gi, proteger)
    // Correos electronicos
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, proteger)
    // Dominios sueltos: www.kaffeeplatz.co, kaffeeplatz.co, cdn.shopify.com...
    .replace(/(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s"'<>)\]]*)?/g, proteger);

  const antes = t;
  // Variantes de la marca escritas mal, en cualquier caja, con o sin espacio.
  t = t.replace(/\bKaffee\s*Platz\b/gi, 'KaffeePlatz');
  if (t !== antes) informe.correccionesMarca += 1;

  return t.replace(/P(\d+)/g, (_, i) => protegidos[Number(i)]);
}

// ---------------------------------------------------------------------------
// 2. Erratas conocidas del contenido publicado
// ---------------------------------------------------------------------------

const ERRATAS = [
  { buscar: /\bse\s+gaanan\b/gi, sustituir: 'se ganan', etiqueta: '"se gaanan" -> "se ganan"' },
  { buscar: /\bDummi\b/g, sustituir: 'Dummy', etiqueta: '"Dummi" -> "Dummy"' },
];

/**
 * Rutas heredadas de Shopify que ya no existen en el sitio nuevo.
 * El enlace "Regresar al blog" venia al final de los 16 articulos apuntando a
 * /blogs/noticias, que era la ruta de Shopify. Aqui el diario vive en /diario.
 * Se deja como ruta RELATIVA A LA RAIZ DEL SITIO: cada propuesta la resuelve
 * con su propio `base`, asi que no se codifica el prefijo aqui.
 */
const RUTAS_HEREDADAS = [
  {
    buscar: /\]\(\/blogs\/noticias\/?\)/g,
    sustituir: '](/diario)',
    etiqueta: '"/blogs/noticias" -> "/diario"',
  },
];

const erratasVistas = new Set();

export function corregirErratas(texto) {
  if (typeof texto !== 'string' || texto === '') return texto;
  let t = texto;
  for (const e of [...ERRATAS, ...RUTAS_HEREDADAS]) {
    if (e.buscar.test(t)) {
      erratasVistas.add(e.etiqueta);
      t = t.replace(e.buscar, e.sustituir);
    }
    e.buscar.lastIndex = 0;
  }
  return t;
}

/** Pasada completa de limpieza de prosa. */
const limpiar = (t) => corregirErratas(normalizarMarca(t));

// ---------------------------------------------------------------------------
// 3. Correcciones de handle
// ---------------------------------------------------------------------------

/** slug legible a partir de un titulo en espanol. */
export function aSlug(titulo) {
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Handles rotos del catalogo de origen.
 * - `sin-nombre-2jul_23-46`: nombre de archivo accidental, se deriva del title real.
 * - `fitro-de-acero-chemex-3-tazas`: typo "fitro" -> "filtro".
 */
const HANDLES_CORREGIDOS = {
  'sin-nombre-2jul_23-46': { motivo: 'handle roto (nombre de archivo accidental), derivado del title real' },
  'fitro-de-acero-chemex-3-tazas': {
    nuevo: 'filtro-de-acero-chemex-3-tazas',
    motivo: 'typo "fitro" -> "filtro"',
  },
};

function resolverHandle(handleOriginal, titulo) {
  const regla = HANDLES_CORREGIDOS[handleOriginal];
  if (!regla) return handleOriginal;
  const nuevo = regla.nuevo ?? aSlug(titulo);
  informe.handlesCorregidos.push({ de: handleOriginal, a: nuevo, motivo: regla.motivo });
  return nuevo;
}

// ---------------------------------------------------------------------------
// 4. Precios
// ---------------------------------------------------------------------------

/** 120000 -> "$120.000" (COP, separador de miles con punto). */
export function formatearCOP(valor) {
  const entero = Math.round(Number(valor));
  return '$' + entero.toLocaleString('de-DE');
}

// ---------------------------------------------------------------------------
// 5. Utilidades de ficheros
// ---------------------------------------------------------------------------

function limpiarDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

/** Nombre de archivo corto, estable y seguro para web. */
function nombreImagenProducto(handle, indice, archivoOriginal) {
  const ext = path.extname(archivoOriginal).toLowerCase() || '.jpg';
  return `${handle}-${indice + 1}${ext}`;
}

// ---------------------------------------------------------------------------
// 6. Productos
// ---------------------------------------------------------------------------

function procesarProductos() {
  const dirOrigen = path.join(ORIGEN, 'productos');
  const archivos = fs.readdirSync(dirOrigen).filter((f) => f.endsWith('.json')).sort();

  const coleccionesPorHandle = cargarColecciones();
  const salida = [];

  for (const archivo of archivos) {
    const crudo = JSON.parse(fs.readFileSync(path.join(dirOrigen, archivo), 'utf8'));
    const handleOriginal = crudo.handle;
    const titulo = limpiar(crudo.title).trim();
    const handle = resolverHandle(handleOriginal, titulo);

    // --- vendor ---
    let vendor = limpiar(crudo.vendor ?? '').trim();
    if (!vendor || /^mi tienda$/i.test(vendor)) {
      informe.correccionesVendor.push({ handle, de: crudo.vendor, a: 'KaffeePlatz' });
      vendor = 'KaffeePlatz';
    }

    // --- variantes ---
    const variantes = (crudo.variants ?? []).map((v) => {
      const precio = Math.round(Number(v.price));
      const esUnica = /^default title$/i.test(v.title ?? '');
      return {
        id: String(v.id),
        titulo: esUnica ? titulo : limpiar(v.title).trim(),
        precio,
        precioFormateado: formatearCOP(precio),
        disponible: Boolean(v.available),
        sku: v.sku ?? null,
      };
    });

    if (variantes.length === 0) {
      informe.anomalias.push(`${handle}: sin variantes, no se puede derivar precio`);
    }

    const precios = variantes.map((v) => v.precio);
    const precio = precios.length ? Math.min(...precios) : 0;
    const disponible = variantes.some((v) => v.disponible);
    if (!disponible) informe.agotados.push(handle);

    // --- opciones ---
    const opciones = (crudo.options ?? [])
      .filter((o) => !(o.values?.length === 1 && /^default title$/i.test(o.values[0])))
      .map((o) => ({ nombre: limpiar(o.name), valores: o.values.map((x) => limpiar(x)) }));

    // --- imagenes: se copian del directorio local, no del CDN ---
    const dirImgOrigen = path.join(ORIGEN, 'imagenes', handleOriginal);
    const imagenes = [];
    if (fs.existsSync(dirImgOrigen)) {
      const archivosImg = fs.readdirSync(dirImgOrigen).sort();
      const dirImgDest = path.join(DEST_IMG_PRODUCTOS, handle);
      fs.mkdirSync(dirImgDest, { recursive: true });
      archivosImg.forEach((f, i) => {
        const nombre = nombreImagenProducto(handle, i, f);
        fs.copyFileSync(path.join(dirImgOrigen, f), path.join(dirImgDest, nombre));
        imagenes.push({
          src: `/img/productos/${handle}/${nombre}`,
          alt: i === 0 ? titulo : `${titulo} — vista ${i + 1}`,
        });
      });
    }
    if (imagenes.length === 0) informe.sinImagen.push(handle);

    const producto = {
      handle,
      titulo,
      vendor,
      descripcionHtml: limpiar(crudo.body_html ?? ''),
      descripcionTexto: limpiar(crudo.body_text ?? '').trim(),
      precio,
      precioFormateado: formatearCOP(precio),
      disponible,
      variantes,
      opciones,
      imagenes,
      coleccion: coleccionesPorHandle[handle] ?? undefined,
      destacado: undefined,
    };

    // Limpia las claves indefinidas para no escribir "null" en el JSON.
    for (const k of Object.keys(producto)) {
      if (producto[k] === undefined) delete producto[k];
    }

    salida.push(producto);
  }

  // Destacados: los 4 primeros disponibles con imagen, por precio descendente.
  salida
    .filter((p) => p.disponible && p.imagenes.length > 0)
    .sort((a, b) => b.precio - a.precio)
    .slice(0, 4)
    .forEach((p) => {
      p.destacado = true;
    });

  for (const p of salida) {
    fs.writeFileSync(
      path.join(DEST_PRODUCTOS, `${p.handle}.json`),
      JSON.stringify(p, null, 2) + '\n',
      'utf8'
    );
  }

  return salida;
}

/**
 * collections.json solo trae el recuento de productos, no la pertenencia.
 * Sin ese dato no se puede asignar coleccion de forma fiable, asi que se deja
 * sin asignar en lugar de inventarla.
 */
function cargarColecciones() {
  const ruta = path.join(ORIGEN, 'datos/collections.json');
  if (!fs.existsSync(ruta)) return {};
  const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const n = datos.collections?.length ?? 0;
  informe.anomalias.push(
    `collections.json lista ${n} colecciones pero no incluye la pertenencia producto->coleccion; ` +
      `el campo "coleccion" queda vacio en los 25 productos.`
  );
  return {};
}

// ---------------------------------------------------------------------------
// 7. Diario (blog)
// ---------------------------------------------------------------------------

/** Parser minimo de frontmatter YAML: claves planas con valor entrecomillado. */
function partirFrontmatter(texto) {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { datos: {}, cuerpo: texto };
  const datos = {};
  for (const linea of m[1].split(/\r?\n/)) {
    const par = linea.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!par) continue;
    let valor = par[2].trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    datos[par[1]] = valor;
  }
  return { datos, cuerpo: m[2] };
}

/** Escapa un valor para frontmatter YAML entrecomillado. */
const yamlStr = (v) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

function procesarDiario() {
  const dirOrigen = path.join(ORIGEN, 'blog');
  const archivos = fs.readdirSync(dirOrigen).filter((f) => f.endsWith('.md')).sort();
  const salida = [];

  for (const archivo of archivos) {
    const bruto = fs.readFileSync(path.join(dirOrigen, archivo), 'utf8');
    const { datos, cuerpo } = partirFrontmatter(bruto);

    const handle = datos.handle || path.basename(archivo, '.md');
    const titulo = limpiar(datos.title ?? '').trim();

    // --- imagen de portada ---
    let imagen;
    if (datos.imagen) {
      const origenImg = path.join(ORIGEN, datos.imagen);
      if (fs.existsSync(origenImg)) {
        const ext = path.extname(origenImg).toLowerCase() || '.png';
        const nombre = `${handle}${ext}`;
        fs.copyFileSync(origenImg, path.join(DEST_IMG_DIARIO, nombre));
        imagen = `/img/diario/${nombre}`;
      } else {
        informe.anomalias.push(`diario/${handle}: imagen declarada no encontrada (${datos.imagen})`);
      }
    }
    if (!imagen) informe.anomalias.push(`diario/${handle}: articulo sin imagen de portada`);

    // --- cuerpo ---
    // Se retira el H1 duplicado (ya va en el frontmatter), la linea de fecha
    // suelta y la imagen de portada remota; la portada la pinta el layout.
    let cuerpoLimpio = cuerpo
      .replace(/^\s*#\s+.*\r?\n/, '')
      .replace(/^\s*\d{1,2}\s+de\s+\w+\s+de\s+\d{4}\s*\r?\n/im, '')
      // Imagen de portada al principio del cuerpo. En algunos articulos viene
      // envuelta en un encabezado ("### ![](...)"), de ahi el prefijo opcional.
      .replace(/^\s*#{0,6}\s*!\[[^\]]*\]\((?:https?:)?\/\/[^)]*\)\s*\r?\n?/m, '')
      .trim();

    // Ninguna imagen debe quedar apuntando al CDN de Shopify: el sitio nuevo
    // sirve copias locales. Si queda alguna remota, se reporta como anomalia.
    const remotas = cuerpoLimpio.match(/!\[[^\]]*\]\((?:https?:)?\/\/[^)]*\)/g);
    if (remotas) {
      informe.anomalias.push(
        `diario/${handle}: ${remotas.length} imagen(es) del cuerpo siguen apuntando al CDN remoto`
      );
    }

    cuerpoLimpio = limpiar(cuerpoLimpio);

    const resumen = limpiar(datos.resumen ?? '').trim();
    if (!resumen) informe.anomalias.push(`diario/${handle}: resumen vacio en el origen`);

    const fecha = datos.fecha;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '')) {
      informe.anomalias.push(`diario/${handle}: fecha invalida (${fecha})`);
    }

    const frontmatter = [
      '---',
      `titulo: ${yamlStr(titulo)}`,
      `handle: ${yamlStr(handle)}`,
      `fecha: ${fecha}`,
      `autor: ${yamlStr(limpiar(datos.autor ?? 'KaffeePlatz').trim())}`,
      `resumen: ${yamlStr(resumen || derivarResumen(cuerpoLimpio))}`,
      ...(imagen ? [`imagen: ${yamlStr(imagen)}`] : []),
      '---',
      '',
    ].join('\n');

    fs.writeFileSync(path.join(DEST_DIARIO, `${handle}.md`), frontmatter + cuerpoLimpio + '\n', 'utf8');
    salida.push({ handle, titulo, fecha, imagen });
  }

  return salida;
}

/** Fallback de resumen: primer parrafo de prosa recortado. */
function derivarResumen(cuerpo) {
  const parrafo = cuerpo
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#') && !p.startsWith('!['));
  if (!parrafo) return 'Un articulo del diario de KaffeePlatz.';
  const texto = parrafo.replace(/\s+/g, ' ');
  return texto.length > 180 ? texto.slice(0, 177).trimEnd() + '...' : texto;
}

// ---------------------------------------------------------------------------
// 8. Ejecucion
// ---------------------------------------------------------------------------

function main() {
  for (const d of [DEST_PRODUCTOS, DEST_DIARIO, DEST_IMG_PRODUCTOS, DEST_IMG_DIARIO]) {
    limpiarDir(d);
  }

  const productos = procesarProductos();
  const articulos = procesarDiario();

  for (const e of [...ERRATAS, ...RUTAS_HEREDADAS]) {
    if (!erratasVistas.has(e.etiqueta)) informe.erratasNoEncontradas.push(e.etiqueta);
  }
  informe.erratas = [...erratasVistas];

  // ---- Informe ----
  const L = console.log;
  L('');
  L('=== NORMALIZACION KaffeePlatz ===');
  L(`Productos generados : ${productos.length}`);
  L(`Articulos generados : ${articulos.length}`);
  L('');
  L(`Sustituciones de marca -> "KaffeePlatz" (campos afectados): ${informe.correccionesMarca}`);
  L('');
  L(`Vendor corregido a "KaffeePlatz" (${informe.correccionesVendor.length}):`);
  informe.correccionesVendor.forEach((v) => L(`  - ${v.handle}: "${v.de}" -> "${v.a}"`));
  L('');
  L(`Handles corregidos (${informe.handlesCorregidos.length}):`);
  informe.handlesCorregidos.forEach((h) => L(`  - "${h.de}" -> "${h.a}"  (${h.motivo})`));
  L('');
  L(`Erratas corregidas (${informe.erratas.length}):`);
  informe.erratas.forEach((e) => L(`  - ${e}`));
  if (informe.erratasNoEncontradas.length) {
    L(`Erratas buscadas pero NO presentes en el material (${informe.erratasNoEncontradas.length}):`);
    informe.erratasNoEncontradas.forEach((e) => L(`  - ${e}`));
  }
  L('');
  L(`Productos SIN imagen (${informe.sinImagen.length}): ${informe.sinImagen.join(', ') || 'ninguno'}`);
  L(`Productos AGOTADOS (${informe.agotados.length}): ${informe.agotados.join(', ') || 'ninguno'}`);
  L('');
  L(`Anomalias (${informe.anomalias.length}):`);
  informe.anomalias.forEach((a) => L(`  - ${a}`));
  L('');
}

main();
