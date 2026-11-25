/* js/game.js
 * Playable offline snake arena with bots, so you can test controls, HUD and squad flow.
 *  - Move: joystick (touch) / mouse / WASD or arrow keys.
 *  - Boost: BOOST button / Space / Shift (burns a little length).
 *  - Squad mates (from the lobby) are friendly bots: they follow you and cannot hurt you.
 *
 * BIG MAP: 5 zones - GOLD CORE (centre), JUNGLE (rich orbs), DESERT (few but big orbs),
 *          ICE (slippery), LAVA (burns, but huge orbs). Rocks to hide behind.
 * RED WALL: the safe area shrinks during the match. Outside it you lose length fast.
 * WIN:     be the last alive (or the longest when time is up) = "VIPER KING!"
 *          with a squad = "SQUAD KINGS!". No respawns.
 * EXTRAS:  golden orb (big bonus, shown on the map), power-ups (shield, magnet, speed).
 *
 * MULTIPLAYER LATER: this file is the "client view". With a server, replace the bot logic
 * (think / stepSnake for other snakes) with positions received from the server, and send
 * only your steering (angle + boost) to the server.
 *
 * API:  VR.game.init()   VR.game.start(cfg)   VR.game.stop()
 */
(function () {
  var G = VR_CONFIG.game;
  var WORLD = G.worldSize, SP = 8, GOLD_R = 0;
  var NAMES = ['Rudra', 'Kabir', 'Zoya', 'Arjun', 'Naga', 'Vyom', 'Mira', 'Tej', 'Ishaan', 'Rhea', 'Dev', 'Anaya', 'Kavya', 'Veer', 'Sia', 'Aarav', 'Neel', 'Tara', 'Ojas', 'Pari'];
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  var PAL = [['#B6FF3B', '#10B981'], ['#22D3EE', '#2563EB'], ['#C084FC', '#7C3AED'], ['#FF9F43', '#EF4444'], ['#F472B6', '#BE185D'], ['#FDE047', '#CA8A04']]
    .map(function (p) { return { a: hex(p[0]), b: hex(p[1]), css: p[0] }; });

  // zones: 0 gold core, 1 jungle (NW), 2 desert (NE), 3 ice (SW), 4 lava (SE)
  var Z = [
    { n: 'GOLD CORE', floor: '#3A2E0A', map: '#C9A227', m: 1.6, count: 260, note: 'rich orbs' },
    { n: 'JUNGLE', floor: '#0F2A1E', map: '#1F7A4D', m: 1, count: 1000, note: 'lots of orbs' },
    { n: 'DESERT', floor: '#33270F', map: '#B88A2E', m: 1.8, count: 500, note: 'big orbs' },
    { n: 'ICE', floor: '#0F2640', map: '#2F7FBF', m: 1, count: 800, note: 'slippery' },
    { n: 'LAVA', floor: '#3A1210', map: '#C2412D', m: 2.2, count: 500, note: 'burns, huge orbs' }
  ];
  var FX = [
    { k: 'sh', n: 'SHIELD', c: '#22D3EE', t: 6, ch: 'S' },
    { k: 'mg', n: 'MAGNET', c: '#FF7AD9', t: 9, ch: 'M' },
    { k: 'sp', n: 'SPEED', c: '#FFE45C', t: 7, ch: '>' }
  ];

  var cv, ctx, mini, mctx, bigCv, bctx, W = 0, H = 0, dpr = 1;
  var snakes = [], foods = [], rocks = [], pickups = [], golden = null, nextGold = 0, player = null, cfg = null, zc = { x: 0, y: 0 };
  var running = false, paused = false, over = false, raf = 0, last = 0, uid = 0, kills = 0, orbs = 0, lbT = 0, talkT = 0, hudT = 0, winT = 0;
  var matchT = 0, tAcc = 0, mapOpen = false, flags = {}, bannerT = 0;
  var cam = { x: 0, y: 0, s: 1 };
  var input = { angle: 0, mag: 0, touch: false, boost: false, keys: {}, mouse: null };
  var sprites = [];

  function $(id) { return document.getElementById(id); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function angDiff(t, c) { var d = t - c; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832; return d; }
  function mixc(a, b, t) { return 'rgb(' + ((a[0] + (b[0] - a[0]) * t) | 0) + ',' + ((a[1] + (b[1] - a[1]) * t) | 0) + ',' + ((a[2] + (b[2] - a[2]) * t) | 0) + ')'; }

  /* ---------- zones, red wall ---------- */
  function zoneAt(x, y) {
    var c = WORLD / 2;
    if (Math.hypot(x - c, y - c) < GOLD_R) return 0;
    return x < c ? (y < c ? 1 : 3) : (y < c ? 2 : 4);
  }
  function randInZone(z) {
    var c = WORLD / 2, i, x, y;
    if (z === 0) { var a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * (GOLD_R - 40); return { x: c + Math.cos(a) * r, y: c + Math.sin(a) * r }; }
    for (i = 0; i < 60; i++) { x = rnd(60, WORLD - 60); y = rnd(60, WORLD - 60); if (zoneAt(x, y) === z) return { x: x, y: y }; }
    return { x: c, y: c };
  }
  function safeRect(t) {
    var k = clamp((t - G.zoneStart) / (G.zoneEnd - G.zoneStart), 0, 1), h = G.zoneMinSize / 2;
    return {
      x0: 0 + (zc.x - h - 0) * k, y0: 0 + (zc.y - h - 0) * k,
      x1: WORLD + (zc.x + h - WORLD) * k, y1: WORLD + (zc.y + h - WORLD) * k
    };
  }
  function outsideSafe(x, y, sr, m) { m = m || 0; return x < sr.x0 + m || x > sr.x1 - m || y < sr.y0 + m || y > sr.y1 - m; }

  /* ---------- snakes ---------- */
  function segCount(s) { return Math.min(260, Math.floor(14 + s.mass * 0.8)); }
  function radiusOf(s) { return 8 + Math.min(10, s.mass / 70); }

  function makeSnake(o) {
    var ang = Math.random() * 6.283;
    var s = {
      id: ++uid, name: o.name, ci: o.ci, team: o.team || 0, isPlayer: !!o.isPlayer, mate: !!o.mate,
      angle: ang, targetAngle: ang, mass: o.mass || G.startMass, segs: [], dead: false, boost: false,
      kills: 0, dropT: 0, thinkT: 0, wob: Math.random() * 6, talk: 0, fx: { sh: 0, mg: 0, sp: 0 }
    };
    s.r = radiusOf(s);
    var n = segCount(s);
    for (var i = 0; i < n; i++) s.segs.push({ x: o.x - Math.cos(ang) * i * SP, y: o.y - Math.sin(ang) * i * SP });
    return s;
  }

  function freeSpot(minFromPlayer) {
    for (var t = 0; t < 30; t++) {
      var x = rnd(400, WORLD - 400), y = rnd(400, WORLD - 400);
      if (!player || Math.hypot(x - player.segs[0].x, y - player.segs[0].y) > minFromPlayer) return { x: x, y: y };
    }
    return { x: WORLD / 2, y: WORLD / 2 };
  }

  function addFood(x, y, v, ci, keep, z) {
    foods.push({ x: x, y: y, v: v, r: 3 + v * 1.4, ci: ci == null ? (Math.random() * PAL.length) | 0 : ci, keep: !!keep, z: z == null ? zoneAt(x, y) : z });
  }
  function baseFoodV(z) { return (1 + Math.random() * 1.5) * Z[z].m; }

  function dropDeathFood(s) {
    for (var i = 0; i < s.segs.length; i += 3) addFood(s.segs[i].x + rnd(-10, 10), s.segs[i].y + rnd(-10, 10), 2 + s.mass / 90, s.ci, false);
    var extra = foods.length - 5400;
    for (var j = 0; j < foods.length && extra > 0; j++) if (!foods[j].keep) { foods.splice(j, 1); j--; extra--; }
  }

  function kill(s, by) {
    if (s.dead) return;
    s.dead = true; dropDeathFood(s);
    if (by) { by.kills++; if (by.isPlayer) { kills++; $('hudKills').textContent = kills; } }
    if (s.isPlayer) endGame('dead');
  }

  /* ---------- movement ---------- */
  function stepSnake(s, dt) {
    var h = s.segs[0], rr = s.r, z = zoneAt(h.x, h.y);
    var diff = angDiff(s.targetAngle, s.angle), maxT = 4.4 * dt * (s.boost ? .8 : 1) * (z === 3 ? .42 : 1);
    s.angle += clamp(diff, -maxT, maxT);
    var sp = s.boost ? G.boostSpeed : G.speed;
    if (s.fx.sp > 0) sp = Math.max(sp, G.boostSpeed * .92);
    h.x = clamp(h.x + Math.cos(s.angle) * sp * dt, rr, WORLD - rr);
    h.y = clamp(h.y + Math.sin(s.angle) * sp * dt, rr, WORLD - rr);
    for (var q = 0; q < rocks.length; q++) {            // rocks are solid
      var rk = rocks[q], dx = h.x - rk.x, dy = h.y - rk.y, md = rk.r + rr;
      if (Math.abs(dx) < md && Math.abs(dy) < md) {
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d < md) { h.x = rk.x + dx / d * md; h.y = rk.y + dy / d * md; }
      }
    }
    for (var i = 1; i < s.segs.length; i++) {
      var p = s.segs[i - 1], g = s.segs[i], gx = p.x - g.x, gy = p.y - g.y, gd = Math.sqrt(gx * gx + gy * gy);
      if (gd > SP) { var k = (gd - SP) / gd; g.x += gx * k; g.y += gy * k; }
    }
    if (s.boost && s.fx.sp <= 0) {
      s.mass = Math.max(10, s.mass - 5 * dt); s.dropT += dt;
      if (s.dropT > .2) { s.dropT = 0; var t = s.segs[s.segs.length - 1]; addFood(t.x, t.y, 1, s.ci, false); }
      if (s.mass <= 12) s.boost = false;
    }
    if (z === 4 && s.fx.sh <= 0 && s.mass > 16) s.mass -= 1.4 * dt;        // lava burns
    var sr = safeRect(matchT);                                              // red wall hurts
    if (outsideSafe(h.x, h.y, sr, 0)) { s.mass -= Math.max(6, s.mass * .05) * dt; if (s.mass <= 10) { kill(s, null); return; } }
    if (s.fx.sh > 0) s.fx.sh -= dt; if (s.fx.mg > 0) s.fx.mg -= dt; if (s.fx.sp > 0) s.fx.sp -= dt;
    var want = segCount(s);
    while (s.segs.length < want) { var l = s.segs[s.segs.length - 1]; s.segs.push({ x: l.x, y: l.y }); }
    while (s.segs.length > want) s.segs.pop();
    s.r = radiusOf(s);
  }

  function eat(s) {
    var h = s.segs[0], hr = s.r + 3, mag = s.fx.mg > 0, reach = mag ? 300 : 36;
    for (var i = foods.length - 1; i >= 0; i--) {
      var f = foods[i], dx = h.x - f.x, dy = h.y - f.y;
      if (dx > 340 || dx < -340 || dy > 340 || dy < -340) continue;
      var d2 = dx * dx + dy * dy, m = hr + f.r + reach;
      if (d2 < m * m) {
        if (d2 < (hr + f.r) * (hr + f.r)) {
          s.mass += f.v * 0.9; if (s.isPlayer) orbs++;
          if (f.keep) { var p = randInZone(f.z); f.x = p.x; f.y = p.y; f.v = baseFoodV(f.z); f.r = 3 + f.v * 1.4; f.ci = (Math.random() * PAL.length) | 0; }
          else { foods[i] = foods[foods.length - 1]; foods.pop(); }
        } else { var pull = mag ? .3 : .18; f.x += dx * pull; f.y += dy * pull; }
      }
    }
    if (golden) {
      var gx = h.x - golden.x, gy = h.y - golden.y;
      if (gx * gx + gy * gy < (hr + golden.r) * (hr + golden.r)) {
        s.mass += golden.v;
        if (s.isPlayer) banner('GOLDEN ORB!  +' + Math.round(golden.v * 10), 2200);
        golden = null; nextGold = matchT + 40;
      }
    }
    for (var j = 0; j < pickups.length; j++) {
      var u = pickups[j]; if (u.cd > 0) continue;
      var ux = h.x - u.x, uy = h.y - u.y;
      if (ux * ux + uy * uy < (hr + 24) * (hr + 24)) {
        var fx = FX[u.type]; s.fx[fx.k] = fx.t; u.cd = 22;
        if (s.isPlayer) banner(fx.n + '!', 1500);
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
      if (hit && A.fx.sh <= 0) kill(A, hit);
    }
  }

  /* ---------- bot AI ---------- */
  function think(s, dt) {
    s.thinkT -= dt; s.wob += dt;
    if (s.thinkT > 0) return;
    s.thinkT = .22 + Math.random() * .3;
    var h = s.segs[0], i, j;
    // 0. stay inside the red wall
    var sr = safeRect(matchT), cx = (sr.x0 + sr.x1) / 2, cy = (sr.y0 + sr.y1) / 2;
    if (outsideSafe(h.x, h.y, sr, 150)) { s.targetAngle = Math.atan2(cy - h.y, cx - h.x); s.boost = outsideSafe(h.x, h.y, sr, 0) && s.mass > 20; return; }
    // 1. danger ahead (other team's bodies)
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
    if (danger && s.fx.sh <= 0) {
      var toward = Math.atan2(danger.y - h.y, danger.x - h.x);
      s.targetAngle = toward + (angDiff(toward, s.angle) > 0 ? -1.7 : 1.7);
      s.boost = dd < 60 && s.mass > 20; return;
    }
    s.boost = false;
    // 2. hunt a smaller snake nearby
    var prey = null, pd = 380;
    for (i = 0; i < snakes.length; i++) {
      var p = snakes[i]; if (p === s || p.dead || (s.team && s.team === p.team) || p.mass > s.mass * .7) continue;
      var pdist = Math.hypot(p.segs[0].x - h.x, p.segs[0].y - h.y);
      if (pdist < pd) { pd = pdist; prey = p; }
    }
    if (prey && s.mass > 25) {
      var ph0 = prey.segs[0];
      s.targetAngle = Math.atan2(ph0.y + Math.sin(prey.angle) * 90 - h.y, ph0.x + Math.cos(prey.angle) * 90 - h.x);
      s.boost = pd < 220 && s.mass > 35; return;
    }
    // 3. golden orb or power-up close by
    if (golden && Math.hypot(golden.x - h.x, golden.y - h.y) < 1000) { s.targetAngle = Math.atan2(golden.y - h.y, golden.x - h.x); return; }
    for (i = 0; i < pickups.length; i++) {
      var u = pickups[i]; if (u.cd > 0) continue;
      if (Math.abs(u.x - h.x) < 420 && Math.abs(u.y - h.y) < 420) { s.targetAngle = Math.atan2(u.y - h.y, u.x - h.x); return; }
    }
    // 4. squad mates stay close to the player
    if (s.mate && player && !player.dead) {
      var ph = player.segs[0], pdd = Math.hypot(ph.x - h.x, ph.y - h.y);
      if (pdd > 230) { s.targetAngle = Math.atan2(ph.y - h.y, ph.x - h.x); s.boost = pdd > 520 && s.mass > 20; return; }
    }
    // 5. nearest food
    var best = null, bd = 320 * 320;
    for (i = 0; i < foods.length; i++) {
      var f = foods[i], fdx = f.x - h.x; if (fdx > 320 || fdx < -320) continue;
      var fdy = f.y - h.y, d2 = fdx * fdx + fdy * fdy;
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
  function banner(text, ms) {
    var b = $('banner'); b.textContent = text; b.classList.add('on');
    clearTimeout(bannerT); bannerT = setTimeout(function () { b.classList.remove('on'); }, ms || 2000);
  }

  function spawnGolden() {
    var sr = safeRect(matchT), m = 200, x = rnd(sr.x0 + m, sr.x1 - m), y = rnd(sr.y0 + m, sr.y1 - m);
    golden = { x: x, y: y, v: 40, r: 18, born: matchT };
    banner('GOLDEN ORB appeared! Check the map', 2600);
  }

  function start(c) {
    cfg = c || { mode: 'solo', squad: [] };
    G = VR_CONFIG.game; WORLD = G.worldSize; GOLD_R = WORLD * .11;
    snakes = []; foods = []; rocks = []; pickups = []; golden = null; nextGold = 25;
    kills = 0; orbs = 0; over = false; paused = false; uid = 0; matchT = 0; tAcc = 0; flags = {}; mapOpen = false; winT = 0;
    $('hudKills').textContent = '0';
    $('result').classList.remove('on'); $('pauseBox').classList.remove('on'); $('bigMap').classList.remove('on');
    $('banner').classList.remove('on');
    resize();
    // safe-area centre: somewhere in the middle part of the map
    zc = { x: rnd(WORLD * .32, WORLD * .68), y: rnd(WORLD * .32, WORLD * .68) };
    // food, spread over the 5 zones
    Z.forEach(function (zn, zi) {
      var n = Math.round(zn.count * (WORLD / 6400) * (WORLD / 6400) * 1.0);
      for (var i = 0; i < n; i++) { var p = randInZone(zi); addFood(p.x, p.y, baseFoodV(zi), null, true, zi); }
    });
    // rocks (not in the gold core)
    for (var r = 0; r < 44; r++) {
      var rp = { x: rnd(300, WORLD - 300), y: rnd(300, WORLD - 300) };
      if (Math.hypot(rp.x - WORLD / 2, rp.y - WORLD / 2) < GOLD_R * .55) { r--; continue; }
      rocks.push({ x: rp.x, y: rp.y, r: rnd(38, 90), sh: Math.random() });
    }
    // power-ups
    for (var u = 0; u < 18; u++) { var pp = freeSpot(0); pickups.push({ x: pp.x, y: pp.y, type: u % 3, cd: 0 }); }

    var me = (cfg.user && cfg.user.name) || 'You';
    var sp = randInZone(1 + ((Math.random() * 4) | 0)); sp.x = clamp(sp.x, 600, WORLD - 600); sp.y = clamp(sp.y, 600, WORLD - 600);
    player = makeSnake({ name: me, ci: (cfg.user && cfg.user.skin) || 0, team: 1, isPlayer: true, x: sp.x, y: sp.y });
    snakes.push(player);

    var mates = cfg.mode === 'squad' ? cfg.squad.filter(function (m) { return !m.you; }) : [];
    mates.forEach(function (m, idx) {
      var s = makeSnake({ name: m.name, ci: m.color != null ? m.color % PAL.length : (idx + 1) % PAL.length, team: 1, mate: true, x: sp.x - 120 - idx * 60, y: sp.y + 90 + idx * 40 });
      snakes.push(s);
    });
    var used = {}; snakes.forEach(function (s) { used[s.name] = 1; });
    var pool = NAMES.filter(function (n) { return !used[n]; });
    for (var b = 0; b < G.botCount; b++) {
      var p2 = freeSpot(900);
      snakes.push(makeSnake({ name: pool[b % pool.length] + (b >= pool.length ? b : ''), ci: (b + 2) % PAL.length, x: p2.x, y: p2.y, mass: rnd(10, 60) }));
    }
    cam.x = sp.x; cam.y = sp.y;
    buildSquadBar();
    $('gMic').classList.toggle('on', VR.voice.isOn());
    banner('Survive! Last one alive is VIPER KING', 2600);
    running = true; last = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }

  function stop() { running = false; cancelAnimationFrame(raf); }

  function endGame(kind) {
    if (over) return;
    over = true;
    var alive = snakes.filter(function (s) { return !s.dead; });
    var place;
    if (kind === 'win') place = 1;
    else if (kind === 'time') place = alive.slice().sort(function (a, b) { return b.mass - a.mass; }).indexOf(player) + 1;
    else place = alive.length + 1;
    var win = kind === 'win' || (kind === 'time' && place === 1);
    var squadWin = win && cfg.mode === 'squad' && alive.some(function (s) { return s.mate; });
    var score = Math.floor(player.mass * 10);
    var res = (VR.lobby && VR.lobby.recordGame) ? VR.lobby.recordGame({ kills: kills, score: score, rank: place, win: win, orbs: orbs, squad: cfg.mode === 'squad', mode: cfg.mode }) : null;
    $('resTitle').textContent = win ? (squadWin ? 'SQUAD KINGS!' : 'VIPER KING!') : (kind === 'time' ? 'TIME UP' : 'YOU DIED');
    $('resCard').classList.toggle('win', win);
    $('resScore').textContent = score;
    $('resInfo').textContent = 'Place #' + place + '  |  Kills ' + kills + '  |  Orbs ' + orbs;
    $('resRewards').textContent = res ? ('+' + res.coins + ' COINS   +' + res.xp + ' XP   ' + (res.rp >= 0 ? '+' : '') + res.rp + ' RP') : '';
    setTimeout(function () { if (over) $('result').classList.add('on'); }, win ? 900 : 700);
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
  function fmtTime(sec) { sec = Math.max(0, Math.ceil(sec)); return ((sec / 60) | 0) + ':' + ('0' + (sec % 60)).slice(-2); }

  function updateHud(dt) {
    $('hudLen').textContent = Math.floor(player.mass * 10);
    $('hudAlive').textContent = snakes.filter(function (s) { return !s.dead; }).length;
    $('hudTime').textContent = fmtTime(G.matchSeconds - matchT);
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
    hudT -= dt;
    if (hudT <= 0) {
      hudT = .25;
      var h = player.segs[0], zn = Z[zoneAt(h.x, h.y)], sr = safeRect(matchT), out = outsideSafe(h.x, h.y, sr, 0);
      $('zoneTag').textContent = out ? 'OUTSIDE THE RED WALL - GET BACK IN!' : ('ZONE: ' + zn.n + ' - ' + zn.note);
      $('zoneTag').style.color = out ? '#FF6B7A' : '#fff';
      var fh = '';
      FX.forEach(function (f) { if (player.fx[f.k] > 0) fh += '<span class="fx" style="--c:' + f.c + '">' + f.n + ' ' + Math.ceil(player.fx[f.k]) + 's</span>'; });
      $('fxBar').innerHTML = fh;
    }
    // match events
    if (!flags.zs && matchT >= G.zoneStart) { flags.zs = 1; banner('RED WALL IS CLOSING IN!', 2800); }
    if (!flags.ze && matchT >= G.zoneEnd) { flags.ze = 1; banner('FINAL ZONE!', 2400); }
    if (!flags.t30 && matchT >= G.matchSeconds - 30) { flags.t30 = 1; banner('30 SECONDS LEFT', 2000); }
    // squad mic dots: you = real mic level; mates = simulated until voice is connected
    talkT -= dt;
    if (talkT <= 0) {
      talkT = .6;
      document.querySelectorAll('#squadBar .sq').forEach(function (el) { el.classList.toggle('talk', Math.random() < .25); });
    }
  }

  /* ---------- maps ---------- */
  function drawMapTo(x, S, big) {
    var k = S / WORLD, i, sr = safeRect(matchT);
    x.clearRect(0, 0, S, S);
    x.fillStyle = '#0B0F2A'; x.fillRect(0, 0, S, S);
    x.globalAlpha = .62;
    x.fillStyle = Z[1].map; x.fillRect(0, 0, S / 2, S / 2);
    x.fillStyle = Z[2].map; x.fillRect(S / 2, 0, S / 2, S / 2);
    x.fillStyle = Z[3].map; x.fillRect(0, S / 2, S / 2, S / 2);
    x.fillStyle = Z[4].map; x.fillRect(S / 2, S / 2, S / 2, S / 2);
    x.fillStyle = Z[0].map; x.beginPath(); x.arc(S / 2, S / 2, GOLD_R * k, 0, 6.283); x.fill();
    x.globalAlpha = 1;
    x.fillStyle = 'rgba(120,130,170,.9)';
    for (i = 0; i < rocks.length; i++) { x.beginPath(); x.arc(rocks[i].x * k, rocks[i].y * k, Math.max(1.5, rocks[i].r * k), 0, 6.283); x.fill(); }
    // outside of the safe area = red
    x.fillStyle = 'rgba(255,40,70,.38)'; x.beginPath(); x.rect(0, 0, S, S);
    x.rect(sr.x0 * k, sr.y0 * k, (sr.x1 - sr.x0) * k, (sr.y1 - sr.y0) * k); x.fill('evenodd');
    x.strokeStyle = '#fff'; x.lineWidth = big ? 3 : 1.6; x.strokeRect(sr.x0 * k, sr.y0 * k, (sr.x1 - sr.x0) * k, (sr.y1 - sr.y0) * k);
    for (i = 0; i < pickups.length; i++) { var u = pickups[i]; if (u.cd > 0) continue; x.fillStyle = FX[u.type].c; x.beginPath(); x.arc(u.x * k, u.y * k, big ? 5 : 2.6, 0, 6.283); x.fill(); }
    snakes.forEach(function (s) {
      if (s.dead) return; var h = s.segs[0];
      x.fillStyle = s.isPlayer ? '#B6FF3B' : (s.mate ? '#22D3EE' : '#FF6B6B');
      x.beginPath(); x.arc(h.x * k, h.y * k, s.isPlayer ? (big ? 8 : 5) : (big ? 5 : 3), 0, 6.283); x.fill();
      if (s.isPlayer) { x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); }
    });
    if (golden) {
      var gx = golden.x * k, gy = golden.y * k, pr = (big ? 9 : 6) + Math.sin(tAcc * 6) * 2;
      x.strokeStyle = '#FFE45C'; x.lineWidth = 2; x.beginPath(); x.arc(gx, gy, pr + 4, 0, 6.283); x.stroke();
      x.fillStyle = '#FFD23F'; x.beginPath(); x.arc(gx, gy, pr, 0, 6.283); x.fill();
    }
    if (!big) {
      var vw = (W / cam.s) * k, vh = (H / cam.s) * k;
      x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.2; x.strokeRect(cam.x * k - vw / 2, cam.y * k - vh / 2, vw, vh);
    } else {
      x.font = '700 15px Rajdhani, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#fff';
      x.fillText('JUNGLE', S * .25, S * .06); x.fillText('DESERT', S * .75, S * .06); x.fillText('ICE', S * .25, S * .97); x.fillText('LAVA', S * .75, S * .97); x.fillText('GOLD CORE', S / 2, S / 2 + GOLD_R * k + 16);
    }
  }
  function drawMini() { drawMapTo(mctx, mini.width, false); if (mapOpen) drawMapTo(bctx, bigCv.width, true); }

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
    var pal = PAL[s.ci % PAL.length], n = s.segs.length, r = s.r, i, g;
    if (s.boost || s.fx.sp > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(' + pal.a.join(',') + ',.10)'; for (i = n - 1; i >= 0; i -= 2) { g = s.segs[i]; ctx.beginPath(); ctx.arc(g.x, g.y, r * 1.8, 0, 6.283); ctx.fill(); } ctx.globalCompositeOperation = 'source-over'; }
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
    if (s.fx.sh > 0) { ctx.strokeStyle = 'rgba(34,211,238,' + (.55 + .3 * Math.sin(t * 8)) + ')'; ctx.fillStyle = 'rgba(34,211,238,.14)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(h.x, h.y, hr * 2.3, 0, 6.283); ctx.fill(); ctx.stroke(); }
    if (s.fx.mg > 0) { ctx.strokeStyle = 'rgba(255,122,217,.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]); ctx.beginPath(); ctx.arc(h.x, h.y, 150 + 14 * Math.sin(t * 5), 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
    ctx.font = '700 ' + Math.max(11, r * 1.1) + 'px Rajdhani, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = s.isPlayer ? '#B6FF3B' : (s.mate ? '#22D3EE' : 'rgba(255,255,255,.85)');
    ctx.fillText(s.name, h.x, h.y - hr * 1.9);
  }

  function render(t) {
    var sc = cam.s, i;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#070A1C'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (W / 2 - cam.x * sc), dpr * (H / 2 - cam.y * sc));
    var vx0 = cam.x - W / 2 / sc, vy0 = cam.y - H / 2 / sc, vx1 = cam.x + W / 2 / sc, vy1 = cam.y + H / 2 / sc, hw = WORLD / 2;
    // zone floors
    ctx.fillStyle = Z[1].floor; ctx.fillRect(0, 0, hw, hw);
    ctx.fillStyle = Z[2].floor; ctx.fillRect(hw, 0, hw, hw);
    ctx.fillStyle = Z[3].floor; ctx.fillRect(0, hw, hw, hw);
    ctx.fillStyle = Z[4].floor; ctx.fillRect(hw, hw, hw, hw);
    var gg = ctx.createRadialGradient(hw, hw, 0, hw, hw, GOLD_R);
    gg.addColorStop(0, '#6B5410'); gg.addColorStop(.8, Z[0].floor); gg.addColorStop(1, 'rgba(58,46,10,.0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(hw, hw, GOLD_R, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,63,.35)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(hw, hw, GOLD_R, 0, 6.283); ctx.stroke();
    // grid
    ctx.strokeStyle = 'rgba(159,176,255,.08)'; ctx.lineWidth = 1.5; ctx.beginPath();
    var gs = 90, gx = Math.max(0, Math.floor(vx0 / gs) * gs), gy = Math.max(0, Math.floor(vy0 / gs) * gs);
    for (var x = gx; x <= Math.min(WORLD, vx1); x += gs) { ctx.moveTo(x, Math.max(0, vy0)); ctx.lineTo(x, Math.min(WORLD, vy1)); }
    for (var y = gy; y <= Math.min(WORLD, vy1); y += gs) { ctx.moveTo(Math.max(0, vx0), y); ctx.lineTo(Math.min(WORLD, vx1), y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(hw, 0); ctx.lineTo(hw, WORLD); ctx.moveTo(0, hw); ctx.lineTo(WORLD, hw); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,60,90,.85)'; ctx.lineWidth = 10; ctx.strokeRect(0, 0, WORLD, WORLD);
    // rocks
    for (i = 0; i < rocks.length; i++) {
      var rk = rocks[i]; if (rk.x < vx0 - rk.r || rk.x > vx1 + rk.r || rk.y < vy0 - rk.r || rk.y > vy1 + rk.r) continue;
      ctx.fillStyle = '#4B5575'; ctx.strokeStyle = '#2A3150'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(rk.x, rk.y, rk.r, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.arc(rk.x - rk.r * .25, rk.y - rk.r * .3, rk.r * .5, 0, 6.283); ctx.fill();
    }
    // food
    for (i = 0; i < foods.length; i++) {
      var f = foods[i]; if (f.x < vx0 - 30 || f.x > vx1 + 30 || f.y < vy0 - 30 || f.y > vy1 + 30) continue;
      var sz = f.r * 4.2 * (1 + .12 * Math.sin(t * 3 + f.x));
      ctx.drawImage(sprites[f.ci], f.x - sz / 2, f.y - sz / 2, sz, sz);
    }
    // power-ups
    for (i = 0; i < pickups.length; i++) {
      var u = pickups[i]; if (u.cd > 0 || u.x < vx0 - 40 || u.x > vx1 + 40 || u.y < vy0 - 40 || u.y > vy1 + 40) continue;
      var fx = FX[u.type], pr = 20 + 3 * Math.sin(t * 4 + u.x);
      ctx.fillStyle = 'rgba(10,8,40,.8)'; ctx.strokeStyle = fx.c; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(u.x, u.y, pr, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = fx.c; ctx.font = '800 ' + (pr * 1.1) + 'px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(fx.ch, u.x, u.y + pr * .38);
    }
    // golden orb
    if (golden && golden.x > vx0 - 80 && golden.x < vx1 + 80 && golden.y > vy0 - 80 && golden.y < vy1 + 80) {
      var gp = golden.r * (1.6 + .2 * Math.sin(t * 5));
      ctx.globalCompositeOperation = 'lighter';
      var gr2 = ctx.createRadialGradient(golden.x, golden.y, 0, golden.x, golden.y, gp * 4);
      gr2.addColorStop(0, 'rgba(255,240,150,.9)'); gr2.addColorStop(.4, 'rgba(255,190,40,.4)'); gr2.addColorStop(1, 'rgba(255,190,40,0)');
      ctx.fillStyle = gr2; ctx.beginPath(); ctx.arc(golden.x, golden.y, gp * 4, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#FFD23F'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(golden.x, golden.y, gp, 0, 6.283); ctx.fill(); ctx.stroke();
    }
    // snakes (smaller first, player last)
    var order = snakes.filter(function (s) { return !s.dead; }).sort(function (a, b) { return (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0) || a.mass - b.mass; });
    order.forEach(function (s) { drawSnake(s, vx0, vy0, vx1, vy1, t); });
    // red wall: everything outside the safe area
    var sr = safeRect(matchT);
    if (sr.x0 > 0 || sr.y0 > 0 || sr.x1 < WORLD || sr.y1 < WORLD) {
      ctx.fillStyle = 'rgba(255,30,60,' + (.2 + .06 * Math.sin(t * 4)) + ')';
      ctx.fillRect(0, 0, WORLD, sr.y0); ctx.fillRect(0, sr.y1, WORLD, WORLD - sr.y1);
      ctx.fillRect(0, sr.y0, sr.x0, sr.y1 - sr.y0); ctx.fillRect(sr.x1, sr.y0, WORLD - sr.x1, sr.y1 - sr.y0);
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 8; ctx.strokeRect(sr.x0, sr.y0, sr.x1 - sr.x0, sr.y1 - sr.y0);
    }
  }

  /* ---------- loop ---------- */
  function frame(now) {
    if (!running) return;
    var dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!paused) {
      tAcc += dt;
      if (!over) { matchT += dt; readInput(); }
      for (var i = 0; i < snakes.length; i++) {
        var s = snakes[i];
        if (s.dead) continue;
        if (!s.isPlayer) think(s, dt);
        stepSnake(s, dt); if (s.dead) continue; eat(s);
      }
      collisions();
      for (var q = 0; q < pickups.length; q++) {            // power-ups come back somewhere else
        var pu = pickups[q]; if (pu.cd > 0) { pu.cd -= dt; if (pu.cd <= 0) { var np = freeSpot(0); pu.x = np.x; pu.y = np.y; } }
      }
      if (!over) {
        if (!golden && matchT >= nextGold) spawnGolden();
        else if (golden && matchT - golden.born > 35) { golden = null; nextGold = matchT + 30; }
        winT -= dt;
        if (winT <= 0) {
          winT = .4;
          if (!snakes.some(function (x) { return !x.dead && x.team !== 1; })) endGame('win');
        }
        if (matchT >= G.matchSeconds) endGame('time');
      }
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

    window.addEventListener('keydown', function (e) { input.keys[e.key.toLowerCase()] = true; if (e.key === ' ' && running) e.preventDefault(); if (e.key.toLowerCase() === 'm' && running) toggleMap(); });
    window.addEventListener('keyup', function (e) { input.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('mousemove', function (e) { if (e.pointerType !== 'touch') input.mouse = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('mousedown', function () { if (!input.touch) input.boost = true; });
    window.addEventListener('mouseup', function () { if (!input.touch && !bb.classList.contains('hold')) input.boost = false; });

    function toggleMap() { mapOpen = !mapOpen; $('bigMap').classList.toggle('on', mapOpen); if (mapOpen) drawMapTo(bctx, bigCv.width, true); }
    mini.addEventListener('click', toggleMap);
    $('bigMap').addEventListener('click', toggleMap);

    $('pauseBtn').addEventListener('click', function () { paused = true; $('pauseBox').classList.add('on'); });
    $('resumeBtn').addEventListener('click', function () { paused = false; last = performance.now(); $('pauseBox').classList.remove('on'); });
    $('quitBtn').addEventListener('click', function () { stop(); $('pauseBox').classList.remove('on'); $('bigMap').classList.remove('on'); VR.app.go('lobby'); });
    $('againBtn').addEventListener('click', function () { start(cfg); });
    $('lobbyBtn').addEventListener('click', function () { stop(); $('result').classList.remove('on'); VR.app.go('lobby'); });
    $('gMic').addEventListener('click', function () {
      VR.voice.toggle().then(function (on) { if (!on) VR.ui.toast('Allow microphone access to use voice chat'); $('gMic').classList.toggle('on', VR.voice.isOn()); });
    });
  }

  function init() {
    cv = $('gameCanvas'); ctx = cv.getContext('2d');
    mini = $('mini'); mctx = mini.getContext('2d');
    bigCv = $('bigMapCv'); bctx = bigCv.getContext('2d');
    GOLD_R = WORLD * .11;
    makeSprites(); resize(); initControls();
    window.addEventListener('resize', resize);
  }

  window.VR = window.VR || {};
  VR.game = { init: init, start: start, stop: stop };
})();
