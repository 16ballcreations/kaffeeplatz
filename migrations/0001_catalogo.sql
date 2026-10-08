-- Catálogo de KaffeePlatz en D1. Los nombres de campo son los mismos que ya
-- valida el zod de src/content.config.ts, para que una fila se pueda entregar
-- a los componentes .astro existentes sin traducir nada.
--
-- CORRECCIONES RESPECTO AL SQL DE planes/kaffeeplatz-panel-admin.md (B.1)
-- ===========================================================================
-- El plan traía este SQL ya escrito. Se corrigieron cinco cosas, todas
-- comprobadas contra SQLite antes de cambiarlas. Se anotan aquí porque el plan
-- (sección F.5) pide que las decisiones queden escritas donde se van a leer.
--
-- 1. LAS PORTADAS SE DECLARAN EN EL `CREATE TABLE`, NO CON `ALTER TABLE`.
--    El plan añadía `productos.portada_id` y `variantes.portada_id` con dos
--    `ALTER TABLE ADD COLUMN` al final. `ADD COLUMN` no admite `IF NOT
--    EXISTS`: al correr la migración por segunda vez falla con "duplicate
--    column name" y aborta. Todo el resto del fichero usa `IF NOT EXISTS`
--    justamente para poder recargarse, así que esos dos ALTER rompían la
--    idempotencia del conjunto. Comprobado: SQLite NO exige que la tabla
--    referenciada exista al declarar la clave ajena, así que `productos`
--    puede apuntar a `imagenes` antes de crearla. La columna queda idéntica
--    (misma FK, mismo ON DELETE SET NULL) y la migración se puede repetir.
--
-- 2. `imagenes.clave` NO ES `UNIQUE`.
--    El plan la declaraba `TEXT NOT NULL UNIQUE` pensando en claves de R2
--    ('productos/<handle>/<uuid>.jpg'), donde el UUID garantiza unicidad. Pero
--    R2 es la fase 6: HOY la clave es la ruta de public/img que ya está en los
--    JSON, y el mismo fichero puede legítimamente servir a dos productos (o
--    aparecer dos veces en un producto con dos roles distintos). Con UNIQUE,
--    la semilla fallaría el día que se reutilice una foto. Se sustituye por un
--    UNIQUE sobre (producto_id, clave), que es la restricción que de verdad
--    hace falta: la misma foto no se repite DENTRO de un producto.
--
-- 3. `variantes.id_externo` ES `UNIQUE`.
--    El plan solo lo indexaba. Es el id de Shopify y `src/scripts/carrito.ts`
--    lo usa como clave para resolver lo que hay en localStorage: si dos filas
--    compartieran id_externo, un carrito guardado resolvería a la variante
--    equivocada. Un índice único convierte eso en un error de carga en vez de
--    un cobro mal hecho. Admite varios NULL (SQLite trata los NULL como
--    distintos), que es lo que hace falta para variantes creadas desde el
--    panel, que no tienen id de Shopify.
--
-- 4. `articulos.fecha` CON `CHECK` DE FORMATO.
--    El plan la dejaba en `TEXT NOT NULL` con el formato solo en un comentario.
--    La fecha ordena el diario y alimenta `<lastmod>` del sitemap: si entra
--    '2025-4-8' en vez de '2025-04-08', el orden alfabético deja de coincidir
--    con el cronológico y nadie se entera hasta que el diario sale desordenado.
--    El CHECK es el "último filtro en la base" que el propio plan recomienda
--    (A.6, punto 5).
--
-- 5. `imagenes.orden`, `variantes.orden` Y `opciones.orden` CON `CHECK >= 0`.
--    Mismo criterio: un orden negativo no significa nada y colarse es gratis.
--
-- Lo que NO se cambió, aunque llame la atención: `precio` y `disponible` son
-- columnas DERIVADAS de las variantes y se mantienen al guardar, en vez de
-- calcularse al leer con un MIN()/MAX(). Es duplicación deliberada y el plan
-- la justifica: el catálogo filtra y ordena por precio en cada visita, y una
-- columna indexable vale más que una subconsulta por producto.

CREATE TABLE IF NOT EXISTS categorias (
  id           TEXT    PRIMARY KEY,          -- slug estable: 'metodos', 'molinos'...
  nombre       TEXT    NOT NULL,
  orden        INTEGER NOT NULL DEFAULT 99,
  descripcion  TEXT,
  ambito       TEXT    NOT NULL DEFAULT 'producto'
               CHECK (ambito IN ('producto', 'diario'))
);

-- Roles de toma: catálogo editable, NO una enumeración cerrada. Justificación
-- extensa en B.7 del plan; en corto: el cliente ya nombró tres roles sin
-- agotar la lista ("ese tipo de cosas"), y un CHECK IN (...) obligaría a una
-- migración de esquema el día que llegue un molino que necesite "despiece".
-- Pero texto libre produciría 'en uso', 'En uso' y 'usando' en tres productos
-- distintos y rompería el agrupado. Una tabla da las dos cosas: lista cerrada
-- en la interfaz, y abrirla es insertar una fila desde el panel.
--
-- Se crea ANTES de `imagenes` porque esta la referencia. El orden de los
-- CREATE no es obligatorio en SQLite, pero leerlo de arriba abajo sí ayuda.
CREATE TABLE IF NOT EXISTS roles_imagen (
  id      TEXT    PRIMARY KEY,               -- 'desarmado', 'armado', 'en-uso'...
  nombre  TEXT    NOT NULL,                  -- lo que ve la dueña: 'Desarmado'
  orden   INTEGER NOT NULL DEFAULT 99        -- orden sugerido dentro de una variante
);

CREATE TABLE IF NOT EXISTS productos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  handle             TEXT    NOT NULL UNIQUE,     -- la URL: /producto/<handle>
  titulo             TEXT    NOT NULL,
  vendor             TEXT    NOT NULL DEFAULT 'KaffeePlatz',
  descripcion_html   TEXT    NOT NULL DEFAULT '',  -- saneado AL ESCRIBIR, ver B.5
  descripcion_texto  TEXT    NOT NULL DEFAULT '',  -- derivado al guardar; lo usa el SEO
  categoria          TEXT    NOT NULL DEFAULT 'otros' REFERENCES categorias (id),
  coleccion          TEXT,                          -- heredado de Shopify, hoy vacío
  destacado          INTEGER NOT NULL DEFAULT 0 CHECK (destacado IN (0, 1)),
  -- Precio y disponibilidad DERIVADOS de las variantes, mantenidos al guardar:
  -- un producto sin variantes propias lleva una variante única ('Default
  -- Title'), igual que hoy en los JSON.
  precio             INTEGER NOT NULL DEFAULT 0 CHECK (precio >= 0),
  disponible         INTEGER NOT NULL DEFAULT 0 CHECK (disponible IN (0, 1)),
  -- La foto de catálogo. Es una FK y no un flag 'es_portada' en `imagenes`
  -- porque un flag permite CERO portadas o DOS, y entonces cada lectura
  -- necesita decidir qué hacer con un dato imposible. Una FK permite
  -- exactamente una, y el NULL es un estado legítimo ("usa la primera").
  -- Referencia a `imagenes`, que se crea más abajo: SQLite lo admite.
  portada_id         INTEGER REFERENCES imagenes (id) ON DELETE SET NULL,
  archivado_en       TEXT,                          -- NULL = visible. Borrado reversible
  version            INTEGER NOT NULL DEFAULT 1,    -- edición concurrente
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- El catálogo público filtra por esto en cada visita: sin el índice es un
-- escaneo completo por petición, y los row reads se pagan.
CREATE INDEX IF NOT EXISTS productos_vivos  ON productos (archivado_en, categoria);
-- `handle` ya tiene índice implícito por el UNIQUE; no se duplica.

CREATE TABLE IF NOT EXISTS variantes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id   INTEGER NOT NULL REFERENCES productos (id) ON DELETE CASCADE,
  -- El id de Shopify, como texto, para no perder la trazabilidad del respaldo
  -- ni romper los carritos ya guardados en localStorage (sección D del plan).
  -- UNIQUE y no solo indexado: `src/scripts/carrito.ts` resuelve por este
  -- valor, así que un duplicado no sería un dato feo, sería un carrito que
  -- cobra la variante equivocada. Varios NULL sí se admiten (SQLite los trata
  -- como distintos): una variante creada desde el panel no tiene id de Shopify.
  id_externo    TEXT    UNIQUE,
  titulo        TEXT    NOT NULL,                  -- 'Morado', 'Default Title'
  precio        INTEGER NOT NULL CHECK (precio >= 0),
  disponible    INTEGER NOT NULL DEFAULT 1 CHECK (disponible IN (0, 1)),
  sku           TEXT,
  orden         INTEGER NOT NULL DEFAULT 0 CHECK (orden >= 0),
  -- Portada de ESTA variante (el color elegido manda en el catálogo). Misma
  -- razón que la de productos: FK, no flag.
  portada_id    INTEGER REFERENCES imagenes (id) ON DELETE SET NULL,
  UNIQUE (producto_id, titulo)
);
CREATE INDEX IF NOT EXISTS variantes_por_producto ON variantes (producto_id, orden);

-- Las opciones ('Color' → Morado, Verde, Rosa). Se guardan explícitas en vez
-- de derivarlas de las variantes porque el orden de los valores es un dato
-- editable y derivarlo perdería ese orden.
CREATE TABLE IF NOT EXISTS opciones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id  INTEGER NOT NULL REFERENCES productos (id) ON DELETE CASCADE,
  nombre       TEXT    NOT NULL,
  valores      TEXT    NOT NULL,                   -- JSON array, el orden importa
  orden        INTEGER NOT NULL DEFAULT 0 CHECK (orden >= 0),
  UNIQUE (producto_id, nombre)
);
CREATE INDEX IF NOT EXISTS opciones_por_producto ON opciones (producto_id, orden);

CREATE TABLE IF NOT EXISTS imagenes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id  INTEGER NOT NULL REFERENCES productos (id) ON DELETE CASCADE,
  -- La variante a la que pertenece ESTA foto, o NULL si es del producto en
  -- general (la foto de catálogo, un detalle del material, el empaque...).
  -- Es FK a variantes.id, no el título como hoy en el JSON: así renombrar
  -- 'Morado' a 'Violeta' no deja 3 fotos huérfanas. ON DELETE SET NULL y no
  -- CASCADE: si la dueña borra una variante, sus fotos pasan a ser del
  -- producto en vez de desaparecer. Borrar un color no debe borrar el trabajo
  -- de fotografía; que sobren fotos se ve y se arregla, que falten no se ve.
  variante_id  INTEGER REFERENCES variantes (id) ON DELETE SET NULL,
  rol          TEXT    REFERENCES roles_imagen (id),  -- NULL = sin clasificar
  -- HOY: la ruta de public/img que ya está en los JSON
  -- ('/img/productos/chemex/chemex-1.jpg'). En la fase 6 pasa a ser la clave
  -- en R2 ('productos/<handle>/<uuid>.jpg'). El nombre `clave` y no `src`
  -- justamente para que el cambio de significado no obligue a renombrar nada.
  --
  -- NO es UNIQUE a secas (el plan lo pedía): hoy no hay UUID que garantice
  -- unicidad global, y la misma foto puede servir a dos productos o aparecer
  -- dos veces en uno con dos roles. Lo que sí tiene que ser único es la foto
  -- DENTRO de su producto, y eso es el UNIQUE de abajo.
  clave        TEXT    NOT NULL,
  alt          TEXT    NOT NULL,                   -- obligatorio, como hoy en zod
  ancho        INTEGER CHECK (ancho IS NULL OR ancho > 0),   -- para reservar el hueco
  alto         INTEGER CHECK (alto  IS NULL OR alto  > 0),
  -- Orden DENTRO de su grupo (su variante, o el producto si variante_id es
  -- NULL). No un orden global: la dueña reordena las 3 fotos del Morado sin
  -- que eso toque las del Verde.
  orden        INTEGER NOT NULL DEFAULT 0 CHECK (orden >= 0),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (producto_id, clave)
);
-- El índice lleva variante_id porque la consulta de la ficha agrupa por ella.
CREATE INDEX IF NOT EXISTS imagenes_por_producto ON imagenes (producto_id, variante_id, orden);

CREATE TABLE IF NOT EXISTS articulos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  handle       TEXT    NOT NULL UNIQUE,            -- /diario/<handle>
  titulo       TEXT    NOT NULL,
  -- YYYY-MM-DD, y el CHECK lo exige de verdad. Esta fecha ordena el diario y
  -- alimenta el <lastmod> del sitemap: con '2025-4-8' el orden alfabético deja
  -- de coincidir con el cronológico y el diario sale desordenado sin que nada
  -- falle. GLOB y no LIKE porque GLOB distingue dígitos de letras.
  fecha        TEXT    NOT NULL
               CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  autor        TEXT    NOT NULL DEFAULT 'Andreina Morales',
  resumen      TEXT    NOT NULL,
  cuerpo_md    TEXT    NOT NULL,                   -- Markdown, como hoy el .md
  -- Renderizado y saneado AL GUARDAR, no al leer. Es la decisión no obvia del
  -- esquema y es deliberada: convertir Markdown en cada visita es gasto por
  -- petición y obliga a meter un renderizador en el Worker. Renderizar una vez
  -- al guardar mueve el coste al panel y, sobre todo, significa que el HTML
  -- que llega al público YA pasó por el saneador. `cuerpo_md` se guarda
  -- igualmente para poder reeditar.
  cuerpo_html  TEXT    NOT NULL DEFAULT '',
  -- Portada. OPCIONAL a propósito: un artículo del diario no la tiene
  -- ('que-es-el-cafe-de-especialidad-y-por-que-esta-conquistando-al-mundo'),
  -- de ahí que haya 15 ficheros para 16 artículos. El zod de hoy también la
  -- admite ausente y hay que seguir admitiéndolo (B.0, anomalía 2).
  imagen       TEXT,
  categoria    TEXT    NOT NULL DEFAULT 'otros' REFERENCES categorias (id),
  publicado    INTEGER NOT NULL DEFAULT 1 CHECK (publicado IN (0, 1)),
  archivado_en TEXT,
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS articulos_por_fecha ON articulos (publicado, archivado_en, fecha DESC);
