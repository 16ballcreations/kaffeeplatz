/**
 * CATALOGO DE CATEGORIAS — KaffeePlatz
 * ===========================================================================
 * Agrupacion del catalogo POR TIPO DE OBJETO, segun decision del cliente.
 *
 * POR QUE ESTE ARCHIVO EXISTE
 * ---------------------------------------------------------------------------
 * Las categorias son un DATO, no una lista de constantes repartidas por el
 * markup. Viven aqui, en un solo sitio, con un `id` estable (slug) que es lo
 * unico que se escribe dentro de cada producto. El nombre visible, el orden y
 * la descripcion se resuelven SIEMPRE a traves de este catalogo.
 *
 * Consecuencia practica: renombrar "Molinos" a "Molienda" es un cambio de una
 * linea aqui y no toca ni un solo producto ni una sola plantilla.
 *
 * COMO SE MIGRA ESTO A UNA API EL DIA DE MANANA
 * ---------------------------------------------------------------------------
 * La forma de los datos es deliberadamente la que devolveria un backend:
 * una lista plana de objetos con `id`, `nombre`, `orden`, `descripcion`.
 *
 * Hoy:
 *     import { CATEGORIAS } from '../datos/categorias';
 *
 * Con backend, solo cambia el ORIGEN, no la forma ni el consumo:
 *
 *     // src/datos/categorias.ts
 *     export async function obtenerCategorias(): Promise<Categoria[]> {
 *       const r = await fetch(`${API}/categorias`);
 *       return CategoriaSchema.array().parse(await r.json());
 *     }
 *
 * y en la pagina, que es un componente de servidor de Astro, basta con
 * `const CATEGORIAS = await obtenerCategorias();`. El resto del archivo
 * (el filtrado, las pildoras, los recuentos) no se entera del cambio porque
 * solo depende de `id`, `nombre` y `orden`.
 *
 * Lo mismo aplica al lado del producto: hoy `categoria` es un campo dentro de
 * cada JSON (igual que vendria en el payload de un producto de una API) y lo
 * valida el esquema zod de src/content.config.ts. El dia que los productos
 * lleguen por HTTP, ese mismo esquema zod sirve de validador de la respuesta.
 * ===========================================================================
 */

export interface Categoria {
  /** Slug estable. Es lo unico que se escribe dentro de cada producto. */
  id: string;
  /** Nombre visible. Cambiarlo aqui lo cambia en todo el sitio. */
  nombre: string;
  /** Orden de aparicion en la barra de filtros. */
  orden: number;
  /** Apoyo editorial, por si alguna vista quiere encabezar la categoria. */
  descripcion?: string;
}

/**
 * Las seis categorias del catalogo, mas "otros" como red de seguridad.
 *
 * NOTA SOBRE LA PROPUESTA INICIAL: se planteo una categoria "Servicio (tazas,
 * servers, mates)". Se mantiene, pero conviene saber que en el catalogo real
 * NO hay tazas: son dos servers de vidrio y un mate. Si el catalogo crece por
 * ese lado, el nombre ya sirve; si no crece, el cliente puede querer fundirla.
 * Se deja senalado en el informe en vez de decidirlo por mi cuenta.
 */
export const CATEGORIAS: Categoria[] = [
  {
    id: 'metodos',
    nombre: 'Métodos de preparación',
    orden: 1,
    descripcion: 'Drippers, prensas y cafeteras: la pieza donde ocurre la extracción.',
  },
  {
    id: 'molinos',
    nombre: 'Molinos',
    orden: 2,
    descripcion: 'La molienda, que es donde se gana o se pierde la taza.',
  },
  {
    id: 'hervidores',
    nombre: 'Hervidores',
    orden: 3,
    descripcion: 'Jarras y hervidores de cuello de ganso para un vertido controlado.',
  },
  {
    id: 'filtros',
    nombre: 'Filtros y consumibles',
    orden: 4,
    descripcion: 'Filtros de papel y de acero para cada método.',
  },
  {
    id: 'medicion',
    nombre: 'Básculas y medición',
    orden: 5,
    descripcion: 'Peso, tiempo y temperatura: la parte medible de una receta.',
  },
  {
    id: 'servicio',
    nombre: 'Servicio',
    orden: 6,
    descripcion: 'Servers y piezas para servir y acompañar la infusión.',
  },
  {
    id: 'otros',
    nombre: 'Otros',
    orden: 99,
    descripcion: 'Sin clasificar todavía.',
  },
];

/**
 * CATEGORIAS DEL DIARIO — agrupacion por TEMA.
 * ---------------------------------------------------------------------------
 * Viven en ESTE archivo, no en uno aparte, por dos razones:
 *   1. Comparten exactamente la misma forma (`Categoria`) y el mismo destino
 *      (una barra de filtros identica), asi que separarlas obligaria a
 *      duplicar el tipo y la funcion de busqueda.
 *   2. Son dos taxonomias CORTAS. Un solo archivo "que categorias existen en
 *      el sitio" se lee de un vistazo; dos archivos casi iguales invitan a
 *      corregir uno y olvidar el otro.
 * Son listas SEPARADAS, eso si: un producto nunca es de "tecnica" ni un
 * articulo de "molinos". No se mezclan los espacios de ids.
 *
 * La migracion a API es la misma que arriba: `obtenerCategoriasDiario()`
 * devolviendo esta misma forma desde `${API}/diario/categorias`.
 */
export const CATEGORIAS_DIARIO: Categoria[] = [
  {
    id: 'metodos',
    nombre: 'Métodos',
    orden: 1,
    descripcion: 'Aeropress, Chemex, V60, prensa francesa y cold brew, uno a uno.',
  },
  {
    id: 'tecnica',
    nombre: 'Técnica',
    orden: 2,
    descripcion: 'Molienda, conservación y los errores que arruinan una taza.',
  },
  {
    id: 'grano',
    nombre: 'El grano',
    orden: 3,
    descripcion: 'Qué es el café de especialidad y por qué el origen cambia el sabor.',
  },
  {
    id: 'equipo',
    nombre: 'Equipo',
    orden: 4,
    descripcion: 'Accesorios y equipo: qué suma de verdad en casa.',
  },
  {
    id: 'otros',
    nombre: 'Otros',
    orden: 99,
    descripcion: 'Sin clasificar todavía.',
  },
];

/** Los ids validos, derivados del catalogo: no se escriben dos veces. */
export const IDS_CATEGORIA = CATEGORIAS.map((c) => c.id);

/** Los ids validos del diario. */
export const IDS_CATEGORIA_DIARIO = CATEGORIAS_DIARIO.map((c) => c.id);

/** Busca una categoria por id. Devuelve "otros" si el id no existe. */
export function categoriaPorId(id: string | undefined): Categoria {
  return (
    CATEGORIAS.find((c) => c.id === id) ??
    (CATEGORIAS.find((c) => c.id === 'otros') as Categoria)
  );
}
