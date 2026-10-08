/**
 * semilla-catalogos.mjs — las dos listas que van a `categorias` y
 * `roles_imagen`.
 *
 * LAS CATEGORÍAS SE LEEN DE src/datos/categorias.ts, NO SE COPIAN
 * ===========================================================================
 * Ese fichero sigue siendo el catálogo semilla y lo dice él mismo: "el día que
 * estos productos lleguen por HTTP, solo cambia el ORIGEN, no la forma".
 * Copiar aquí los nombres y las descripciones sería tener la misma lista en dos
 * sitios y descubrir la divergencia el día que alguien renombre una categoría
 * en el sitio y la base siga diciendo lo de antes.
 *
 * Se lee con expresiones regulares porque Node no ejecuta TypeScript y meter un
 * compilador en un script de migración es desproporcionado. El formato del
 * fichero son literales planos y estables; si dejaran de serlo, esto lanza un
 * error en voz alta (lista vacía) en vez de sembrar una tabla a medias.
 *
 * LOS DOS ÁMBITOS COMPARTEN ESPACIO DE IDS, Y HAY QUE SABERLO
 * ---------------------------------------------------------------------------
 * `CATEGORIAS` (productos) y `CATEGORIAS_DIARIO` (temas) son listas separadas a
 * propósito —un producto nunca es de "técnica"— pero COMPARTEN tres ids:
 * 'metodos', 'equipo'... y sobre todo 'otros'. En D1 van a la MISMA tabla, cuya
 * clave primaria es `id`, así que 'metodos' no puede existir dos veces con dos
 * nombres distintos ('Métodos de preparación' y 'Métodos').
 *
 * Decisión: el id de la tabla es `<ambito>:<id>` para el diario y el id tal
 * cual para productos. Así:
 *   - los 25 productos siguen guardando 'metodos' en `productos.categoria`,
 *     igual que hoy en el JSON: no cambia ni un dato del catálogo;
 *   - los artículos guardan 'diario:metodos', que es un valor nuevo pero
 *     interno (nunca sale en una URL ni lo ve la dueña);
 *   - y la columna `ambito`, que el plan ya pedía, sigue sirviendo para
 *     filtrar la lista que se le enseña a cada pantalla del panel.
 *
 * La alternativa —clave primaria compuesta (id, ambito)— es más limpia en
 * teoría, pero obliga a que `productos.categoria` y `articulos.categoria`
 * lleven las dos columnas, y el plan fija que `productos.categoria` sea una FK
 * simple a `categorias(id)`. Entre cambiar el esquema del plan y prefijar un id
 * que nadie lee, se prefirió lo segundo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './contenido.mjs';

/**
 * Prefijo de los ids del diario dentro de la tabla `categorias`.
 *
 * Se LEE de src/datos/categorias.ts, que es donde está declarado para el
 * sitio: el que escribe (este script) y el que lee (la capa de datos) tienen
 * que usar el mismo, y tenerlo en dos sitios es exactamente como se
 * desincroniza. Si alguien lo cambia allí, esto lo sigue.
 */
export const PREFIJO_DIARIO = (() => {
  const ts = fs.readFileSync(path.join(RAIZ, 'src/datos/categorias.ts'), 'utf8');
  const m = ts.match(/export const PREFIJO_DIARIO = '([^']+)'/);
  if (!m) {
    throw new Error(
      'No se encontró PREFIJO_DIARIO en src/datos/categorias.ts. ' +
        'La semilla y la capa de datos tienen que usar el mismo prefijo.',
    );
  }
  return m[1];
})();

/**
 * Extrae una lista `Categoria[]` de src/datos/categorias.ts.
 * Devuelve {id, nombre, orden, descripcion} en el orden en que están escritas.
 */
function leerLista(nombreConst) {
  const ts = fs.readFileSync(path.join(RAIZ, 'src/datos/categorias.ts'), 'utf8');
  const i = ts.indexOf(`export const ${nombreConst}: Categoria[] = [`);
  if (i < 0) throw new Error(`No se encontró ${nombreConst} en src/datos/categorias.ts`);
  const bloque = ts.slice(i, ts.indexOf('\n];', i));

  const salida = [];
  /* Cada entrada es un objeto `{ id: '...', nombre: '...', orden: N,
     descripcion: '...' }`. Se trocea por `id:` para no depender del orden de
     las claves dentro de cada objeto. */
  const partes = bloque.split(/\n\s*\{\s*\n/).slice(1);
  for (const parte of partes) {
    const id = parte.match(/id:\s*'([^']*)'/)?.[1];
    const nombre = parte.match(/nombre:\s*'([^']*)'/)?.[1];
    const orden = parte.match(/orden:\s*(\d+)/)?.[1];
    /* La descripción puede llevar comillas simples escapadas o apóstrofos
       tipográficos; se acepta cualquier contenido hasta la comilla de cierre
       seguida de coma y salto. */
    const descripcion = parte.match(/descripcion:\s*'((?:[^'\\]|\\.)*)'/)?.[1];
    if (!id || !nombre || orden === undefined) {
      throw new Error(
        `Entrada de ${nombreConst} ilegible (id/nombre/orden). ` +
          'Si src/datos/categorias.ts dejó de ser literales planos, hay que revisar este lector.',
      );
    }
    salida.push({
      id,
      nombre,
      orden: Number(orden),
      descripcion: descripcion ? descripcion.replace(/\\'/g, "'") : null,
    });
  }
  if (!salida.length) throw new Error(`${nombreConst} salió vacía`);
  return salida;
}

/** Las dos listas, ya con su `ambito` y con los ids del diario prefijados. */
export function categoriasSemilla() {
  const productos = leerLista('CATEGORIAS').map((c) => ({ ...c, ambito: 'producto' }));
  const diario = leerLista('CATEGORIAS_DIARIO').map((c) => ({
    ...c,
    id: PREFIJO_DIARIO + c.id,
    ambito: 'diario',
  }));
  const todas = [...productos, ...diario];
  const ids = todas.map((c) => c.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('hay ids de categoría repetidos tras prefijar el diario');
  }
  return todas;
}

/**
 * Roles de imagen (B.7 del plan): los tres que nombró el cliente más dos
 * obvios. `rol` es NULLABLE y las 30 fotos actuales quedan SIN rol: no se
 * inventa uno. Una foto sin rol se muestra igual; el rol solo añade orden y
 * una etiqueta.
 *
 * Esta lista SÍ está escrita aquí y no en src/, a diferencia de las
 * categorías, porque el sitio público no la usa: hoy nada en src/ necesita
 * saber qué roles existen. La tabla es la fuente de verdad desde el primer día
 * y ampliarla es insertar una fila desde el panel, sin migración (que es el
 * motivo de que sea una tabla y no un CHECK).
 */
export function rolesSemilla() {
  return [
    { id: 'armado', nombre: 'Armado', orden: 1 },
    { id: 'desarmado', nombre: 'Desarmado', orden: 2 },
    { id: 'en-uso', nombre: 'Extrayendo café', orden: 3 },
    { id: 'detalle', nombre: 'Detalle', orden: 4 },
    { id: 'empaque', nombre: 'Empaque', orden: 5 },
  ];
}
