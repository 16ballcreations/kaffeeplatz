/**
 * consultas/variantes-escribir.ts — lo que escriben las tarjetas de versión y
 * el bloque «Versiones» de la ficha del panel.
 *
 * DOS GUARDADOS, DOS CERROJOS
 * ===========================================================================
 * La ficha del producto se guarda por bloques (migrations/0009):
 *
 *   guardarVariante   UNA tarjeta («Verde»): nombre, precio, a la venta y sus
 *                     fotos. Cerrojo: `variantes.version` de ESA variante.
 *   guardarVariantes  el bloque «Versiones»: añadir, quitar, reordenar y el
 *                     nombre de lo que cambia entre ellas («Color»). Cerrojo:
 *                     `productos.version_variantes`.
 *
 * Cada uno es UN `batch()` con el mismo truco que `productos-escribir.ts`: la
 * fila de auditoría justo detrás del UPDATE del cerrojo, con
 * `CASE WHEN changes() = 1 ... ELSE 'conflicto'`, que el CHECK de la
 * auditoría rechaza y deshace el batch entero. Ver allí la explicación larga.
 *
 * Lo que NO se pisan entre sí, a propósito:
 *   - «Versiones» no escribe nombre, precio ni «a la venta» de una versión que
 *     ya existe (eso es de su tarjeta). Solo su `orden`, y el nombre de la
 *     única fila que no tiene ninguno todavía (la «Default Title» de un
 *     producto que pasa a tener colores), subiendo entonces su `version`.
 *   - Una tarjeta no escribe `orden`. Reordenar en otra pestaña no le da
 *     conflicto a quien está cambiando el precio de «Verde».
 *   - Quitar una versión sí hace que su tarjeta abierta en otra pestaña avise:
 *     su UPDATE ya no encuentra la fila, `changes()` da 0 y no se guarda nada.
 *
 * Y en los dos se recalcula al final el precio «desde» y la disponibilidad
 * del producto (`SQL_DERIVADOS`), sin subir `productos.version`.
 */

import type { BaseD1Escritura, SentenciaPreparada } from './inventario-formas';
import {
  CERROJO,
  ID_EXTERNO_PROPIO,
  SQL_DERIVADOS,
  SQL_VALORES_OPCION,
  ejecutar,
  type ResultadoGuardar,
} from './productos-escribir';

export interface GuardadoVariante {
  productoId: number;
  varianteId: number;
  versionEsperada: number;
  titulo: string;
  precio: number;
  disponible: boolean;
  /** Sentencias de sus fotos (ver `sentenciasAsignaciones`), detrás del cerrojo. */
  fotos: unknown[];
  antes: unknown;
  nota: string;
}

/** Guarda la tarjeta de UNA versión. Todo o nada. */
export async function guardarVariante(db: BaseD1Escritura, g: GuardadoVariante): Promise<ResultadoGuardar> {
  const s: SentenciaPreparada[] = [
    db
      .prepare(
        `UPDATE variantes SET titulo = ?4, precio = ?5, disponible = ?6, version = version + 1
          WHERE id = ?1 AND producto_id = ?2 AND version = ?3`,
      )
      .bind(g.varianteId, g.productoId, g.versionEsperada, g.titulo, g.precio, g.disponible ? 1 : 0),
    /* EL CERROJO: inmediatamente detrás, `changes()` habla del UPDATE. */
    db.prepare(CERROJO).bind(String(g.productoId), JSON.stringify(g.antes), g.nota || null),
    ...(g.fotos as SentenciaPreparada[]),
    /* Renombrar «Morado» cambia un valor de la opción «Color». */
    db.prepare(SQL_VALORES_OPCION).bind(g.productoId),
    db.prepare(SQL_DERIVADOS).bind(g.productoId),
  ];
  return ejecutar(db, s);
}

/** Una fila del resultado final de «Versiones», en su orden. */
export type FilaFinal =
  | { tipo: 'existe'; id: number }
  | { tipo: 'nueva'; titulo: string; precio: number; disponible: boolean };

export interface GuardadoVariantes {
  productoId: number;
  /** `productos.version_variantes` con la que se pintó el bloque. */
  versionEsperada: number;
  /** En el orden final: el índice ES el `orden`. */
  filas: FilaFinal[];
  /** Variantes a borrar. El panel ya comprobó que no tienen historial. */
  quitar: { id: number; antes: unknown }[];
  /** Filas sin nombre («Default Title») que reciben uno. */
  nombrar: { id: number; titulo: string }[];
  /** 'Color', 'Tamaño'… o `null` para no tener opción. */
  opcionNombre: string | null;
  antes: unknown;
  nota: string;
}

/** Guarda el bloque «Versiones». Todo o nada. */
export async function guardarVariantes(db: BaseD1Escritura, g: GuardadoVariantes): Promise<ResultadoGuardar> {
  const s: SentenciaPreparada[] = [
    db
      .prepare(
        `UPDATE productos SET version_variantes = version_variantes + 1, updated_at = datetime('now')
          WHERE id = ?1 AND version_variantes = ?2`,
      )
      .bind(g.productoId, g.versionEsperada),
    db.prepare(CERROJO).bind(String(g.productoId), JSON.stringify(g.antes), g.nota || null),
  ];

  /* 1. Borrar, primero, para que sus títulos queden libres por si una nueva
     quiere llamarse igual. Sus fotos pasan al producto (ON DELETE SET NULL de
     0001): quitar un color no borra el trabajo de fotografía. Si tuviera
     movimientos, reservas o paquetes, el RESTRICT de 0004 hace fallar el
     batch entero —el panel lo comprueba antes para explicarlo; esto es la
     red—. */
  for (const q of g.quitar) {
    s.push(
      db.prepare('DELETE FROM variantes WHERE id = ?1 AND producto_id = ?2').bind(q.id, g.productoId),
      db
        .prepare(`INSERT INTO auditoria (entidad, entidad_id, accion, antes) VALUES ('variante', ?1, 'borrar', ?2)`)
        .bind(String(q.id), JSON.stringify(q.antes)),
    );
  }

  /* 2. La fila sin nombre que lo recibe. Solo si SIGUE sin nombre: si su
     tarjeta la bautizó en otra pestaña entretanto, gana la tarjeta. Sube su
     `version` para que esa tarjeta, abierta con el nombre vacío, avise. */
  for (const n of g.nombrar) {
    s.push(
      db
        .prepare(
          `UPDATE variantes SET titulo = ?3, version = version + 1
            WHERE id = ?1 AND producto_id = ?2 AND titulo = 'Default Title'`,
        )
        .bind(n.id, g.productoId, n.titulo),
    );
  }

  /* 3. El orden de las que quedan y 4. las nuevas, en su sitio. */
  g.filas.forEach((f, orden) => {
    if (f.tipo === 'existe') {
      s.push(
        db.prepare('UPDATE variantes SET orden = ?3 WHERE id = ?1 AND producto_id = ?2').bind(f.id, g.productoId, orden),
      );
      return;
    }
    s.push(
      db
        .prepare(
          `INSERT INTO variantes (producto_id, titulo, precio, disponible, orden)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .bind(g.productoId, f.titulo, f.precio, f.disponible ? 1 : 0, orden),
      /* Su id no se conoce hasta aquí: se busca por título, único dentro del
         producto. */
      db
        .prepare(
          `INSERT INTO auditoria (entidad, entidad_id, accion, nota)
           SELECT 'variante', id, 'crear', ?3 FROM variantes WHERE producto_id = ?1 AND titulo = ?2`,
        )
        .bind(g.productoId, f.titulo, `Nueva en el producto ${g.productoId}`),
    );
  });
  s.push(db.prepare(ID_EXTERNO_PROPIO).bind(g.productoId));

  /* 5. La opción. El panel maneja UNA ('Color' → Morado, Verde, Rosa), que es
     lo que tienen los 25 productos del respaldo. Sus valores se leen de la
     base ya reordenada, no del formulario. */
  s.push(db.prepare('DELETE FROM opciones WHERE producto_id = ?1').bind(g.productoId));
  if (g.opcionNombre) {
    s.push(
      db
        .prepare(`INSERT INTO opciones (producto_id, nombre, valores, orden) VALUES (?1, ?2, '[]', 0)`)
        .bind(g.productoId, g.opcionNombre),
      db.prepare(SQL_VALORES_OPCION).bind(g.productoId),
    );
  }
  s.push(db.prepare(SQL_DERIVADOS).bind(g.productoId));
  return ejecutar(db, s);
}
