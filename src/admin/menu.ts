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
 * «Fotos», no «Medios». «Diario», no «Blog» ni «Contenido». «Inventario», no
 * «Stock». Conoce su catálogo al dedillo y no es técnica: la palabra correcta es
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
  { clave: 'productos', etiqueta: 'Productos', href: '/admin/productos', listo: false, fase: 5 },
  { clave: 'fotos', etiqueta: 'Fotos', href: '/admin/fotos', listo: true, fase: 6 },
  { clave: 'diario', etiqueta: 'Diario', href: '/admin/diario', listo: false, fase: 7 },
  { clave: 'inventario', etiqueta: 'Inventario', href: '/admin/inventario', listo: false, fase: 9 },
];
