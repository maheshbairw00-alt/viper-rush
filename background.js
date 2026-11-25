/* js/background.js
 * Animated menu background.
 *   mode 'menu'  (loading + login): snakes slithering across the screen, glowing orbs, embers.
 *   mode 'lobby' (lobby): colorful Free Fire style scene - swaying light rays, bokeh,
 *                twinkling stars and floating diamonds. No snakes.
 * API:  VR.bg.start()   VR.bg.stop()   VR.bg.setMode('menu' | 'lobby')
 */
(function () {
  var cv = document.getElementById('bg');
  var ctx = cv.getContext('2d');
  var wrap = document.getElementById('bgwrap');
  var W = 0, H = 0, dpr = 1, K = 1, running = false, last = 0, time = 0, raf = 0, mode = 'menu';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    K = Math.max(0.7, Math.min(1.8, H / 420));
  }
  window.addEventListener('resize', resize);
  resize();

  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function mix(a, b, t) {
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  var PAL = [['#B6FF3B', '#10B981'], ['#22D3EE', '#2563EB'], ['#C084FC', '#7C3AED'], ['#FF9F43', '#EF4444'], ['#F472B6', '#BE185D']]
    .map(function (p) { return [hex(p[0]), hex(p[1]), p[0]]; });
  var LAYER = { 0: { s: .55, a: .4, n: 34, v: .7 }, 1: { s: .85, a: .65, n: 44, v: 1 }, 2: { s: 1.35, a: .5, n: 52, v: 1.25 } };
  var MARGIN = 90;

  function spawn(sn, first) {
    var L = LAYER[sn.layer];
    sn.dir = Math.random() < .5 ? 1 : -1;
    sn.pal = PAL[Math.floor(Math.random() * PAL.length)];
    sn.r = 11 * L.s * K; sn.sp = (46 + Math.random() * 34) * L.v * K;
    sn.gap = sn.r * .62; sn.amp = (26 + Math.random() * 52) * L.s * K; sn.wl = (170 + Math.random() * 110) * L.s * K;
    sn.ph = Math.random() * 6.28; sn.y0 = H * (.08 + Math.random() * .84);
    sn.len = L.n * sn.gap; sn.total = W + 2 * MARGIN + sn.len;
    sn.t = first ? Math.random() * (sn.total / sn.sp) : 0;
  }
  var snakes = [];
  [0, 0, 0, 1, 1, 1, 2, 2].forEach(function (l) { var s = { layer: l }; spawn(s, true); snakes.push(s); });
  snakes.sort(function (a, b) { return a.layer - b.layer; });

  function pos(sn, dist) {
    var x = sn.dir > 0 ? -MARGIN + dist : W + MARGIN - dist;
    var y = sn.y0 + sn.amp * Math.sin(dist / sn.wl * 6.283 + sn.ph);
    return [x, y];
  }

  function drawSnake(sn, t) {
    var L = LAYER[sn.layer], n = L.n, pts = [], i;
    var head = sn.sp * sn.t;
    for (i = 0; i < n; i++) pts.push(pos(sn, head - i * sn.gap));
    ctx.globalCompositeOperation = 'lighter';
    for (i = n - 1; i >= 0; i--) {
      var k = i / (n - 1), r = sn.r * (.35 + .65 * Math.pow(1 - k, .6));
      ctx.fillStyle = 'rgba(' + sn.pal[0].join(',') + ',' + (.07 * L.a / .5) + ')';
      ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], r * 2.3, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = L.a;
    for (i = n - 1; i >= 0; i--) {
      var k2 = i / (n - 1), r2 = sn.r * (.35 + .65 * Math.pow(1 - k2, .6));
      ctx.fillStyle = mix(sn.pal[1], sn.pal[0], (1 - k2) * .85 + ((i >> 1) % 2 ? 0 : .12));
      ctx.strokeStyle = 'rgba(2,30,24,.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], r2, 0, 6.283); ctx.fill(); ctx.stroke();
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.arc(pts[i][0] - r2 * .28, pts[i][1] - r2 * .34, r2 * .38, 0, 6.283); ctx.fill(); }
    }
    var h = pts[0], p = pts[2], ang = Math.atan2(h[1] - p[1], h[0] - p[0]), hr = sn.r * 1.3;
    ctx.save(); ctx.translate(h[0], h[1]); ctx.rotate(ang);
    if (Math.sin(t * 5 + sn.ph) > .7) {
      ctx.strokeStyle = '#FF3B5C'; ctx.lineWidth = Math.max(1.5, sn.r * .18); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hr * .9, 0); ctx.lineTo(hr * 1.9, 0); ctx.moveTo(hr * 1.9, 0); ctx.lineTo(hr * 2.3, -hr * .28); ctx.moveTo(hr * 1.9, 0); ctx.lineTo(hr * 2.3, hr * .28); ctx.stroke();
    }
    ctx.fillStyle = mix(sn.pal[1], sn.pal[0], 1); ctx.strokeStyle = 'rgba(2,30,24,.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, hr * 1.05, hr * .92, 0, 0, 6.283); ctx.fill(); ctx.stroke();
    [-1, 1].forEach(function (sd) {
      ctx.fillStyle = '#FFD23F'; ctx.beginPath(); ctx.ellipse(hr * .25, sd * hr * .5, hr * .3, hr * .2, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#0A0E1F'; ctx.beginPath(); ctx.ellipse(hr * .3, sd * hr * .5, hr * .08, hr * .17, 0, 0, 6.283); ctx.fill();
    });
    ctx.restore(); ctx.globalAlpha = 1;
  }

  var orbs = [], embers = [], i, streak = null, nextStreak = 2;
  for (i = 0; i < 26; i++) orbs.push({ x: Math.random(), y: Math.random(), r: 2 + Math.random() * 3.5, c: PAL[i % PAL.length][2], ph: Math.random() * 6.28, sp: .4 + Math.random() * .8, dx: (Math.random() - .5) * .004 });
  for (i = 0; i < 55; i++) embers.push({ x: Math.random(), y: Math.random(), r: .8 + Math.random() * 2, v: .012 + Math.random() * .03, w: Math.random() * 6.28, c: Math.random() < .6 ? '182,255,59' : '168,85,247' });

  function drawFx(t, dt) {
    ctx.globalCompositeOperation = 'lighter';
    orbs.forEach(function (o) {
      o.x += o.dx * dt; if (o.x < -.05) o.x = 1.05; if (o.x > 1.05) o.x = -.05;
      var a = .45 + .4 * Math.sin(t * o.sp * 2 + o.ph), px = o.x * W, py = o.y * H, rgb = hex(o.c).join(',');
      var g = ctx.createRadialGradient(px, py, 0, px, py, o.r * 5 * K);
      g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, o.r * 5 * K, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + a + ')'; ctx.beginPath(); ctx.arc(px, py, o.r * .7 * K, 0, 6.283); ctx.fill();
    });
    embers.forEach(function (e) {
      e.y -= e.v * dt; e.w += dt * 1.5; if (e.y < -.03) { e.y = 1.03; e.x = Math.random(); }
      var px = (e.x + Math.sin(e.w) * .012) * W, py = e.y * H, a = .25 + .35 * Math.sin(e.w * 2 + e.x * 9);
      ctx.fillStyle = 'rgba(' + e.c + ',' + Math.max(.05, a) + ')'; ctx.beginPath(); ctx.arc(px, py, e.r * K, 0, 6.283); ctx.fill();
    });
    if (!streak && t > nextStreak) streak = { x: Math.random() * W * .6 + W * .4, y: Math.random() * H * .3, t: 0 };
    if (streak) {
      streak.t += dt; var k = streak.t / .7;
      if (k >= 1) { streak = null; nextStreak = t + 3 + Math.random() * 4; }
      else {
        var sx = streak.x - k * W * .5, sy = streak.y + k * H * .18, g2 = ctx.createLinearGradient(sx, sy, sx + 110, sy - 32);
        g2.addColorStop(0, 'rgba(140,240,255,' + (.9 * (1 - k)) + ')'); g2.addColorStop(1, 'rgba(140,240,255,0)');
        ctx.strokeStyle = g2; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 110, sy - 32); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }


  /* ---------- lobby mode: colorful scene ---------- */
  var BOKEH_COL = ['#FF7AD9', '#22D3EE', '#FFE45C', '#FF9F1C', '#C084FC', '#7CFFB2'].map(hex);
  var bokeh = [], twinkles = [], floaters = [];
  for (i = 0; i < 24; i++) bokeh.push({ x: Math.random(), y: Math.random(), r: 14 + Math.random() * 40, c: BOKEH_COL[i % BOKEH_COL.length], a: .12 + Math.random() * .2, vx: (Math.random() - .5) * .006, vy: -.004 - Math.random() * .01, ph: Math.random() * 6.28 });
  for (i = 0; i < 26; i++) twinkles.push({ x: Math.random(), y: Math.random(), s: 3 + Math.random() * 5, ph: Math.random() * 6.28, sp: 1 + Math.random() * 2 });
  for (i = 0; i < 12; i++) floaters.push({ x: Math.random(), y: Math.random(), s: 7 + Math.random() * 8, rot: Math.random() * 6.28, vr: (Math.random() - .5) * .8, vy: .006 + Math.random() * .012 });

  function star4(x, y, s) {
    ctx.beginPath(); ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x + s * .12, y - s * .12, x + s, y); ctx.quadraticCurveTo(x + s * .12, y + s * .12, x, y + s);
    ctx.quadraticCurveTo(x - s * .12, y + s * .12, x - s, y); ctx.quadraticCurveTo(x - s * .12, y - s * .12, x, y - s);
    ctx.fill();
  }

  function drawLobby(t, dt) {
    var k, ox = W * .5, oy = -H * .12;
    ctx.globalCompositeOperation = 'lighter';
    for (k = 0; k < 9; k++) {
      var ang = Math.PI / 2 + (k - 4) * .24 + Math.sin(t * .25 + k * 1.3) * .06, len = H * 1.7, half = .05 + .02 * Math.sin(t * .4 + k);
      var x1 = ox + Math.cos(ang - half) * len, y1 = oy + Math.sin(ang - half) * len, x2 = ox + Math.cos(ang + half) * len, y2 = oy + Math.sin(ang + half) * len;
      var g = ctx.createLinearGradient(ox, oy, ox + Math.cos(ang) * len, oy + Math.sin(ang) * len);
      g.addColorStop(0, 'rgba(255,255,255,.2)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.fill();
    }
    bokeh.forEach(function (b) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -.1) { b.y = 1.1; b.x = Math.random(); } if (b.x < -.1) b.x = 1.1; if (b.x > 1.1) b.x = -.1;
      var px = b.x * W, py = b.y * H, r = b.r * K, a = b.a * (.75 + .25 * Math.sin(t * .8 + b.ph)), rgb = b.c.join(',');
      var gr = ctx.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(.7, 'rgba(' + rgb + ',' + a * .6 + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, py, r, 0, 6.283); ctx.fill();
    });
    twinkles.forEach(function (w) {
      var a = Math.max(0, .15 + .85 * Math.sin(t * w.sp + w.ph));
      ctx.fillStyle = 'rgba(255,255,255,' + (a * .9) + ')'; star4(w.x * W, w.y * H, w.s * K * (.6 + .4 * a));
    });
    ctx.lineWidth = 1.4;
    floaters.forEach(function (f) {
      f.y += f.vy * dt; f.rot += f.vr * dt; if (f.y > 1.08) { f.y = -.08; f.x = Math.random(); }
      var px = f.x * W, py = f.y * H, s = f.s * K;
      ctx.save(); ctx.translate(px, py); ctx.rotate(f.rot); ctx.scale(1, .75);
      ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath(); ctx.stroke();
      ctx.restore();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function setMode(m) { mode = m; wrap.classList.toggle('lobby', m === 'lobby'); }

  function frame(now) {
    if (!running) return;
    var dt = Math.min(.05, (now - last) / 1000); last = now; time += dt;
    ctx.clearRect(0, 0, W, H);
    if (mode === 'lobby') drawLobby(time, dt);
    else {
      drawFx(time, dt);
      snakes.forEach(function (sn) { sn.t += dt; if (sn.t * sn.sp > sn.total) spawn(sn, false); drawSnake(sn, time); });
    }
    if (!reduce) raf = requestAnimationFrame(frame);
  }

  function start() {
    wrap.classList.remove('off');
    if (running) return;
    running = true; last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false; cancelAnimationFrame(raf);
    wrap.classList.add('off');
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); }
    else if (running && !reduce) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  window.VR = window.VR || {};
  VR.bg = { start: start, stop: stop, setMode: setMode };
})();
