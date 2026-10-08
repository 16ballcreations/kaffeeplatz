-- Sesiones del panel. Reemplazan Basic Auth: ver B.5 del plan.
--
-- Esta migración se aplica YA, en la fase 2, aunque el panel sea la fase 4.
-- Razón: las migraciones son numeradas e incrementales y se aplican en orden
-- (A.6, punto 6). Crear las tablas vacías ahora no cuesta nada y evita que la
-- fase 4 tenga que intercalar una migración entre dos ya aplicadas.
--
-- CORRECCIÓN RESPECTO AL SQL DEL PLAN
-- ===========================================================================
-- `intentos` no tenía forma de limpiarse. Es una tabla que CRECE CON CADA
-- INTENTO DE ENTRADA, incluidos los de un atacante probando claves: es
-- exactamente la tabla que un ataque de fuerza bruta puede hacer crecer sin
-- límite, y D1 cobra por filas escritas (R4). Se añade el índice por
-- `created_at` a secas para que el barrido periódico
-- (DELETE FROM intentos WHERE created_at < datetime('now','-1 day'))
-- pueda usarlo en vez de escanear la tabla entera. El índice del plan,
-- (ip, created_at DESC), sirve para CONTAR los intentos de una IP, que es la
-- otra consulta; hacen falta los dos y por eso están los dos.

CREATE TABLE IF NOT EXISTS sesiones (
  id          TEXT    PRIMARY KEY,                 -- 256 bits aleatorios, hex
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL,
  ultima_ip   TEXT,
  ultima_ua   TEXT
);
CREATE INDEX IF NOT EXISTS sesiones_por_caducidad ON sesiones (expires_at);

-- Intentos de entrada, para limitar la fuerza bruta.
CREATE TABLE IF NOT EXISTS intentos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip          TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  ok          INTEGER NOT NULL DEFAULT 0 CHECK (ok IN (0, 1))
);
-- Para contar los fallos recientes de UNA ip (el límite de B.5).
CREATE INDEX IF NOT EXISTS intentos_por_ip ON intentos (ip, created_at DESC);
-- Para el barrido de los viejos sin escanear la tabla entera.
CREATE INDEX IF NOT EXISTS intentos_por_fecha ON intentos (created_at);
