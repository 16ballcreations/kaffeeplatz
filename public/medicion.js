/* Medición con Microsoft Clarity y su aviso. El mismo archivo vive en los
   sitios de 16BC (16bc-site, modularity-site, kaffeeplatz); PsicoFormando
   tiene su propia versión en Medicion.astro, que además maneja el píxel de Meta.

   Se usa así, al final del <head>:
     <script src="/medicion.js" data-clarity="ID_DEL_PROYECTO"
             data-privacidad="/privacidad/" defer></script>

   El modelo es el de PsicoFormando (08/11/2026):
     Europa  se pregunta antes (RGPD): no se carga nada hasta que la persona
             dice que sí.
     Resto   Clarity carga desde el principio y el aviso solo informa, con la
             opción de decir que no. Decir que no lo apaga, borra sus cookies
             y queda recordado.
   «Europa» se deduce de la zona horaria del navegador.

   Clarity mide cuánto tiempo pasa cada quien en la página, hasta dónde baja
   y dónde hace clic (mapas de calor). Los campos de formulario se enmascaran
   (modo «Balanced» del proyecto en Clarity) y no se usa para anuncios.

   La respuesta se guarda en el navegador de cada quien. Un botón o enlace con
   [data-cambiar-medicion] la borra y vuelve a mostrar el aviso.

   Colores: el aviso toma --medicion-fondo, --medicion-texto, --medicion-borde
   y --medicion-acento si el sitio los define; si no, usa los de abajo. */
(function () {
  var etiqueta = document.currentScript;
  var CLARITY = etiqueta && etiqueta.getAttribute('data-clarity');
  if (!CLARITY) return;
  var PRIVACIDAD = (etiqueta.getAttribute('data-privacidad')) || '/privacidad/';
  var LLAVE = 'medicion';
  var ingles = /^en\b/i.test(document.documentElement.lang || '');

  var TEXTOS = ingles ? {
    preguntar: 'May we measure how people read this site? We use Microsoft Clarity: time on each page, how far you scroll and where you click. Nothing you type is recorded. If you prefer not, the site works the same.',
    informar: 'We use Microsoft Clarity to see how people read this site: time on each page, how far you scroll and where you click. Nothing you type is recorded. If you prefer not, we turn it off and the site works the same.',
    enlace: 'How we handle your data',
    no: 'No, thanks',
    si: 'Accept',
    entendido: 'Got it'
  } : {
    preguntar: '¿Nos dejas medir cómo se lee el sitio? Usamos Microsoft Clarity: cuánto tiempo pasas en cada página, hasta dónde bajas y dónde haces clic. No guarda nada de lo que escribes. Si prefieres que no, el sitio funciona igual.',
    informar: 'Usamos Microsoft Clarity para ver cómo se lee el sitio: cuánto tiempo pasas en cada página, hasta dónde bajas y dónde haces clic. No guarda nada de lo que escribes. Si prefieres que no, lo apagamos y el sitio funciona igual.',
    enlace: 'Cómo tratamos tus datos',
    no: 'No, gracias',
    si: 'Aceptar',
    entendido: 'Entendido'
  };

  function enEuropa() {
    try {
      var zona = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      return /^Europe\//.test(zona) || ['Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores', 'Africa/Ceuta'].indexOf(zona) !== -1;
    } catch (e) {
      // Sin forma de saberlo, lo prudente es preguntar.
      return true;
    }
  }

  function recordado() {
    try { return localStorage.getItem(LLAVE); }
    // Navegación privada o almacenamiento bloqueado: se trata como un no.
    catch (e) { return 'no'; }
  }

  function guardar(respuesta) {
    try { localStorage.setItem(LLAVE, respuesta); } catch (e) { /* vale para esta visita */ }
  }

  function arrancar() {
    if (!window.clarity) {
      (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
      })(window, document, 'clarity', 'script', CLARITY);
    }
    window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
  }

  // Decir que no después de que Clarity arrancó: deja de guardar y se borran
  // sus cookies. En la próxima página ya no se carga.
  function apagar() {
    if (window.clarity) {
      window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
      window.clarity('consent', false);
    }
    var dominio = location.hostname.replace(/^www\./, '');
    ['_clck', '_clsk', 'CLID', 'ANONCHK', 'MR', 'MUID', 'SM'].forEach(function (nombre) {
      document.cookie = nombre + '=; Max-Age=0; path=/';
      document.cookie = nombre + '=; Max-Age=0; path=/; domain=.' + dominio;
    });
  }

  var aviso = null;

  function crearAviso() {
    var estilo = document.createElement('style');
    estilo.textContent =
      '.aviso-medicion{position:fixed;z-index:9999;left:16px;right:16px;bottom:16px;max-width:560px;margin-inline:auto;' +
      'display:grid;gap:14px;padding:20px 22px;border-radius:16px;' +
      'background:var(--medicion-fondo,#111);color:var(--medicion-texto,#eee);' +
      'border:1px solid var(--medicion-borde,rgba(255,255,255,.14));box-shadow:0 24px 48px -24px rgba(0,0,0,.7);' +
      'font:15px/1.5 inherit;font-family:inherit}' +
      '.aviso-medicion[hidden]{display:none}' +
      '.aviso-medicion p{margin:0}' +
      '.aviso-medicion a{color:inherit;text-decoration:underline;text-underline-offset:3px}' +
      '.aviso-medicion .botones{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}' +
      '.aviso-medicion button{font:inherit;cursor:pointer;padding:10px 20px;border-radius:999px;' +
      'border:1px solid var(--medicion-borde,rgba(255,255,255,.24));background:transparent;color:inherit}' +
      '.aviso-medicion button[data-responde="si"]{background:var(--medicion-acento,#fff);' +
      'border-color:var(--medicion-acento,#fff);color:var(--medicion-fondo,#111)}' +
      '@media (max-width:560px){.aviso-medicion{left:8px;right:8px;bottom:8px;gap:10px;padding:16px;font-size:14px;line-height:1.45}' +
      '.aviso-medicion .botones{flex-wrap:nowrap}.aviso-medicion button{flex:1;padding:10px 12px}}';
    document.head.appendChild(estilo);

    aviso = document.createElement('div');
    aviso.className = 'aviso-medicion';
    aviso.setAttribute('role', 'region');
    aviso.setAttribute('aria-label', ingles ? 'Measurement notice' : 'Aviso de medición');
    aviso.hidden = true;
    var p = document.createElement('p');
    var a = document.createElement('a');
    a.href = PRIVACIDAD;
    a.textContent = TEXTOS.enlace;
    var botones = document.createElement('div');
    botones.className = 'botones';
    var no = document.createElement('button');
    no.type = 'button'; no.setAttribute('data-responde', 'no'); no.textContent = TEXTOS.no;
    var si = document.createElement('button');
    si.type = 'button'; si.setAttribute('data-responde', 'si');
    botones.appendChild(no); botones.appendChild(si);
    aviso.appendChild(p); aviso.appendChild(botones);
    aviso._texto = p; aviso._enlace = a; aviso._si = si;
    aviso.addEventListener('click', function (evento) {
      var boton = evento.target.closest('[data-responde]');
      if (boton) responder(boton.getAttribute('data-responde'));
    });
    document.body.appendChild(aviso);
  }

  function mostrarAviso(modelo) {
    if (!aviso) crearAviso();
    aviso._texto.textContent = TEXTOS[modelo] + ' ';
    aviso._texto.appendChild(aviso._enlace);
    aviso._si.textContent = modelo === 'informar' ? TEXTOS.entendido : TEXTOS.si;
    aviso.hidden = false;
  }

  function responder(respuesta) {
    guardar(respuesta);
    if (aviso) aviso.hidden = true;
    if (respuesta === 'si') arrancar();
    else apagar();
  }

  function iniciar() {
    document.addEventListener('click', function (evento) {
      if (!evento.target.closest('[data-cambiar-medicion]')) return;
      evento.preventDefault();
      try { localStorage.removeItem(LLAVE); } catch (e) {}
      if (enEuropa()) { apagar(); mostrarAviso('preguntar'); }
      else { arrancar(); mostrarAviso('informar'); }
    });

    var yaRespondio = recordado();
    if (yaRespondio === 'si') arrancar();
    else if (yaRespondio === 'no') { /* nada: no se carga */ }
    else if (enEuropa()) mostrarAviso('preguntar');
    else { arrancar(); mostrarAviso('informar'); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
