-- 0011: productos que se pueden pedir por encargo.
--
-- QUÉ PIDIÓ EL CLIENTE (2 nov 2026)
-- ===========================================================================
-- «Necesitamos agregar una opción a los productos que sea que se pueden pedir
-- por encargo con tiempo de entrega de 15 días. Agrega una opción para eso en
-- la tarjeta de edición del producto.»
--
-- QUÉ SIGNIFICA «POR ENCARGO» (y qué no)
-- ---------------------------------------------------------------------------
-- Es el RESPALDO de cuando no hay unidades, no un estado aparte. Con el
-- inventario encendido, una versión de un producto por encargo que se queda
-- sin unidades vendibles (incluida la que el inventario retiró sola al
-- agotarse, `variantes.agotada_auto = 1`, ver 0010) NO sale «Agotado»: se
-- puede pedir, y la tienda dice «Por encargo · entrega en N días». Si Andreina
-- la retiró A MANO («A la venta» desmarcada con `agotada_auto = 0`), sigue sin
-- venderse: su decisión manda sobre el encargo. Con el inventario apagado no
-- hay noción de «sin unidades» y esto no cambia nada. La fórmula vive en un
-- solo sitio: `consultas/productos.ts` (`sqlEncargable` y `aVariante`).
--
-- POR QUÉ EN EL PRODUCTO Y NO EN CADA VERSIÓN
-- ---------------------------------------------------------------------------
-- La petición habla del producto («una opción a los productos»), y lo que se
-- encarga es el producto al proveedor; el color sale de lo que se pida. Un
-- interruptor por versión duplicaría la casilla en cada tarjeta para el caso
-- que no se ha pedido. Si un día hiciera falta, es otra columna aditiva.
--
-- LOS DÍAS, CON 15 POR DEFECTO Y UN TECHO DE 120
-- ---------------------------------------------------------------------------
-- 15 es lo que pidió el cliente; se guarda por producto porque un proveedor
-- puede tardar más que otro. El CHECK es la misma regla que valida el panel
-- (`forma.ts`, `leerDiasEncargo`): de 1 a 120 días (cuatro meses; más que eso
-- no es un encargo, es otra conversación). El panel devuelve el error con lo
-- escrito; el CHECK es solo la red.
--
-- SOLO ALTER ADITIVOS: producción ya tiene datos y esto NO toca ninguna fila.
-- Todo producto existente queda con `por_encargo = 0` (como hoy) y 15 días
-- guardados para cuando lo active. No sube `productos.version`: no hay nada
-- que una pestaña abierta pueda pisar.
--
-- Mismo criterio que 0009/0010: `ADD COLUMN` no admite `IF NOT EXISTS`, y el
-- runner no reaplica un fichero. Sin abrir ni cerrar transacciones a mano
-- (ver 0008).

ALTER TABLE productos ADD COLUMN por_encargo INTEGER NOT NULL DEFAULT 0
  CHECK (por_encargo IN (0, 1));

ALTER TABLE productos ADD COLUMN dias_encargo INTEGER NOT NULL DEFAULT 15
  CHECK (dias_encargo BETWEEN 1 AND 120);
