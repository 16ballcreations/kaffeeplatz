/**
 * d1-cli.mjs — consultar D1 desde un script de Node.
 *
 * POR QUE NO SE USA `wrangler d1 execute --json`
 * ===========================================================================
 * Es lo primero que se intenta y no sirve para esto: la salida mezcla el JSON
 * con los avisos de la propia herramienta ("update available", "Resource
 * location: local"...), que van a stdout y cambian de versión a versión.
 * Parsear eso es construir una dependencia sobre el formato de los mensajes de
 * wrangler, que no es una interfaz estable.
 *
 * Contra `--local` hay un camino mejor y es el que se usa: la base ES un
 * fichero SQLite en `.wrangler/state/v3/d1/`, y Node trae un cliente de SQLite
 * desde la 22 (`node:sqlite`). Se lee el fichero directamente, en SOLO
 * LECTURA.
 *
 * ESTO ES UNA HERRAMIENTA DE VERIFICACIÓN, NO LA CAPA DE DATOS DEL SITIO
 * ---------------------------------------------------------------------------
 * El sitio NUNCA lee así: habla con D1 por el binding `env.DB` a través de
 * `src/datos/`, que es la única frontera con la base (F.1 del plan). Este
 * módulo existe para que `comparar-d1.mjs` pueda mirar dentro de la base de
 * desarrollo desde Node, y para nada más.
 *
 * CONTRA `--remote` NO FUNCIONA, A PROPÓSITO
 * ---------------------------------------------------------------------------
 * No hay fichero que leer. Comparar contra remoto se hace con
 * `wrangler d1 execute --remote --json` desde una sesión con credenciales, y
 * esta fase no toca Cloudflare. Si se pide `--remote`, el script lo dice y sale
 * en vez de fingir que comprobó algo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './contenido.mjs';

/**
 * `node:sqlite` existe desde Node 22. El README del proyecto dice "Node 20"
 * porque Astro 5.18 es la última rama que lo soporta, así que un
 * desarrollador puede estar en 20 legítimamente. Se importa de forma perezosa
 * y, si no está, se explica qué hacer en vez de reventar con un
 * "Cannot find module 'node:sqlite'" que no dice nada.
 *
 * Importante: esto afecta SOLO a esta herramienta de verificación. El sitio no
 * la usa, así que la versión de Node del despliegue no tiene nada que ver.
 */
async function cargarSqlite() {
  try {
    return (await import('node:sqlite')).DatabaseSync;
  } catch {
    throw new Error(
      `comparar-d1 necesita el módulo 'node:sqlite', que existe desde Node 22 ` +
        `(aquí hay ${process.version}).\n` +
        'Es solo para esta comprobación: el sitio no lo usa y sigue funcionando en Node 20.\n' +
        'Alternativa sin cambiar de Node: comprobar a mano con\n' +
        '  npx wrangler d1 execute kaffeeplatz --local --command "SELECT COUNT(*) FROM productos"',
    );
  }
}

const DIR_ESTADO = path.join(RAIZ, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

/** Abre la base local de desarrollo en solo lectura. */
export async function abrirLocal() {
  const DatabaseSync = await cargarSqlite();
  let ficheros = [];
  try {
    ficheros = fs
      .readdirSync(DIR_ESTADO)
      .filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  } catch {
    /* El directorio no existe: nunca se corrió una migración en local. */
  }
  if (!ficheros.length) {
    throw new Error(
      'No hay base D1 local. Créala con:\n' +
        '  npx wrangler d1 migrations apply kaffeeplatz --local\n' +
        '  node scripts/sembrar-d1.mjs\n' +
        '  npx wrangler d1 execute kaffeeplatz --local --file tmp/semilla.sql',
    );
  }
  if (ficheros.length > 1) {
    throw new Error(
      `Hay ${ficheros.length} bases en ${path.relative(RAIZ, DIR_ESTADO)} y no se puede ` +
        'saber cuál es la del catálogo. Borra el directorio y vuelve a aplicar las migraciones.',
    );
  }
  const db = new DatabaseSync(path.join(DIR_ESTADO, ficheros[0]), { readOnly: true });
  return {
    /** Todas las filas de una consulta, como objetos planos. */
    todas(sql, ...params) {
      return db.prepare(sql).all(...params);
    },
    cerrar() {
      db.close();
    },
  };
}
