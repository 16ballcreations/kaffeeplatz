-- 0008: la auditoría aprende a hablar del inventario.
--
-- QUÉ FALTABA
-- ===========================================================================
-- La pantalla de inventario (fase 9) tiene dos acciones que NO son un
-- movimiento de stock y que aun así hay que poder explicar dentro de un mes:
--
--   1. El interruptor `inventario_activo` de `ajustes`. Es la acción más
--      peligrosa del panel —encenderlo con la bodega sin contar deja la tienda
--      entera en "Agotado" (R13)— y la que más se va a preguntar: "¿quién lo
--      apagó, y cuándo?". `ajustes.updated_at` dice cuándo cambió por última
--      vez, pero no qué había antes ni las veces anteriores.
--   2. "Ya salió" en la lista de despachos. No mueve stock (bajó al cobrar o
--      al vender por WhatsApp), así que `movimientos` no lo ve. Y "¿cuándo
--      salió el paquete de Marcela?" es la pregunta que llega por WhatsApp.
--
-- El CHECK de `auditoria.entidad` en 0003 es una lista cerrada SIN 'ajuste' ni
-- 'despacho', así que esos INSERT fallarían. Y un CHECK no se puede cambiar en
-- SQLite sin recrear la tabla.
--
-- POR QUÉ SE RECREA `auditoria` Y NO SE CREA UNA TABLA NUEVA
-- ---------------------------------------------------------------------------
-- Una tabla aparte ("auditoria_inventario") dejaría DOS sitios donde mirar qué
-- pasó en el panel, y el día que alguien busque en uno solo, no lo encontrará.
-- Recrear es seguro AQUÍ, y es la excepción a la regla de 0004 ("recrear es la
-- operación más peligrosa de SQLite"), por dos razones que se comprobaron:
--   - NADIE APUNTA A `auditoria`: no tiene FK entrantes (ni salientes: la nota
--     3 de 0003 explica que es la única tabla sin integridad referencial a
--     propósito). Recrearla no puede romper ninguna referencia.
--   - Se copian TODAS las filas con su `id`, así que el AUTOINCREMENT sigue
--     donde estaba y ningún id se reutiliza.
--
-- SIN ABRIR NI CERRAR TRANSACCIONES A MANO, A PROPÓSITO: D1 remoto lo rechaza,
-- y `wrangler d1 migrations apply` ya envuelve cada fichero en la suya. (Ni
-- siquiera se escriben aquí las dos palabras en inglés: wrangler las busca en
-- el texto del fichero, comentarios incluidos, y se niega a aplicarlo.)
--
-- REAPLICARLO A MANO NO HACE DAÑO: `auditoria_nueva` ya no existe después del
-- RENAME, así que una segunda pasada vuelve a crearla, copia las mismas filas
-- y deja exactamente la misma tabla. (El runner, de todas formas, lleva su
-- registro y no reaplica un fichero ya corrido.)
--
-- Lo que se AÑADE a las listas, y nada más:
--   entidad: 'ajuste'   (el interruptor y, el día que exista, la tarifa de envío)
--            'despacho' (la lista de "productos a despachar")
--   accion:  'activar', 'desactivar'  (el interruptor)
--            'despachar', 'reabrir'   ("Ya salió" y su deshacer)
--            'anular'                 (un paquete que no va a salir)

CREATE TABLE auditoria_nueva (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  entidad     TEXT    NOT NULL
              CHECK (entidad IN ('producto', 'variante', 'imagen', 'articulo', 'categoria', 'rol',
                                 'ajuste', 'despacho')),
  -- TEXT, no INTEGER: ver 0003. Un ajuste se identifica por su clave
  -- ('inventario_activo'), que es texto, y eso confirma la decisión de 0003.
  entidad_id  TEXT    NOT NULL,
  accion      TEXT    NOT NULL
              CHECK (accion IN ('crear', 'editar', 'archivar', 'restaurar',
                                'borrar', 'reordenar', 'publicar', 'despublicar',
                                'activar', 'desactivar', 'despachar', 'reabrir', 'anular')),
  antes       TEXT,                                -- JSON del estado anterior
  nota        TEXT
);

INSERT INTO auditoria_nueva (id, created_at, entidad, entidad_id, accion, antes, nota)
  SELECT id, created_at, entidad, entidad_id, accion, antes, nota FROM auditoria;

DROP TABLE auditoria;
ALTER TABLE auditoria_nueva RENAME TO auditoria;

-- Los dos índices de 0003, con el mismo nombre: DROP TABLE se los llevó.
CREATE INDEX IF NOT EXISTS auditoria_por_fecha ON auditoria (created_at DESC);
CREATE INDEX IF NOT EXISTS auditoria_por_entidad ON auditoria (entidad, entidad_id, created_at DESC);
