/**
 * consultas/productos-escribir.ts — las escrituras del catálogo (fase 5).
 * ===========================================================================
 * Crear, guardar, archivar y restaurar productos, con sus variantes y su
 * auditoría. Solo lo usa el panel; el sitio público no importa este fichero
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

/** Una variante tal como queda tras guardar. `id: null` = nueva. */
export interface VarianteAGuardar {
  id: number | null;
  titulo: string;
  precio: number;
  disponible: boolean;
}

export interface Guardado {
  productoId: number;
  versionEsperada: number;
  datos: DatosProducto;
  /** En el orden final: el índice ES el `orden`. */
  variantes: VarianteAGuardar[];
  /** Ids de variantes a borrar. El panel ya comprobó que no tienen historial. */
  quitar: { id: number; antes: unknown }[];
  /** Ids de variantes cuyo título cambia (para el paso de títulos temporales). */
  renombradas: number[];
  /** Nombre de la opción ('Color', 'Tamaño') o `null` para no tener opción. */
  opcionNombre: string | null;
  /** Foto del producto ANTES de guardar, para la auditoría. */
  antes: unknown;
  /** Resumen legible del cambio: «precio de Morado, título». */
  nota: string;
  reordenado: boolean;
}

export type ResultadoGuardar =
  | { ok: true }
  | { ok: false; motivo: 'conflicto' | 'con-historial' | 'nombre-repetido' | 'error' };

/**
 * Precio y disponibilidad del PRODUCTO, derivados de sus variantes (B.1).
 *
 * El precio es el menor de las variantes A LA VENTA —el «desde» que enseña la
 * tarjeta—, y si ninguna lo está, el menor de todas: un producto retirado
 * sigue teniendo un precio que enseñar en el panel. Coincide con lo que traía
 * el respaldo de Shopify (la Chemex: 6 tazas a 320.000 y 3 tazas a 285.000 →
 * 285.000).
 */
export function derivados(variantes: VarianteAGuardar[]): { precio: number; disponible: boolean } {
  const aLaVenta = variantes.filter((v) => v.disponible);
  const base = aLaVenta.length ? aLaVenta : variantes;
  return {
    precio: base.length ? Math.min(...base.map((v) => v.precio)) : 0,
    disponible: aLaVenta.length > 0,
  };
}

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
const ID_EXTERNO_PROPIO = `UPDATE variantes SET id_externo = 'kp-' || id
  WHERE producto_id = ?1 AND id_externo IS NULL`;

/** Guarda un producto existente con sus variantes. Todo o nada. */
export async function guardarProducto(
  db: BaseD1Escritura,
  g: Guardado,
): Promise<ResultadoGuardar> {
  const d = derivados(g.variantes);
  const s: SentenciaPreparada[] = [];

  s.push(
    db
      .prepare(
        `UPDATE productos
            SET titulo = ?3, descripcion_html = ?4, descripcion_texto = ?5,
                categoria = ?6, destacado = ?7, precio = ?8, disponible = ?9,
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
        d.precio,
        d.disponible ? 1 : 0,
      ),
  );
  /* EL CERROJO. Ver la cabecera: si el UPDATE de arriba no tocó nada, esto
     viola el CHECK de `auditoria.entidad` y el batch entero se deshace. Tiene
     que ir INMEDIATAMENTE después: `changes()` habla de la última sentencia. */
  s.push(
    db
      .prepare(
        `INSERT INTO auditoria (entidad, entidad_id, accion, antes, nota)
         VALUES (CASE WHEN changes() = 1 THEN 'producto' ELSE 'conflicto' END,
                 ?1, 'editar', ?2, ?3)`,
      )
      .bind(String(g.productoId), JSON.stringify(g.antes), g.nota || null),
  );

  /* 1. Borrar. Primero, para que sus títulos queden libres por si una variante
     nueva quiere llamarse igual. Las fotos de la variante borrada pasan al
     producto (ON DELETE SET NULL de 0001): borrar un color no borra el
     trabajo de fotografía. Si tuviera movimientos, reservas o paquetes, el
     RESTRICT de 0004 haría fallar el batch entero — el panel lo comprueba
     antes para poder explicarlo, y esto es la red. */
  for (const q of g.quitar) {
    s.push(
      db.prepare('DELETE FROM variantes WHERE id = ?1 AND producto_id = ?2').bind(q.id, g.productoId),
    );
    s.push(
      db
        .prepare(
          `INSERT INTO auditoria (entidad, entidad_id, accion, antes)
           VALUES ('variante', ?1, 'borrar', ?2)`,
        )
        .bind(String(q.id), JSON.stringify(q.antes)),
    );
  }

  /* 2. Títulos temporales para las que se renombran. Sin este paso, cambiar
     «A»→«B» y «B»→«A» en el mismo guardado choca con UNIQUE (producto_id,
     titulo) a mitad del batch. El temporal lleva un carácter de control que
     nadie puede escribir desde un formulario, así que no puede chocar con un
     título real. */
  for (const id of g.renombradas) {
    s.push(
      db
        .prepare(`UPDATE variantes SET titulo = char(1) || id WHERE id = ?1 AND producto_id = ?2`)
        .bind(id, g.productoId),
    );
  }

  /* 3. Las que quedan, con su orden final; 4. las nuevas. */
  g.variantes.forEach((v, orden) => {
    if (v.id !== null) {
      s.push(
        db
          .prepare(
            `UPDATE variantes SET titulo = ?3, precio = ?4, disponible = ?5, orden = ?6
              WHERE id = ?1 AND producto_id = ?2`,
          )
          .bind(v.id, g.productoId, v.titulo, v.precio, v.disponible ? 1 : 0, orden),
      );
    } else {
      s.push(
        db
          .prepare(
            `INSERT INTO variantes (producto_id, titulo, precio, disponible, orden)
             VALUES (?1, ?2, ?3, ?4, ?5)`,
          )
          .bind(g.productoId, v.titulo, v.precio, v.disponible ? 1 : 0, orden),
      );
      /* La auditoría de la nueva necesita su id, que no se conoce hasta aquí:
         se busca por título, que es único dentro del producto. */
      s.push(
        db
          .prepare(
            `INSERT INTO auditoria (entidad, entidad_id, accion, nota)
             SELECT 'variante', id, 'crear', ?3 FROM variantes
              WHERE producto_id = ?1 AND titulo = ?2`,
          )
          .bind(g.productoId, v.titulo, `Nueva en el producto ${g.productoId}`),
      );
    }
  });
  s.push(db.prepare(ID_EXTERNO_PROPIO).bind(g.productoId));

  /* 5. La opción. El panel maneja UNA ('Color' → Morado, Verde, Rosa), que es
     lo que tienen los 25 productos del respaldo: ninguno combina dos. Sus
     valores son los títulos de las variantes EN SU ORDEN, así que reordenar
     variantes reordena la opción y la tarjeta dice «3 colores» sin más. */
  s.push(db.prepare('DELETE FROM opciones WHERE producto_id = ?1').bind(g.productoId));
  if (g.opcionNombre) {
    s.push(
      db
        .prepare('INSERT INTO opciones (producto_id, nombre, valores, orden) VALUES (?1, ?2, ?3, 0)')
        .bind(g.productoId, g.opcionNombre, JSON.stringify(g.variantes.map((v) => v.titulo))),
    );
  }

  if (g.reordenado) {
    s.push(
      db
        .prepare(
          `INSERT INTO auditoria (entidad, entidad_id, accion, nota)
           VALUES ('producto', ?1, 'reordenar', ?2)`,
        )
        .bind(String(g.productoId), g.variantes.map((v) => v.titulo).join(' · ')),
    );
  }

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
function clasificar(fallo: unknown): 'conflicto' | 'con-historial' | 'nombre-repetido' | 'error' {
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
