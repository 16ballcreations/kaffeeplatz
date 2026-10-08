/**
 * base.ts — los tres comportamientos del armazon del sitio.
 * ===========================================================================
 *
 * Son tres piezas pequeñas e independientes que estaban en linea dentro de
 * `src/layouts/Base.astro`. Se sacan aqui porque ese layout paso de 300
 * lineas al separar las condiciones de los dos flotantes, y el limite del
 * repo son ~300 por fichero. El layout se queda con lo que es: la estructura
 * de la pagina. Ninguna de las tres tiene nada que ver con las otras ni con
 * el marcado concreto mas alla de un par de selectores de datos.
 *
 *   1. Revelado al entrar en pantalla.
 *   2. Cabecera que se compacta al bajar.
 *   3. Menu movil que se cierra con Escape o al elegir un enlace.
 *
 * Las tres degradan solas: sin JavaScript todo se ve, la cabecera se queda en
 * su estado normal y el menu sigue abriendo y cerrando porque es un
 * `<details>` nativo.
 */

/* ---------------------------------------------------------------------------
   1. REVELADO AL ENTRAR EN PANTALLA

   La clase que OCULTA (.v-js) la pone este script, no el CSS: sin JS, o con
   movimiento reducido, todo se ve desde el principio y no hay forma de que
   algo quede invisible para siempre porque un observador no llego a correr.
   --------------------------------------------------------------------------- */
const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const piezas = document.querySelectorAll<HTMLElement>('[data-v-revelar]');
if (!reducir && 'IntersectionObserver' in window && piezas.length) {
  document.documentElement.classList.add('v-js');
  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('v-visto');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  piezas.forEach((p) => io.observe(p));
}

/* ---------------------------------------------------------------------------
   2. CABECERA COMPACTA AL BAJAR

   Un centinela de 1px en lo alto de la pagina evita escuchar el evento
   `scroll`, que se dispara decenas de veces por segundo.
   --------------------------------------------------------------------------- */
const cabecera = document.querySelector<HTMLElement>('[data-kp-cabecera]');
if (cabecera && 'IntersectionObserver' in window) {
  const centinela = document.createElement('div');
  centinela.setAttribute('aria-hidden', 'true');
  centinela.style.cssText =
    'position:absolute;top:0;left:0;width:1px;height:40px;pointer-events:none';
  document.body.prepend(centinela);
  new IntersectionObserver(([e]) => {
    cabecera.toggleAttribute('data-compacta', !e.isIntersecting);
  }).observe(centinela);
}

/* ---------------------------------------------------------------------------
   3. MENU MOVIL

   El `<details>` ya abre y cierra solo. Esto añade lo que el navegador no
   da: cerrar con Escape (devolviendo el foco al disparador) y cerrar al
   elegir un enlace, para que al volver atras el menu no siga abierto.
   --------------------------------------------------------------------------- */
const menu = document.querySelector<HTMLDetailsElement>('.v-menu');
if (menu) {
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
  menu.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      menu.open = false;
    }),
  );
}
