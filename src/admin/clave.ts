/**
 * clave.ts — la clave del panel, guardada como HASH y nunca en claro.
 *
 * POR QUE UN HASH Y NO LA CLAVE
 * ===========================================================================
 * 16bc compara `env.ADMIN_PASSWORD` contra lo que llega (A.2 del plan). Funciona,
 * pero significa que el secreto del panel existe en claro en la configuración de
 * Cloudflare, y cualquiera que pueda leer las variables del Worker —hoy o en dos
 * años, con otra persona en la cuenta— tiene la clave de la tienda.
 *
 * Con un hash, lo que se guarda no sirve para entrar en ningún otro sitio y no
 * se puede volver a la clave original. B.5 lo pide explícitamente: «mejor:
 * guardar la clave como hash (PBKDF2 vía WebCrypto, que está en el runtime)».
 *
 * PBKDF2 Y NO SHA-256 A SECAS
 * ---------------------------------------------------------------------------
 * Un SHA-256 de una clave humana se rompe por fuerza bruta a millones por
 * segundo. PBKDF2 con 210.000 iteraciones hace que cada intento cueste, y la
 * sal hace que no se pueda precalcular una tabla. El número sigue la
 * recomendación vigente de OWASP para PBKDF2-HMAC-SHA256.
 *
 * No se usa Argon2 ni bcrypt porque no están en el runtime de Workers:
 * meterlos obligaría a un paquete WASM. PBKDF2 está en WebCrypto, que es
 * nativo, y para una clave larga de una sola persona es suficiente.
 *
 * EL COSTE ES DELIBERADO Y ESTA ACOTADO
 * ---------------------------------------------------------------------------
 * 210.000 iteraciones son decenas de milisegundos de CPU. Eso se paga SOLO al
 * entrar, no en cada petición: lo que se comprueba en cada visita al panel es
 * el id de sesión en la tabla `sesiones`, que es un índice. Y el límite de
 * intentos de `intentos.ts` se comprueba ANTES de derivar el hash, así que un
 * atacante no puede usar este coste como ataque de agotamiento.
 *
 * FORMATO DEL VALOR GUARDADO
 * ---------------------------------------------------------------------------
 *     pbkdf2$sha256$<iteraciones>$<sal en base64>$<hash en base64>
 *
 * Lleva el algoritmo y las iteraciones dentro a propósito: el día que haya que
 * subir el coste, los hashes viejos siguen verificándose con su propio número y
 * no hace falta migrar nada de golpe.
 */

/** Iteraciones de los hashes NUEVOS. Los viejos usan la suya, la del propio hash. */
const ITERACIONES = 210_000;
const BITS = 256;
const SAL_BYTES = 16;

const b64 = (b: ArrayBuffer | Uint8Array): string => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s);
};

const deB64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derivar(
  clave: string,
  sal: Uint8Array,
  iteraciones: number,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(clave),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    /* `sal as BufferSource`: el tipo de `Uint8Array` en el lib de TS para
       Workers no coincide exactamente con `BufferSource` según la versión.
       El valor es correcto en tiempo de ejecución. */
    { name: 'PBKDF2', salt: sal as unknown as BufferSource, iterations: iteraciones, hash: 'SHA-256' },
    material,
    BITS,
  );
  return new Uint8Array(bits);
}

/**
 * Crea el hash de una clave. Lo usa `scripts/hash-clave.mjs`, NO el Worker:
 * el panel solo verifica, nunca genera.
 */
export async function hashearClave(clave: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(SAL_BYTES));
  const hash = await derivar(clave, sal, ITERACIONES);
  return `pbkdf2$sha256$${ITERACIONES}$${b64(sal)}$${b64(hash)}`;
}

/**
 * Comparación en TIEMPO CONSTANTE, copiada en espíritu de `sameText` de 16bc
 * (A.2), que el plan dice copiar tal cual.
 *
 * Sobre dos hashes de longitud fija el riesgo de temporización es teórico —los
 * dos lados miden siempre 32 bytes—, pero se hace igual porque es gratis y
 * porque la alternativa (`===` sobre cadenas) es el tipo de atajo que luego
 * alguien copia a un sitio donde sí importa.
 */
function igualesEnTiempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * ¿Es ésta la clave del panel?
 *
 * FALLA CERRADO, siempre. Es el punto 1 de «qué copiar tal cual» de A.6: si el
 * hash falta, está mal escrito o la derivación revienta, la respuesta es `false`
 * y nadie entra. Nunca `true` por omisión, y nunca una excepción que el
 * handler de arriba pudiera interpretar como «no se pudo comprobar, pasa».
 *
 * Que quede claro lo que NO es: no hay identidad. Es una clave compartida, igual
 * que en 16bc (hallazgo 10 de A.6). Con una sola persona usando el panel es
 * aceptable, y queda escrito aquí para que nadie lo descubra por sorpresa.
 */
export async function esLaClave(clave: string, guardado: string | undefined): Promise<boolean> {
  if (!guardado || !clave) return false;

  const partes = guardado.split('$');
  if (partes.length !== 5) return false;
  const [algo, hash, iterTexto, salB64, hashB64] = partes;
  if (algo !== 'pbkdf2' || hash !== 'sha256') return false;

  const iteraciones = Number(iterTexto);
  /* Un tope por si el valor guardado viniera manipulado: sin esto, un
     `iterations` absurdo convertiría cada intento en una denegación de
     servicio contra el propio Worker. */
  if (!Number.isInteger(iteraciones) || iteraciones < 1 || iteraciones > 2_000_000) return false;

  try {
    const esperado = deB64(hashB64);
    const obtenido = await derivar(clave, deB64(salB64), iteraciones);
    return igualesEnTiempoConstante(obtenido, esperado);
  } catch {
    /* Base64 corrupto o WebCrypto no disponible. Falla cerrado. */
    return false;
  }
}
