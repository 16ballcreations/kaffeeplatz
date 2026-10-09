/**
 * intentos.ts — el límite de fuerza bruta, sobre la tabla `intentos` (0002).
 *
 * B.5 lo fija: «limitar por IP con la tabla `intentos` (p. ej. 10 fallos en 15
 * minutos → esperar)». Es el hallazgo 7 de A.6: 16bc no tiene nada que impida
 * probar claves a toda velocidad.
 *
 * SOLO SE CUENTAN LOS FALLOS, Y SOLO LOS RECIENTES
 * ===========================================================================
 * Un acierto no gasta cuota: si la dueña se equivoca tres veces y entra, no
 * arrastra esos tres fallos durante quince minutos. Y la ventana es deslizante
 * (`created_at > datetime('now','-15 minutes')`), no un contador que alguien
 * tenga que poner a cero: no hay estado que reiniciar ni cron que dependa de
 * nada.
 *
 * EL ACIERTO LIMPIA LOS FALLOS DE SU IP
 * ---------------------------------------------------------------------------
 * Al entrar bien se borran los fallos de esa IP. Así, quien conoce la clave
 * nunca queda bloqueado por sus propios dedos, y el bloqueo sigue intacto para
 * quien no la conoce. Es la diferencia entre proteger la puerta y estorbar a la
 * dueña, que es la forma habitual de que un límite de intentos acabe quitado.
 *
 * POR QUE LA TABLA SE BARRE AQUI
 * ---------------------------------------------------------------------------
 * La cabecera de 0002 lo dice: `intentos` es «exactamente la tabla que un ataque
 * de fuerza bruta puede hacer crecer sin límite, y D1 cobra por filas
 * escritas». El índice `intentos_por_fecha` existe para que el barrido no
 * escanee la tabla; se dispara desde aquí, con probabilidad baja, en vez de
 * montar un Cron Trigger solo para esto. Así el coste del barrido lo paga el
 * propio tráfico que ensucia la tabla.
 *
 * QUE ESTE LIMITE NO ES
 * ---------------------------------------------------------------------------
 * No es protección contra un atacante distribuido: con muchas IPs, cada una
 * tiene sus 10 intentos. Contra eso lo que protege es que la clave sea larga y
 * aleatoria (y el coste de PBKDF2 en `clave.ts`). Esto corta el caso real —un
 * script contra una IP— y hay que saber lo que cubre y lo que no.
 */

import type { BaseAdmin } from './base';

/** 10 fallos en 15 minutos y a esperar. Los números son los del plan (B.5). */
export const MAX_FALLOS = 10;
export const MINUTOS_VENTANA = 15;

/** Una de cada 20 entradas barre lo viejo. */
const PROB_BARRIDO = 0.05;
const DIAS_QUE_SE_GUARDAN = 1;

export interface EstadoIntentos {
  bloqueado: boolean;
  fallos: number;
  /** Lo que queda por probar antes del bloqueo. Es lo que se le dice a la persona. */
  restantes: number;
}

/**
 * La IP de quien pide, según Cloudflare.
 *
 * `CF-Connecting-IP` la pone el borde y NO se puede falsificar desde fuera:
 * Cloudflare la reescribe con la IP real de la conexión. `X-Forwarded-For`, en
 * cambio, lo manda el cliente y se puede inventar — usarlo como clave de un
 * límite de intentos sería regalar el bypass (`X-Forwarded-For: lo-que-sea` y
 * cuota nueva). Se acepta solo como respaldo para `wrangler dev --local`, donde
 * no hay borde que ponga la primera.
 *
 * Sin ninguna de las dos se usa una constante. Es deliberado: significa que todo
 * el tráfico sin IP identificable comparte una sola cuota, que es el lado
 * seguro del error. Lo contrario —no limitar cuando no se sabe la IP— sería el
 * agujero.
 */
export function ipDe(peticion: Request): string {
  return (
    peticion.headers.get('CF-Connecting-IP') ??
    peticion.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'desconocida'
  );
}

/**
 * ¿Puede esta IP seguir intentando?
 *
 * Se llama ANTES de derivar el hash de la clave (que cuesta decenas de
 * milisegundos a propósito, ver `clave.ts`). Ese orden importa: comprobar
 * primero el límite es lo que evita que el coste del hash se convierta en un
 * ataque de agotamiento contra el propio Worker.
 *
 * Si D1 falla, devuelve BLOQUEADO. Es el criterio de «falla cerrado» aplicado
 * aquí: sin poder contar intentos no se puede limitar, y un rato sin poder
 * entrar es mucho mejor que una ventana de fuerza bruta sin límite. La dueña
 * ve un mensaje que dice que vuelva a intentar en un momento.
 */
export async function revisarIntentos(db: BaseAdmin, ip: string): Promise<EstadoIntentos> {
  try {
    const fila = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM intentos
          WHERE ip = ?1 AND ok = 0 AND created_at > datetime('now', ?2)`,
      )
      .bind(ip, `-${MINUTOS_VENTANA} minutes`)
      .first<{ n: number }>();
    const fallos = fila?.n ?? 0;
    return {
      bloqueado: fallos >= MAX_FALLOS,
      fallos,
      restantes: Math.max(0, MAX_FALLOS - fallos),
    };
  } catch (fallo) {
    console.error('[admin] no se pudo contar los intentos:', fallo instanceof Error ? fallo.message : fallo);
    return { bloqueado: true, fallos: MAX_FALLOS, restantes: 0 };
  }
}

/**
 * Deja constancia de un intento.
 *
 * Nunca lanza: no poder registrar un intento no debe impedir entrar con la clave
 * correcta. El riesgo de ese catch es que los fallos dejen de contarse si D1 va
 * mal, pero en ese caso `revisarIntentos` ya devuelve bloqueado, así que la
 * puerta sigue cerrada.
 */
export async function anotarIntento(db: BaseAdmin, ip: string, ok: boolean): Promise<void> {
  try {
    await db.prepare('INSERT INTO intentos (ip, ok) VALUES (?1, ?2)').bind(ip, ok ? 1 : 0).run();

    if (ok) {
      /* Entró bien: su IP queda limpia. Ver la cabecera. */
      await db.prepare('DELETE FROM intentos WHERE ip = ?1 AND ok = 0').bind(ip).run();
    }

    if (Math.random() < PROB_BARRIDO) {
      await db
        .prepare("DELETE FROM intentos WHERE created_at < datetime('now', ?1)")
        .bind(`-${DIAS_QUE_SE_GUARDAN} day`)
        .run();
    }
  } catch (fallo) {
    console.error('[admin] no se pudo anotar el intento:', fallo instanceof Error ? fallo.message : fallo);
  }
}
