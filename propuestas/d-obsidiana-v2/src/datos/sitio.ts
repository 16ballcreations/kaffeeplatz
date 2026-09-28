/**
 * Datos de negocio de KaffeePlatz, en un solo sitio.
 *
 * Todo lo de aqui esta VERIFICADO contra el material de contenido-original/.
 * Si necesitas un dato que no esta, NO lo inventes: anadelo como MARCADOR
 * (p.ej. "PENDIENTE: ...") y avisa.
 */

export const SITIO = {
  nombre: 'KaffeePlatz',
  /** Frase ancla de marca. */
  lema: 'Eleva tu experiencia cafetera',
  descripcion:
    'Accesorios de café de especialidad seleccionados desde Medellín. Métodos, filtros y utensilios para preparar mejor café en casa.',
  ciudad: 'Medellín, Colombia',
  /** Marca 100% online: no hay punto físico. */
  tienePuntoFisico: false,
  dueña: 'Andreina Morales',
  email: 'kaffeeplatz28@gmail.com',
  /** Solo dígitos, formato internacional, para wa.me */
  whatsappNumero: '573013809886',
  /** Para mostrar a la persona. */
  whatsappVisible: '+57 301 380 9886',
  /** El dominio va en minúsculas y NO se normaliza a KaffeePlatz. */
  dominioLegado: 'kaffeeplatz.co',
} as const;

/** Navegación principal. Los diseños la pintan como quieran, pero no cambian las rutas. */
export const NAVEGACION = [
  { href: '/', etiqueta: 'Inicio' },
  { href: '/catalogo', etiqueta: 'Catálogo' },
  { href: '/cafe', etiqueta: 'Café' },
  { href: '/diario', etiqueta: 'Diario' },
  { href: '/nosotros', etiqueta: 'Nosotros' },
  { href: '/contacto', etiqueta: 'Contacto' },
] as const;

/**
 * Prefija una ruta interna con el `base` de Astro para que funcione en
 * GitHub Pages (/kaffeeplatz). Usa SIEMPRE esto en lugar de href="/algo".
 */
export function ruta(camino: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const limpio = camino.startsWith('/') ? camino : `/${camino}`;
  return `${base}${limpio}` || '/';
}

/** Igual que `ruta`, para recursos de public/ (imágenes, iconos). */
export const recurso = ruta;
