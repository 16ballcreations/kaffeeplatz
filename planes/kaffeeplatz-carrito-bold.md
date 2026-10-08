# Plan: carrito y pago con Bold para KaffeePlatz

Preparado desde 16 Ball Creations el 8 oct 2026. Es para que otro agente lo ejecute en el repositorio de KaffeePlatz. Este documento es el encargo: léelo completo antes de tocar código.

## Contexto

- **Repositorio:** `16ballcreations/kaffeeplatz`, local en `/home/xan217/Documents/Dev/KaffeePlatz`.
- **Sitio:** Astro 5 estático (`output: 'static'`) con Tailwind 4, publicado en Cloudflare Pages desde `main` (ver `CLOUDFLARE.md`). El diseño vigente es **Obsidiana II**, en la raíz del repo.
- **Hoy no hay carrito ni checkout.** Toda compra se cierra por WhatsApp con la dueña, con el mensaje precargado según el producto y la variante (`src/components/BotonWhatsApp.astro`, número en `src/datos/sitio.ts`).
- **Catálogo:** 25 productos en `src/content/productos/*.json`, generados por `scripts/normalizar.mjs` desde `contenido-original/`, el respaldo del Shopify. Cada producto tiene `precio`, `disponible` y `variantes[]` con `id`, `titulo`, `precio` y `disponible`. **No se editan a mano:** cualquier cambio va por `normalizar.mjs`.
- **El Shopify actual sigue en producción en `kaffeeplatz.co`.** No se apunta el dominio a este sitio hasta que se apruebe.

## Objetivo

Que un cliente pueda armar un carrito, poner sus datos de envío y pagar con Bold (PSE, Nequi, tarjetas) sin salir del sitio, y que la dueña reciba el pedido confirmado. **WhatsApp se mantiene** como alternativa en cada paso: la tienda vende por contacto directo y eso no se quita.

## Decisiones que hay que tomar antes de programar

Pregúntaselas al usuario. No las inventes.

1. **Cuenta Bold.** La abre la dueña de KaffeePlatz a su nombre (cédula o NIT y cuenta bancaria). Se necesitan sus llaves de integración: llave de identidad y llave secreta, primero las de **pruebas** y después las de producción.
2. **Envíos.** Costo por ciudad o zona, si hay envío gratis desde cierto monto y los tiempos de entrega. Revisa primero la política de envíos que ya existe en `contenido-original/` y en el sitio, y propón la regla a partir de ella.
3. **Infraestructura.** Recomendación: pasar de Pages a un **Worker con assets estáticos**, igual que el sitio de 16bc (`16ballcreations/16ballcreations.github.io`: `wrangler.jsonc`, `worker/index.js`, D1 y `npm run deploy`). Así hay un solo patrón para los dos proyectos y se reutiliza el panel `/admin`. La alternativa es mantener Pages y agregar Pages Functions con D1. Cualquiera de las dos sirve; lo que el usuario elija define la fase 0.
4. **Inventario. DECIDIDO el 8 oct 2026: se lleva stock.** Esta pregunta ya no
   está abierta. La recomendación original —confirmar a mano, sin stock— valía
   bajo su supuesto: una sola vía de venta. Lo que cambió es que hay **dos**
   compitiendo por las mismas unidades: Bold y WhatsApp. Vender el último
   hervidor hablando y que el sitio lo cobre diez minutos después no es un dato
   viejo, es dinero recibido por algo que no existe.
   El diseño vive en `kaffeeplatz-panel-admin.md`, sección G (fase 9). Lo que
   toca a este plan: `POST /api/pedidos` reserva, el webhook confirma y libera,
   y "marcar como enviado" pasa a la lista de despachos.
   Regla hermana de la de precios, igual de innegociable: **la disponibilidad
   tampoco se toma del navegador.**
5. **Facturación electrónica (DIAN).** Bold cobra, pero no factura. Pregunta cómo factura hoy la dueña; esto queda fuera del alcance salvo que lo pidan.

## Arquitectura

```
Navegador                         Worker (o Pages Functions)            Bold
─────────                         ──────────────────────────            ────
Carrito en localStorage
/checkout (datos + envío) ──POST /api/pedidos──▶ recalcula precios
                                  desde el catálogo, crea el pedido
                                  en D1 "pendiente", genera order-id
                                  y la firma SHA256
                          ◀── config del botón ──
Botón Bold (embedded) ────────────────────────────────────────────────▶ pasarela
                                                                        │
/pedido/resultado?bold-order-id&bold-tx-status ◀──────── redirección ───┤
   └─ GET /api/pedidos/:id (estado desde D1)                            │
                                  POST /api/bold/webhook ◀──────────────┘
                                  verifica, actualiza el pedido (idempotente),
                                  avisa a la dueña y al cliente
```

### Reglas de seguridad (no negociables)

- **El precio nunca se toma del navegador.** El servidor recalcula cada línea a partir del catálogo (los mismos JSON, empaquetados en el Worker) usando `handle`, `variante.id` y la cantidad.
- **La llave secreta solo vive como secreto del Worker** (`wrangler secret put BOLD_SECRET_KEY`), nunca en el repo, en el HTML ni en `.dev.vars` versionado.
- **La firma de integridad se genera en el servidor:** SHA256 de `{orderId}{monto}{COP}{llaveSecreta}`.
- **Un pedido solo pasa a "pagado" por el webhook.** El parámetro `bold-tx-status` de la redirección es informativo, no definitivo.
- **El webhook es idempotente** (Bold puede reenviar eventos) y verifica la autenticidad del evento según la documentación de webhooks de Bold. Léela antes de implementarlo.

### Datos (D1)

- `pedidos`: id (order-id `kp-<timestamp>-<aleatorio>`, máximo 60 caracteres, solo alfanuméricos, `-` y `_`), creado_en, estado (`pendiente` / `pagado` / `rechazado` / `expirado` / `enviado` / `cancelado`), subtotal, envio, total, datos del cliente (nombre, tipo y número de documento, email, celular), dirección (dirección, ciudad, departamento, notas), bold_tx_id, metodo_pago, pagado_en, enviado_en.
- `pedido_items`: pedido_id, handle, variante_id, titulo (copia), variante_titulo (copia), precio_unitario (copia), cantidad.
- `eventos_pago`: registro crudo de cada webhook recibido, con fecha, para auditar.

## Fases y estimado

| Fase | Qué incluye | Horas |
|---|---|---|
| 0 · Base | Worker + assets (o Pages Functions), D1 con migraciones, secretos, entorno de pruebas | 3–4 |
| 1 · Carrito | Estado en localStorage, «Agregar al carrito» en la ficha con la variante elegida, contador en la cabecera, página `/carrito` (cantidades, quitar, subtotal) y botón «Pedir por WhatsApp» con el carrito completo en el mensaje | 5–7 |
| 2 · Checkout | `/checkout` con formulario y validación, cálculo de envío, `POST /api/pedidos`, botón Bold en modo `embedded` con `data-customer-data` precargado | 6–8 |
| 3 · Confirmación | Webhook, `/pedido/resultado`, `GET /api/pedidos/:id`, manejo de rechazado y abandonado (Bold da 24 horas para pagar) | 4–6 |
| 4 · Avisos y panel | Correo a la dueña y al cliente al confirmarse el pago, `/admin/pedidos` protegido para ver pedidos y marcarlos como enviados, enlace a WhatsApp del cliente | 5–7 |
| 5 · Pruebas y lanzamiento | Modo de pruebas de Bold, páginas legales, revisión en celular, cambio a llaves de producción | 3–4 |
| **Total** | | **26–36** |

## Diseño

- Respeta Obsidiana II y `marca/MARCA.md`: papel negro, oro, Cormorant en títulos, Geist en interfaz y precios en cifras tabulares. El **botón de oro relleno** es la acción principal de cada vista: en la ficha pasa a ser «Agregar al carrito» y WhatsApp queda como acción secundaria.
- Revisa el contraste con `npm run contraste` después de cada cambio visual.
- Los precios se muestran con el formato que ya existe (`$315.000`) y el componente `Precio.astro`.
- Los productos agotados (`disponible: false`) no se pueden agregar; mantienen «Avísame».

## Pruebas obligatorias antes de dar por terminado

1. Pago aprobado en modo de pruebas: el pedido pasa a `pagado` solo cuando llega el webhook, y llegan los dos correos.
2. Pago rechazado y pago abandonado: el pedido no queda como pagado y el cliente puede reintentar.
3. Webhook duplicado: no duplica avisos ni cambia el estado dos veces.
4. Precio manipulado desde el navegador: el servidor lo ignora y cobra el del catálogo.
5. Variante agotada: no se puede agregar ni pagar.
6. Flujo completo en celular (375 px) y en escritorio.
7. Con el carrito vacío, `/checkout` no se puede usar.

## Páginas legales (Colombia)

Al recoger datos personales y vender en línea hacen falta:
- política de tratamiento de datos (Ley 1581 de 2012);
- términos de compra con el derecho de retracto, cambios y devoluciones (Estatuto del Consumidor, Ley 1480 de 2011);
- política de envíos.

Prepara borradores a partir de lo que ya tenga KaffeePlatz y márcalos para revisión de la dueña. No se presentan como revisados legalmente.

## Fuera de alcance

- Sincronización con el Shopify. (El **inventario** salió de esta lista el 8
  oct 2026: ver la decisión 4.)
- Facturación electrónica.
- Cuentas de cliente e historial de compras.
- Cupones y descuentos.
- Cambiar el dominio `kaffeeplatz.co`.

## Referencias

- Botón de pagos, integración manual: https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-manual
- Llaves de integración: https://developers.bold.co/pagos-en-linea/llaves-de-integracion
- Webhooks: https://www.developers.bold.co/webhook
- Patrón de Worker + D1 + panel: el sitio de 16bc, en `/home/xan217/Documents/Dev/16bc/16ballcreations-site` (`worker/index.js`, `wrangler.jsonc`, `migrations/`).
