/**
 * publicar.mjs — `npm run deploy`: publica en kaffeeplatz.co SOLO lo que ya
 * está en GitHub.
 * ===========================================================================
 * El 2026-10-09 se publicaron cambios (el emblema vivo del hero) desde
 * commits que nunca se subieron: producción quedó por delante del repo y
 * desde otro equipo no había forma de verlos ni de reconstruirlos. Este
 * script lo impide. Antes de construir comprueba:
 *
 *   1. Que no haya cambios sin commit, incluidos ficheros nuevos sin añadir
 *      (un `src/scripts/*.ts` nuevo sin `git add` se publica igual, porque el
 *      build lee el disco, no git).
 *   2. Que el commit actual esté en GitHub (en alguna rama de `origin`).
 *
 * Si pasa, construye con `npm run build` y publica con `wrangler deploy`,
 * poniendo el commit como mensaje del despliegue: en Cloudflare, Workers &
 * Pages → kaffeeplatz → Deployments, cada versión dice de qué commit salió.
 *
 * Los argumentos extra pasan a wrangler (`npm run deploy -- --dry-run`).
 *
 * EMERGENCIAS: para volver atrás no hace falta este script; el Rollback del
 * panel de Cloudflare no pasa por aquí. Si aun así hay que publicar algo sin
 * subirlo, `KP_PUBLICAR_SIN_GIT=1 npm run deploy` se salta la comprobación
 * (y lo deja dicho en el mensaje del despliegue).
 */
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const fallar = (motivo, ayuda) => {
  console.error(`\nNO SE PUBLICA: ${motivo}\n`);
  if (ayuda) console.error(`${ayuda}\n`);
  process.exit(1);
};

const forzado = process.env.KP_PUBLICAR_SIN_GIT === '1';
const commit = git('log', '-1', '--format=%h %s');

if (!forzado) {
  // .claude/ es estado local del editor (worktrees de sesiones), no del sitio
  // sin trim(): el primer carácter de cada línea es parte del estado (" M")
  const sucios = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
    .split('\n')
    .filter((l) => l && !l.slice(3).startsWith('.claude/'));
  if (sucios.length) {
    fallar(
      'hay cambios sin commit. Producción tiene que poder reconstruirse desde GitHub.',
      `${sucios.join('\n')}\n\nHaz commit (y push) de esto, o descártalo, y vuelve a intentarlo.`,
    );
  }

  try {
    git('fetch', '--quiet', 'origin');
  } catch {
    fallar('no se pudo consultar GitHub (git fetch origin).', 'Revisa la conexión y vuelve a intentarlo.');
  }
  const remotas = git('branch', '-r', '--contains', 'HEAD');
  if (!remotas) {
    fallar(
      `el commit ${commit} no está en GitHub.`,
      `Haz push primero (git push origin ${git('rev-parse', '--abbrev-ref', 'HEAD')}).`,
    );
  }
  console.log(`Publicando ${commit} (en GitHub: ${remotas.split('\n').map((r) => r.trim()).join(', ')})`);
} else {
  console.warn(`\nATENCIÓN: KP_PUBLICAR_SIN_GIT=1, se publica sin comprobar GitHub (${commit}).\n`);
}

const correr = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
correr('npm', ['run', 'build']);
const mensaje = (forzado ? '[SIN GIT] ' : '') + commit;
correr('npx', ['wrangler', 'deploy', '--message', mensaje.slice(0, 100), ...process.argv.slice(2)]);
