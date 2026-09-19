import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { IDS_CATEGORIA, IDS_CATEGORIA_DIARIO } from './datos/categorias';

/**
 * Colecciones tipadas de KaffeePlatz.
 *
 * Los ficheros de src/content/ los GENERA scripts/normalizar.mjs a partir de
 * contenido-original/. No los edites a mano.
 */

const imagenProducto = z.object({
  /** Ruta absoluta servida desde public/, p.ej. "/img/productos/chemex/chemex-1.jpg" */
  src: z.string(),
  /** Texto alternativo: obligatorio, nunca vacio. */
  alt: z.string().min(1),
  /**
   * Variante a la que corresponde ESTA foto. OPCIONAL, y hoy vacio en los 25
   * productos.
   *
   * POR QUE ESTA VACIO
   * -------------------------------------------------------------------------
   * El respaldo de Shopify no exporto la asociacion imagen->variante. En
   * `aeropress-clear` hay 3 fotos y 3 colores (Morado, Verde, Rosa), pero los
   * `alt` son genericos ("Aeropress Clear", "— vista 2", "— vista 3"): el dato
   * de que foto es de que color NO EXISTE en el material. No se inventa, igual
   * que no se invento `coleccion` (ver abajo).
   *
   * COMO SE RELLENARA
   * -------------------------------------------------------------------------
   * El valor es el TITULO EXACTO de la variante, tal cual aparece en
   * `variantes[].titulo`. Para aeropress-clear quedaria asi, una vez el
   * cliente confirme que foto es cada color:
   *
   *   "imagenes": [
   *     { "src": ".../aeropress-clear-1.jpg", "alt": "...", "variante": "Morado" },
   *     { "src": ".../aeropress-clear-2.jpg", "alt": "...", "variante": "Verde"  },
   *     { "src": ".../aeropress-clear-3.jpg", "alt": "...", "variante": "Rosa"   }
   *   ]
   *
   * El sitio de la correccion es `scripts/normalizar.mjs` + regenerar, NUNCA
   * el JSON a mano (regla de BASE.md §7).
   *
   * QUE PASARA ENTONCES, SIN TOCAR UNA LINEA MAS DE CODIGO
   * -------------------------------------------------------------------------
   * La galeria (`GaleriaProducto.astro`) ya lee este campo y lo emite como
   * `data-variante` en cada miniatura. En cuanto aparezca:
   *   1. Al pulsar una miniatura se marcara tambien la variante correspondiente
   *      en la lista de opciones de la ficha.
   *   2. Al elegir una variante en esa lista, la foto grande cambiara sola.
   * Mientras el campo siga ausente, la galeria funciona exactamente igual, solo
   * que sin ese vinculo: es una mejora aditiva, no un requisito.
   *
   * NOTA: no se valida contra los titulos de `variantes` porque zod valida cada
   * imagen de forma aislada, sin acceso a sus hermanas. La comprobacion de que
   * el titulo existe de verdad se hace en la galeria (§ GaleriaProducto), que
   * descarta en silencio los vinculos que no casen con ninguna variante.
   */
  variante: z.string().optional(),
});

const variante = z.object({
  id: z.string(),
  titulo: z.string(),
  /** Precio en COP, entero. */
  precio: z.number().int().nonnegative(),
  /** Precio ya formateado para mostrar, p.ej. "$120.000". */
  precioFormateado: z.string(),
  disponible: z.boolean(),
  sku: z.string().nullable().default(null),
});

const opcion = z.object({
  nombre: z.string(),
  valores: z.array(z.string()),
});

const productos = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/productos' }),
  schema: z.object({
    handle: z.string(),
    titulo: z.string(),
    vendor: z.string().default('KaffeePlatz'),
    descripcionHtml: z.string(),
    descripcionTexto: z.string(),
    /** Precio desde (el menor de las variantes), en COP. */
    precio: z.number().int().nonnegative(),
    precioFormateado: z.string(),
    disponible: z.boolean(),
    variantes: z.array(variante),
    opciones: z.array(opcion).default([]),
    imagenes: z.array(imagenProducto).default([]),
    coleccion: z.string().optional(),
    /**
     * Categoria del producto (agrupacion por tipo de objeto).
     *
     * El dato VIAJA CON EL PRODUCTO, dentro de su propio JSON, que es
     * exactamente como lo devolveria una API. Asi, el dia que estos productos
     * lleguen por HTTP, este mismo esquema zod sirve de validador de la
     * respuesta sin tocar nada mas.
     *
     * Se valida contra los ids reales de src/datos/categorias.ts: si un
     * producto trae una categoria que no existe en el catalogo, el BUILD
     * FALLA en vez de tragarse el dato en silencio. Y si un producto llega
     * sin categoria, cae a 'otros' por defecto, que es un valor con nombre
     * visible y sitio en la barra de filtros, no un hueco.
     *
     * Nota: `coleccion` (arriba) es el campo heredado del respaldo de
     * Shopify. Esta vacio en los 25 productos porque el respaldo no traia la
     * pertenencia producto->coleccion. Se deja intacto para no romper nada;
     * `categoria` es el campo que se usa de verdad.
     */
    categoria: z
      .enum(IDS_CATEGORIA as [string, ...string[]])
      .default('otros'),
    destacado: z.boolean().optional(),
  }),
});

const diario = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/diario' }),
  schema: z.object({
    titulo: z.string(),
    handle: z.string(),
    fecha: z.coerce.date(),
    autor: z.string(),
    resumen: z.string(),
    /** Portada servida desde public/, p.ej. "/img/diario/<handle>.png" */
    imagen: z.string().optional(),
    /**
     * Tema del articulo. Mismo criterio que en productos: el dato viaja en el
     * frontmatter del propio .md, que es donde lo pondria un CMS y lo que
     * devolveria una API. Validado contra los ids reales de
     * src/datos/categorias.ts (CATEGORIAS_DIARIO): un tema inexistente rompe
     * el build en vez de colarse. Sin categoria, cae a 'otros'.
     */
    categoria: z
      .enum(IDS_CATEGORIA_DIARIO as [string, ...string[]])
      .default('otros'),
  }),
});

export const collections = { productos, diario };
