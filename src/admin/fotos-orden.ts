/**
 * fotos-orden.ts — cómo se reordenan las fotos de un producto, sin base ni DOM.
 *
 * UN SOLO ORDEN POR PRODUCTO, REORDENADO POR GRUPOS
 * ===========================================================================
 * `imagenes.orden` se lee en la tienda tal cual: `ORDER BY i.orden, i.id`
 * (consultas/productos.ts). La foto grande de la ficha y la de la tarjeta del
 * catálogo son LA PRIMERA de esa lista. La semilla dejó cada producto numerado
 * 0, 1, 2... en el orden del JSON, y con eso las 30 fotos de hoy se ven como
 * se veían.
 *
 * La dueña, en cambio, piensa por grupos: «las tres del Morado», «las del
 * producto». Subir o bajar una foto se hace DENTRO de su grupo y no debe mover
 * las del Verde. La forma de conseguir las dos cosas a la vez es esta: el orden
 * sigue siendo uno solo para todo el producto, y mover dentro de un grupo
 * intercambia posiciones solo entre fotos de ese grupo. Las demás no se
 * enteran, y la tienda no necesita saber que existen los grupos.
 *
 * LAS PORTADAS SON «LA PRIMERA», Y POR ESO NO HAY DOS VERDADES
 * ---------------------------------------------------------------------------
 * El esquema tiene `productos.portada_id` y `variantes.portada_id` (0001). Si
 * fueran un dato aparte del orden, la tienda (que pinta la primera) y la
 * portada guardada podrían discrepar, y cada lectura tendría que decidir cuál
 * manda. Aquí no discrepan nunca: «usar como portada» es LLEVARLA AL FRENTE, y
 * las dos columnas se recalculan en cada escritura a partir del orden
 * (`sincronizarPortadas` en consultas/imagenes-escribir.ts). Quien lea
 * `portada_id` en el futuro —las tarjetas del catálogo, por ejemplo— verá lo
 * mismo que se ve hoy.
 *
 * Consecuencia que el panel explica en pantalla: la portada del producto es
 * también la primera de su color. Si la dueña elige como portada del Morado
 * otra foto, esa pasa por delante y, si la del producto era del Morado, la
 * portada del producto pasa a ser la nueva. Es la única regla coherente con
 * «la primera es la portada», y es lo que ella va a ver en la tienda.
 */

export interface FotoOrden {
  id: number;
  /** Grupo de reordenación: ver `grupoDe`. */
  grupo: string;
}

/** Las fotos por revisar van aparte: todavía no son de ningún color. */
export function grupoDe(f: { varianteId: number | null; porRevisar: boolean }): string {
  if (f.porRevisar) return 'revisar';
  return f.varianteId === null ? 'producto' : `v${f.varianteId}`;
}

/** Sube (−1) o baja (+1) una foto dentro de su grupo. `null` si no se puede. */
export function mover(lista: FotoOrden[], id: number, paso: -1 | 1): number[] | null {
  const i = lista.findIndex((f) => f.id === id);
  if (i < 0) return null;
  const grupo = lista[i]!.grupo;
  let j = i + paso;
  while (j >= 0 && j < lista.length && lista[j]!.grupo !== grupo) j += paso;
  if (j < 0 || j >= lista.length) return null;
  const ids = lista.map((f) => f.id);
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  return ids;
}

/**
 * Reparte un orden nuevo DENTRO de un grupo (lo que manda el arrastre).
 * Las fotos del grupo ocupan los mismos huecos que antes; solo cambia quién va
 * en cada uno. `null` si los ids no son exactamente los del grupo.
 */
export function ordenarGrupo(lista: FotoOrden[], grupo: string, nuevos: number[]): number[] | null {
  const huecos = lista.map((f, i) => (f.grupo === grupo ? i : -1)).filter((i) => i >= 0);
  const actuales = new Set(huecos.map((i) => lista[i]!.id));
  if (nuevos.length !== huecos.length || new Set(nuevos).size !== nuevos.length) return null;
  if (!nuevos.every((id) => actuales.has(id))) return null;
  const ids = lista.map((f) => f.id);
  huecos.forEach((h, k) => (ids[h] = nuevos[k]!));
  return ids;
}

/** Portada del producto: al frente de todo. El resto conserva su orden. */
export function alFrente(lista: FotoOrden[], id: number): number[] | null {
  if (!lista.some((f) => f.id === id)) return null;
  return [id, ...lista.map((f) => f.id).filter((x) => x !== id)];
}

/** Portada de su variante: al frente de su grupo. */
export function alFrenteDelGrupo(lista: FotoOrden[], id: number): number[] | null {
  const f = lista.find((x) => x.id === id);
  if (!f) return null;
  const delGrupo = lista.filter((x) => x.grupo === f.grupo).map((x) => x.id);
  return ordenarGrupo(lista, f.grupo, [id, ...delGrupo.filter((x) => x !== id)]);
}
