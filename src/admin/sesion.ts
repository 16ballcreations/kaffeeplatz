/**
 * sesion.ts — crear, comprobar y destruir la sesión del panel.
 *
 * Sustituye Basic Auth por una sesión en la tabla `sesiones` (migración 0002,
 * ya aplicada). Las tres razones están en B.5 del plan, y la primera es la que
 * manda: **Basic Auth reenvía las credenciales entre sitios**, así que con el
 * panel abierto cualquier página podía provocar un POST que cambiara un precio.
 * Una cookie `SameSite=Strict` no se manda en peticiones que vengan de otro
 * sitio, y eso es lo que mata el CSRF.
 *
 * POR QUE LA SESION VIVE EN D1 Y NO EN LA COOKIE
 * ===========================================================================
 * Un token firmado (JWT o similar) no necesita base y es más rápido. Pero no se
 * puede invalidar: mientras no caduque, vale. El plan pide explícitamente que
 * «salir invalide la sesión de verdad» y que cerrar sesión impida volver atrás
 * (prueba obligatoria 9). Con la sesión en una tabla, salir es un `DELETE` y la
 * cookie vieja deja de servir en ese instante. Esa es la diferencia entre
 * «cerrar sesión» y «olvidar la cookie».
 *
 * El coste es una consulta por petición al panel, por un índice de clave
 * primaria. Es barata y sólo la pagan las visitas del panel, que son las de una
 * persona: el sitio público no toca esta tabla.
 *
 * LA COOKIE, CAMPO POR CAMPO
 * ---------------------------------------------------------------------------
 *   HttpOnly          JavaScript no la puede leer, así que un XSS no se la lleva.
 *   Secure            solo por HTTPS.
 *   SameSite=Strict   el navegador NO la manda si la petición viene de otro
 *                     sitio. Es la defensa principal contra CSRF.
 *   Path=/admin       no se manda en el sitio público: menos superficie, y la
 *                     caché de borde de las páginas públicas no ve nunca una
 *                     petición con cookie.
 *   Max-Age           30 días, renovados al usarla (B.5).
 *
 * `Secure` EN DESARROLLO LOCAL
 * ---------------------------------------------------------------------------
 * `wrangler dev --local` sirve por HTTP, y una cookie `Secure` no se guardaría.
 * Los navegadores tratan `127.0.0.1` como contexto seguro y SÍ aceptan `Secure`
 * ahí; `localhost` también, pero no todos los clientes de línea de órdenes.
 * Por eso las pruebas se hacen contra `127.0.0.1` (así lo pide el encargo) y la
 * bandera NO se desactiva nunca, ni en local: una bandera de seguridad que se
 * apaga según el entorno es una bandera que algún día se queda apagada.
 */

import type { BaseAdmin } from './base';

export const COOKIE = 'kp_sesion';
export const RUTA_COOKIE = '/admin';

/** 30 días, como pide B.5. Se renueva cada vez que se usa. */
export const DIAS_SESION = 30;
const SEGUNDOS_SESION = DIAS_SESION * 24 * 60 * 60;

/**
 * A partir de cuándo merece la pena reescribir la caducidad.
 *
 * Renovar «al usarla» no puede significar un `UPDATE` por cada clic: serían
 * cientos de escrituras al día en D1 (que cobra por fila escrita, R4) para
 * mover una fecha unas horas. Se renueva solo si a la sesión le queda menos de
 * un día de su mes, que es cuando la renovación cambia algo de verdad.
 */
const RENOVAR_SI_QUEDA_MENOS_DE = 24 * 60 * 60;

export interface Sesion {
  id: string;
  expira: Date;
}

/* ------------------------------------------------------------------- el id */

/**
 * 256 bits de `crypto.getRandomValues`, en hex. Lo pide B.5 tal cual.
 *
 * 256 bits no se adivinan ni se recorren: no hace falta límite de intentos
 * sobre el id de sesión, solo sobre la clave (que es la que eligió una persona).
 */
function nuevoId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ¿Tiene esto la forma de un id de sesión?
 *
 * Se comprueba ANTES de ir a la base. Una cookie basura (o un intento de
 * inyección) no merece una consulta, y así la tabla no se toca con lo que
 * evidentemente no es una sesión. El valor va por `bind` de todos modos.
 */
const FORMA_ID = /^[0-9a-f]{64}$/;

/* --------------------------------------------------------------- la cookie */

/** La cookie de una sesión recién abierta. */
export function cabeceraCookie(id: string): string {
  return `${COOKIE}=${id}; HttpOnly; Secure; SameSite=Strict; Path=${RUTA_COOKIE}; Max-Age=${SEGUNDOS_SESION}`;
}

/**
 * La cookie que BORRA la sesión del navegador.
 *
 * `Max-Age=0` con el mismo `Path` y las mismas banderas: si el `Path` no
 * coincidiera, el navegador guardaría una segunda cookie vacía y mantendría la
 * buena, que es el error clásico de «cerré sesión y sigo dentro».
 */
export function cabeceraCookieVacia(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=${RUTA_COOKIE}; Max-Age=0`;
}

/** El id de sesión que trae la petición, o `null`. */
export function idDeLaPeticion(peticion: Request): string | null {
  const crudo = peticion.headers.get('Cookie');
  if (!crudo) return null;
  for (const trozo of crudo.split(';')) {
    const igual = trozo.indexOf('=');
    if (igual < 0) continue;
    if (trozo.slice(0, igual).trim() !== COOKIE) continue;
    const valor = trozo.slice(igual + 1).trim();
    return FORMA_ID.test(valor) ? valor : null;
  }
  return null;
}

/* ------------------------------------------------------------ la base */

const enISO = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

/**
 * Abre una sesión. Devuelve el id que va en la cookie.
 *
 * `ip` y `ua` se guardan porque las columnas existen (0002) y porque son lo
 * único que permitiría responder «¿desde dónde se entró?» si algún día hace
 * falta. No se usan para autorizar: atar una sesión a la IP echaría a la dueña
 * cada vez que su celular cambie de red, que es un modo de fallo peor que el
 * problema que resuelve.
 */
export async function abrirSesion(
  db: BaseAdmin,
  ip: string,
  ua: string,
): Promise<{ id: string; cookie: string }> {
  const id = nuevoId();
  const expira = new Date(Date.now() + SEGUNDOS_SESION * 1000);
  await db
    .prepare('INSERT INTO sesiones (id, expires_at, ultima_ip, ultima_ua) VALUES (?1, ?2, ?3, ?4)')
    .bind(id, enISO(expira), ip.slice(0, 64), ua.slice(0, 256))
    .run();

  /* Aprovechar la entrada para barrer lo caducado. Es la única escritura
     frecuente de esta tabla, así que es el sitio natural para la limpieza: sin
     esto, `sesiones` crece para siempre con filas que ya no valen. Un fallo
     aquí NO puede impedir entrar, de ahí el catch vacío. */
  try {
    await db.prepare("DELETE FROM sesiones WHERE expires_at < datetime('now')").run();
  } catch {
    /* la limpieza es accesoria: patrón 7 de A.6 */
  }

  return { id, cookie: cabeceraCookie(id) };
}

/**
 * ¿Hay sesión válida? `null` si no.
 *
 * LA CADUCIDAD SE COMPRUEBA EN EL `WHERE`, NO EN JAVASCRIPT.
 * Es el patrón 3 de A.6 («condiciones de concurrencia en el WHERE») aplicado al
 * tiempo: `expires_at > datetime('now')` lo decide la base con su propio reloj,
 * en la misma operación que lee la fila. Comparar fechas en JavaScript después
 * de leer deja una ventana y, peor, mete la zona horaria del runtime en una
 * decisión de seguridad.
 *
 * NO lanza nunca: si D1 falla, devuelve `null` y la puerta manda a entrar. Un
 * fallo de la base NO puede abrir el panel (falla cerrado), y tampoco puede
 * dar un 500 desnudo (hallazgo 3 de A.6).
 */
export async function sesionValida(db: BaseAdmin, id: string | null): Promise<Sesion | null> {
  if (!id || !FORMA_ID.test(id)) return null;
  try {
    const fila = await db
      .prepare("SELECT id, expires_at FROM sesiones WHERE id = ?1 AND expires_at > datetime('now')")
      .bind(id)
      .first<{ id: string; expires_at: string }>();
    if (!fila) return null;
    return { id: fila.id, expira: new Date(`${fila.expires_at.replace(' ', 'T')}Z`) };
  } catch (fallo) {
    console.error('[admin] no se pudo comprobar la sesión:', fallo instanceof Error ? fallo.message : fallo);
    return null;
  }
}

/**
 * Renueva la caducidad si ya queda poco. Devuelve la cookie nueva, o `null`.
 *
 * Nunca lanza: no poder renovar no es motivo para echar a nadie, la sesión
 * sigue siendo válida hasta su fecha.
 */
export async function renovarSiHaceFalta(
  db: BaseAdmin,
  sesion: Sesion,
): Promise<string | null> {
  const quedan = (sesion.expira.getTime() - Date.now()) / 1000;
  if (quedan > RENOVAR_SI_QUEDA_MENOS_DE) return null;
  const expira = new Date(Date.now() + SEGUNDOS_SESION * 1000);
  try {
    await db
      .prepare("UPDATE sesiones SET expires_at = ?2 WHERE id = ?1 AND expires_at > datetime('now')")
      .bind(sesion.id, enISO(expira))
      .run();
    return cabeceraCookie(sesion.id);
  } catch {
    return null;
  }
}

/**
 * Cierra la sesión: la BORRA de D1.
 *
 * Borrar y no marcar: una fila que ya no existe no se puede revalidar por error,
 * y no hay un segundo estado («cerrada pero presente») que alguna consulta
 * futura pudiera olvidar filtrar. Esto es lo que hace que reusar la cookie
 * después de salir no entre (prueba obligatoria 9).
 */
export async function cerrarSesion(db: BaseAdmin, id: string | null): Promise<void> {
  if (!id || !FORMA_ID.test(id)) return;
  try {
    await db.prepare('DELETE FROM sesiones WHERE id = ?1').bind(id).run();
  } catch (fallo) {
    console.error('[admin] no se pudo borrar la sesión:', fallo instanceof Error ? fallo.message : fallo);
  }
}
