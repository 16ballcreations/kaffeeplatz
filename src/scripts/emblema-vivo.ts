/**
 * emblema-vivo.ts — el emblema de la portada, hecho de partículas.
 * ===========================================================================
 * Ocupa el lado derecho del hero, donde antes iba la foto del AeroPress. Un
 * polvo dorado flota en el hero; desde abajo crece la rama del emblema (tallo,
 * hojas en sus dos tonos de oro con las nervaduras, cerezas que pasan de verde
 * a oro y maduran a rojo) y, con las cerezas ya rojas, se cierra el resto del
 * logo: el anillo doble y KAFFEEPLATZ atravesando el tallo. La rama sigue
 * meciéndose dentro del logo; el cursor aparta las partículas y vuelven.
 *
 * Misma técnica que el orbe de 16 Ball Creations: canvas 2D sin librerías, los
 * puntos agrupados por color y brillo para que un cuadro sean unas decenas de
 * trazos y no miles. Las formas salen de código (curvas y máscaras de texto),
 * así que se afinan contra el emblema sin tocar imágenes.
 *
 * El texto, los botones y el SEO del hero siguen siendo HTML; nada depende de
 * esto. Con «reducir movimiento» se pinta el emblema ya completo y quieto. Se
 * pausa cuando el hero sale de pantalla o la pestaña se oculta.
 */

type Punto = {
  x: number; y: number; c: number; a: number; b: number;
  k: number; ox: number; oy: number; hoja: number; u: number; r: number;
  hf: number; banda: boolean;
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
     LA RAMA
     Caja de 400×545 (base del tallo en 200,532); luego se desplaza 100,10
     para centrarla en la caja de 600 del emblema.
     ====================================================================== */
  const KS = 0, KL = 1, KC = 2; // tallo, hoja, cereza
  const CREC = 2.4; // segundos que tarda el tallo en llegar arriba

  function genRama(st: number) {
    const P = [[200, 532], [183, 400], [232, 250], [206, 96]];
    const bz = (t: number) => {
      const m = 1 - t;
      return [0, 1].map((k) => m * m * m * P[0][k] + 3 * m * m * t * P[1][k] + 3 * m * t * t * P[2][k] + t * t * t * P[3][k]);
    };
    const bd = (t: number) => {
      const m = 1 - t;
      return [0, 1].map((k) => 3 * m * m * (P[1][k] - P[0][k]) + 6 * m * t * (P[2][k] - P[1][k]) + 3 * t * t * (P[3][k] - P[2][k]));
    };
    const pts: Punto[] = [];
    const add = (x: number, y: number, c: number, a: number, b: number, k: number, ox: number, oy: number, hoja = -1, u = 0) =>
      pts.push({ x, y, c, a, b, k, ox, oy, hoja, u, r: R(), hf: 0, banda: false });

    // tallo: nace de abajo arriba, cada punto desde un poco más abajo
    const n = Math.ceil(470 / st);
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = bz(t), d = bd(t), L = Math.hypot(d[0], d[1]);
      const nx = -d[1] / L, ny = d[0] / L, w = 7.5 * (1 - t) + 2.4, q = bz(Math.max(0, t - 0.05));
      for (let o = -w / 2; o <= w / 2 + 0.01; o += st * 0.75)
        add(p[0] + nx * o, p[1] + ny * o, o < -w * 0.2 ? 2 : o > w * 0.2 ? 4 : 3, 0.9, t * CREC + R() * 0.04, KS, q[0], q[1]);
    }

    // hojas: mitad clara y mitad oscura como en el emblema, con nervio
    // central y siete nervaduras por lado; se despliegan desde el tallo
    const hoja = (tA: number, lado: number, largo: number, ancho: number, angDeg: number, caida: number, idx: number) => {
      const b = bz(tA), d = bd(tA);
      const th = Math.atan2(d[1], d[0]) + (lado * angDeg * Math.PI) / 180;
      const ax = Math.cos(th), ay = Math.sin(th);
      const nx = Math.cos(th + (lado * Math.PI) / 2), ny = Math.sin(th + (lado * Math.PI) / 2);
      const inicio = tA * CREC + 0.25;
      for (let a = 0; a <= largo; a += st) {
        const u = a / largo;
        const hw = (ancho / 2) * Math.pow(Math.sin(Math.PI * u), 0.8) * (1 - 0.25 * u);
        const cd = caida * largo * u * u;
        const ox = b[0] + ax * a * 0.75 + nx * cd, oy = b[1] + ay * a * 0.75 + ny * cd;
        for (let v = -hw; v <= hw + 0.01; v += st * 0.9) {
          const av = Math.abs(v);
          let col = v > 0 ? 4 : 2, alfa = 0.78;
          if (av < st * 0.55) { col = 0; alfa = 0.95; }
          else if (hw - av < st * 0.9) { col = v > 0 ? 3 : 1; alfa = 0.95; }
          else {
            for (let k = 0; k < 7; k++) {
              const ue = 0.1 + k * 0.12 + (0.14 * av) / Math.max(hw, 1);
              if (Math.abs(u - ue) * largo < st * 0.55) { col = v > 0 ? 2 : 1; alfa = 0.95; break; }
            }
          }
          const jt = (R() - 0.5) * st * 0.45, jv = (R() - 0.5) * st * 0.3;
          add(b[0] + ax * (a + jt) + nx * (cd + v + jv), b[1] + ay * (a + jt) + ny * (cd + v + jv), col, alfa,
            inicio + u * 1.15 + R() * 0.08, KL, ox, oy, idx, u);
        }
      }
    };
    hoja(0.16, -1, 150, 62, 64, 0.12, 0);
    hoja(0.25, 1, 166, 66, 58, 0.1, 1);
    hoja(0.52, -1, 118, 50, 56, 0.08, 2);
    hoja(0.58, 1, 128, 52, 52, 0.08, 3);
    hoja(0.8, -1, 80, 36, 50, 0.05, 4);
    hoja(0.85, 1, 88, 38, 48, 0.05, 5);

    // cerezas: pedúnculo, fruto y un brillo crema arriba a la izquierda
    const cereza = (bx: number, by: number, cx: number, cy: number, rad: number, b0: number) => {
      const L = Math.hypot(cx - bx, cy - by);
      for (let s = 0; s <= L; s += st * 0.8) {
        const f = s / L;
        add(bx + (cx - bx) * f, by + (cy - by) * f, 3, 0.85, b0 - 0.3 + f * 0.3, KS, bx, by);
      }
      for (let y = -rad; y <= rad; y += st * 0.8) for (let x = -rad; x <= rad; x += st * 0.8) {
        const d2 = x * x + y * y;
        if (d2 > rad * rad) continue;
        const hx = x + rad * 0.38, hy = y + rad * 0.38;
        if (hx * hx + hy * hy < rad * rad * 0.1) add(cx + x, cy + y, 0, 0.9, b0 + 0.2, KS, cx, cy);
        else add(cx + x, cy + y, 2, d2 > rad * rad * 0.7 ? 1 : 0.85, b0 + (Math.sqrt(d2) / rad) * 0.25, KC, cx, cy);
      }
    };
    const rc = bz(0.38);
    [[-36, -12, 12], [-56, 8, 13], [-30, 18, 12], [-50, -32, 11]].forEach((o, i) =>
      cereza(rc[0], rc[1], rc[0] + o[0], rc[1] + o[1], o[2], 4.5 + i * 0.18));
    const tip = bz(1);
    [[-90, 40], [-50, 32], [-130, 32]].forEach((o, i) => {
      const a = (o[0] * Math.PI) / 180;
      cereza(tip[0], tip[1], tip[0] + Math.cos(a) * o[1], tip[1] + Math.sin(a) * o[1], 9, 2.9 + i * 0.15);
    });

    // altura relativa (para el bamboleo) y paso a la caja del emblema
    for (const p of pts) {
      p.hf = Math.max(0, Math.min(1, (532 - p.y) / 440));
      p.x += 100; p.y += 10; p.ox += 100; p.oy += 10;
      p.banda = Math.abs(p.y - BANDA) < 40;
    }
    return pts;
  }
  /* verde, luego oro, luego rojo; el umbral de cada punto es distinto para
     que el cambio se vea granulado y no de golpe */
  const madurez = (p: Punto, T: number) => {
    const f = (T - p.b - 0.5) / 2.4;
    if (f < p.r * 0.5) return 7;
    if (f < 0.5 + p.r * 0.5) return 2;
    return p.r < 0.3 ? 6 : 5;
  };

  /* ======================================================================
     EL RESTO DEL EMBLEMA, cuando las cerezas ya están rojas
     ====================================================================== */
  const LOGO = 7.4, BANDA = 300;
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

  const preparar = () => {
    semilla(7);
    const st = paso();
    rama = genRama(st);
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
      // bamboleo: giro sobre la base del tallo, más fuerte cuanto más alto
      const ang = sw * p.hf * p.hf * 1.6, c = Math.cos(ang), sn = Math.sin(ang);
      const rx = p.x - 300, ry = p.y - 542;
      const tx = 300 + rx * c - ry * sn;
      let ty = 542 + rx * sn + ry * c;
      if (p.k === KL) ty += Math.sin(T * 2.1 + p.hoja * 1.7) * 1.4 * p.u;
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
  // el nombre se dibuja con la Cormorant de la página: se espera a que esté,
  // con un tope para no quedarse sin emblema si la fuente no llega
  const fuente = document.fonts?.load ? document.fonts.load('600 100px "Cormorant Garamond"') : Promise.resolve();
  Promise.race([fuente, new Promise((r) => setTimeout(r, 1500))]).then(arranque, arranque);
}
