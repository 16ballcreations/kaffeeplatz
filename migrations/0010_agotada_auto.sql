-- 0010: lo que se agota sale solo de la venta, y vuelve solo si salió así.
--
-- QUÉ PIDIÓ EL CLIENTE (2 nov 2026)
-- ===========================================================================
-- «Cuando un producto tiene cantidad de inventario 0, debería pasar a "no a la
-- venta" (el check que tiene la tarjeta del producto).»
--
-- Con el inventario ENCENDIDO, cada movimiento que deja `stock_fisico <= 0`
-- desmarca «A la venta» de esa versión (`variantes.disponible = 0`). Y al
-- revés: si después una carga la deja en > 0, vuelve sola a la venta... PERO
-- SOLO SI SE HABÍA RETIRADO SOLA. Si la retiró Andreina a mano («este color ya
-- no lo traigo»), cargar unidades no puede volver a ponerla a la venta: sería
-- desobedecerla en silencio.
--
-- POR QUÉ HACE FALTA UNA COLUMNA
-- ---------------------------------------------------------------------------
-- `disponible = 0` solo dice «no está a la venta», no POR QUÉ. Sin una marca,
-- una carga no puede distinguir «se agotó» de «la retiró ella», que es justo
-- la diferencia que importa. `agotada_auto = 1` significa «la quitó el
-- inventario al agotarse»; la ponen y la quitan las sentencias de
-- `consultas/inventario-agotado.ts`, y marcar o desmarcar la casilla a mano
-- la deja en 0 (`guardarVariante`).
--
-- Una columna y no mirar la auditoría: la decisión se toma DENTRO del mismo
-- `batch()` del movimiento, con la condición en el WHERE (G.4.1), y eso exige
-- que el dato esté en la fila.
--
-- POR QUÉ ESTO NO SUBE `variantes.version` (el cerrojo de la tarjeta, 0009)
-- ---------------------------------------------------------------------------
-- Ver la cabecera de `consultas/inventario-agotado.ts`. En corto: subirlo
-- haría que «Vendí 1» le diera un 409 a la tarjeta abierta con un precio a
-- medio escribir. En su lugar, la tarjeta solo escribe «A la venta» si ella
-- tocó la casilla (`venta_antes`), así que guardar no revive con un valor
-- viejo lo que el inventario acaba de retirar.
--
-- LA PUESTA AL DÍA DE LO QUE YA ESTÁ EN 0
-- ---------------------------------------------------------------------------
-- Si el inventario ya está encendido cuando se aplica esto, las versiones que
-- hoy están a la venta con el físico en 0 o menos se retiran YA (con su fila
-- de auditoría), para que el modelo sea cierto desde el primer día y no desde
-- su próximo movimiento. En la tienda no cambia nada visible: con el
-- inventario encendido ya salían «Agotado» (`sqlVendible` exige stock > 0).
-- Con el inventario apagado no se toca nada.
--
-- Mismo criterio que 0009: `ADD COLUMN` no admite `IF NOT EXISTS`, y el runner
-- no reaplica un fichero. Sin abrir ni cerrar transacciones a mano (ver 0008).

ALTER TABLE variantes ADD COLUMN agotada_auto INTEGER NOT NULL DEFAULT 0
  CHECK (agotada_auto IN (0, 1));

INSERT INTO auditoria (entidad, entidad_id, accion, antes, nota)
  SELECT 'variante', CAST(id AS TEXT), 'despublicar',
         json_object('disponible', disponible, 'agotada_auto', agotada_auto, 'stock_fisico', stock_fisico),
         'Se retiró de la venta: se agotó'
    FROM variantes
   WHERE disponible = 1 AND stock_fisico <= 0
     AND EXISTS (SELECT 1 FROM ajustes WHERE clave = 'inventario_activo' AND valor = '1');

UPDATE variantes SET disponible = 0, agotada_auto = 1
 WHERE disponible = 1 AND stock_fisico <= 0
   AND EXISTS (SELECT 1 FROM ajustes WHERE clave = 'inventario_activo' AND valor = '1');

-- El precio «desde» y la disponibilidad del producto, como `SQL_DERIVADOS`.
UPDATE productos SET
    disponible = EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = productos.id AND v.disponible = 1),
    precio = COALESCE(
      (SELECT MIN(v.precio) FROM variantes v WHERE v.producto_id = productos.id AND v.disponible = 1),
      (SELECT MIN(v.precio) FROM variantes v WHERE v.producto_id = productos.id), 0)
 WHERE id IN (SELECT producto_id FROM variantes WHERE agotada_auto = 1);
