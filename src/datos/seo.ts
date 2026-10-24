/**
 * SEO: lo que Google lee de cada pagina y que no es el texto visible.
 *
 * TITULOS DE PRODUCTO
 * El <title> de cada ficha dice QUE es el producto con las palabras con que
 * se busca ("cafetera", "dripper", "filtro de papel para..."), no solo su
 * nombre comercial. El nombre visible (h1) no cambia. Cada tipo sale de la
 * descripcion real del producto; no se inventa nada. Un producto sin entrada
 * aqui usa su titulo tal cual.
 *
 * MARCAS
 * Solo cuando el titulo o la descripcion la dicen explicitamente. Si no hay
 * marca conocida, el dato se omite: antes todos decian "KaffeePlatz", que es
 * la tienda (ya figura como vendedor en la oferta), no el fabricante.
 */

export const TITULO_PRODUCTO: Record<string, string> = {
  'aeropress-clear': 'AeroPress Clear: cafetera de presión manual',
  aeropress: 'AeroPress Original: cafetera de presión manual',
  chemex: 'Chemex Original: cafetera de filtro de 3 y 6 tazas',
  'dripper-de-vidrio': 'V60 Petal Glass: dripper de vidrio para café filtrado',
  'dripper-flor-de-loto': 'V60 Suiren: dripper para café filtrado',
  'filtro-acero-para-aeropress': 'Filtro de acero reutilizable para AeroPress',
  'filtro-de-acero-chemex-3-tazas': 'Filtro de acero reutilizable para Chemex de 3 tazas',
  'filtro-de-acero-v60': 'Filtro de acero reutilizable para V60',
  'filtros-chemex': 'Filtros de papel Chemex',
  'filtros-v60': 'Filtros de papel Hario V60 02',
  'grameras-digital': 'Gramera digital para café Nknove',
  'hario-switch': 'Hario V60 Switch: dripper con válvula',
  'hario-v60-mugen': 'Hario V60 Mugen: dripper para café filtrado',
  'hervidor-brewista': 'Hervidor Brewista cuello de ganso con control de temperatura',
  'hervidor-mango-de-madera': 'Jarra cuello de ganso 600 ml para café',
  'micro-filters-aeroprees': 'Filtros de papel para AeroPress',
  'molino-manual-timemore-c3-esp-pro': 'Molino manual Timemore C3 ESP Pro',
  'prensa-francesa-acero-inoxidable': 'Prensa francesa de acero inoxidable',
  'prensa-francesa': 'Prensa francesa para café',
  server: 'Server de vidrio para café',
  'servex-hario': 'Server Hario 02 de vidrio',
  'set-hario-v60': 'Set Hario V60: kit para café filtrado',
  termometro: 'Termómetro para café',
  'v60-de-vidrio': 'V60 Glass: dripper de vidrio',
};

export const MARCA_PRODUCTO: Record<string, string> = {
  'aeropress-clear': 'AeroPress',
  aeropress: 'AeroPress',
  chemex: 'Chemex',
  'filtros-chemex': 'Chemex',
  'filtros-v60': 'Hario',
  'hario-switch': 'Hario',
  'hario-v60-mugen': 'Hario',
  'servex-hario': 'Hario',
  'set-hario-v60': 'Hario',
  'grameras-digital': 'Nknove',
  'hervidor-brewista': 'Brewista',
  'molino-manual-timemore-c3-esp-pro': 'Timemore',
};

/**
 * Recorta un texto para meta description sin partir palabras (~155
 * caracteres, lo que Google suele mostrar). Antes se cortaba en seco a 160.
 */
export function recortar(texto: string, max = 155): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max - 1);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > 80 ? corte.slice(0, espacio) : corte).replace(/[\s,;:.]+$/, '')}…`;
}
