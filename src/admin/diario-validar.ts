/**
 * diario-validar.ts — leer y validar el formulario de un artículo.
 *
 * SIN BASE Y SIN ASTRO, A PROPOSITO
 * ===========================================================================
 * Todo lo que aquí se decide (qué falta, qué sobra, cómo se deriva la
 * dirección) son reglas puras sobre texto. Así se prueban con
 * `node scripts/probar-diario.mjs` sin levantar nada, y la página solo junta
 * piezas. Lo que SÍ necesita la base (¿esa dirección ya la usa otro
 * artículo?) lo resuelve la página con `handleOcupado`, después de esto.
 *
 * DEVOLVER EL ERROR, NO TRUNCAR NI ADIVINAR
 * ---------------------------------------------------------------------------
 * Es el hallazgo 4 de A.6 y la mitigación de R7. Un título de 300 caracteres
 * no se corta en silencio a 160: se devuelve con un mensaje que dice qué
 * hacer, y lo que la dueña escribió vuelve al formulario intacto
 * (`leerFormulario` conserva el texto tal cual llegó). Los mensajes hablan
 * su idioma: «la dirección», nunca «el handle» ni «el slug».
 */

export interface ValoresArticulo {
  titulo: string;
  /** La dirección: /diario/<handle>. Vacía = derivarla del título. */
  handle: string;
  /** YYYY-MM-DD. */
  fecha: string;
  autor: string;
  resumen: string;
  cuerpoMd: string;
  /** Ruta de la portada ('/img/diario/...') o '' para ninguna. */
  imagen: string;
  /** Tema del diario SIN prefijo ('metodos'). */
  categoria: string;
  publicado: boolean;
  /** La `version` que se leyó al abrir el formulario. 0 en uno nuevo. */
  version: number;
}

export type CampoArticulo = Exclude<keyof ValoresArticulo, 'version'>;
export type Errores = Partial<Record<CampoArticulo | 'general', string>>;

export const AUTOR_POR_DEFECTO = 'Andreina Morales';

/* Topes: holgados respecto a lo que ya existe (el título más largo tiene 93
   caracteres, el resumen 377, la dirección 91, el cuerpo 3.581). Están para
   atrapar un pegado accidental, no para recortar a nadie. */
export const TOPES = {
  titulo: 160,
  handle: 120,
  autor: 80,
  resumen: 600,
  cuerpoMd: 60_000,
} as const;

/** La dirección: minúsculas, números y guiones, sin guion al principio ni al final. */
export const FORMA_HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Título → dirección. «¿Qué molienda usar?» → «que-molienda-usar».
 *
 * NFD + quitar las marcas combinantes resuelve tildes y ñ (ñ = n + virgulilla)
 * de una vez, que es la regla de la convención de nombres aprobada por el
 * cliente: «sin tildes ni ñ, separado por guiones».
 */
export function aHandle(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TOPES.handle)
    .replace(/-+$/, '');
}

/** Hoy en Colombia (UTC−5, sin horario de verano), como YYYY-MM-DD. */
export function hoyEnColombia(ahora: number = Date.now()): string {
  return new Date(ahora - 5 * 3600_000).toISOString().slice(0, 10);
}

/** Un `FormData` (o cualquier cosa con `get`) → valores, SIN validar. */
export function leerFormulario(forma: { get(nombre: string): unknown }): ValoresArticulo {
  const texto = (n: string) => {
    const v = forma.get(n);
    return typeof v === 'string' ? v : '';
  };
  return {
    /* `trim` solo en los campos de una línea: en el cuerpo, los espacios y
       saltos son de ella. Se normalizan los finales de línea de Windows, que
       el navegador manda en un textarea. */
    titulo: texto('titulo').trim(),
    handle: texto('handle').trim().toLowerCase(),
    fecha: texto('fecha').trim(),
    autor: texto('autor').trim(),
    resumen: texto('resumen').replace(/\r\n?/g, '\n').trim(),
    cuerpoMd: texto('cuerpo').replace(/\r\n?/g, '\n'),
    imagen: texto('imagen').trim(),
    categoria: texto('categoria').trim(),
    publicado: texto('estado') === 'publicado',
    version: Number.parseInt(texto('version'), 10) || 0,
  };
}

/** ¿Es una fecha real? '2025-02-30' tiene la forma y no existe. */
function fechaValida(f: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(`${f}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

export interface Contexto {
  /** Los temas del diario que existen, sin prefijo. */
  temas: string[];
  /** Las portadas que se pueden elegir. */
  portadas: Set<string>;
}

/**
 * Valida y COMPLETA: deriva la dirección del título si vino vacía y pone el
 * autor por defecto. Devuelve los valores definitivos y los errores; si
 * `errores` está vacío, se puede guardar.
 *
 * UN BORRADOR SE PUEDE GUARDAR A MEDIAS
 * ---------------------------------------------------------------------------
 * Solo el título es obligatorio siempre (sin él no hay de dónde sacar la
 * dirección ni cómo encontrarlo en la lista). Resumen y cuerpo se exigen al
 * PUBLICAR: un borrador es justamente un artículo sin terminar, y obligar a
 * escribir un resumen para poder guardar lo que lleva escrito es la forma más
 * rápida de que se pierda lo escrito.
 */
export function validarArticulo(
  entrada: ValoresArticulo,
  ctx: Contexto,
): { valores: ValoresArticulo; errores: Errores } {
  const v: ValoresArticulo = { ...entrada };
  const e: Errores = {};

  if (!v.titulo) e.titulo = 'Escribe un título.';
  else if (v.titulo.length > TOPES.titulo)
    e.titulo = `El título es demasiado largo: tiene ${v.titulo.length} letras y caben ${TOPES.titulo}.`;

  if (!v.handle) v.handle = aHandle(v.titulo);
  if (!v.handle) {
    if (!e.titulo) e.handle = 'Escribe la dirección con letras o números.';
  } else if (v.handle.length > TOPES.handle) {
    e.handle = `La dirección es demasiado larga: caben ${TOPES.handle} letras.`;
  } else if (!FORMA_HANDLE.test(v.handle)) {
    e.handle =
      'La dirección solo puede llevar letras sin tilde, números y guiones (por ejemplo: guia-de-la-v60).';
  }

  if (!v.fecha) e.fecha = 'Elige la fecha del artículo.';
  else if (!fechaValida(v.fecha)) e.fecha = 'Esa fecha no existe. Elígela en el calendario.';

  if (!v.autor) v.autor = AUTOR_POR_DEFECTO;
  else if (v.autor.length > TOPES.autor) e.autor = `El nombre es demasiado largo: caben ${TOPES.autor} letras.`;

  if (v.resumen.length > TOPES.resumen)
    e.resumen = `El resumen es demasiado largo: tiene ${v.resumen.length} letras y caben ${TOPES.resumen}. Es lo que se ve en la lista del diario: mejor corto.`;
  else if (v.publicado && !v.resumen)
    e.resumen = 'Para publicar hace falta un resumen: es lo que se ve en la lista del diario y en Google.';

  if (v.cuerpoMd.length > TOPES.cuerpoMd) e.cuerpoMd = 'El texto es demasiado largo para un solo artículo.';
  else if (v.publicado && !v.cuerpoMd.trim()) e.cuerpoMd = 'Para publicar, el artículo tiene que tener texto.';

  if (!ctx.temas.includes(v.categoria)) e.categoria = 'Elige un tema de la lista.';

  if (v.imagen && !ctx.portadas.has(v.imagen)) e.imagen = 'Esa portada ya no está disponible. Elige otra.';

  return { valores: v, errores: e };
}

/** ¿Hay algún error? */
export const hayErrores = (e: Errores): boolean => Object.keys(e).length > 0;
