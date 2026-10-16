/**
 * Lectura de colecciones con ORDEN ESTABLE.
 *
 * getCollection() devuelve las entradas en el orden en que el sistema de
 * archivos las entrega, y ese orden cambia de un equipo a otro. Como luego
 * las paginas ordenan por fecha, precio o "destacado", cuando hay empates el
 * resultado dependia de que equipo construyera el sitio: el mosaico de la
 * portada, el indice del diario o los relacionados salian distintos segun
 * desde donde se publicara.
 *
 * Aqui se ordenan por id (el nombre del archivo) con una comparacion simple,
 * sin reglas de idioma, que da lo mismo en cualquier maquina. Array.sort es
 * estable, asi que cualquier orden posterior desempata por este.
 *
 * Usar SIEMPRE esto en lugar de getCollection.
 */
import { getCollection, type CollectionEntry, type CollectionKey } from 'astro:content';

export async function coleccion<C extends CollectionKey>(nombre: C): Promise<CollectionEntry<C>[]> {
  const entradas = await getCollection(nombre);
  return entradas.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
