/**
 * atencion.ts — lo que necesita atención, para la portada del panel.
 *
 * QUE ES ESTO Y QUE NO ES
 * ===========================================================================
 * NO es un panel de métricas. No hay visitas, ni conversión, ni gráficas: nada
 * de eso existe en D1 y el encargo lo dice sin rodeos — **sin inventar
 * métricas**. Inventarse un número es peor que no ponerlo, porque alguien lo
 * usará para decidir.
 *
 * Lo que hay es una lista de **cosas que la dueña puede arreglar hoy**, cada una
 * contada con un `COUNT` sobre datos reales. El criterio para que algo entre
 * aquí es exactamente ese: si no hay nada que hacer al verlo, no es atención, es
 * decoración.
 *
 * LAS CINCO COSAS, Y POR QUE CADA UNA
 * ---------------------------------------------------------------------------
 *   Productos agotados        cuesta dinero cada día que sigue así
 *   Productos sin foto        una tarjeta sin foto no se vende
 *   Artículos sin portada     B.0 dice que hay uno así de verdad (15 de 16)
 *   Borradores del diario     escrito y sin publicar: se olvida
 *   Productos archivados      por si algo se archivó por error
 *
 * Los cuatro primeros son trabajo pendiente. El último es una red de seguridad
 * para el borrado reversible (R7): un producto archivado por error es dinero, y
 * sin verlo en alguna parte nadie lo descubre.
 *
 * CADA CONSULTA VA EN SU PROPIO `try/catch`
 * ---------------------------------------------------------------------------
 * Es el patrón 7 de A.6 llevado al extremo que el panel necesita: en 16bc, un
 * `try{...}catch{}` envuelve TODAS las insignias y, si falla una, se pierden
 * las cinco. Aquí cada cifra falla sola, y la portada se pinta con las que sí
 * respondieron. Una tarjeta dice «no se pudo consultar» y las otras cuatro
 * siguen siendo útiles.
 *
 * Y nunca lanza. Por el hallazgo 3 de A.6: un fallo de D1 aquí no puede dar un
 * 500 sin cuerpo en la primera pantalla que la dueña abre cada mañana.
 */

import type { BaseAdmin } from './base';

export interface Aviso {
  clave: string;
  /** Lo que ve la dueña. Sin jerga y sin ids. */
  titulo: string;
  /** Qué hacer, en una frase. */
  detalle: string;
  cuenta: number | null;
  /** A dónde lleva. Las fases 5–7 crean estos destinos; hoy puede no existir. */
  href: string;
  /** `true` si la consulta falló: la tarjeta lo dice en vez de mentir con un 0. */
  fallo: boolean;
}

/** Un `COUNT(*)` con su propio try/catch. `null` si no se pudo. */
async function contar(db: BaseAdmin, sql: string): Promise<number | null> {
  try {
    const fila = await db.prepare(sql).first<{ n: number }>();
    return fila?.n ?? 0;
  } catch (fallo) {
    console.error('[admin] no se pudo contar:', fallo instanceof Error ? fallo.message : fallo);
    return null;
  }
}

/**
 * Los avisos de la portada.
 *
 * Las cinco consultas van en paralelo con `Promise.all`: son cinco `COUNT`
 * sobre tablas pequeñas y secuenciarlas solo sumaría latencia. Ninguna puede
 * rechazar la promesa (cada una tiene su catch dentro de `contar`), así que
 * `Promise.all` aquí no puede fallar entero — que es justo lo que haría si los
 * catch no estuvieran.
 */
export async function loQueNecesitaAtencion(db: BaseAdmin): Promise<Aviso[]> {
  const [agotados, sinFoto, sinPortada, borradores, archivados] = await Promise.all([
    /* Agotado = no disponible. En la fase 9 esto pasará a mirar el stock
       calculado (sección G), y entonces esta consulta cambia de sitio pero no
       de significado. */
    contar(db, 'SELECT COUNT(*) AS n FROM productos WHERE archivado_en IS NULL AND disponible = 0'),
    contar(
      db,
      `SELECT COUNT(*) AS n FROM productos p
        WHERE p.archivado_en IS NULL
          AND NOT EXISTS (SELECT 1 FROM imagenes i WHERE i.producto_id = p.id)`,
    ),
    /* `imagen IS NULL OR imagen = ''`: la columna admite NULL (un artículo real
       no tiene portada, anomalía 2 de B.0) y la semilla podría dejar cadena
       vacía. Las dos cosas son «sin portada» para la dueña. */
    contar(
      db,
      `SELECT COUNT(*) AS n FROM articulos
        WHERE archivado_en IS NULL AND publicado = 1 AND (imagen IS NULL OR imagen = '')`,
    ),
    contar(db, 'SELECT COUNT(*) AS n FROM articulos WHERE archivado_en IS NULL AND publicado = 0'),
    contar(db, 'SELECT COUNT(*) AS n FROM productos WHERE archivado_en IS NOT NULL'),
  ]);

  return [
    {
      clave: 'agotados',
      titulo: 'Productos agotados',
      detalle: 'Están publicados pero marcados como no disponibles.',
      cuenta: agotados,
      href: '/admin/productos?estado=agotados',
      fallo: agotados === null,
    },
    {
      clave: 'sin-foto',
      titulo: 'Productos sin ninguna foto',
      detalle: 'En el catálogo salen con el hueco vacío.',
      cuenta: sinFoto,
      href: '/admin/productos?estado=sin-foto',
      fallo: sinFoto === null,
    },
    {
      clave: 'sin-portada',
      titulo: 'Artículos sin foto de portada',
      detalle: 'Se publican igual, pero se comparten sin imagen.',
      cuenta: sinPortada,
      href: '/admin/diario?estado=sin-portada',
      fallo: sinPortada === null,
    },
    {
      clave: 'borradores',
      titulo: 'Artículos en borrador',
      detalle: 'Escritos y todavía sin publicar.',
      cuenta: borradores,
      href: '/admin/diario?estado=borradores',
      fallo: borradores === null,
    },
    {
      clave: 'archivados',
      titulo: 'Productos archivados',
      detalle: 'No salen en la tienda. Se pueden restaurar.',
      cuenta: archivados,
      href: '/admin/productos?estado=archivados',
      fallo: archivados === null,
    },
  ];
}

/** El resumen de la tienda. Cuentas, no métricas: lo que hay, contado. */
export interface Resumen {
  productos: number | null;
  articulos: number | null;
}

export async function resumenDeLaTienda(db: BaseAdmin): Promise<Resumen> {
  const [productos, articulos] = await Promise.all([
    contar(db, 'SELECT COUNT(*) AS n FROM productos WHERE archivado_en IS NULL'),
    contar(db, 'SELECT COUNT(*) AS n FROM articulos WHERE archivado_en IS NULL AND publicado = 1'),
  ]);
  return { productos, articulos };
}
