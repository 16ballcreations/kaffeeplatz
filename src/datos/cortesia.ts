/**
 * cortesia.ts — la página que se sirve cuando la base no responde Y no hay
 * copia en caché.
 *
 * Es el último recurso de la capa 3 de R1, y la única página del sitio que NO
 * puede depender de nada: ni de D1, ni de la caché, ni de un layout de Astro
 * que importe un componente que lea datos. Por eso es una plantilla de texto en
 * un `.ts` y no un `.astro`: si esta página necesitara renderizarse con el
 * pipeline normal, compartiría modos de fallo con lo que ha fallado.
 *
 * QUE LLEVA, Y POR QUE TAN POCO
 * ---------------------------------------------------------------------------
 * Un título que no asusta, el WhatsApp de la dueña y un enlace a la portada.
 * Nada más. La persona que ve esto venía a comprar: lo útil no es explicarle lo
 * que pasó, es darle la forma de hablar con Andreina, que es como se cierra una
 * venta en esta tienda de todos modos (no hay pago en línea).
 *
 * No lleva CSS del sitio a propósito. `v2.css` son 3.464 líneas que se sirven
 * como asset: si el Worker está teniendo problemas, no conviene que esta página
 * dependa de otra petición. Los estilos van en línea, son veinte reglas, y usan
 * los colores de la marca (marca/MARCA.md) para que no parezca una página de
 * error de otro sitio.
 *
 * `noindex` es deliberado: esta página no debe acabar en Google NUNCA. El 503
 * ya le dice a Google que vuelva luego; el `noindex` es el cinturón por si
 * alguna vez se sirviera con otro estado por error.
 */

import { SITIO } from './sitio';

/** El HTML completo de la página de cortesía. Sin dependencias externas. */
export function paginaDeCortesia(): string {
  const wa = `https://wa.me/${SITIO.whatsappNumero}?text=${encodeURIComponent(
    'Hola KaffeePlatz, entré a la tienda y no cargó. ¿Me ayudan?',
  )}`;
  return `<!DOCTYPE html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Volvemos en un momento · ${SITIO.nombre}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: #12100D; color: #F4EFE3;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.6; text-align: center;
  }
  main { max-width: 32rem; }
  h1 { font-size: clamp(1.6rem, 5vw, 2.4rem); margin: 0 0 1rem; font-weight: 600; letter-spacing: -0.01em; }
  p { margin: 0 0 1.5rem; color: #D6CDBA; }
  .wa {
    display: inline-flex; align-items: center; gap: .5rem;
    background: #DEC185; color: #1A1A1A; text-decoration: none;
    padding: .85rem 1.5rem; border-radius: 999px; font-weight: 600;
    /* El oro relleno con texto oscuro da 10:1 de contraste (README, "Regla del
       oro"): como relleno es correcto, como texto sobre oscuro no lo sería. */
  }
  .wa:hover { background: #E8D2A1; }
  .otra { display: block; margin-top: 1.5rem; }
  .otra a { color: #DEC185; }
  small { display: block; margin-top: 2.5rem; color: #8C8372; font-size: .8rem; }
</style>
</head>
<body>
<main>
  <h1>Volvemos en un momento</h1>
  <p>
    Estamos teniendo un problema técnico para mostrar el catálogo. Dura poco, y
    mientras tanto puedes escribirnos: te responde ${SITIO.dueña}.
  </p>
  <a class="wa" href="${wa}">Escribir por WhatsApp</a>
  <span class="otra"><a href="/">Volver a la portada</a></span>
  <small>${SITIO.nombre} · ${SITIO.ciudad}</small>
</main>
</body>
</html>
`;
}
