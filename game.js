/* js/game.js
 * Playable offline snake arena with bots, so you can test controls, HUD and squad flow.
 *  - Move: joystick (touch) / mouse / WASD or arrow keys.
 *  - Boost: BOOST button / Space / Shift (burns a little length).
 *  - Squad mates (from the lobby) are friendly bots: they follow you and cannot hurt you.
 *
 * MULTIPLAYER LATER: this file is the "client view". With a server, replace the bot logic
 * (think / stepSnake for other snakes) with positions received from the server, and send
 * only your steering (angle + boost) to the server.
 *
 * API:  VR.game.init()   VR.game.start(cfg)   VR.game.stop()
 */
(function () {
  var G = VR_CONFIG.game;
  var WORLD = G.worldSize, SP = 8;
  var NAMES = ['Rudra', 'Kabir', 'Zoya', 'Arjun', 'Naga', 'Vyom', 'Mira', 'Tej', 'Ishaan', 'Rhea', 'Dev', 'Anaya', 'Kavya', 'Veer', 'Sia', 'Aarav', 'Neel', 'Tara', 'Ojas', 'Pari'];
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  var PAL = [['#B6FF3B', '#10B981'], ['#22D3EE', '#2563EB'], ['#C084FC', '#7C3AED'], ['#FF9F43', '#EF4444'], ['#F472B6', '#BE185D'], ['#FDE047', '#CA8A04']]
    .map(function (p) { return { a: hex(p[0]), b: hex(p[1]), css: p[0] }; });

  var cv, ctx, mini, mctx, W = 0, H = 0, dpr = 1;
  var snakes = [], foods = [], player = null, cfg = null;
  var running = false, paused = false, over = false, raf = 0, last = 0, uid = 0, kills = 0, lbT = 0, talkT = 0;
  var cam = { x: 0, y: 0, s: 1 };
  var input = { angle: 0, mag: 0, touch: false, boost: false, keys: {}, mouse: null };
  var sprites = [];

  function $(id) { return document.getElementById(id); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function angDiff(t, c) { var d = t - c; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832; return d; }
  function mixc(a, b, t) { return 'rgb(' + ((a[0] + (b[0] - a[0]) * t) | 0) + ',' + ((a[1] + (b[1] - a[1]) * t) | 0) + ',' + ((a[2] + (b[2] - a[2]) * t) | 0) + ')'; }

  /* ---------- snakes ---------- */
  function segCount(s) { return Math.min(260, Math.floor(14 + s.mass * 0.8)); }
  function radiusOf(s) { return 8 + Math.min(10, s.mass / 70); }

  function makeSnake(o) {
    var ang = Math.random() * 6.283;
    var s = {
      id: ++uid, name: o.name, ci: o.ci, team: o.team || 0, isPlayer: !!o.isPlayer, mate: !!o.mate,
      angle: ang, targetAngle: ang, mass: o.mass || G.startMass, segs: [], dead: false, boost: false,
      kills: 0, dropT: 0, respawn: 0, thinkT: 0, wob: Math.random() * 6, talk: 0
    };
    s.r = radiusOf(s);
    var n = segCount(s);
    for (var i = 0; i < n; i++) s.segs.push({ x: o.x - Math.cos(ang) * i * SP, y: o.y - Math.sin(ang) * i * SP });
    return s;
  }

  function freeSpot(minFromPlayer) {
    for (var t = 0; t < 20; t++) {
      var x = rnd(300, WORLD - 300), y = rnd(300, WORLD - 300);
      if (!player || Math.hypot(x - player.segs[0].x, y - player.segs[0].y) > minFromPlayer) return { x: x, y: y };
    }
    return { x: WORLD / 2, y: WORLD / 2 };
  }

  function addFood(x, y, v, ci, keep) {
    foods.push({ x: x, y: y, v: v, r: 3 + v * 1.4, ci: ci == null ? (Math.random() * PAL.length) | 0 : ci, keep: !!keep });
  }

  function dropDeathFood(s) {
    for (var i = 0; i < s.segs.length; i += 3) addFood(s.segs[i].x + rnd(-10, 10), s.segs[i].y + rnd(-10, 10), 2 + s.mass / 90, s.ci, false);
    var extra = foods.length - 1900;
    for (var j = 0; j < foods.length && extra > 0; j++) if (!foods[j].keep) { foods.splice(j, 1); j--; extra--; }
  }

  function kill(s, by) {
    if (s.dead) return;
    s.dead = true; dropDeathFood(s);
    if (by) { by.kills++; if (by.isPlayer) { kills++; $('hudKills').textContent = kills; } }
    if (s.isPlayer) endGame(); else s.respawn = 2.5;
  }

  function respawn(s) {
    var p = freeSpot(700);
    var n = makeSnake({ name: s.name, ci: s.ci, team: s.team, mate: s.mate, mass: s.mate ? G.startMass : rnd(10, 40), x: p.x, y: p.y });
    if (s.mate && player && !player.dead) { n.segs.forEach(function (g, i) { g.x = player.segs[0].x - 120 - i * SP * .2; g.y = player.segs[0].y + 90; }); }
    for (var k in n) s[k] = n[k]; s.id = ++uid;
  }

  /* ---------- movement ---------- */
  function stepSnake(s, dt) {
    var diff = angDiff(s.targetAngle, s.angle), maxT = 4.4 * dt * (s.boost ? .8 : 1);
    s.angle += clamp(diff, -maxT, maxT);
    var sp = s.boost ? G.boostSpeed : G.speed;
    var h = s.segs[0], rr = s.r;
    h.x = clamp(h.x + Math.cos(s.angle) * sp * dt, rr, WORLD - rr);
    h.y = clamp(h.y + Math.sin(s.angle) * sp * dt, rr, WORLD - rr);
    for (var i = 1; i < s.segs.length; i++) {
      var p = s.segs[i - 1], g = s.segs[i], dx = p.x - g.x, dy = p.y - g.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d > SP) { var k = (d - SP) / d; g.x += dx * k; g.y += dy * k; }
    }
    if (s.boost) {
      s.mass = Math.max(10, s.mass - 5 * dt); s.dropT += dt;
      if (s.dropT > .2) { s.dropT = 0; var t = s.segs[s.segs.length - 1]; addFood(t.x, t.y, 1, s.ci, false); }
      if (s.mass <= 12) s.boost = false;
    }
    var want = segCount(s);
    while (s.segs.length < want) { var l = s.segs[s.segs.length - 1]; s.segs.push({ x: l.x, y: l.y }); }
    while (s.segs.length > want) s.segs.pop();
    s.r = radiusOf(s);
  }

  function eat(s) {
    var h = s.segs[0], hr = s.r + 3;
    for (var i = foods.length - 1; i >= 0; i--) {
      var f = foods[i], dx = h.x - f.x, dy = h.y - f.y, d2 = dx * dx + dy * dy, m = hr + f.r + 36;
      if (d2 < m * m) {
        if (d2 < (hr + f.r) * (hr + f.r)) {
          s.mass += f.v * 0.9;
          if (f.keep) { f.x = rnd(40, WORLD - 40); f.y = rnd(40, WORLD - 40); f.ci = (Math.random() * PAL.length) | 0; }
          else { foods[i] = foods[foods.length - 1]; foods.pop(); }
        } else { f.x += dx * .18; f.y += dy * .18; }
      }
    }
  }

  function collisions() {
    for (var a = 0; a < snakes.length; a++) {
      var A = snakes[a]; if (A.dead) continue;
      var h = A.segs[0], hit = null;
      for (var b = 0; b < snakes.length && !hit; b++) {
        var B = snakes[b]; if (B === A || B.dead) continue;
        if (A.team && A.team === B.team) continue;
        var bh = B.segs[0], reach = B.segs.length * SP + 60;
        if (Math.abs(h.x - bh.x) > reach || Math.abs(h.y - bh.y) > reach) continue;
        var rr = (A.r + B.r) * 0.78; rr *= rr;
        for (var j = 0; j < B.segs.length; j++) {
          if (j === 0 && A.mass > B.mass * 1.1) continue;
          var dx = h.x - B.segs[j].x, dy = h.y - B.segs[j].y;
          if (dx * dx + dy * dy < rr) { hit = B; break; }
        }
      }
      if (hit) kill(A, hit);
    }
  }

  /* ---------- bot AI ---------- */
  function think(s, dt) {
    s.thinkT -= dt; s.wob += dt;
    if (s.thinkT > 0) return;
    s.thinkT = .22 + Math.random() * .3;
    var h = s.segs[0], i, j;
    // 1. walls
    var m = 170;
    if (h.x < m || h.x > WORLD - m || h.y < m || h.y > WORLD - m) { s.targetAngle = Math.atan2(WORLD / 2 - h.y, WORLD / 2 - h.x); s.boost = false; return; }
    // 2. danger ahead (other team's bodies)
    var look = 70 + s.r * 3, fx = Math.cos(s.angle), fy = Math.sin(s.angle), danger = null, dd = 1e9;
    for (i = 0; i < snakes.length; i++) {
      var o = snakes[i]; if (o === s || o.dead) continue;
      if (s.team && s.team === o.team) continue;
      var oh = o.segs[0]; if (Math.abs(oh.x - h.x) > look + o.segs.length * SP || Math.abs(oh.y - h.y) > look + o.segs.length * SP) continue;
      for (j = 0; j < o.segs.length; j += 2) {
        var dx = o.segs[j].x - h.x, dy = o.segs[j].y - h.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < look && (dx * fx + dy * fy) > -10 && d < dd) { dd = d; danger = o.segs[j]; }
      }
    }
    if (danger) {
      var toward = Math.atan2(danger.y - h.y, danger.x - h.x);
      s.targetAngle = toward + (angDiff(toward, s.angle) > 0 ? -1.7 : 1.7);
      s.boost = dd < 60 && s.mass > 20; return;
    }
    s.boost = false;
    // 3. squad mates stay close to the player
    if (s.mate && player && !player.dead) {
      var ph = player.segs[0], pd = Math.hypot(ph.x - h.x, ph.y - h.y);
      if (pd > 230) { s.targetAngle = Math.atan2(ph.y - h.y, ph.x - h.x); s.boost = pd > 520 && s.mass > 20; return; }
    }
    // 4. nearest food
    var best = null, bd = 320 * 320;
    for (i = 0; i < foods.length; i++) {
      var f = foods[i], fdx = f.x - h.x, fdy = f.y - h.y, d2 = fdx * fdx + fdy * fdy;
      if (d2 < bd) { bd = d2; best = f; }
    }
    if (best) s.targetAngle = Math.atan2(best.y - h.y, best.x - h.x);
    else s.targetAngle = s.angle + Math.sin(s.wob) * .9;
  }

  /* ---------- player input ---------- */
  function readInput() {
    var p = player; if (p.dead) return;
    var k = input.keys;
    var dx = ((k.arrowright || k.d) ? 1 : 0) - ((k.arrowleft || k.a) ? 1 : 0);
    var dy = ((k.arrowdown || k.s) ? 1 : 0) - ((k.arrowup || k.w) ? 1 : 0);
    if (input.touch && input.mag > .15) p.targetAngle = input.angle;
    else if (dx || dy) p.targetAngle = Math.atan2(dy, dx);
    else if (input.mouse && !input.touch) p.targetAngle = Math.atan2(input.mouse.y - H / 2, input.mouse.x - W / 2);
    p.boost = (input.boost || k[' '] || k.shift) && p.mass > 12;
  }

  /* ---------- game flow ---------- */
  function start(c) {
    cfg = c || { mode: 'solo', squad: [] };
    snakes = []; foods = []; kills = 0; over = false; paused = false; uid = 0;
    $('hudKills').textContent = '0';
    $('result').classList.remove('on'); $('pauseBox').classList.remove('on');
    resize();
    for (var i = 0; i < 900; i++) addFood(rnd(40, WORLD - 40), rnd(40, WORLD - 40), 1 + Math.random() * 1.5, null, true);

    var me = (cfg.user && cfg.user.name) || 'You';
    player = makeSnake({ name: me, ci: 0, team: 1, isPlayer: true, x: WORLD / 2, y: WORLD / 2 });
    snakes.push(player);

    var mates = cfg.mode === 'squad' ? cfg.squad.filter(function (m) { return !m.you; }) : [];
    mates.forEach(function (m, idx) {
      var s = makeSnake({ name: m.name, ci: (idx + 1) % PAL.length, team: 1, mate: true, x: WORLD / 2 - 120 - idx * 60, y: WORLD / 2 + 90 + idx * 40 });
      snakes.push(s);
    });
    var used = {}; snakes.forEach(function (s) { used[s.name] = 1; });
    var pool = NAMES.filter(function (n) { return !used[n]; });
    for (var b = 0; b < G.botCount; b++) {
      var p = freeSpot(900);
      snakes.push(makeSnake({ name: pool[b % pool.length] + (b >= pool.length ? b : ''), ci: (b + 2) % PAL.length, x: p.x, y: p.y, mass: rnd(10, 60) }));
    }
    cam.x = WORLD / 2; cam.y = WORLD / 2;
    buildSquadBar();
    $('gMic').classList.toggle('on', VR.voice.isOn());
    running = true; last = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }

  function stop() { running = false; cancelAnimationFrame(raf); }

  function endGame() {
    over = true;
    var ranked = snakes.slice().sort(function (a, b) { return b.mass - a.mass; });
    var rank = ranked.indexOf(player) + 1;
    $('resScore').textContent = Math.floor(player.mass * 10);
    $('resInfo').textContent = 'Rank ' + rank + '  |  Kills ' + kills;
    if (VR.lobby && VR.lobby.recordGame) VR.lobby.recordGame({ kills: kills, score: Math.floor(player.mass * 10), rank: rank });
    setTimeout(function () { if (over) $('result').classList.add('on'); }, 700);
  }

  function buildSquadBar() {
    var bar = $('squadBar'); bar.innerHTML = '';
    snakes.filter(function (s) { return s.mate; }).forEach(function (s) {
      var d = document.createElement('div'); d.className = 'sq'; d.dataset.id = s.name;
      d.innerHTML = '<i></i><span></span>'; d.querySelector('span').textContent = s.name.toUpperCase();
      bar.appendChild(d);
    });
  }

  /* ---------- HUD ---------- */
  function updateHud(dt) {
    $('hudLen').textContent = Math.floor(player.mass * 10);
    lbT -= dt;
    if (lbT <= 0) {
      lbT = .5;
      var top = snakes.filter(function (s) { return !s.dead; }).sort(function (a, b) { return b.mass - a.mass; }).slice(0, 5);
      var html = '<h4>LEADERBOARD</h4>';
      top.forEach(function (s, i) {
        var cls = s.isPlayer ? 'lme' : (s.mate ? 'ltm' : '');
        html += '<div class="' + cls + '"><span>' + (i + 1) + ' ' + s.name.replace(/</g, '') + '</span><span>' + Math.floor(s.mass * 10) + '</span></div>';
      });
      $('lb').innerHTML = html;
    }
    // squad mic dots: you = real mic level; mates = simulated until voice is connected
    talkT -= dt;
    if (talkT <= 0) {
      talkT = .6;
      document.querySelectorAll('#squadBar .sq').forEach(function (el) { el.classList.toggle('talk', Math.random() < .25); });
    }
  }

  function drawMini() {
    var S = mini.width, k = S / WORLD;
    mctx.clearRect(0, 0, S, S);
    mctx.fillStyle = 'rgba(255,255,255,.06)'; mctx.fillRect(0, 0, S, S);
    snakes.forEach(function (s) {
      if (s.dead) return; var h = s.segs[0];
      mctx.fillStyle = s.isPlayer ? '#B6FF3B' : (s.mate ? '#22D3EE' : '#FF6B6B');
      mctx.beginPath(); mctx.arc(h.x * k, h.y * k, s.isPlayer ? 5 : 3, 0, 6.283); mctx.fill();
    });
    var vw = (W / cam.s) * k, vh = (H / cam.s) * k;
    mctx.strokeStyle = 'rgba(255,255,255,.6)'; mctx.lineWidth = 1.5;
    mctx.strokeRect(cam.x * k - vw / 2, cam.y * k - vh / 2, vw, vh);
  }

  /* ---------- rendering ---------- */
  function makeSprites() {
    sprites = PAL.map(function (p) {
      var c = document.createElement('canvas'); c.width = c.height = 48;
      var x = c.getContext('2d'), g = x.createRadialGradient(24, 24, 0, 24, 24, 24), rgb = p.a.join(',');
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.25, 'rgba(' + rgb + ',.95)'); g.addColorStop(.6, 'rgba(' + rgb + ',.28)'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
      x.fillStyle = g; x.fillRect(0, 0, 48, 48); return c;
    });
  }

  function drawSnake(s, vx0, vy0, vx1, vy1, t) {
    var pal = PAL[s.ci], n = s.segs.length, r = s.r, i, g;
    if (s.boost) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(' + pal.a.join(',') + ',.10)'; for (i = n - 1; i >= 0; i -= 2) { g = s.segs[i]; ctx.beginPath(); ctx.arc(g.x, g.y, r * 1.8, 0, 6.283); ctx.fill(); } ctx.globalCompositeOperation = 'source-over'; }
    ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(2,30,24,.55)';
    for (i = n - 1; i >= 0; i--) {
      g = s.segs[i]; if (g.x < vx0 - r || g.x > vx1 + r || g.y < vy0 - r || g.y > vy1 + r) continue;
      var k = i / n, rr = r * (.55 + .45 * Math.pow(1 - k, .5));
      ctx.fillStyle = mixc(pal.b, pal.a, (1 - k) * .85 + ((i >> 1) % 2 ? 0 : .12));
      ctx.beginPath(); ctx.arc(g.x, g.y, rr, 0, 6.283); ctx.fill(); ctx.stroke();
    }
    var h = s.segs[0], hr = r * 1.12;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(s.angle);
    if (s.mate || s.isPlayer) { ctx.strokeStyle = s.isPlayer ? '#B6FF3B' : '#22D3EE'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, hr * 1.35, 0, 6.283); ctx.stroke(); }
    ctx.fillStyle = mixc(pal.b, pal.a, 1); ctx.strokeStyle = 'rgba(2,30,24,.7)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 0, hr * 1.05, hr * .95, 0, 0, 6.283); ctx.fill(); ctx.stroke();
    [-1, 1].forEach(function (sd) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(hr * .3, sd * hr * .5, hr * .3, hr * .26, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#0A0E1F'; ctx.beginPath(); ctx.arc(hr * .4, sd * hr * .5, hr * .13, 0, 6.283); ctx.fill();
    });
    ctx.restore();
    ctx.font = '700 ' + Math.max(11, r * 1.1) + 'px Rajdhani, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = s.isPlayer ? '#B6FF3B' : (s.mate ? '#22D3EE' : 'rgba(255,255,255,.85)');
    ctx.fillText(s.name, h.x, h.y - hr * 1.9);
  }

  function render(t) {
    var sc = cam.s;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#070A1C'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (W / 2 - cam.x * sc), dpr * (H / 2 - cam.y * sc));
    var vx0 = cam.x - W / 2 / sc, vy0 = cam.y - H / 2 / sc, vx1 = cam.x + W / 2 / sc, vy1 = cam.y + H / 2 / sc;
    // arena floor + grid
    ctx.fillStyle = '#0E1233'; ctx.fillRect(0, 0, WORLD, WORLD);
    ctx.strokeStyle = 'rgba(159,176,255,.08)'; ctx.lineWidth = 1.5; ctx.beginPath();
    var gs = 90, gx = Math.max(0, Math.floor(vx0 / gs) * gs), gy = Math.max(0, Math.floor(vy0 / gs) * gs);
    for (var x = gx; x <= Math.min(WORLD, vx1); x += gs) { ctx.moveTo(x, Math.max(0, vy0)); ctx.lineTo(x, Math.min(WORLD, vy1)); }
    for (var y = gy; y <= Math.min(WORLD, vy1); y += gs) { ctx.moveTo(Math.max(0, vx0), y); ctx.lineTo(Math.min(WORLD, vx1), y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,60,90,.85)'; ctx.lineWidth = 10; ctx.strokeRect(0, 0, WORLD, WORLD);
    // food
    for (var i = 0; i < foods.length; i++) {
      var f = foods[i]; if (f.x < vx0 - 30 || f.x > vx1 + 30 || f.y < vy0 - 30 || f.y > vy1 + 30) continue;
      var sz = f.r * 4.2 * (1 + .12 * Math.sin(t * 3 + f.x));
      ctx.drawImage(sprites[f.ci], f.x - sz / 2, f.y - sz / 2, sz, sz);
    }
    // snakes (smaller first, player last)
    var order = snakes.filter(function (s) { return !s.dead; }).sort(function (a, b) { return (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0) || a.mass - b.mass; });
    order.forEach(function (s) { drawSnake(s, vx0, vy0, vx1, vy1, t); });
  }

  /* ---------- loop ---------- */
  var tAcc = 0;
  function frame(now) {
    if (!running) return;
    var dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!paused) {
      tAcc += dt;
      if (!over) readInput();
      for (var i = 0; i < snakes.length; i++) {
        var s = snakes[i];
        if (s.dead) { if (!s.isPlayer && (s.respawn -= dt) <= 0) respawn(s); continue; }
        if (!s.isPlayer) think(s, dt);
        stepSnake(s, dt); eat(s);
      }
      collisions();
      var focus = player.dead ? (cam) : player.segs[0];
      cam.x += (focus.x - cam.x) * Math.min(1, dt * 8); cam.y += (focus.y - cam.y) * Math.min(1, dt * 8);
      var targetS = (H / 400) / (1 + player.mass / 900);
      cam.s += (clamp(targetS, .35, 2) - cam.s) * Math.min(1, dt * 3);
      updateHud(dt); drawMini();
    }
    render(tAcc);
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }

  /* ---------- controls ---------- */
  function initControls() {
    var stick = $('stick'), knob = $('knob'), pid = null;
    function move(e) {
      var r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy), max = r.width / 2;
      var k = d > max ? max / d : 1;
      knob.style.transform = 'translate(' + (dx * k) + 'px,' + (dy * k) + 'px)';
      input.mag = Math.min(1, d / max); if (d > 4) input.angle = Math.atan2(dy, dx);
    }
    stick.addEventListener('pointerdown', function (e) { pid = e.pointerId; stick.setPointerCapture(pid); input.touch = true; move(e); e.preventDefault(); });
    stick.addEventListener('pointermove', function (e) { if (e.pointerId === pid) move(e); });
    function up(e) { if (e.pointerId !== pid) return; pid = null; input.mag = 0; knob.style.transform = ''; }
    stick.addEventListener('pointerup', up); stick.addEventListener('pointercancel', up);

    var bb = $('boostBtn');
    function bset(v) { input.boost = v; bb.classList.toggle('hold', v); }
    bb.addEventListener('pointerdown', function (e) { bb.setPointerCapture(e.pointerId); bset(true); e.preventDefault(); });
    bb.addEventListener('pointerup', function () { bset(false); }); bb.addEventListener('pointercancel', function () { bset(false); });

    window.addEventListener('keydown', function (e) { input.keys[e.key.toLowerCase()] = true; if (e.key === ' ' && running) e.preventDefault(); });
    window.addEventListener('keyup', function (e) { input.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('mousemove', function (e) { if (e.pointerType !== 'touch') input.mouse = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('mousedown', function () { if (!input.touch) input.boost = true; });
    window.addEventListener('mouseup', function () { if (!input.touch && !bb.classList.contains('hold')) input.boost = false; });

    $('pauseBtn').addEventListener('click', function () { paused = true; $('pauseBox').classList.add('on'); });
    $('resumeBtn').addEventListener('click', function () { paused = false; last = performance.now(); $('pauseBox').classList.remove('on'); });
    $('quitBtn').addEventListener('click', function () { stop(); $('pauseBox').classList.remove('on'); VR.app.go('lobby'); });
    $('againBtn').addEventListener('click', function () { start(cfg); });
    $('lobbyBtn').addEventListener('click', function () { stop(); $('result').classList.remove('on'); VR.app.go('lobby'); });
    $('gMic').addEventListener('click', function () {
      VR.voice.toggle().then(function (on) { if (!on) VR.ui.toast('Allow microphone access to use voice chat'); $('gMic').classList.toggle('on', VR.voice.isOn()); });
    });
  }

  function init() {
    cv = $('gameCanvas'); ctx = cv.getContext('2d');
    mini = $('mini'); mctx = mini.getContext('2d');
    makeSprites(); resize(); initControls();
    window.addEventListener('resize', resize);
  }

  window.VR = window.VR || {};
  VR.game = { init: init, start: start, stop: stop };
})();
