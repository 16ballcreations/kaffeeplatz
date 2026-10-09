-- Fase 6: fotos por variante y por rol, cargadas desde el panel (B.7 del plan).
--
-- El esquema de 0001 ya traía casi todo lo que hace falta: `imagenes` con
-- `variante_id`, `rol`, `orden`, `ancho` y `alto`, el catálogo `roles_imagen` y
-- las dos portadas. Esta migración añade SOLO las dos columnas que la
-- convención de nombres aprobada por el cliente (8 oct 2026) necesita para
-- cumplir su promesa: «el panel PROPONE, la dueña confirma».
--
-- 1. `nombre_original`: el nombre del fichero tal como lo subió la dueña
--    ('aeropress-clear-morado-armado.jpg'). La clave en R2 es un UUID (B.4: así
--    «foto.jpg» subida dos veces no se pisa), de modo que sin esta columna el
--    nombre se pierde al subir y la sugerencia de variante+rol solo viviría en
--    la pestaña del navegador: se iría con una recarga o con el wifi. Guardado,
--    la sugerencia se recalcula siempre que se pinta la foto, con los títulos
--    de variante y los roles de ESE momento. Además le sirve a ella para
--    reconocer cuál es cuál («la que llamé -2»). NULL en las 30 fotos de la
--    semilla, que no se subieron por el panel.
--
-- 2. `por_revisar`: 1 mientras la dueña no haya confirmado variante y rol.
--    Es lo que hace que la sugerencia sea una sugerencia y no una decisión:
--    una foto recién subida entra SIN variante ni rol (es «del producto») y el
--    panel la enseña aparte con la propuesta marcada, hasta que ella la guarde.
--    Un nombre mal escrito no puede publicar una foto en el color equivocado.
--    DEFAULT 0 para que las 30 fotos de la semilla queden como están: ya
--    tienen su vínculo revisado (se migró del JSON, ver 0001).
--
-- SOBRE LA IDEMPOTENCIA: mismo criterio que 0004. `ADD COLUMN` no admite
-- `IF NOT EXISTS` en SQLite; `wrangler d1 migrations apply` lleva su registro y
-- no reaplica el fichero. Si alguien lo corre a mano dos veces, falla en el
-- primer ALTER sin haber hecho nada.
--
-- No hace falta índice nuevo: el panel lee las fotos de UN producto, y eso ya
-- lo cubre `imagenes_por_producto (producto_id, variante_id, orden)`.

ALTER TABLE imagenes ADD COLUMN nombre_original TEXT;
ALTER TABLE imagenes ADD COLUMN por_revisar INTEGER NOT NULL DEFAULT 0
  CHECK (por_revisar IN (0, 1));
