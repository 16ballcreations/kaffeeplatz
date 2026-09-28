/**
 * GUIAS — el puente entre el catalogo y el diario. Propuesta D "Obsidiana II".
 * ===========================================================================
 * Dos piezas de captacion que NO inventan contenido:
 *
 * 1. METODOS: el buscador "¿Cómo te gusta el café?" de la portada.
 *    Cada descripcion sale literalmente del articulo del diario que la
 *    respalda (campo `guia`). Si un articulo cambia de tono, esto se revisa.
 *
 *      V60        "notas brillantes, aroma limpio y sabores bien definidos"
 *      Prensa     "una bebida con cuerpo, aceites naturales y sabores profundos"
 *      Aeropress  "Sencilla, portátil y versátil" / "En menos de 2 minutos"
 *      Chemex     "una taza más limpia, libre de aceites y sedimentos"
 *                 + la variante real de 6 tazas
 *
 * 2. GUIA_DE_PRODUCTO: que articulo enlaza cada ficha como "Cómo prepararlo".
 *    Productos sin articulo propio apuntan a la guia de molienda o a la de
 *    accesorios, que son las que les aplican de verdad.
 * ===========================================================================
 */

export interface Metodo {
  id: string;
  /** Lo que la persona elige: como le gusta el cafe, no el nombre del aparato. */
  gusto: string;
  /** El metodo que se le recomienda. */
  nombre: string;
  descripcion: string;
  /** Productos del catalogo (handles), el primero es el protagonista. */
  productos: string[];
  /** Handle del articulo del diario que respalda la recomendacion. */
  guia: string;
  /** Mensaje precargado para WhatsApp. */
  mensaje: string;
}

export const METODOS: Metodo[] = [
  {
    id: 'limpio',
    gusto: 'Limpio y brillante',
    nombre: 'V60',
    descripcion:
      'Para quien busca notas brillantes, aroma limpio y sabores bien definidos. Tú controlas el vertido.',
    productos: ['set-hario-v60', 'v60-de-vidrio', 'filtros-v60'],
    guia: 'v60-el-metodo-para-lograr-una-taza-limpia-delicada-y-perfecta-en-casa',
    mensaje: 'Hola KaffeePlatz, me gusta el café limpio y brillante. ¿Qué V60 me recomiendan para empezar?',
  },
  {
    id: 'cuerpo',
    gusto: 'Con cuerpo e intenso',
    nombre: 'Prensa francesa',
    descripcion:
      'Una bebida con cuerpo, aceites naturales y sabores profundos. Funcionamiento simple, sin papel.',
    productos: ['prensa-francesa-acero-inoxidable', 'prensa-francesa'],
    guia: 'prensa-francesa-cafe-con-cuerpo-sabor-intenso-y-preparacion-sin-complicaciones',
    mensaje: 'Hola KaffeePlatz, me gusta el café con cuerpo e intenso. ¿Qué prensa francesa me recomiendan?',
  },
  {
    id: 'rapido',
    gusto: 'Rápido y versátil',
    nombre: 'Aeropress',
    descripcion:
      'Sencilla, portátil y versátil. En menos de dos minutos tienes la taza lista, en casa o de viaje.',
    productos: ['aeropress-clear', 'aeropress', 'micro-filters-aeroprees'],
    guia: 'aeropress-el-metodo-perfecto-para-preparar-cafe-de-especialidad-en-casa',
    mensaje: 'Hola KaffeePlatz, quiero un método rápido y versátil. ¿Me ayudan a elegir entre las Aeropress?',
  },
  {
    id: 'compartir',
    gusto: 'Para compartir',
    nombre: 'Chemex',
    descripcion:
      'Filtros más gruesos, taza más limpia y libre de sedimentos. En versión de 6 tazas para servir a varios.',
    productos: ['chemex', 'filtros-chemex', 'filtro-de-acero-chemex-3-tazas'],
    guia: 'el-metodo-de-preparacion-que-conquisto-al-mundo-del-cafe',
    mensaje: 'Hola KaffeePlatz, quiero preparar café para varias personas. ¿Qué Chemex me recomiendan?',
  },
];

const MOLIENDA = 'guia-practica-que-tipo-de-molienda-usar-para-cada-metodo-de-cafe';
const ACCESORIOS = 'los-mejores-accesorios-para-mejorar-tu-experiencia-de-cafe-en-casa';
const V60 = 'v60-el-metodo-para-lograr-una-taza-limpia-delicada-y-perfecta-en-casa';
const AEROPRESS = 'aeropress-el-metodo-perfecto-para-preparar-cafe-de-especialidad-en-casa';
const CHEMEX = 'el-metodo-de-preparacion-que-conquisto-al-mundo-del-cafe';
const PRENSA = 'prensa-francesa-cafe-con-cuerpo-sabor-intenso-y-preparacion-sin-complicaciones';

/** Handle de producto -> handle del articulo "Cómo prepararlo". */
export const GUIA_DE_PRODUCTO: Record<string, string> = {
  'aeropress-clear': AEROPRESS,
  aeropress: AEROPRESS,
  'filtro-acero-para-aeropress': AEROPRESS,
  'micro-filters-aeroprees': AEROPRESS,
  chemex: CHEMEX,
  'filtros-chemex': CHEMEX,
  'filtro-de-acero-chemex-3-tazas': CHEMEX,
  'set-hario-v60': V60,
  'v60-de-vidrio': V60,
  'dripper-de-vidrio': V60,
  'dripper-flor-de-loto': V60,
  'hario-v60-mugen': V60,
  'hario-switch': V60,
  'filtros-v60': V60,
  'filtro-de-acero-v60': V60,
  'prensa-francesa': PRENSA,
  'prensa-francesa-acero-inoxidable': PRENSA,
  'molino-manual-timemore-c3-esp-pro': MOLIENDA,
  'grameras-digital': ACCESORIOS,
  termometro: ACCESORIOS,
  'hervidor-brewista': ACCESORIOS,
  'hervidor-mango-de-madera': ACCESORIOS,
  server: ACCESORIOS,
  'servex-hario': ACCESORIOS,
};

/**
 * Tiempos de envio. Fuente: contenido-original/datos/politicas/shipping-policy.md
 * (los mismos que ya publica /contacto).
 */
export const ENVIOS = [
  { zona: 'Ciudades principales', plazo: '2 a 5 días hábiles' },
  { zona: 'Otras ciudades y municipios', plazo: '5 a 8 días hábiles' },
  { zona: 'Pedidos por encargo', plazo: '8 a 15 días hábiles' },
] as const;

/** "3 colores", "2 tamaños"... a partir de las opciones reales del producto. */
export function resumenOpciones(opciones: { nombre: string; valores: string[] }[]): string | null {
  const o = opciones.find((x) => x.valores.length > 1);
  if (!o) return null;
  const nombre = o.nombre.toLowerCase();
  const plural: Record<string, string> = {
    color: 'colores',
    'tamaño': 'tamaños',
    capacidad: 'capacidades',
  };
  return `${o.valores.length} ${plural[nombre] ?? 'opciones'}`;
}
