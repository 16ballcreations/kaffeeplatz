/**
 * menu.ts — el mapa del panel, en un sitio.
 *
 * El armazón de la fase 4 existe para que las fases 5–7 cuelguen sus pantallas
 * sin tocar el layout: añadir una sección es añadir una línea aquí y poner
 * `listo: true` cuando su página exista.
 *
 * LAS SECCIONES QUE NO EXISTEN TODAVIA SE ENSEÑAN, APAGADAS
 * ===========================================================================
 * Podrían ocultarse hasta que estén. Se enseñan porque la dueña va a ver este
 * panel antes de que esté completo, y un menú que crece solo se siente roto
 * («¿ayer no estaba esto?»). Apagadas dicen la verdad: esto va a estar aquí y
 * todavía no está. Y no son enlaces, así que no hay forma de llegar a un 404.
 *
 * LAS ETIQUETAS SON LAS PALABRAS DE ANDREINA
 * ---------------------------------------------------------------------------
 * «Diario», no «Blog» ni «Contenido». «Para despachar», no «Pedidos
 * pendientes». Conoce su catálogo al dedillo y no es técnica: la palabra correcta es
 * la que ella usa, y en ningún sitio aparece un id.
 */

export interface Seccion {
  /** Clave interna. No se pinta nunca. */
  clave: string;
  /** Lo que ve la dueña. */
  etiqueta: string;
  href: string;
  /** `false` mientras su fase no esté hecha: se pinta apagada, sin enlace. */
  listo: boolean;
  /** En qué fase llega. Solo para quien lee el código. */
  fase: number;
}

export const SECCIONES: Seccion[] = [
  { clave: 'inicio', etiqueta: 'Inicio', href: '/admin', listo: true, fase: 4 },
  { clave: 'productos', etiqueta: 'Productos', href: '/admin/productos', listo: true, fase: 5 },
  /* «Fotos» e «Inventario» ya no son secciones: viven dentro de la ficha de
     cada producto (pedidos del cliente, 9 oct 2026: «se me hace confuso que
     por un lado se suban las imágenes y por otro los datos», y el inventario
     «en la misma vista de productos»). /admin/fotos e /admin/inventario
     redirigen a Productos. El encendido del inventario y el conteo de la
     bodega están en la cabecera de la lista de productos. */
  /* Junto a Productos: es lo que se mira a diario cuando hay ventas. */
  { clave: 'despachos', etiqueta: 'Para despachar', href: '/admin/despachos', listo: true, fase: 9 },
  { clave: 'diario', etiqueta: 'Diario', href: '/admin/diario', listo: true, fase: 7 },
  /* Justo detrás de Diario porque es donde se piden: los temas del diario
     viven ahí. Antes solo se llegaba por un enlace al pie del diario. */
  { clave: 'categorias', etiqueta: 'Categorías', href: '/admin/categorias', listo: true, fase: 7 },
];
