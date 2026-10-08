-- Qué se cambió y cuándo. En una tienda real, poder responder "¿qué le pasó al
-- precio de la Chemex el martes?" vale más que su coste en filas.
--
-- CORRECCIONES RESPECTO AL SQL DEL PLAN
-- ===========================================================================
-- 1. FALTABA 'imagen' EN LA LISTA DE ACCIONES ÚTILES, Y SOBRE TODO FALTABA
--    'despublicar'. El CHECK del plan era
--    accion IN ('crear','editar','archivar','restaurar','borrar','reordenar').
--    Pero el esquema 0001 tiene `articulos.publicado`, y el plan pide
--    explícitamente borradores (E.6): pasar un artículo a borrador NO es
--    archivarlo (archivar es el borrado reversible, con `archivado_en`) ni
--    editarlo. Sin un valor propio, el día que la dueña despublique un
--    artículo el INSERT de auditoría falla por el CHECK y —según cómo esté
--    escrito el handler— se pierde el registro o se cae el guardado. Es el
--    tipo de error que solo aparece meses después. Se añaden 'publicar' y
--    'despublicar'.
--
-- 2. `entidad_id` SE DOCUMENTA COMO TEXTO A PROPÓSITO.
--    El plan lo declaraba TEXT sin decir por qué, lo que invita a "corregirlo"
--    a INTEGER. Es TEXT porque las entidades no comparten tipo de clave:
--    productos, variantes, imágenes y artículos tienen id INTEGER, pero
--    categorias y roles_imagen tienen id TEXT ('metodos', 'armado'). Una sola
--    columna para todas obliga a TEXT.
--
-- 3. NO HAY FK A LAS ENTIDADES, Y ES DELIBERADO.
--    Una FK con ON DELETE CASCADE borraría el registro de auditoría justo
--    cuando más hace falta (al borrar la cosa). Y con RESTRICT impediría
--    borrarla nunca. El historial tiene que sobrevivir a lo que describe, así
--    que `entidad_id` es un id suelto, sin integridad referencial. Es la única
--    tabla del esquema donde eso es lo correcto.

CREATE TABLE IF NOT EXISTS auditoria (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  entidad     TEXT    NOT NULL
              CHECK (entidad IN ('producto', 'variante', 'imagen', 'articulo', 'categoria', 'rol')),
  -- TEXT, no INTEGER: categorias y roles_imagen tienen id de texto
  -- ('metodos', 'armado'), el resto INTEGER. Una columna para todas → TEXT.
  -- Sin FK a propósito: ver la nota 3 de la cabecera.
  entidad_id  TEXT    NOT NULL,
  accion      TEXT    NOT NULL
              CHECK (accion IN ('crear', 'editar', 'archivar', 'restaurar',
                                'borrar', 'reordenar', 'publicar', 'despublicar')),
  antes       TEXT,                                -- JSON del estado anterior
  nota        TEXT
);
CREATE INDEX IF NOT EXISTS auditoria_por_fecha ON auditoria (created_at DESC);
-- Para la pregunta que de verdad se hace: "¿qué le pasó a ESTE producto?".
CREATE INDEX IF NOT EXISTS auditoria_por_entidad ON auditoria (entidad, entidad_id, created_at DESC);
