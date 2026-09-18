import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
  }),
});

export const collections = { productos, diario };
