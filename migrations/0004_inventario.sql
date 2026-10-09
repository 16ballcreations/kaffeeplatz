-- INVENTARIO: un solo stock, dos vías de venta (venta por Bold y venta por
-- WhatsApp). Diseño completo y justificaciones en la sección G del plan
-- planes/kaffeeplatz-panel-admin.md.
--
-- SUPERA UNA DECISIÓN ANTERIOR (8 oct 2026). El plan del carrito
-- (kaffeeplatz-carrito-bold.md, decisión 4) recomendaba "confirmación manual
-- de la dueña, sin llevar stock", y este plan lo tenía en "Fuera de alcance".
-- El cliente eligió llevar stock porque hay DOS vías de venta compitiendo por
-- las mismas unidades: sin un contador, vender el último hervidor por WhatsApp
-- y que el sitio lo cobre diez minutos después no es un dato viejo, es un
-- reembolso. Ver G.0 del plan.
--
-- SOBRE LA IDEMPOTENCIA DE ESTE FICHERO
-- ===========================================================================
-- Todo es `IF NOT EXISTS` menos los dos ALTER TABLE del final: `ADD COLUMN` no
-- admite `IF NOT EXISTS` en SQLite y reaplicar el fichero fallaría con
-- "duplicate column name". No se corrige recreando `variantes` (hay FK
-- apuntando a ella desde `imagenes`, y recrear tablas es la operación más
-- peligrosa de SQLite) porque `wrangler d1 migrations apply` lleva su propio
-- registro de migraciones aplicadas y no reaplica un fichero ya corrido. Si
-- alguien ejecuta esto a mano dos veces, fallará en el primer ALTER y no habrá
-- hecho daño: los CREATE son idempotentes y los ALTER son lo último.
--
-- CORRECCIONES RESPECTO AL SQL DEL PLAN (sección G.1)
-- ===========================================================================
-- Mismo criterio que las cabeceras de 0001 y 0003: el plan trae este SQL ya
-- escrito y lo que no se sostuvo al programarlo se corrige aquí, anotado donde
-- se va a leer (F.5).
--
-- 1. EL ORDEN DEL FICHERO SE INVIERTE RESPECTO AL PLAN: LOS `ALTER` VAN AL
--    FINAL, NO AL PRINCIPIO.
--    El plan presenta los dos `ALTER TABLE variantes ADD COLUMN` como bloque 1
--    y los `CREATE TABLE` después, pero su propia cabecera promete que "los
--    ALTER son lo último" para que una segunda ejecución a mano falle SIN
--    haber hecho daño. Con el orden del plan, una segunda ejecución falla en la
--    primera sentencia y los `CREATE ... IF NOT EXISTS` no llegan a correr: el
--    fichero no sería "idempotente en todo menos los ALTER", sería inútil
--    entero. Se respeta la promesa de la cabecera, que es la que importa.
--
-- 2. `ajustes` SE CREA ANTES DE SU `INSERT`, Y ES LA PRIMERA TABLA DEL FICHERO.
--    El plan la presenta en un bloque aparte "para que se vea que es una
--    dependencia nueva" y dice que en el fichero real va antes del INSERT. Va
--    primera del todo: es la tabla que sostiene el interruptor de R13, y el
--    `INSERT OR IGNORE` que lo apaga tiene que correr aunque los ALTER fallen.
--
-- 3. EL `CHECK (stock_reservado >= 0)` SÍ SE PUEDE PONER, Y SE PONE.
--    El plan se contradice en este punto: primero dice "lo que sí tiene CHECK
--    es `stock_reservado`, abajo" y en el mismo comentario se corrige a sí
--    mismo —"se declara como índice parcial en vez de CHECK porque CHECK no se
--    puede añadir a una tabla existente sin recrearla"—, y acaba declarando un
--    índice parcial que, por cierto, tampoco aparece en su SQL. Las dos frases
--    no pueden ser verdad a la vez, así que se comprobó contra SQLite y contra
--    el runtime real de D1 (miniflare) antes de decidir. Resultado:
--      · `ALTER TABLE ... ADD COLUMN ... CHECK (sr >= 0)` se acepta sin
--        recrear la tabla, y
--      · el CHECK SÍ se evalúa en los UPDATE posteriores sobre las filas que
--        ya existían: un `UPDATE variantes SET stock_reservado =
--        stock_reservado - 5` sin guarda falla con "CHECK constraint failed".
--        Comprobado en SQLite 3.46 y con `wrangler d1 execute --local`.
--    O sea: la premisa del plan era falsa y lo que el plan QUERÍA ("un
--    reservado negativo es un bug del código de reservas, y ahí sí se quiere
--    que falle ruidosamente") sí es alcanzable en la base. Se pone el CHECK.
--    Y compone exactamente con el patrón de G.4: el `UPDATE ... WHERE
--    stock_reservado >= ?` sigue dando `changes = 0` (sin excepción) cuando no
--    alcanza, que es el camino previsto; el CHECK solo salta si alguien escribe
--    un UPDATE SIN la guarda, que es precisamente el bug que se quería cazar.
--    El índice parcial que el plan menciona NO se añade: un índice indexa, no
--    restringe, y no habría impuesto nada.
--    El `CHECK` sobre `stock_fisico` sigue ausente a propósito, por la razón
--    del plan, que sí se sostiene (caso límite G.4.4).
--
-- 4. `movimientos.variante_id` NO LLEVA `ON DELETE CASCADE`: LLEVA `RESTRICT`.
--    El plan lo declara CASCADE y, catorce páginas después (caso límite G.4.6),
--    razona lo contrario: "el borrado definitivo se bloquea mientras haya
--    reservas activas o despachos pendientes. Aquí sí se bloquea y no se
--    pregunta: `movimientos.variante_id` tiene ON DELETE CASCADE, así que
--    borrar de verdad SE LLEVARÍA EL LIBRO POR DELANTE". Es decir: el plan
--    identifica el CASCADE como el peligro y encarga al código de la aplicación
--    que lo evite. Pero toda la sección G está construida sobre la idea de que
--    las garantías viven en la base y no en la disciplina de quien programa
--    (es su propia regla: "la única protección que no depende de nadie"), y
--    0003 ya estableció que el historial tiene que sobrevivir a lo que
--    describe. `RESTRICT` hace que borrar una variante con historial falle en
--    la base en vez de borrar el libro en silencio, que es exactamente el
--    resultado que G.4.6 quiere. El aviso del panel sigue siendo necesario
--    (para explicarlo con palabras en vez de con un error), pero deja de ser
--    la ÚNICA cosa entre un `DELETE` y la pérdida del libro.
--    Nota: las variantes hoy no se borran nunca (se archiva el producto), así
--    que esto no cambia ningún comportamiento actual; cambia qué pasa el día
--    que alguien añada un borrado definitivo al panel.
--
-- 5. `reservas.variante_id` Y `despacho_items.variante_id` TAMBIÉN A `RESTRICT`.
--    Por coherencia con 4 y por la misma razón del plan: una reserva o un
--    paquete sin despachar que desaparecen solos al borrar una variante es
--    "perder un pedido pagado", que G.4.6 llama "lo más grave que puede hacer
--    este sistema". El plan ya declaraba `despacho_items.variante_id` sin
--    acción (que en SQLite es NO ACTION, equivalente aquí a RESTRICT); se
--    explicita para que se lea como decisión y no como olvido.
--
-- 6. SE AÑADE `despachos.sin_stock`, QUE EL DISEÑO USA Y EL SQL NO DECLARABA.
--    El caso límite G.4.5 ("reserva caducada mientras el cliente seguía
--    pagando") es explícito: "se crea el despacho igual, MARCADO `sin_stock` y
--    PRIMERO en la lista de despachos, en rojo". Y R14 lo repite: "el despacho
--    nace marcado `sin_stock` y primero en la lista". Pero el `CREATE TABLE
--    despachos` del plan no tiene dónde guardar esa marca: su `estado` solo
--    admite 'pendiente', 'despachado' y 'anulado'. Sin la columna, el caso
--    límite 5 no se puede implementar.
--    Se añade como columna propia y NO como un cuarto valor de `estado`,
--    porque son dos ejes independientes: un despacho sin stock está
--    *pendiente* y además *roto*, y cuando se resuelva pasará a 'despachado'
--    sin dejar de ser cierto que nació sin unidad. Meterlo en `estado` haría
--    que resolverlo borrara la constancia de que pasó.
--
-- 7. SE AÑADE UN CHECK DE FORMATO A `vence_en`, PERO CON `LIKE` Y NO CON
--    `GLOB` — PORQUE D1 RECHAZA EL `GLOB` EQUIVALENTE.
--    Se le añade un CHECK de formato a `vence_en` con el mismo criterio que
--    `articulos.fecha` en 0001 (corrección 4 de su cabecera): la caducidad se
--    decide comparando `vence_en <= datetime('now')`, que es una comparación
--    de TEXTO. Un `vence_en` escrito en ISO con 'T' y 'Z'
--    ('2026-10-08T19:30:00Z') se compara mal contra el 'YYYY-MM-DD HH:MM:SS'
--    que produce `datetime()`, y el fallo no es un error visible: es una
--    reserva que caduca a la hora equivocada o que no caduca nunca.
--    PERO el patrón GLOB con clases de dígitos —el estilo de 0001— NO SIRVE
--    AQUÍ: tiene 14 clases `[0-9]` y D1 aplica un límite de complejidad de
--    patrón más estricto que SQLite de serie, así que TODA inserción de
--    reserva falla con «LIKE or GLOB pattern too complex: SQLITE_ERROR».
--    Esto NO se encontró leyendo: se encontró porque la prueba de la condición
--    de carrera falló con ese error. En sqlite3 local el GLOB pasa sin
--    problema; en `wrangler d1 execute --local` no. Es la clase de diferencia
--    que solo aparece ejecutándolo contra el runtime real, y es la razón de
--    que la validación de esta fase exija ejecutar y no solo compilar.
--    La forma elegida (`length() = 19 AND ... LIKE '____-__-__ __:__:__'`) sí
--    la acepta D1 y rechaza igualmente el caso que importa, comprobado.

-- ---------------------------------------------------------------------------
-- 1. AJUSTES: clave/valor, y el interruptor que hace reversible todo esto
-- ---------------------------------------------------------------------------
-- La menciona la sección D.5 del plan como la forma correcta de que la dueña
-- edite TARIFA_PLANA_ENVIO, y el inventario la necesita para el interruptor de
-- activación, así que se crea aquí. Es el patrón `settings` de 16bc.
--
-- Va PRIMERA (y no en el bloque 5 como en el plan) porque el `INSERT OR
-- IGNORE` que apaga el inventario es la mitigación de R13 y tiene que haber
-- corrido aunque los ALTER del final fallen.
CREATE TABLE IF NOT EXISTS ajustes (
  clave       TEXT PRIMARY KEY,
  valor       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- 2. MOVIMIENTOS: el libro de por qué el stock es el que es
-- ---------------------------------------------------------------------------
-- Toda variación de stock_fisico o stock_reservado escribe aquí. Sin
-- excepciones, ni para los ajustes de la dueña ni para la carga inicial. Sin
-- esto, cuando el stock no cuadre —y va a pasar— no habrá forma de saber por
-- qué. Es la misma idea que `auditoria` (0003) aplicada a cantidades.
--
-- `motivo` SÍ es un CHECK cerrado, al contrario que `roles_imagen` (B.7), que
-- es un catálogo editable. La diferencia es la regla 3 de F: si la dueña puede
-- querer añadir un valor, es una fila; si añadirlo cambia el comportamiento del
-- código, es código. Un motivo nuevo de movimiento cambia cómo se calcula el
-- stock, así que es código.
CREATE TABLE IF NOT EXISTS movimientos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  -- RESTRICT y no CASCADE (corrección 4 de la cabecera): borrar una variante
  -- con historial tiene que FALLAR, no llevarse el libro por delante. Es lo
  -- que G.4.6 quiere conseguir, puesto donde no depende de que nadie se
  -- acuerde.
  variante_id  INTEGER NOT NULL REFERENCES variantes (id) ON DELETE RESTRICT,
  -- Con signo: +3 es una entrada, -1 una venta. Se guarda con signo y no un
  -- "tipo + cantidad positiva" porque así SUM(cantidad) por variante es
  -- directamente el stock esperado, y eso es el cuadre de G.4 en una línea.
  -- NUNCA 0: un movimiento que no mueve nada es un error de quien lo escribe.
  cantidad     INTEGER NOT NULL CHECK (cantidad <> 0),
  -- Sobre QUÉ cantidad actúa. Un mismo motivo puede tocar las dos (un despacho
  -- baja físico Y reservado), y entonces escribe DOS filas: así cada fila dice
  -- una sola cosa y el cuadre de cada columna es independiente.
  afecta       TEXT    NOT NULL CHECK (afecta IN ('fisico', 'reservado')),
  motivo       TEXT    NOT NULL CHECK (motivo IN (
                 'entrada',            -- + físico: llegó mercancía
                 'venta_bold',         -- - físico: pago confirmado por webhook
                 'venta_whatsapp',     -- - físico: la dueña cerró la venta hablando
                 'reserva',            -- + reservado: empezó un checkout
                 'reserva_confirmada', -- la reserva pasa a comprometida (no cambia cantidades)
                 'reserva_caducada',   -- - reservado: venció sin pagar
                 'reserva_liberada',   -- - reservado: cancelación explícita
                 'devolucion',         -- + físico
                 'ajuste',             -- ± físico: conteo, rotura, pérdida. Nota obligatoria
                 'despacho'            -- - físico y - reservado: salió el paquete
               )),
  -- Quién. TEXT y no FK a usuarios porque el panel tiene UNA CLAVE COMPARTIDA y
  -- no tiene identidad (A.2: "el usuario se ignora"). Hoy los valores reales
  -- son 'panel', 'webhook' y 'cron'. Se escribe igualmente: cuesta una columna
  -- y el día que entren dos personas (decisión E.5) el libro ya lo distingue
  -- sin migración.
  quien        TEXT    NOT NULL DEFAULT 'panel',
  -- Qué lo causó, para poder volver atrás desde el movimiento. Sueltos y sin
  -- FK, por la misma razón que `auditoria.entidad_id` (0003, nota 3): el
  -- historial tiene que sobrevivir a lo que describe.
  pedido_id    TEXT,
  reserva_id   INTEGER,
  despacho_id  INTEGER,
  -- Obligatoria para 'ajuste' (lo exige el panel, no la base: un CHECK
  -- condicional aquí daría un error de base de datos en vez de un mensaje
  -- que diga "escribe por qué lo estás ajustando").
  nota         TEXT
);
-- La consulta que de verdad se hace: "¿qué le pasó a ESTA variante?".
CREATE INDEX IF NOT EXISTS movimientos_por_variante
  ON movimientos (variante_id, created_at DESC);
-- Para el cuadre y para el historial general del panel.
CREATE INDEX IF NOT EXISTS movimientos_por_fecha ON movimientos (created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. RESERVAS: lo apartado mientras alguien paga
-- ---------------------------------------------------------------------------
-- Una fila por LÍNEA de un checkout iniciado. 30 minutos de vida (G.2 explica
-- por qué 30 y no 15 ni las 24 h que da Bold).
--
-- No se borran nunca: una reserva caducada es exactamente lo que explica un
-- stock que bajó y volvió a subir, y borrarla deja el libro con un agujero.
CREATE TABLE IF NOT EXISTS reservas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  -- El pedido de Bold al que pertenece. TEXT porque el order-id de Bold es
  -- 'kp-<timestamp>-<aleatorio>' (plan del carrito). Sin FK: `pedidos` la crea
  -- la migración del carrito y el orden de aplicación no debe acoplarlas.
  pedido_id    TEXT    NOT NULL,
  variante_id  INTEGER NOT NULL REFERENCES variantes (id) ON DELETE RESTRICT,
  cantidad     INTEGER NOT NULL CHECK (cantidad > 0),
  -- Cuándo deja de valer. Se guarda la fecha ABSOLUTA y no una duración: así
  -- cambiar los 30 minutos mañana no reinterpreta las reservas de hoy.
  --
  -- El CHECK de formato NO es cosmético (corrección 7 de la cabecera): la
  -- caducidad se decide con `vence_en <= datetime('now')`, que es una
  -- comparación de TEXTO. Un ISO con 'T' y 'Z' se compara mal contra el
  -- 'YYYY-MM-DD HH:MM:SS' de SQLite y la reserva caduca a la hora equivocada o
  -- no caduca nunca. Mismo criterio que `articulos.fecha` en 0001.
  -- `LIKE` con guiones bajos + `length`, y NO el `GLOB` con clases de dígitos
  -- que usa `articulos.fecha` en 0001. Razón medida, no estética: D1 impone un
  -- límite de complejidad de patrón más estricto que SQLite de serie, y el
  -- GLOB equivalente (14 clases `[0-9]`) hace fallar TODA inserción de reserva
  -- con «LIKE or GLOB pattern too complex: SQLITE_ERROR». Comprobado: en
  -- sqlite3 local pasa, en `wrangler d1 execute --local` no. Esta forma sí la
  -- acepta D1 y rechaza igual el error que importa (un ISO con 'T' y 'Z').
  -- Ver corrección 7 de la cabecera.
  vence_en     TEXT    NOT NULL
               CHECK (length(vence_en) = 19 AND vence_en LIKE '____-__-__ __:__:__'),
  estado       TEXT    NOT NULL DEFAULT 'activa'
               CHECK (estado IN ('activa', 'confirmada', 'caducada', 'liberada')),
  cerrada_en   TEXT                              -- cuándo dejó de estar activa
);
-- El barrido del cron: "las activas que ya vencieron". Índice parcial, que es
-- lo que lo hace barato: solo indexa las filas que el barrido mira.
CREATE INDEX IF NOT EXISTS reservas_a_caducar
  ON reservas (vence_en) WHERE estado = 'activa';
-- Para el webhook, que llega con un pedido_id y tiene que cerrar sus reservas.
CREATE INDEX IF NOT EXISTS reservas_por_pedido ON reservas (pedido_id);
-- Para el cuadre: SUM de lo activo de una variante contra stock_reservado, y
-- para el descuento exacto al leer (G.2, "al leer").
CREATE INDEX IF NOT EXISTS reservas_por_variante
  ON reservas (variante_id) WHERE estado = 'activa';

-- ---------------------------------------------------------------------------
-- 4. DESPACHOS: la lista de "productos a despachar"
-- ---------------------------------------------------------------------------
-- UNA fila por paquete que hay que armar y sacar, venga de donde venga. Es la
-- tabla que hace que la lista sea UNA y no dos.
--
-- Por qué una tabla y no solo una vista sobre `pedidos`: porque la venta por
-- WhatsApp NO genera un pedido del sitio, así que no habría nada sobre lo que
-- hacer SELECT. Y por qué no obligar a la venta de WhatsApp a crear un pedido
-- completo: porque eso significaría pedirle cliente, documento, dirección,
-- subtotal y envío a alguien que está contestando mensajes con el móvil en la
-- mano (G.3).
--
-- No duplica el pedido de Bold: no copia líneas ni precios, solo apunta.
CREATE TABLE IF NOT EXISTS despachos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  origen       TEXT    NOT NULL CHECK (origen IN ('bold', 'whatsapp')),
  -- Para 'bold': el pedido. Para 'whatsapp': NULL, y los artículos están en
  -- despacho_items. El CHECK de abajo lo hace cumplir de verdad.
  pedido_id    TEXT,
  -- Lo mínimo para saber a quién es. Para 'bold' se deja NULL y se lee del
  -- pedido (no se copia: una copia se desactualiza). Para 'whatsapp' es lo
  -- único que hay, y es OPCIONAL: la dueña sabe de quién es cada paquete y
  -- exigirle que lo escriba para poder descontar una unidad es el tipo de
  -- requisito que hace que un panel se abandone.
  cliente      TEXT,
  nota         TEXT,
  estado       TEXT    NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente', 'despachado', 'anulado')),
  -- "Pagado y no hay unidad" (caso límite G.4.5 y R14). Columna propia y no un
  -- cuarto `estado`, porque son dos ejes: este despacho está PENDIENTE y
  -- además ROTO, y cuando se resuelva pasará a 'despachado' sin dejar de ser
  -- cierto que nació sin unidad. Ver corrección 6 de la cabecera.
  -- Es lo que ordena la lista: lo roto va primero y en rojo (G.6).
  sin_stock    INTEGER NOT NULL DEFAULT 0 CHECK (sin_stock IN (0, 1)),
  despachado_en TEXT,
  -- Un pedido de Bold tiene exactamente un despacho; una venta de WhatsApp no
  -- tiene pedido. Las dos reglas en una restricción:
  CHECK ((origen = 'bold'     AND pedido_id IS NOT NULL)
      OR (origen = 'whatsapp' AND pedido_id IS NULL))
);
-- La lista del panel: lo pendiente, lo más viejo primero. Índice parcial: solo
-- indexa lo que la pantalla mira.
CREATE INDEX IF NOT EXISTS despachos_pendientes
  ON despachos (created_at) WHERE estado = 'pendiente';
-- Idempotencia del webhook: un pedido de Bold no puede generar dos despachos
-- aunque el evento llegue dos veces. Es la segunda red del webhook, después de
-- `pedidos.estado`, y es la que no depende de que nadie se acuerde.
CREATE UNIQUE INDEX IF NOT EXISTS despachos_un_pedido
  ON despachos (pedido_id) WHERE pedido_id IS NOT NULL;

-- Artículos de un despacho de WhatsApp. Los de Bold salen de `pedido_items`.
CREATE TABLE IF NOT EXISTS despacho_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  despacho_id  INTEGER NOT NULL REFERENCES despachos (id) ON DELETE CASCADE,
  -- RESTRICT explícito (corrección 5): un paquete sin despachar que desaparece
  -- al borrar una variante es "perder un pedido pagado".
  variante_id  INTEGER NOT NULL REFERENCES variantes (id) ON DELETE RESTRICT,
  cantidad     INTEGER NOT NULL CHECK (cantidad > 0),
  -- Copia del título en el momento de la venta, igual que `pedido_items` del
  -- plan del carrito. Para que la lista de hace tres meses siga diciendo lo
  -- que se vendió aunque la dueña haya renombrado la variante desde entonces.
  titulo       TEXT    NOT NULL,
  -- OPCIONAL, y esta es la decisión. En una venta por WhatsApp el precio se
  -- negocia hablando y puede no ser el del catálogo. Exigirlo convertiría
  -- "descontar una unidad" en "registrar una venta", que es justo lo que G.3
  -- dice que no se puede pedir. Si se rellena, la pantalla de ventas del mes
  -- suma; si no, cuenta unidades y no pesos. Media verdad vale más que pedir
  -- un dato que nadie va a escribir con el móvil en la mano.
  precio_unitario INTEGER CHECK (precio_unitario IS NULL OR precio_unitario >= 0)
);
CREATE INDEX IF NOT EXISTS despacho_items_por_despacho ON despacho_items (despacho_id);

-- ---------------------------------------------------------------------------
-- 5. CARGA INICIAL DEL STOCK — EL INTERRUPTOR, APAGADO
-- ---------------------------------------------------------------------------
-- NO se inventa. Las 30 variantes quedan en stock_fisico = 0 y, por tanto, en
-- "Agotado" según la regla de G.1 — lo cual sería APAGAR LA TIENDA el día que
-- esto se aplique (R13). Por eso la fase 9 no termina con la migración:
-- termina con Andreina contando su bodega en la pantalla de inventario, antes
-- de que el cálculo de `vendible` empiece a mirar el stock.
--
-- La secuencia obligatoria está en G.6 ("el día del cambio") y es: aplicar
-- 0004 → cargar el conteo real → y SOLO ENTONCES activar el stock en el
-- cálculo de `vendible`. Mientras el interruptor está apagado, `vendible` es
-- solo `disponible`, exactamente como hoy.
--
-- `OR IGNORE` y no un `INSERT` a secas: si alguien ya lo activó a mano, volver
-- a aplicar esto NO debe apagarle la tienda.
INSERT OR IGNORE INTO ajustes (clave, valor) VALUES ('inventario_activo', '0');

-- Los 30 minutos de la reserva (G.2). En `ajustes` y no en una constante del
-- código porque es un número que se va a querer ajustar viendo cómo se
-- comporta la tienda real, y pedir un despliegue para pasar de 30 a 45 es la
-- clase de cosa que no se hace y se queda mal para siempre.
INSERT OR IGNORE INTO ajustes (clave, valor) VALUES ('reserva_minutos', '30');

-- ---------------------------------------------------------------------------
-- 6. LAS DOS CANTIDADES QUE SE GUARDAN, EN LA VARIANTE  ← LO ÚLTIMO, A PROPÓSITO
-- ---------------------------------------------------------------------------
-- VAN AL FINAL DEL FICHERO Y NO AL PRINCIPIO (corrección 1 de la cabecera):
-- son las dos únicas sentencias no idempotentes, así que una segunda ejecución
-- a mano falla AQUÍ, con todo lo de arriba ya hecho y sin daño.
--
-- El stock vive en la VARIANTE y solo ahí: hay 30 variantes y es lo que se
-- vende. Nadie despacha "un Aeropress Clear"; despacha un morado. Los 21
-- productos de una sola variante no son un caso especial: ya llevan su
-- variante única 'Default Title' desde 0001, así que tienen su contador como
-- los demás y no hay ninguna rama de código distinta para ellos.
--
-- `stock_disponible` NO existe como columna: es `stock_fisico -
-- stock_reservado`, y guardarlo sería un tercer número capaz de contradecir a
-- los otros dos.
--
-- SOBRE LOS `CHECK` QUE NO ESTÁN EN ESTAS DOS COLUMNAS, Y POR QUÉ NO PUEDEN
-- ESTAR (corrección 3 de la cabecera):
--
--   · `stock_fisico` NO lleva `CHECK (>= 0)` A PROPÓSITO. El stock negativo es
--     un estado al que se llega por error humano y que hay que poder
--     REPRESENTAR para poder avisar de él y corregirlo (G.4.4): un CHECK
--     convertiría "la dueña se equivocó contando" en "el guardado falla con un
--     error de base de datos" y el panel no podría explicar nada. NO LO
--     AÑADAS: el negativo nunca llega al cliente, porque `vendible` exige
--     `> 0` y −1 no es > 0, así que el producto sale "Agotado" en el sitio y el
--     error se ve solo en el panel. Ese reparto es el correcto.
--
--   · `stock_reservado` SÍ LLEVA `CHECK (>= 0)`, y es la asimetría deliberada
--     del modelo. Un reservado negativo no es un error de conteo humano: es un
--     BUG del código de reservas (se liberó dos veces lo mismo), y ahí sí se
--     quiere que falle ruidosamente. Comprobado que el CHECK de un `ADD
--     COLUMN` se evalúa en los UPDATE de las filas preexistentes, tanto en
--     SQLite como en el D1 local; ver corrección 3 de la cabecera, porque el
--     plan creía que no se podía.
--     Esto NO sustituye la guarda del WHERE, la refuerza: todo UPDATE que baja
--     reservado lleva `AND stock_reservado >= ?` (ver
--     src/datos/consultas/inventario.ts), lo que da `changes = 0` y ninguna
--     excepción cuando simplemente no alcanza. El CHECK solo salta si alguien
--     escribe un UPDATE sin esa guarda — o sea, exactamente el bug que hay que
--     cazar, y lo caza en la base en vez de dejarlo pasar en silencio.
--
-- Caché transaccional de SUM(reservas activas). `stock_reservado` se duplica a
-- propósito —igual que `productos.precio` en 0001— porque el catálogo público
-- pregunta por la disponibilidad en CADA visita y una resta de dos enteros de
-- la fila que ya se está leyendo no cuesta nada, mientras que un SUM() agregado
-- por cada una de las 30 variantes en cada pintado de /catalogo sí (R4, row
-- reads). NUNCA se escribe fuera del batch() que crea o cierra la reserva que
-- lo causa.

ALTER TABLE variantes ADD COLUMN stock_fisico INTEGER NOT NULL DEFAULT 0;
ALTER TABLE variantes ADD COLUMN stock_reservado INTEGER NOT NULL DEFAULT 0
  CHECK (stock_reservado >= 0);
