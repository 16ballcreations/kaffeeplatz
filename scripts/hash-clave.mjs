/**
 * hash-clave.mjs — genera el hash de la clave del panel.
 *
 * El Worker SOLO verifica; nunca genera. Este script es la otra mitad: se corre
 * a mano, en la máquina de quien administra, y lo que imprime es lo que se
 * declara como secreto.
 *
 * Uso:
 *   node scripts/hash-clave.mjs                 (genera una clave al azar)
 *   node scripts/hash-clave.mjs 'mi clave'      (usa la que le des)
 *
 * SIN ARGUMENTO GENERA LA CLAVE, Y ESO ES LO RECOMENDADO
 * ===========================================================================
 * Una clave de 24 caracteres al azar hace que el límite de intentos sea una
 * formalidad: no se adivina. Una que elige una persona sí se puede adivinar, y
 * entonces el límite de intentos pasa a ser la única defensa. Como la dueña va
 * a guardarla en el gestor de claves del teléfono y no la va a teclear de
 * memoria, no hay motivo para que sea memorizable.
 *
 * LA CLAVE SE IMPRIME UNA VEZ Y NO SE GUARDA EN NINGUN SITIO
 * ---------------------------------------------------------------------------
 * Ni en un fichero, ni en el repositorio. Se copia al gestor de claves y se
 * pierde. Lo único que queda es el hash, que no sirve para entrar.
 */

import { webcrypto as crypto } from 'node:crypto';

/* 100.000 y no más: Cloudflare Workers RECHAZA PBKDF2 por encima de ese
   número ("iteration counts above 100000 are not supported"). Node no tiene
   ese límite, así que un hash de 210.000 —el valor que recomienda OWASP—
   verifica bien en local y falla SIEMPRE en el Worker desplegado, sin decir
   por qué: `esLaClave` captura la excepción y devuelve false, que es lo
   correcto para fallar cerrado pero indistinguible de una clave mala.
   El tope de la plataforma manda sobre la recomendación.
   Si algún día Workers lo sube, este número puede subir con él: el coste
   viaja DENTRO del hash, así que los hashes viejos se siguen verificando. */
const ITERACIONES = 100_000;
const BITS = 256;

/* El mismo alfabeto sin caracteres que se confundan al leerlos en voz alta o
   al teclearlos en un móvil: sin l/I/1, sin O/0. */
const ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_';

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

function claveAlAzar(largo = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(largo));
  /* El módulo introduce un sesgo mínimo que no importa aquí: con 58 símbolos y
     24 posiciones quedan ~140 bits de entropía incluso contándolo. */
  return [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join('');
}

async function hashear(clave) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(clave),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal, iterations: ITERACIONES, hash: 'SHA-256' },
    material,
    BITS,
  );
  return `pbkdf2$sha256$${ITERACIONES}$${b64(sal)}$${b64(new Uint8Array(bits))}`;
}

const dada = process.argv[2];
const clave = dada ?? claveAlAzar();
const hash = await hashear(clave);

console.log('');
if (!dada) {
  console.log('CLAVE (se muestra UNA vez: guárdala en el gestor de claves)');
  console.log('------------------------------------------------------------');
  console.log(`  ${clave}`);
  console.log('');
}
console.log('HASH (esto es lo que se declara como secreto; no es la clave)');
console.log('------------------------------------------------------------');
console.log(`  ${hash}`);
console.log('');
console.log('EN PRODUCCION');
console.log('  npx wrangler secret put ADMIN_CLAVE_HASH');
console.log('  (y pega el hash cuando lo pida)');
console.log('');
console.log('EN LOCAL (.dev.vars, que NO se versiona)');
console.log(`  echo 'ADMIN_CLAVE_HASH=${hash}' >> .dev.vars`);
console.log('');
