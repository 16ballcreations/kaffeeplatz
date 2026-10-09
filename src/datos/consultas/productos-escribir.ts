/**
 * consultas/productos-escribir.ts — las escrituras del catálogo (fase 5).
 * ===========================================================================
 * Crear, guardar, archivar y restaurar productos, y su auditoría. Las
 * escrituras de las versiones (variantes) viven en `variantes-escribir.ts`. Solo lo usa el panel; el sitio público no importa este fichero
 * (y su tipo `BaseD1` de solo lectura no le dejaría llamar a nada de aquí).
 *
 * Está separado de `consultas/productos.ts` por la misma razón que el
 * inventario separa `inventario-leer.ts` de `inventario-escribir.ts`: las
 * lecturas del sitio no escriben nunca, y quien audite «¿qué puede cambiar el
 * catálogo?» tiene que poder leer UN fichero sin el ruido de las consultas
 * públicas.
 *
 * TODO GUARDADO ES UN SOLO `batch()`
 * ---------------------------------------------------------------------------
 * Un producto son varias filas (el producto, sus variantes, su opción, la
 * auditoría). Guardarlas con varias llamadas sueltas dejaría a medias un
 * producto si la tercera falla: un precio nuevo con las variantes viejas, o
 * una variante borrada sin rastro en la auditoría. `batch()` en D1 es una
 * transacción implícita: o entra todo o no entra nada. D1 remoto no acepta
 * `BEGIN TRANSACTION` a mano, así que es la ÚNICA forma de tener atomicidad.
 *
 * EL CERROJO DE `version` VIVE DENTRO DEL MISMO BATCH
 * ---------------------------------------------------------------------------
 * El patrón de 16bc (`UPDATE ... WHERE id = ? AND version = ?`) tiene una
 * trampa dentro de un batch: si el UPDATE no toca ninguna fila porque otra
 * pestaña guardó antes, el batch NO se detiene — las sentencias siguientes
 * (variantes, opción) se ejecutarían igual y pisarían lo del otro. Un batch
 * solo se deshace si algo FALLA, no si algo no cambia nada.
 *
 * Así que la fila de auditoría hace de cerrojo. Va justo después del UPDATE
 * del producto y su `entidad` es
 *
 *     CASE WHEN changes() = 1 THEN 'producto' ELSE 'conflicto' END
 *
 * Si el UPDATE ganó, se escribe la auditoría normal. Si no tocó nada, intenta
 * escribir `entidad = 'conflicto'`, que el CHECK de 0003 rechaza, el batch
 * falla entero y no se escribe NADA. Una sola sentencia hace las dos cosas,
 * y lo importante es que la decisión la toma la base en el mismo instante que
 * el UPDATE, no el código antes (una lectura previa de `version` y luego el
 * batch dejaría una ventana entre las dos). La lectura previa también se hace
 * —es la que da el mensaje bueno en el caso normal—; esto es lo que cubre la
 * carrera de verdad.
 */

import type { BaseD1Escritura, SentenciaPreparada } from './inventario-formas';

/** Lo editable de un producto, ya validado y saneado por el panel. */
export interface DatosProducto {
  titulo: string;
  /** YA SANEADO (B.5). Este fichero no sanea: confía en que llega limpio. */
  descripcionHtml: string;
  descripcionTexto: string;
  categoria: string;
  destacado: boolean;
}

/** Lo que guarda el bloque «Producto» de la ficha. */
export interface GuardadoProducto {
  productoId: number;
  versionEsperada: number;
  datos: DatosProducto;
  /**
   * Las sentencias de las fotos generales del bloque (versión, toma, alt y
   * publicar), ya construidas por `sentenciasAsignaciones` en
   * imagenes-escribir.ts. Van DETRÁS del cerrojo: si hay conflicto, tampoco
   * se escriben.
   */
  fotos: unknown[];
  /** Foto del producto ANTES de guardar, para la auditoría. */
  antes: unknown;
  /** Resumen legible del cambio: «nombre: «A» → «B»; descripción». */
  nota: string;
}

export type MotivoFallo = 'conflicto' | 'con-historial' | 'nombre-repetido' | 'error';
export type ResultadoGuardar = { ok: true } | { ok: false; motivo: MotivoFallo };

/**
 * Precio y disponibilidad del PRODUCTO, derivados de sus variantes (B.1).
 *
 * El precio es el menor de las variantes A LA VENTA —el «desde» que enseña la
 * tarjeta—, y si ninguna lo está, el menor de todas: un producto retirado
 * sigue teniendo un precio que enseñar en el panel. Coincide con lo que traía
 * el respaldo de Shopify (la Chemex: 6 tazas a 320.000 y 3 tazas a 285.000 →
 * 285.000).
 *
 * En SQL y no en TypeScript desde que cada versión se guarda sola: quien
 * guarda «Verde» no tiene en la mano el precio de «Rosa» que otra pestaña
 * acaba de cambiar, y la base sí. NO sube `productos.version`: es una columna
 * derivada, y subir el cerrojo del bloque «Producto» por ella daría un
 * conflicto falso en la misma página (ver migrations/0009).
 */
export const SQL_DERIVADOS = `UPDATE productos SET
    disponible = EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = ?1 AND v.disponible = 1),
    precio = COALESCE(
      (SELECT MIN(v.precio) FROM variantes v WHERE v.producto_id = ?1 AND v.disponible = 1),
      (SELECT MIN(v.precio) FROM variantes v WHERE v.producto_id = ?1), 0),
    updated_at = datetime('now')
  WHERE id = ?1`;

/**
 * Las variantes nacidas en el panel reciben `id_externo = 'kp-<id>'`.
 *
 * POR QUE: el carrito guarda en `localStorage` el id PÚBLICO de la variante,
 * que es `id_externo ?? titulo` (`aVariante` en consultas/productos.ts). Sin
 * esto, una variante del panel se identificaría por su TÍTULO, y renombrar
 * «Morado» a «Violeta» vaciaría en silencio esa línea de todos los carritos
 * guardados. Con un id estable, renombrar no rompe nada, igual que no rompe
 * las fotos (que van por `variante_id`). El prefijo `kp-` no choca con los
 * ids de Shopify, que son solo dígitos.
 */
export const ID_EXTERNO_PROPIO = `UPDATE variantes SET id_externo = 'kp-' || id
  WHERE producto_id = ?1 AND id_externo IS NULL`;

/**
 * Los valores de la opción («Color» → Morado, Verde, Rosa) son los títulos de
 * las variantes EN SU ORDEN, leídos de la base en el mismo batch. Lo usan el
 * guardado de una versión (renombrar cambia un valor) y el de «Versiones»
 * (reordenar cambia el orden). Si el producto no tiene opción, no toca nada.
 */
export const SQL_VALORES_OPCION = `UPDATE opciones SET valores =
    (SELECT json_group_array(titulo) FROM
       (SELECT titulo FROM variantes WHERE producto_id = ?1 ORDER BY orden, id))
  WHERE producto_id = ?1`;

/**
 * Guarda el bloque «Producto»: nombre, descripción, categoría, destacado y sus
 * fotos generales. Todo o nada, con el cerrojo de `productos.version`.
 *
 * NO toca precio ni disponibilidad: desde la ficha por bloques esos los
 * escriben las versiones (ver `SQL_DERIVADOS`).
 */
export async function guardarDatosProducto(
  db: BaseD1Escritura,
  g: GuardadoProducto,
): Promise<ResultadoGuardar> {
  const s: SentenciaPreparada[] = [
    db
      .prepare(
        `UPDATE productos
            SET titulo = ?3, descripcion_html = ?4, descripcion_texto = ?5,
                categoria = ?6, destacado = ?7,
                version = version + 1, updated_at = datetime('now')
          WHERE id = ?1 AND version = ?2`,
      )
      .bind(
        g.productoId,
        g.versionEsperada,
        g.datos.titulo,
        g.datos.descripcionHtml,
        g.datos.descripcionTexto,
        g.datos.categoria,
        g.datos.destacado ? 1 : 0,
      ),
    /* EL CERROJO. Ver la cabecera: si el UPDATE de arriba no tocó nada, esto
       viola el CHECK de `auditoria.entidad` y el batch entero se deshace.
       Tiene que ir INMEDIATAMENTE después: `changes()` habla de la última
       sentencia. */
    db.prepare(CERROJO).bind(String(g.productoId), JSON.stringify(g.antes), g.nota || null),
    ...(g.fotos as SentenciaPreparada[]),
  ];
  return ejecutar(db, s);
}

/**
 * La fila de auditoría que hace de cerrojo (ver la cabecera). La usan los
 * tres bloques de la ficha: todos auditan como `producto` con el id del
 * producto, para que «Últimos cambios» los enseñe juntos.
 */
export const CERROJO = `INSERT INTO auditoria (entidad, entidad_id, accion, antes, nota)
  VALUES (CASE WHEN changes() = 1 THEN 'producto' ELSE 'conflicto' END, ?1, 'editar', ?2, ?3)`;

/** Corre el batch y traduce el fallo a algo que el panel sabe explicar. */
export async function ejecutar(db: BaseD1Escritura, s: SentenciaPreparada[]): Promise<ResultadoGuardar> {
  try {
    await db.batch(s);
    return { ok: true };
  } catch (fallo) {
    return { ok: false, motivo: clasificar(fallo) };
  }
}

/**
 * Qué falló, en las palabras que el panel sabe explicar.
 *
 * Se mira el mensaje de SQLite porque D1 no da códigos de error tipados. Los
 * tres casos que importan tienen textos estables desde hace años
 * («CHECK constraint failed», «FOREIGN KEY constraint failed», «UNIQUE
 * constraint failed»), y si alguno cambiara, el fallo cae en 'error', que el
 * panel explica como «no se pudo guardar, inténtalo otra vez»: degrada al
 * mensaje genérico, nunca a guardar mal.
 */
function clasificar(fallo: unknown): MotivoFallo {
  const m = fallo instanceof Error ? fallo.message : String(fallo);
  if (/CHECK constraint failed/i.test(m) && /auditoria|entidad/i.test(m)) return 'conflicto';
  if (/FOREIGN KEY constraint failed/i.test(m)) return 'con-historial';
  if (/UNIQUE constraint failed/i.test(m)) return 'nombre-repetido';
  console.error('[admin] guardar producto falló:', m);
  /* Un CHECK que no es el de auditoría no puede venir del cerrojo, pero D1 no
     siempre dice QUÉ CHECK falló. Quien llama vuelve a leer `version` para
     distinguir un conflicto real de cualquier otra cosa. */
  if (/CHECK constraint failed/i.test(m)) return 'conflicto';
  return 'error';
}

/** Un producto nuevo, con su variante única. Devuelve su id. */
export async function crearProducto(
  db: BaseD1Escritura,
  handle: string,
  datos: DatosProducto,
  variante: { precio: number; disponible: boolean },
): Promise<{ ok: true; id: number } | { ok: false; motivo: 'handle-repetido' | 'error' }> {
  /* 'Default Title' es la convención de B.1 (y de Shopify) para «este
     producto no viene en colores ni tamaños». El panel no la enseña: el campo
     del nombre aparece vacío mientras sea la única. */
  const s: SentenciaPreparada[] = [
    db
      .prepare(
        `INSERT INTO productos (handle, titulo, descripcion_html, descripcion_texto,
                                categoria, destacado, precio, disponible)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(
        handle,
        datos.titulo,
        datos.descripcionHtml,
        datos.descripcionTexto,
        datos.categoria,
        datos.destacado ? 1 : 0,
        variante.precio,
        variante.disponible ? 1 : 0,
      ),
    db
      .prepare(
        `INSERT INTO variantes (producto_id, titulo, precio, disponible, orden)
         SELECT id, 'Default Title', ?2, ?3, 0 FROM productos WHERE handle = ?1`,
      )
      .bind(handle, variante.precio, variante.disponible ? 1 : 0),
    db
      .prepare(
        `UPDATE variantes SET id_externo = 'kp-' || id
          WHERE id_externo IS NULL
            AND producto_id = (SELECT id FROM productos WHERE handle = ?1)`,
      )
      .bind(handle),
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion, nota)
         SELECT 'producto', id, 'crear', ?2 FROM productos WHERE handle = ?1`,
      )
      .bind(handle, `Creado: ${datos.titulo}`),
  ];

  try {
    await db.batch(s);
  } catch (fallo) {
    const m = fallo instanceof Error ? fallo.message : String(fallo);
    if (/UNIQUE constraint failed/i.test(m)) return { ok: false, motivo: 'handle-repetido' };
    console.error('[admin] crear producto falló:', m);
    return { ok: false, motivo: 'error' };
  }
  const fila = await db
    .prepare('SELECT id FROM productos WHERE handle = ?1')
    .bind(handle)
    .first<{ id: number }>();
  return fila ? { ok: true, id: fila.id } : { ok: false, motivo: 'error' };
}

/**
 * Archivar o restaurar. Devuelve `false` si no había nada que cambiar.
 *
 * Condicional (`archivado_en IS NULL` / `IS NOT NULL`) para que el doble toque
 * de un dedo nervioso no escriba dos auditorías. Y la auditoría solo se
 * escribe si el UPDATE cambió algo: `WHERE changes() = 1` en el INSERT ...
 * SELECT, que aquí NO es un cerrojo (no hay nada que proteger si ya estaba
 * archivado), solo evita una fila de historial que mentiría.
 *
 * Archivar sube `version`: una pestaña con el formulario abierto desde antes
 * del archivado avisará al guardar en vez de editar a ciegas un producto que
 * ya no está en la tienda.
 *
 * Las reservas y los paquetes pendientes NO se tocan (G.4.6): archivar es
 * «quítalo del catálogo», no «cancela las ventas en curso». Las reservas
 * apuntan a `variantes.id` y aquí no se borra ninguna variante.
 */
export async function cambiarArchivado(
  db: BaseD1Escritura,
  productoId: number,
  archivar: boolean,
  antes: unknown,
): Promise<boolean> {
  const r = await db.batch([
    db
      .prepare(
        archivar
          ? `UPDATE productos SET archivado_en = datetime('now'), version = version + 1,
                    updated_at = datetime('now')
              WHERE id = ?1 AND archivado_en IS NULL`
          : `UPDATE productos SET archivado_en = NULL, version = version + 1,
                    updated_at = datetime('now')
              WHERE id = ?1 AND archivado_en IS NOT NULL`,
      )
      .bind(productoId),
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion, antes)
         SELECT 'producto', ?1, ?2, ?3 WHERE changes() = 1`,
      )
      .bind(String(productoId), archivar ? 'archivar' : 'restaurar', JSON.stringify(antes)),
  ]);
  return Boolean(r[0]?.meta.changes);
}
