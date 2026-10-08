/**
 * contenido.mjs — lee y VALIDA src/content/ (los 25 JSON y los 16 MD).
 *
 * POR QUE ESTE FICHERO EXISTE, Y NO ESTA DENTRO DE sembrar-d1.mjs
 * ===========================================================================
 * Lo usan DOS scripts con objetivos opuestos:
 *   - `sembrar-d1.mjs`  escribe el contenido en D1.
 *   - `comparar-d1.mjs` comprueba que lo que hay en D1 coincide con el origen.
 *
 * Si cada uno leyera los ficheros a su manera, la comparación podría dar verde
 * por compartir el mismo error de lectura con la semilla. Leyendo los dos por
 * aquí, la comparación compara de verdad el ORIGEN contra la BASE, que es lo
 * que pide el riesgo R5 del plan.
 *
 * VALIDACIÓN: EL MISMO ZOD QUE EL BUILD
 * ---------------------------------------------------------------------------
 * El plan (B.2, paso 2) exige validar con el zod de src/content.config.ts: no
 * se carga a la base lo que el build de hoy no aceptaría. Ese fichero importa
 * de 'astro:content', que solo existe dentro de Astro, así que no se puede
 * importar desde un script de Node. Lo que SÍ se puede, y es lo que se hace
 * aquí, es reconstruir los mismos esquemas con el zod que Astro ya trae como
 * dependencia, importando los ids de categoría del MISMO fichero
 * (src/datos/categorias.ts) que usa el build. Así la lista de categorías
 * válidas no se escribe dos veces.
 *
 * Hay una prueba de que las dos validaciones no se separan: si un JSON pasa
 * esta validación y no la del build, `npm run build` falla y se ve. El riesgo
 * de que se separen al revés (el build acepta algo que esto rechaza) es el que
 * importa, y de ahí las dos TOLERANCIAS de abajo.
 *
 * LAS DOS ANOMALÍAS QUE HAY QUE TOLERAR (B.0 del plan, verificadas)
 * ---------------------------------------------------------------------------
 * 1. `servex-hario` referencia un `.webp` como origen y es el único fichero de
 *    su carpeta: no hay JPG/PNG. Por eso no está en `imagenes.json` y se sirve
 *    sin `srcset`. El validador NO puede exigir que todo origen sea JPG/PNG.
 * 2. Un artículo del diario no tiene portada, de ahí 15 ficheros para 16
 *    artículos. `imagen` es opcional en el zod y debe seguir siéndolo.
 * Si este validador las rechaza, el validador está mal: son datos de
 * producción que el sitio ya sirve correctamente.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'astro/zod';
import { frontmatter } from './frontmatter.mjs';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR_PRODUCTOS = path.join(RAIZ, 'src/content/productos');
const DIR_DIARIO = path.join(RAIZ, 'src/content/diario');

/**
 * Los ids de categoría salen del MISMO fichero que usa el build. Se leen con
 * una expresión regular en vez de importando el .ts porque Node no ejecuta
 * TypeScript: el fichero es una lista de literales y los ids están en
 * `id: '...'`, así que extraerlos es fiable y no añade un compilador al script.
 * Si algún día ese fichero deja de ser literales planos, esto falla en voz
 * alta (lista vacía → error) en vez de validar contra nada.
 */
function idsDeCategorias() {
  const ts = fs.readFileSync(path.join(RAIZ, 'src/datos/categorias.ts'), 'utf8');
  const bloque = (nombre) => {
    const i = ts.indexOf(`export const ${nombre}: Categoria[] = [`);
    if (i < 0) throw new Error(`No se encontró ${nombre} en src/datos/categorias.ts`);
    const fin = ts.indexOf('\n];', i);
    return [...ts.slice(i, fin).matchAll(/^\s*id:\s*'([^']+)'/gm)].map((m) => m[1]);
  };
  const producto = bloque('CATEGORIAS');
  const diario = bloque('CATEGORIAS_DIARIO');
  if (!producto.length || !diario.length) {
    throw new Error('No se pudo extraer ninguna categoría de src/datos/categorias.ts');
  }
  return { producto, diario };
}

export const IDS = idsDeCategorias();

/* ---------------------------------------------------------------- esquemas */

const imagenProducto = z.object({
  /* Ruta de public/. NO se exige extensión: `servex-hario` usa .webp (B.0). */
  src: z.string().min(1),
  alt: z.string().min(1),
  /* Título EXACTO de una variante, o ausente. La comprobación de que ese
     título existe de verdad se hace en `leerProductos`, que sí ve las
     variantes hermanas; zod valida cada imagen aislada. */
  variante: z.string().optional(),
});

const variante = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  precio: z.number().int().nonnegative(),
  precioFormateado: z.string(),
  disponible: z.boolean(),
  sku: z.string().nullable().default(null),
});

const esquemaProducto = z.object({
  handle: z.string().min(1),
  titulo: z.string().min(1),
  vendor: z.string().default('KaffeePlatz'),
  descripcionHtml: z.string(),
  descripcionTexto: z.string(),
  precio: z.number().int().nonnegative(),
  precioFormateado: z.string(),
  disponible: z.boolean(),
  variantes: z.array(variante),
  opciones: z.array(z.object({ nombre: z.string(), valores: z.array(z.string()) })).default([]),
  imagenes: z.array(imagenProducto).default([]),
  coleccion: z.string().optional(),
  categoria: z.enum(IDS.producto).default('otros'),
  destacado: z.boolean().optional(),
});

const esquemaArticulo = z.object({
  titulo: z.string().min(1),
  handle: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha debe ser YYYY-MM-DD'),
  autor: z.string().min(1),
  resumen: z.string().min(1),
  /* Opcional: un artículo no tiene portada (B.0, anomalía 2). */
  imagen: z.string().optional(),
  categoria: z.enum(IDS.diario).default('otros'),
});

/* ---------------------------------------------------------------- lectura */

/** Acumula los errores de validación para enseñarlos TODOS de golpe. */
class Fallos {
  constructor() {
    this.lista = [];
  }
  add(donde, detalle) {
    this.lista.push(`${donde}: ${detalle}`);
  }
  lanzarSiHay(que) {
    if (!this.lista.length) return;
    throw new Error(
      `${this.lista.length} problema(s) en ${que}. No se escribe nada.\n  - ` +
        this.lista.join('\n  - '),
    );
  }
}

/**
 * Los 25 productos, validados y en orden alfabético de handle.
 *
 * El orden es ALFABÉTICO y no el del directorio: así la semilla produce el
 * mismo SQL en cualquier máquina, y los ids que asigna AUTOINCREMENT son
 * reproducibles. Que la salida de un script de migración sea comparable es
 * justamente lo que permite revisarla antes de ejecutarla (B.2).
 */
export function leerProductos() {
  const fallos = new Fallos();
  const salida = [];
  for (const f of fs.readdirSync(DIR_PRODUCTOS).filter((f) => f.endsWith('.json')).sort()) {
    const ruta = path.join(DIR_PRODUCTOS, f);
    let crudo;
    try {
      crudo = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    } catch (e) {
      fallos.add(f, `JSON ilegible: ${e.message}`);
      continue;
    }
    const r = esquemaProducto.safeParse(crudo);
    if (!r.success) {
      for (const i of r.error.issues) fallos.add(f, `${i.path.join('.')} ${i.message}`);
      continue;
    }
    const p = r.data;
    if (p.handle !== path.basename(f, '.json')) {
      fallos.add(f, `el handle '${p.handle}' no coincide con el nombre del fichero`);
    }
    if (!p.variantes.length) {
      /* Sin variantes no hay precio ni disponibilidad que derivar, y el
         esquema de D1 las da por hechas. Hoy los 25 tienen al menos una. */
      fallos.add(f, 'no tiene ninguna variante');
    }
    /* El vínculo imagen↔variante: si un título no casa, SE FALLA y se dice.
       No se descarta en silencio, porque en la semilla un vínculo perdido es
       un dato perdido. (La galería sí lo descarta al pintar, y ahí es
       correcto: en tiempo de render vale más una galería sin vínculo que una
       rota. Son dos sitios con dos criterios distintos, a propósito — B.7.) */
    const titulos = new Set(p.variantes.map((v) => v.titulo));
    for (const img of p.imagenes) {
      if (img.variante && !titulos.has(img.variante)) {
        fallos.add(f, `la imagen '${img.src}' apunta a la variante '${img.variante}', que no existe`);
      }
    }
    const ids = p.variantes.map((v) => v.id);
    if (new Set(ids).size !== ids.length) fallos.add(f, 'tiene ids de variante repetidos');
    const tits = p.variantes.map((v) => v.titulo);
    if (new Set(tits).size !== tits.length) fallos.add(f, 'tiene títulos de variante repetidos');
    const srcs = p.imagenes.map((i) => i.src);
    if (new Set(srcs).size !== srcs.length) fallos.add(f, 'repite la misma imagen dos veces');
    salida.push(p);
  }
  fallos.lanzarSiHay('los productos de src/content/productos');

  /* Un id de Shopify repetido ENTRE productos rompería el UNIQUE de
     variantes.id_externo, y con él los carritos guardados (sección D). Mejor
     saberlo aquí que a mitad de la carga. */
  const vistos = new Map();
  for (const p of salida) {
    for (const v of p.variantes) {
      if (vistos.has(v.id)) {
        throw new Error(
          `El id de variante '${v.id}' está en '${p.handle}' y en '${vistos.get(v.id)}'. ` +
            'Es el id de Shopify y en D1 es UNIQUE: el carrito lo usa para resolver.',
        );
      }
      vistos.set(v.id, p.handle);
    }
  }
  const handles = salida.map((p) => p.handle);
  if (new Set(handles).size !== handles.length) throw new Error('hay handles de producto repetidos');
  return salida;
}

/**
 * Los 16 artículos, validados, en orden alfabético de handle.
 * Devuelve el frontmatter más `cuerpoMd` (el Markdown tal cual, sin tocar).
 */
export function leerArticulos() {
  const fallos = new Fallos();
  const salida = [];
  for (const f of fs.readdirSync(DIR_DIARIO).filter((f) => f.endsWith('.md')).sort()) {
    const texto = fs.readFileSync(path.join(DIR_DIARIO, f), 'utf8');
    const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m) {
      fallos.add(f, 'no tiene frontmatter delimitado por ---');
      continue;
    }
    let datos;
    try {
      datos = frontmatter(m[1]);
    } catch (e) {
      fallos.add(f, `frontmatter ilegible: ${e.message}`);
      continue;
    }
    const r = esquemaArticulo.safeParse(datos);
    if (!r.success) {
      for (const i of r.error.issues) fallos.add(f, `${i.path.join('.')} ${i.message}`);
      continue;
    }
    if (r.data.handle !== path.basename(f, '.md')) {
      fallos.add(f, `el handle '${r.data.handle}' no coincide con el nombre del fichero`);
    }
    /* `cuerpoMd` se guarda ÍNTEGRO, con el salto final tal cual: es lo que
       permite reeditar el artículo en el panel sin que cambie al guardarlo. */
    salida.push({ ...r.data, cuerpoMd: m[2] });
  }
  fallos.lanzarSiHay('los artículos de src/content/diario');
  const handles = salida.map((a) => a.handle);
  if (new Set(handles).size !== handles.length) throw new Error('hay handles de artículo repetidos');
  return salida;
}

/** Recuentos reales, CONTADOS, nunca escritos a mano (B.2, paso 5). */
export function recuentos(productos, articulos) {
  return {
    productos: productos.length,
    articulos: articulos.length,
    variantes: productos.reduce((n, p) => n + p.variantes.length, 0),
    opciones: productos.reduce((n, p) => n + p.opciones.length, 0),
    imagenesProducto: productos.reduce((n, p) => n + p.imagenes.length, 0),
    portadasDiario: articulos.filter((a) => a.imagen).length,
    vinculosImagenVariante: productos.reduce(
      (n, p) => n + p.imagenes.filter((i) => i.variante).length,
      0,
    ),
  };
}
