/**
 * contraste.mjs — verifica el ratio WCAG 2.1 de todos los pares texto/fondo
 * de "Obsidiana II" (propuesta D).
 *
 * Los fondos translucidos (cabecera, barra de filtros) se componen contra lo
 * que tienen detras antes de medir: el ojo ve el color compuesto.
 * Para el crema con lino se mide contra el crema oscurecido por el tejido al
 * 30% en multiply, usando el extremo oscuro del tile (medido, no supuesto).
 *
 * Uso: node scripts/contraste.mjs   (sale con codigo 1 si algun par falla)
 */

const hex = (h) => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};

const sobre = (rgb, a, fondo) => {
  const f = hex(fondo);
  return '#' + [0, 1, 2].map((i) => Math.round(rgb[i] * a + f[i] * (1 - a)).toString(16).padStart(2, '0')).join('');
};

/** multiply de `capa` sobre `base` con opacidad `a`. */
const multiply = (base, capa, a) => {
  const b = hex(base);
  const c = hex(capa);
  return '#' + [0, 1, 2].map((i) => {
    const m = (b[i] * c[i]) / 255;
    return Math.round(m * a + b[i] * (1 - a)).toString(16).padStart(2, '0');
  }).join('');
};

const canal = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const lum = (h) => {
  const [r, g, b] = hex(h);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// --- Fondos -----------------------------------------------------------------
const ABISMO = '#0f0e0d';
const CANVAS = '#151413';
const SUPERFICIE = '#1c1b19';
const ELEVADO = '#24221f';
const ELEVADO_2 = '#2c2926';
const CREMA = '#fdf7e7';
// Tile claro medido con sharp: media #c5a793, extremo oscuro (media-2sd) #ab8e7b.
const CREMA_LINO = multiply(CREMA, '#ab8e7b', 0.3); // peor caso del tejido al 30%
const ORO = '#dec185';
// Sobre la franja crema la cabecera siempre esta en estado compacto (hay
// scroll): abismo al 90%. Arriba del todo (72%) solo tiene detras el hero oscuro.
const CABECERA = sobre(hex('#0f0e0d'), 0.9, '#fdf7e7');
const FILTROS = sobre(hex('#151413'), 0.94, '#fdf7e7');

// --- Tintas -----------------------------------------------------------------
const TINTA = '#fdf7e7';
const TINTA_2 = '#b9b1a2';
const TINTA_3 = '#9a9384';
const TINTA_OSCURA = '#1a1a1a';
const TINTA_OSCURA_2 = '#5c4c3e';
const ORO_LEGIBLE = '#8f6724';

const oscuros = { ABISMO, CANVAS, SUPERFICIE, ELEVADO, ELEVADO_2 };
const pares = [];
for (const [n, f] of Object.entries(oscuros)) {
  pares.push([`tinta / ${n}`, TINTA, f, 4.5]);
  pares.push([`tinta-2 / ${n}`, TINTA_2, f, 4.5]);
  pares.push([`tinta-3 / ${n}`, TINTA_3, f, 4.5]);
  pares.push([`oro (texto) / ${n}`, ORO, f, 4.5]);
}
pares.push(
  ['tinta-oscura / oro (boton relleno)', TINTA_OSCURA, ORO, 4.5],
  ['crema / tinta-oscura (boton sobre crema)', TINTA, TINTA_OSCURA, 4.5],
  ['tinta-oscura / crema', TINTA_OSCURA, CREMA, 4.5],
  ['tinta-oscura-2 / crema', TINTA_OSCURA_2, CREMA, 4.5],
  ['oro-legible / crema', ORO_LEGIBLE, CREMA, 4.5],
  ['tinta-oscura / crema+lino', TINTA_OSCURA, CREMA_LINO, 4.5],
  ['tinta-oscura-2 / crema+lino', TINTA_OSCURA_2, CREMA_LINO, 4.5],
  ['oro-legible / crema+lino (titulos >=24px)', ORO_LEGIBLE, CREMA_LINO, 3],
  ['crema / tinta-oscura (cinta Agotado)', CREMA, TINTA_OSCURA, 4.5],
  ['tinta-2 / cabecera compacta sobre crema', TINTA_2, CABECERA, 4.5],
  ['tinta-2 / barra de filtros (peor caso)', TINTA_2, FILTROS, 4.5],
);

// --- CARRITO (fase 1 del plan de Bold) --------------------------------------
// El carrito no introduce ningun color nuevo, pero si fondos COMPUESTOS
// nuevos: velos de oro al 10% y de crema al 8% sobre los cuatro negros. Se
// miden igual que los translucidos de la cabecera, porque el ojo ve el color
// compuesto, no el token.
const oroVelo = (f) => sobre(hex(ORO), 0.1, f);
const cremaVelo = (f) => sobre(hex(TINTA), 0.08, f);

pares.push(
  // Pildora "Agregado al carrito" de la ficha y "te faltan X para el envio
  // gratis" del resumen: texto oro sobre su propio velo de oro.
  ['oro / velo de oro sobre canvas (confirmacion al agregar)', ORO, oroVelo(CANVAS), 4.5],
  ['oro / velo de oro sobre superficie', ORO, oroVelo(SUPERFICIE), 4.5],
  ['oro / velo de oro sobre elevado (falta para envio gratis)', ORO, oroVelo(ELEVADO), 4.5],
  // Boton "Agregar al carrito" cuando la variante elegida esta agotada.
  ['tinta-3 / velo de crema sobre canvas (agregar desactivado)', TINTA_3, cremaVelo(CANVAS), 4.5],
  // Resumen del carrito, que vive en una superficie elevada.
  ['tinta-2 / elevado (etiquetas del resumen)', TINTA_2, ELEVADO, 4.5],
  ['tinta-3 / elevado (nota del pago de la fase 2)', TINTA_3, ELEVADO, 4.5],
  // "Quitar" y el precio unitario de cada linea.
  ['tinta-3 / superficie (quitar linea, precio unitario)', TINTA_3, SUPERFICIE, 4.5],
  // "Máximo 10 por pedido" bajo la cantidad de una linea: el motivo de que el
  // `+` este apagado. Va en tinta-2 sobre la superficie de la linea, no en
  // tinta-3: explica un limite y hay que poder leerlo.
  ['tinta-2 / superficie (motivo del tope bajo la cantidad)', TINTA_2, SUPERFICIE, 4.5],
  // Aviso de recorte al cargar un carrito guardado que se pasaba del tope
  // (los hay con 69 unidades). Hereda el fondo de .v-aviso, que es la
  // superficie, con el texto principal en tinta-2 y la coletilla de ayuda en
  // el mismo tono: es una aclaracion, no una alerta, asi que no usa rojo.
  ['tinta-2 / superficie (aviso de recorte del carrito)', TINTA_2, SUPERFICIE, 4.5],
  // Burbuja del contador de la cabecera: tinta oscura sobre oro relleno.
  ['tinta-oscura / oro (burbuja del contador)', TINTA_OSCURA, ORO, 4.5],
);

// --- ACCIONES DE LA TARJETA DEL CATALOGO ------------------------------------
// La fila de acciones de la tarjeta pasa de UNA accion (WhatsApp de contorno,
// a ancho completo) a DOS: compra en oro relleno + WhatsApp de contorno.
// Tampoco introduce colores nuevos, pero SI estados nuevos que hay que medir
// contra el fondo REAL de la tarjeta, que es `--v-superficie` (#1c1b19) y no
// el canvas de la pagina: la tarjeta es una superficie elevada.
const ORO_HOVER = '#e9d3a3';

pares.push(
  // "Agregar" / "Elegir color": oro relleno. Es el primario de la marca y el
  // texto va en tinta oscura, igual que cualquier .v-boton--oro.
  ['tinta-oscura / oro (agregar/elegir en la tarjeta)', TINTA_OSCURA, ORO, 4.5],
  ['tinta-oscura / oro-hover (agregar/elegir, raton encima)', TINTA_OSCURA, ORO_HOVER, 4.5],
  // "Preguntar": contorno sobre la superficie de la tarjeta. El fondo del
  // boton es un velo de crema al 3%, casi nada, pero se compone igual.
  ['tinta / velo de crema 3% sobre superficie (preguntar)', TINTA, sobre(hex(TINTA), 0.03, SUPERFICIE), 4.5],
  // Al pasar el raton, "Preguntar" cambia texto y borde a oro.
  ['oro / velo de crema 3% sobre superficie (preguntar, raton encima)', ORO, sobre(hex(TINTA), 0.03, SUPERFICIE), 4.5],
  // "Avísame" de un agotado: contorno discontinuo, texto en tinta-2.
  ['tinta-2 / superficie (avísame en la tarjeta)', TINTA_2, SUPERFICIE, 4.5],
  // Confirmacion "X agregado al carrito" al pie de la tarjeta: oro sobre su
  // velo de oro, sobre la superficie de la tarjeta.
  ['oro / velo de oro sobre superficie (confirmacion en la tarjeta)', ORO, oroVelo(SUPERFICIE), 4.5],
  // "Máximo 10": el boton de compra cuando el carrito ya tiene el tope de esa
  // variante. Pierde el oro relleno y pasa a contorno con texto en tinta-2
  // sobre la superficie de la tarjeta. Es tinta-2 y NO tinta-3 a proposito: un
  // texto que explica un limite tiene que poder leerse, y el boton sigue
  // siendo activable (no se desactiva, para no sacarlo del tabulador).
  ['tinta-2 / superficie (máximo alcanzado en la tarjeta)', TINTA_2, SUPERFICIE, 4.5],
);

// --- SELECTOR DE CANTIDAD (ficha de producto) -------------------------------
// Tampoco trae colores nuevos, pero si un fondo compuesto nuevo: el control
// es una pildora con un velo de crema al 3% sobre el CANVAS de la pagina (la
// ficha no es una tarjeta: el bloque de compra va sobre el fondo de pagina),
// que es un caso distinto al mismo velo sobre la superficie de la tarjeta.
const CANTIDAD_FONDO = sobre(hex(TINTA), 0.03, CANVAS);

pares.push(
  // El numero y los dos signos (−/+) en reposo.
  ['tinta / velo de crema 3% sobre canvas (numero y pasos de cantidad)', TINTA, CANTIDAD_FONDO, 4.5],
  // Al pasar el raton, el signo se pone en oro.
  ['oro / velo de crema 3% sobre canvas (paso de cantidad, raton encima)', ORO, CANTIDAD_FONDO, 4.5],
  // Un paso en el extremo (no se puede bajar de 1, ni subir del tope). Es un
  // control DESACTIVADO, asi que WCAG no le exige ratio; se mide igual porque
  // sigue siendo informacion que hay que poder leer.
  ['tinta-3 / velo de crema 3% sobre canvas (paso de cantidad en el extremo)', TINTA_3, CANTIDAD_FONDO, 4.5],
  // La etiqueta "Cantidad" y el aviso "Máximo N por pedido", los dos en
  // tinta-2 sobre el canvas de la pagina.
  ['tinta-2 / canvas (etiqueta Cantidad y aviso del tope)', TINTA_2, CANVAS, 4.5],
);

// --- ACCESO FLOTANTE AL CARRITO ---------------------------------------------
// El boton sube de tamaño y gana un anillo de oro que pulsa. El anillo es
// decorativo (no lleva texto) pero debe distinguirse de lo que tiene detras,
// que en el peor caso es el canvas de la pagina. Se mide como componente de
// interfaz: el minimo de WCAG 1.4.11 para eso es 3:1, no 4.5.
pares.push(
  ['oro (anillo del pulso) / canvas (peor caso detras del boton)', ORO, CANVAS, 3],
  // La cifra de unidades dentro del boton, que va sobre la superficie elevada.
  ['oro / elevado (cuenta de unidades del flotante)', ORO, ELEVADO, 4.5],
);

// --- PANEL DE ADMINISTRACION (fase 4) ---------------------------------------
// El panel reutiliza los tokens del sitio, asi que casi todos sus pares ya
// estan medidos arriba. Introduce UN color propio: el rojo de aviso de los
// errores del formulario de entrada y de las tarjetas cuya consulta fallo.
// Se mide contra los DOS fondos reales sobre los que aparece.
const P_AVISO = '#ff9b8a';

pares.push(
  // El mensaje de error de /admin/entrar vive en una caja sobre --v-superficie.
  ['panel: aviso / superficie (error al entrar)', P_AVISO, SUPERFICIE, 4.5],
  // La misma caja sobre el canvas, por si el error se pinta fuera de tarjeta.
  ['panel: aviso / canvas', P_AVISO, CANVAS, 4.5],
  // La cifra "—" de una tarjeta cuya consulta no respondio.
  ['panel: aviso / elevado (cifra no disponible)', P_AVISO, ELEVADO, 4.5],
  // Texto y cifras del panel sobre las superficies que usa: la barra superior
  // y el menu van sobre --v-abismo, las tarjetas sobre --v-superficie y el
  // resumen sobre --v-elevado. Son pares ya cubiertos arriba, pero se repiten
  // nombrados por el panel para que al tocar sus colores se vea que fallan.
  ['panel: tinta-2 / abismo (menu en reposo)', TINTA_2, ABISMO, 4.5],
  ['panel: oro / abismo (seccion activa del menu)', ORO, ABISMO, 4.5],
  ['panel: tinta-3 / abismo (seccion no disponible)', TINTA_3, ABISMO, 4.5],
  ['panel: oro / superficie (cifra de una tarjeta)', ORO, SUPERFICIE, 4.5],
  ['panel: tinta-2 / superficie (detalle de una tarjeta)', TINTA_2, SUPERFICIE, 4.5],
  ['panel: tinta-3 / superficie (cifra en cero)', TINTA_3, SUPERFICIE, 4.5],
  ['panel: tinta-2 / elevado (etiqueta del resumen)', TINTA_2, ELEVADO, 4.5],
  ['panel: tinta / superficie (campo de la clave)', TINTA, SUPERFICIE, 4.5],
);

let fallos = 0;
console.log(`crema+lino compuesto: ${CREMA_LINO}\n`);
for (const [nombre, t, f, min] of pares) {
  const r = ratio(t, f);
  const ok = r >= min;
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${r.toFixed(2).padStart(6)}:1  (min ${min})  ${nombre}`);
}
console.log(`\n${pares.length - fallos}/${pares.length} pares pasan AA.`);
process.exit(fallos ? 1 : 0);
