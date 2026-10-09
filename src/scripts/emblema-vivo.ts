/**
 * emblema-vivo.ts — el emblema de la portada, hecho de partículas.
 * ===========================================================================
 * Ocupa el lado derecho del hero, donde antes iba la foto del AeroPress. Un
 * polvo dorado flota en el hero; desde abajo crece la matica del logo, tomada
 * punto por punto de su imagen aislada (planta-oro): sube el tallo, salen las
 * ramas, se abren las hojas y las bayas pasan de verde a oro y maduran a rojo.
 * Con las bayas ya rojas se cierra el resto del emblema: el anillo doble y
 * KAFFEEPLATZ atravesando el tallo. La matica sigue meciéndose dentro del
 * logo; el cursor aparta las partículas y vuelven.
 *
 * Misma técnica que el orbe de 16 Ball Creations: canvas 2D sin librerías, los
 * puntos agrupados por color y brillo para que un cuadro sean unas decenas de
 * trazos y no miles. La planta sale de la imagen del logo y el nombre de una
 * máscara de texto, así que si cambia el logo basta con cambiar la imagen.
 *
 * El texto, los botones y el SEO del hero siguen siendo HTML; nada depende de
 * esto. Con «reducir movimiento» se pinta el emblema ya completo y quieto. Se
 * pausa cuando el hero sale de pantalla o la pestaña se oculta.
 */

type Punto = {
  x: number; y: number; c: number; a: number; b: number;
  k: number; ox: number; oy: number; r: number; hf: number; banda: boolean;
};
type Marca = { x: number; y: number; c: number; a: number; b: number; ox: number; oy: number };

const hero = document.querySelector<HTMLElement>('[data-kp-emblema-hero]');
const lienzo = document.querySelector<HTMLCanvasElement>('[data-kp-emblema-lienzo]');
const zona = document.querySelector<HTMLElement>('[data-kp-emblema]');
const ctx = lienzo?.getContext('2d');
if (hero && lienzo && zona && ctx) iniciar(hero, lienzo, zona, ctx);

function iniciar(hero: HTMLElement, lienzo: HTMLCanvasElement, zona: HTMLElement, ctx: CanvasRenderingContext2D) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  /* ---------- paleta y dibujo por lotes ---------- */
  const COL = [
    [253, 247, 231], // 0 crema
    [233, 211, 163], // 1 oro claro
    [222, 193, 133], // 2 oro
    [184, 154, 94], //  3 oro medio
    [143, 110, 62], //  4 oro hondo
    [214, 104, 74], //  5 cereza
    [168, 64, 44], //   6 cereza honda
    [156, 168, 98], //  7 verde
  ];
  const LV = 6;
  const lotes: number[][] = [];
  const relleno: string[] = [];
  for (const c of COL) for (let l = 0; l < LV; l++) {
    lotes.push([]);
    relleno.push(`rgba(${c.join(',')},${((l + 0.5) / LV).toFixed(3)})`);
  }
  const put = (c: number, a: number, x: number, y: number, s: number) => {
    if (a < 0.03) return;
    const l = Math.min(LV - 1, (a * LV) | 0);
    lotes[c * LV + l].push(x - s / 2, y - s / 2, s);
  };
  const vaciar = () => { for (const L of lotes) L.length = 0; };
  const pintar = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < lotes.length; i++) {
      const L = lotes[i];
      if (!L.length) continue;
      ctx.fillStyle = relleno[i];
      ctx.beginPath();
      for (let j = 0; j < L.length; j += 3) ctx.rect(L[j], L[j + 1], L[j + 2], L[j + 2]);
      ctx.fill();
      L.length = 0;
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  /* ---------- azar con semilla: la rama sale igual en cada visita ---------- */
  let semillaActual = 1;
  const semilla = (n: number) => { semillaActual = n >>> 0 || 1; };
  const R = () => {
    semillaActual |= 0; semillaActual = (semillaActual + 0x6d2b79f5) | 0;
    let t = Math.imul(semillaActual ^ (semillaActual >>> 15), 1 | semillaActual);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const suave = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

  /* ---------- medida ---------- */
  let W = 0, H = 0, dpr = 1, estrecho = false;
  let reg = { x: 0, y: 0, w: 1, h: 1 };
  const ptr = { x: -1e4, y: -1e4 };
  const medir = () => {
    const hr = hero.getBoundingClientRect(), zr = zona.getBoundingClientRect();
    W = hr.width; H = hr.height;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    lienzo.width = Math.round(W * dpr); lienzo.height = Math.round(H * dpr);
    estrecho = W < 860;
    reg = { x: zr.left - hr.left, y: zr.top - hr.top, w: zr.width, h: zr.height };
  };
  const CAJA = 600;
  const encajar = () => {
    const s = Math.min(reg.w, reg.h) / CAJA;
    return { s, ox: reg.x + (reg.w - CAJA * s) / 2, oy: reg.y + (reg.h - CAJA * s) / 2 };
  };
  /* separación entre puntos, en unidades de la caja: unos 3 px en pantalla */
  const paso = () => Math.min(6, Math.max(2.2, 3.2 / (Math.min(reg.w, reg.h) / CAJA)));
  const tam = () => (estrecho ? 1.25 : 1.55);

  /* ---------- polvo de ambiente en todo el hero ---------- */
  let motas: { x: number; y: number; v: number; f: number; a: number }[] = [];
  const sembrarMotas = () => {
    motas = [];
    for (let i = 0, n = estrecho ? 60 : 120; i < n; i++)
      motas.push({ x: Math.random() * W, y: Math.random() * H, v: 4 + Math.random() * 8, f: Math.random() * 6.28, a: 0.08 + Math.random() * 0.14 });
  };
  const moverMotas = (dt: number, T: number) => {
    for (const m of motas) {
      m.y -= m.v * dt; m.x += Math.sin(T * 0.4 + m.f) * 4 * dt;
      if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; }
      put(3, m.a, m.x, m.y, 1.2);
    }
  };

  /* ---------- muestreo de una máscara dibujada ---------- */
  const mascara = (w: number, h: number, st: number, dibujar: (m: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const m = c.getContext('2d');
    const out: { x: number; y: number }[] = [];
    if (!m) return out;
    dibujar(m);
    const d = m.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y += st) for (let x = 0; x < w; x += st) {
      if (d[((y | 0) * w + (x | 0)) * 4 + 3] > 120) out.push({ x: x + (R() - 0.5) * st * 0.5, y: y + (R() - 0.5) * st * 0.5 });
    }
    return out;
  };

  /* ======================================================================
     LA MATICA
     Sale de la imagen aislada de la planta del logo (planta-oro): cada punto
     es un píxel de la imagen, con su tono. Medidas en la imagen de 900 px de
     ancho; el tramo desnudo del tallo (y≈492) queda detrás del nombre, como
     en el emblema, y el pie del tallo se corta en el anillo.
     ====================================================================== */
  const KS = 0, KC = 2; // tallo y hojas, bayas
  const CREC = 5.2; // segundos que tarda la matica en crecer entera
  const K = 0.42, TALLO_X = 413, TRAMO_Y = 492;
  /* las bayas de la imagen (x, y, radio en la de 900): las tres de arriba,
     las dos del centro y los dos puntos sueltos */
  const BAYAS = [[410, 42, 42], [325, 118, 40], [500, 125, 40], [330, 608, 32], [497, 598, 32], [268, 575, 26], [568, 568, 24]];
  let pivoteY = 560;

  function genMatica(img: HTMLImageElement, st: number) {
    const w = img.naturalWidth, h = img.naturalHeight, f = 900 / w;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const m = c.getContext('2d', { willReadFrequently: true });
    if (!m) return [];
    m.drawImage(img, 0, 0);
    const d = m.getImageData(0, 0, w, h).data;
    const pi = st / K / f; // separación en píxeles de la imagen
    const cols = Math.ceil(w / pi), filas = Math.ceil(h / pi);
    const celda = new Int32Array(cols * filas).fill(-1);
    const pts: Punto[] = [], gx: number[] = [], gy: number[] = [];
    for (let j = 0; j < filas; j++) for (let i = 0; i < cols; i++) {
      const ix = Math.min(w - 1, ((i + 0.5) * pi) | 0), iy = Math.min(h - 1, ((j + 0.5) * pi) | 0);
      const o = (iy * w + ix) * 4;
      if (d[o + 3] < 128) continue;
      const X = ix * f, Y = iy * f;
      const x = 300 + (X - TALLO_X) * K + (R() - 0.5) * st * 0.4;
      const y = BANDA + (Y - TRAMO_Y) * K + (R() - 0.5) * st * 0.4;
      if ((x - 300) ** 2 + (y - 300) ** 2 > 262 * 262) continue; // dentro del anillo
      // el degradado de la imagen (claro arriba, tostado abajo) pasa a la paleta
      const lum = 0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2];
      // (un escalón más claro que la imagen: sobre el lino oscuro el tostado
      // de abajo se apagaba)
      const col = lum > 200 ? 1 : lum > 160 ? 2 : lum > 115 ? 3 : 4;
      const baya = BAYAS.some(([bx, by, br]) => (X - bx) ** 2 + (Y - by) ** 2 < br * br);
      celda[j * cols + i] = pts.length;
      gx.push(i); gy.push(j);
      pts.push({ x, y, c: col, a: col === 4 ? 0.9 : 1, b: 0, k: baya ? KC : KS, ox: x, oy: y, r: R(), hf: 0, banda: false });
    }
    const n = pts.length;
    if (!n) return pts;

    /* Orden de crecimiento: distancia caminando por la planta desde el pie
       del tallo. Así sube el tallo, salen las ramas y las hojas se abren
       desde donde se pegan. Cada punto nace donde está su vecino anterior. */
    const dist = new Float32Array(n).fill(Infinity), padre = new Int32Array(n).fill(-1);
    let raiz = 0;
    for (let i = 1; i < n; i++) if (pts[i].y > pts[raiz].y || (pts[i].y === pts[raiz].y && Math.abs(pts[i].x - 300) < Math.abs(pts[raiz].x - 300))) raiz = i;
    dist[raiz] = 0;
    const cola = [raiz];
    for (let q = 0; q < cola.length; q++) {
      const u = cola[q];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const i = gx[u] + dx, j = gy[u] + dy;
        if (i < 0 || j < 0 || i >= cols || j >= filas) continue;
        const v = celda[j * cols + i];
        if (v < 0) continue;
        const nd = dist[u] + Math.hypot(dx, dy);
        if (nd < dist[v] - 1e-3) { dist[v] = nd; padre[v] = u; cola.push(v); }
      }
    }
    // piezas sueltas (los puntos y el grano de la izquierda): nacen después
    // del punto alcanzado más cercano, como si brotaran de él
    const alcanzados: number[] = [];
    for (let i = 0; i < n; i++) if (dist[i] < Infinity) alcanzados.push(i);
    for (let i = 0; i < n; i++) {
      if (dist[i] < Infinity) continue;
      let mejor = -1, md = Infinity;
      for (const v of alcanzados) {
        const dd = (gx[i] - gx[v]) ** 2 + (gy[i] - gy[v]) ** 2;
        if (dd < md) { md = dd; mejor = v; }
      }
      dist[i] = dist[mejor] + Math.sqrt(md) * 1.5; padre[i] = mejor;
    }
    let dmax = 0, arriba = Infinity;
    for (let i = 0; i < n; i++) { if (dist[i] > dmax) dmax = dist[i]; if (pts[i].y < arriba) arriba = pts[i].y; }
    pivoteY = pts[raiz].y;
    for (let i = 0; i < n; i++) {
      const p = pts[i], pa = padre[i] >= 0 ? pts[padre[i]] : p;
      p.b = (dist[i] / dmax) * CREC + R() * 0.06;
      p.ox = pa.x; p.oy = pa.y;
      p.hf = Math.max(0, Math.min(1, (pivoteY - p.y) / (pivoteY - arriba)));
      p.banda = Math.abs(p.y - BANDA) < 24;
    }
    return pts;
  }
  /* verde, luego oro, luego rojo; el umbral de cada punto es distinto para
     que el cambio se vea granulado y no de golpe */
  const madurez = (p: Punto, T: number) => {
    const f = (T - p.b - 0.3) / 1.6;
    if (f < p.r * 0.5) return 7;
    if (f < 0.5 + p.r * 0.5) return 2;
    return p.r < 0.3 ? 6 : 5;
  };

  /* ======================================================================
     EL RESTO DEL EMBLEMA, cuando las cerezas ya están rojas
     ====================================================================== */
  const LOGO = 7.4, BANDA = 300; // el logo se cierra con las bayas ya rojas
  function genEmblema(st: number) {
    const L: Marca[] = [];
    // el anillo doble, trazado desde abajo hacia los dos lados
    for (const [rad, c, a, d] of [[285, 2, 0.9, 0], [272, 3, 0.45, 0.3]]) {
      const n = Math.ceil((2 * Math.PI * rad) / (st * 0.8));
      for (let i = 0; i < n; i++) {
        const f = i / n, ang = Math.PI / 2 + (i % 2 ? 1 : -1) * f * Math.PI;
        const cx = Math.cos(ang), cy = Math.sin(ang);
        L.push({ x: 300 + cx * rad, y: 300 + cy * rad, c, a, b: LOGO + d + f * 1.3 + R() * 0.05, ox: 300 + cx * rad * 1.06, oy: 300 + cy * rad * 1.06 });
      }
    }
    // KAFFEEPLATZ, de izquierda a derecha. Los trazos finos de la serif (el
    // palo izquierdo de la A) se pierden al muestrear: un contorno fino los
    // engrosa y el paso es más apretado que el de la rama.
    mascara(1200, 260, Math.max(2.4, (st * 0.6) / 0.5), (m) => {
      m.fillStyle = m.strokeStyle = '#fff';
      m.lineWidth = 3.5; m.lineJoin = 'round'; m.textAlign = 'center';
      m.font = '600 100px "Cormorant Garamond", Georgia, serif';
      try { m.letterSpacing = '6px'; } catch { /* navegadores sin letterSpacing en canvas */ }
      const w = m.measureText('KAFFEEPLATZ').width;
      m.font = `600 ${Math.round((100 * 1000) / w)}px "Cormorant Garamond", Georgia, serif`;
      m.fillText('KAFFEEPLATZ', 600, 172);
      m.strokeText('KAFFEEPLATZ', 600, 172);
    }).forEach((p) => L.push({
      x: 300 + (p.x - 600) * 0.5, y: BANDA + (p.y - 128) * 0.5,
      c: p.y < 110 ? 0 : p.y < 145 ? 1 : 2, a: 0.95,
      b: LOGO + 0.9 + (p.x / 1200) * 1.1 + R() * 0.15,
      ox: 300 + (R() - 0.5) * 620, oy: 300 + (R() - 0.5) * 520,
    }));
    return L;
  }

  /* ======================================================================
     ESCENA
     ====================================================================== */
  let rama: Punto[] = [], logo: Marca[] = [];
  let px = new Float32Array(0), py = px, vx = px, vy = px;
  let vis = new Uint8Array(0), nac = vis;
  let T = 0;

  let planta: HTMLImageElement | null = null;
  const preparar = () => {
    semilla(7);
    const st = paso();
    rama = planta ? genMatica(planta, st) : [];
    logo = genEmblema(st);
    const n = rama.length + logo.length;
    px = new Float32Array(n); py = new Float32Array(n); vx = new Float32Array(n); vy = new Float32Array(n);
    vis = new Uint8Array(n); nac = new Uint8Array(n);
    // un poco más de un cuarto de la rama empieza como polvo visible que
    // luego vuela a su sitio; el resto brota desde el tallo
    rama.forEach((p, i) => {
      if (R() < 0.28) { vis[i] = 1; px[i] = 80 + R() * 440; py[i] = 150 + R() * 420; }
      else { px[i] = p.ox; py[i] = p.oy; }
    });
    T = 0;
  };

  const resorte = (i: number, tx: number, ty: number, k: number, am: number, dt: number, mx: number, my: number, rr: number) => {
    vx[i] += (tx - px[i]) * k * dt; vy[i] += (ty - py[i]) * k * dt;
    const dx = px[i] - mx, dy = py[i] - my, d2 = dx * dx + dy * dy;
    if (d2 < rr * rr && d2 > 0.01) {
      const d = Math.sqrt(d2), f = (1 - d / rr) * 2400 * dt;
      vx[i] += (dx / d) * f; vy[i] += (dy / d) * f;
    }
    vx[i] *= am; vy[i] *= am;
    px[i] += vx[i] * dt; py[i] += vy[i] * dt;
  };

  const cuadro = (dt: number) => {
    T += dt;
    const { s, ox, oy } = encajar();
    const mx = (ptr.x - ox) / s, my = (ptr.y - oy) / s, rr = 64 / s;
    const sw = Math.sin(T * 0.7) * 0.03 + Math.sin(T * 1.9 + 1) * 0.007;
    const am = Math.exp(-7 * dt), z = tam(), n = rama.length;
    // la banda del nombre tapa el tallo, como en el emblema
    const tapa = 1 - 0.85 * suave((T - LOGO - 0.7) / 1.2);

    for (let i = 0; i < n; i++) {
      const p = rama[i];
      if (T < p.b) {
        if (vis[i]) {
          px[i] += Math.sin(T * 0.5 + i) * 5 * dt; py[i] -= (3 + (i % 5)) * dt;
          put(3, 0.18, ox + px[i] * s, oy + py[i] * s, z * 0.75);
        }
        continue;
      }
      if (!nac[i]) { nac[i] = 1; if (!vis[i]) { px[i] = p.ox; py[i] = p.oy; } }
      // bamboleo: giro sobre el pie del tallo, más fuerte cuanto más alto;
      // lo que se aleja del tallo (hojas, bayas) tiembla un poco además
      const ang = sw * p.hf * p.hf * 1.6, c = Math.cos(ang), sn = Math.sin(ang);
      const rx = p.x - 300, ry = p.y - pivoteY;
      const tx = 300 + rx * c - ry * sn;
      const ty = pivoteY + rx * sn + ry * c + Math.sin(T * 2.1 + p.x * 0.05) * 1.3 * Math.min(1, Math.abs(rx) / 120);
      resorte(i, tx, ty, 60, am, dt, mx, my, rr);
      const a = Math.min(1, (T - p.b) * 2.2) * p.a * (p.banda ? tapa : 1);
      put(p.k === KC ? madurez(p, T) : p.c, a, ox + px[i] * s, oy + py[i] * s, p.k === KC ? z * 1.15 : z);
    }
    // el anillo y el nombre quedan quietos mientras la rama se mece
    for (let j = 0; j < logo.length; j++) {
      const p = logo[j], i = n + j;
      if (T < p.b) continue;
      if (!nac[i]) { nac[i] = 1; px[i] = p.ox; py[i] = p.oy; }
      resorte(i, p.x, p.y, 40, am, dt, mx, my, rr);
      put(p.c, Math.min(1, (T - p.b) * 2) * p.a, ox + px[i] * s, oy + py[i] * s, z);
    }
  };

  /* ---------- bucle ---------- */
  let raf = 0, ultimo = 0, visible = true, Tg = 0;
  const tick = (now: number) => {
    raf = 0;
    if (!visible || document.hidden) { ultimo = 0; return; }
    const dt = ultimo ? Math.min(0.05, (now - ultimo) / 1000) : 1 / 60;
    ultimo = now; Tg += dt;
    moverMotas(dt, Tg);
    cuadro(dt);
    pintar();
    raf = requestAnimationFrame(tick);
  };
  const arrancar = () => { if (!raf && !reduce) raf = requestAnimationFrame(tick); };

  /* sin movimiento: se adelanta la escena hasta el emblema completo y se
     pinta una sola vez */
  const quieto = () => {
    for (let i = 0; i < 13 * 30; i++) { cuadro(1 / 30); vaciar(); }
    moverMotas(0, 0); cuadro(1 / 30); pintar();
  };

  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top;
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { ptr.x = ptr.y = -1e4; });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) arrancar(); }).observe(hero);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) arrancar(); });

  /* al cambiar de tamaño la escena no se reinicia: las formas viven en la
     caja de 600 y solo cambia la escala. Sí se rehace si cruza el corte de
     móvil, porque cambia la densidad de puntos. */
  let espera = 0;
  window.addEventListener('resize', () => {
    clearTimeout(espera);
    espera = window.setTimeout(() => {
      const antes = estrecho;
      medir(); sembrarMotas();
      if (antes !== estrecho) { preparar(); if (reduce) quieto(); }
      else if (reduce) { moverMotas(0, 0); cuadro(0); pintar(); }
    }, 120);
  });

  const arranque = () => {
    medir(); sembrarMotas(); preparar();
    if (reduce) quieto(); else arrancar();
  };
  // la matica sale de la imagen de la planta (si no carga, queda el anillo y
  // el nombre); el nombre se dibuja con la Cormorant de la página. Se espera
  // a las dos, con un tope para no quedarse sin emblema si la fuente no llega.
  const imagen = new Promise<void>((listo) => {
    const src = zona.dataset.planta;
    if (!src) return listo();
    const img = new Image();
    img.onload = () => { planta = img; listo(); };
    img.onerror = () => listo();
    img.src = src;
  });
  const fuente = document.fonts?.load ? document.fonts.load('600 100px "Cormorant Garamond"') : Promise.resolve();
  const fuenteConTope = Promise.race([fuente, new Promise((r) => setTimeout(r, 1500))]);
  Promise.all([imagen, fuenteConTope]).then(arranque, arranque);
}
