/* js/game.js  -  VIPER ROYALE (20 minute battle)
 * Playable offline arena with bots, so you can test controls, HUD and squad flow.
 *  - Move: joystick (touch) / mouse / WASD or arrow keys.  Boost: BOOST / Space / Shift.
 *  - Heal: HEAL buttons (or H / J keys). They use the coins you pick up during the match.
 *  - HP: the red wall and lava hurt you. Medkits on the ground give HP back.
 *  - Revive: 1st = automatic (if you die in the first 3 minutes), 2nd = a teammate touches your heart.
 *    You come back with full HP, a 3 second shield, small like at the start, somewhere else on the map.
 *  - After you die you can watch your teammates, REPORT, LIKE, or LEAVE.
 *  - Win: last one alive = VIPER KING (SQUAD KINGS with a squad). Time up = longest snake wins.
 *
 * MULTIPLAYER LATER: this file is the "client view". With a server, replace think()/stepSnake() of the
 * other snakes by positions from the server, and send only your steering + actions (boost, heal) to it.
 * The REPORT / LIKE buttons are marked with NETWORK HOOK comments.
 *
 * API:  VR.game.init()   VR.game.start(cfg)   VR.game.stop()
 */
(function () {
  var G = VR_CONFIG.game;
  var WORLD = G.worldSize, SP = 8, GOLD_R = 0, HPMAX = 100;
  var NAMES = ['Rudra', 'Kabir', 'Zoya', 'Arjun', 'Naga', 'Vyom', 'Mira', 'Tej', 'Ishaan', 'Rhea', 'Dev', 'Anaya', 'Kavya', 'Veer', 'Sia', 'Aarav', 'Neel', 'Tara', 'Ojas', 'Pari'];
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  var PAL = [['#B6FF3B', '#10B981'], ['#22D3EE', '#2563EB'], ['#C084FC', '#7C3AED'], ['#FF9F43', '#EF4444'], ['#F472B6', '#BE185D'], ['#FDE047', '#CA8A04']]
    .map(function (p) { return { a: hex(p[0]), b: hex(p[1]), css: p[0] }; });

  var lastPlace = '';
  /* ---------- online match (see js/net.js and the server folder) ---------- */
  var NET = null, hadEnemy = false, byNet = {}, staticFoods = [], eatQ = [], dseq = 0, netT = 0;
  function prng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function respawnStatic(f) {                              // an orb that was eaten comes back at a place every player calculates the same
    f.rc = (f.rc || 0) + 1;
    var mr = Math.random; Math.random = prng((NET.seed ^ Math.imul(f.id + 1, 2654435761) ^ Math.imul(f.rc, 40503)) >>> 0);
    var p = randInZone(f.z); f.x = p.x; f.y = p.y; f.v = baseFoodV(f.z); f.r = 3 + f.v * 1.4; f.ci = (Math.random() * PAL.length) | 0;
    Math.random = mr;
  }
  function removeDrop(id) { for (var i = foods.length - 1; i >= 0; i--) if (foods[i].id === id) { foods[i] = foods[foods.length - 1]; foods.pop(); return; } }
  function stepRemote(s, dt) {
    if (s.emo) { s.emo.t -= dt; if (s.emo.t <= 0) s.emo = null; }
    var tg = s.netSegs; if (!tg) return;
    var n = tg.length / 2, k = Math.min(1, dt * 14), i;
    if (s.segs.length !== n) { s.segs = []; for (i = 0; i < n; i++) s.segs.push({ x: tg[2 * i], y: tg[2 * i + 1] }); return; }
    for (i = 0; i < n; i++) { var g = s.segs[i]; g.x += (tg[2 * i] - g.x) * k; g.y += (tg[2 * i + 1] - g.y) * k; }
  }
  function onNet(m) {
    if (!NET) return;
    var rs = m.id ? byNet[m.id] : null, i;
    if (m.t === 's' && rs) {
      rs.dead = false; rs.mass = m.m; rs.boost = !!m.b; rs.hp = m.h; rs.angle = m.a; rs.r = radiusOf(rs); rs.netSegs = m.g;
    } else if (m.t === 'eat') {
      for (i = 0; i < m.ids.length; i++) { var id = m.ids[i]; if (typeof id === 'number') { if (staticFoods[id]) respawnStatic(staticFoods[id]); } else removeDrop(id); }
    } else if (m.t === 'drop') {
      for (i = 0; i < m.f.length; i++) { var d = m.f[i]; foods.push({ x: d[0], y: d[1], v: d[2], r: 3 + d[2] * 1.4, ci: d[3], keep: false, z: zoneAt(d[0], d[1]), id: d[4] }); }
    } else if (m.t === 'died' && rs && !rs.dead) {
      rs.dead = true;
      if (m.by === NET.you && !over) { kills++; $('hudKills').textContent = kills; banner('You eliminated ' + rs.name, 1800); if (anim && anim.t === 'burst') burst(rs.segs[0].x, rs.segs[0].y, anim.c, 22); }
    } else if (m.t === 'emo' && rs) { rs.emo = { e: m.e, t: 3 };
    } else if (m.t === 'left' && rs) { rs.dead = true;
    } else if (m.t === 'closed' && running && !over) { banner('Connection lost - you play on alone', 3000); }
  }
  function netTick(dt) {
    if (!NET) return;
    netT += dt; if (netT < .083) return; netT = 0;
    if (eatQ.length) { VR.net.send({ t: 'eat', ids: eatQ }); eatQ = []; }
    if (player.dead) return;
    var g = [], i, sg = player.segs;
    for (i = 0; i < sg.length; i++) { g.push(Math.round(sg[i].x), Math.round(sg[i].y)); }
    VR.net.send({ t: 's', a: +player.angle.toFixed(2), m: +player.mass.toFixed(1), b: player.boost ? 1 : 0, h: Math.round(player.hp), g: g });
  }
  var FOOD_K = 2.3;      // orb amount per zone = zone count x this (few orbs, big gaps)
  var Z = [
    { n: 'GOLD CORE', floor: '#3A2E0A', map: '#C9A227', m: 1.6, count: 260, note: 'rich orbs, big coins' },
    { n: 'JUNGLE', floor: '#0F2A1E', map: '#1F7A4D', m: 1, count: 1000, note: 'lots of orbs' },
    { n: 'DESERT', floor: '#33270F', map: '#B88A2E', m: 1.8, count: 500, note: 'big orbs' },
    { n: 'ICE', floor: '#0F2640', map: '#2F7FBF', m: 1, count: 800, note: 'slippery' },
    { n: 'LAVA', floor: '#3A1210', map: '#C2412D', m: 2.2, count: 500, note: 'burns HP, big coins' }
  ];
  var FX = [
    { k: 'sh', n: 'SHIELD', c: '#22D3EE', t: 6, ch: 'S' },
    { k: 'mg', n: 'MAGNET', c: '#FF7AD9', t: 9, ch: 'M' },
    { k: 'sp', n: 'SPEED', c: '#FFE45C', t: 7, ch: '>' }
  ];
  var HEAL = { s: { cost: 100, hp: 25, cast: 2.5 }, l: { cost: 200, hp: 60, cast: 3 } };

  var cv, ctx, mini, mctx, bigCv, bctx, W = 0, H = 0, dpr = 1;
  var snakes = [], foods = [], rocks = [], pickups = [], meds = [], mcoins = [], hearts = [], parts = [], portal = null;
  var golden = null, nextGold = 0, player = null, cfg = null, zc = { x: 0, y: 0 };
  var running = false, paused = false, over = false, raf = 0, last = 0, uid = 0, kills = 0, orbs = 0, lbT = 0, talkT = 0, hudT = 0, winT = 0;
  var matchT = 0, tAcc = 0, mapOpen = false, flags = {}, bannerT = 0, myCoins = 0, rv = { auto: false, heart: false };
  var heal = { casting: false, t: 0, size: 's', cd: 0 }, anim = null, trailT = 0, deadPlace = 0, diedT = 0, killerName = '', winFx = 0;
  var spec = { on: false, idx: 0, liked: {}, reported: false };
  var cam = { x: 0, y: 0, s: 1 };
  var input = { angle: 0, mag: 0, touch: false, boost: false, keys: {}, mouse: null };
  var sprites = [], lastHp = -1;

  function $(id) { return document.getElementById(id); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function angDiff(t, c) { var d = t - c; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832; return d; }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

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
  function shrinkK(t) { return clamp((t - G.zoneStart) / (G.zoneEnd - G.zoneStart), 0, 1); }
  function safeRect(t) {
    var k = shrinkK(t), h = G.zoneMinSize / 2;
    return { x0: (zc.x - h) * k, y0: (zc.y - h) * k, x1: WORLD + (zc.x + h - WORLD) * k, y1: WORLD + (zc.y + h - WORLD) * k };
  }
  function outsideSafe(x, y, sr, m) { m = m || 0; return x < sr.x0 + m || x > sr.x1 - m || y < sr.y0 + m || y > sr.y1 - m; }


  /* ---------- named places ---------- */
  // fx, fy = position as a fraction of the map (0..1). Each place has a few extra orbs and its name is shown on the ground, minimap and in a banner.
  var PLACES = [
    { n: 'Viper Temple', fx: .12, fy: .14 }, { n: 'Toxic Swamp', fx: .35, fy: .12 }, { n: 'Hidden Grove', fx: .14, fy: .38 }, { n: 'Monkey Ruins', fx: .36, fy: .36 },
    { n: 'Sand Fort', fx: .64, fy: .12 }, { n: 'Oasis Camp', fx: .88, fy: .14 }, { n: 'Scorpion Dunes', fx: .62, fy: .38 }, { n: 'Lost Pyramid', fx: .87, fy: .36 },
    { n: 'Frost Peak', fx: .13, fy: .64 }, { n: 'Frozen Lake', fx: .36, fy: .62 }, { n: 'Ice Palace', fx: .12, fy: .88 }, { n: 'Blizzard Camp', fx: .37, fy: .87 },
    { n: 'Magma Core', fx: .63, fy: .64 }, { n: 'Ash Village', fx: .88, fy: .63 }, { n: 'Dragon Cave', fx: .64, fy: .87 }, { n: 'Fire Fort', fx: .88, fy: .88 }
  ];
  function placeR() { return WORLD * .03; }
  function placeAt(x, y) {
    var R = placeR();
    for (var i = 0; i < PLACES.length; i++) { var p = PLACES[i]; if (Math.abs(x - p.fx * WORLD) < R && Math.abs(y - p.fy * WORLD) < R && Math.hypot(x - p.fx * WORLD, y - p.fy * WORLD) < R) return p.n; }
    return Math.hypot(x - WORLD / 2, y - WORLD / 2) < GOLD_R ? 'Gold Core' : '';
  }

  /* ---------- snakes ---------- */
  function segCount(s) { return Math.min(260, Math.floor(14 + s.mass * 0.1)); }     // length grows only 0.1 per mass
  function radiusOf(s) { return 8 + Math.min(10, s.mass / 70); }

  function skinList() { return VR.cos.SKINS.filter(function (x) { return !x.pass; }); }
  function charList() { return VR.cos.CHARS.filter(function (x) { return !x.pass; }); }

  function makeSnake(o) {
    var ang = Math.random() * 6.283;
    var s = {
      id: ++uid, name: o.name, ci: o.ci, team: o.team || 0, isPlayer: !!o.isPlayer, mate: !!o.mate,
      angle: ang, targetAngle: ang, mass: o.mass || G.startMass, segs: [], dead: false, boost: false, hp: HPMAX,
      kills: 0, dropT: 0, thinkT: 0, wob: Math.random() * 6, fx: { sh: 0, mg: 0, sp: 0 },
      skin: o.skin || pick(skinList()), ch: o.ch || pick(charList())
    };
    s.r = radiusOf(s);
    var n = segCount(s);
    for (var i = 0; i < n; i++) s.segs.push({ x: o.x - Math.cos(ang) * i * SP, y: o.y - Math.sin(ang) * i * SP });
    return s;
  }
  function rebuild(s, x, y) {
    var ang = Math.random() * 6.283; s.angle = s.targetAngle = ang; s.segs = [];
    var n = segCount(s);
    for (var i = 0; i < n; i++) s.segs.push({ x: x - Math.cos(ang) * i * SP, y: y - Math.sin(ang) * i * SP });
    s.r = radiusOf(s);
  }

  function freeSpot(minFromPlayer) {
    for (var t = 0; t < 30; t++) {
      var x = rnd(400, WORLD - 400), y = rnd(400, WORLD - 400);
      if (!player || player.dead || Math.hypot(x - player.segs[0].x, y - player.segs[0].y) > minFromPlayer) return { x: x, y: y };
    }
    return { x: WORLD / 2, y: WORLD / 2 };
  }
  function safeSpot() {
    var sr = safeRect(matchT), best = null, bd = -1;
    for (var t = 0; t < 25; t++) {
      var x = rnd(sr.x0 + 350, sr.x1 - 350), y = rnd(sr.y0 + 350, sr.y1 - 350), md = 1e9;
      for (var i = 0; i < snakes.length; i++) { var o = snakes[i]; if (o.dead || o === player) continue; var d = Math.hypot(o.segs[0].x - x, o.segs[0].y - y); if (d < md) md = d; }
      if (md > bd) { bd = md; best = { x: x, y: y }; }
      if (md > 700) break;
    }
    return best || { x: zc.x, y: zc.y };
  }

  function addFood(x, y, v, ci, keep, z) {
    var nf = { x: x, y: y, v: v, r: 3 + v * 1.4, ci: ci == null ? (Math.random() * PAL.length) | 0 : ci, keep: !!keep, z: z == null ? zoneAt(x, y) : z };
    foods.push(nf); return nf;
  }
  function baseFoodV(z) { return 1 + Math.random() * 1.5; }       // same value in every zone

  function dropDeathFood(s) {
    var added = [];
    for (var i = 0; i < s.segs.length; i += 3) {
      var nf = addFood(s.segs[i].x + rnd(-10, 10), s.segs[i].y + rnd(-10, 10), 2 + s.mass / 90, s.ci, false);
      if (NET && s.isPlayer) { nf.id = 'd' + NET.you + '_' + (dseq++); added.push([Math.round(nf.x), Math.round(nf.y), +nf.v.toFixed(2), nf.ci, nf.id]); }
    }
    if (added.length) VR.net.send({ t: 'drop', f: added });
    var extra = foods.length - 14000;
    for (var j = 0; j < foods.length && extra > 0; j++) if (!foods[j].keep) { foods.splice(j, 1); j--; extra--; }
  }

  function aliveCount() { var n = 0; for (var i = 0; i < snakes.length; i++) if (!snakes[i].dead) n++; return n; }
  function aliveMates() { return snakes.filter(function (m) { return m.mate && !m.dead; }); }

  function kill(s, by) {
    if (s.dead) return;
    s.dead = true; dropDeathFood(s);
    if (by) {
      by.kills++;
      if (by.isPlayer) { kills++; $('hudKills').textContent = kills; if (anim && anim.t === 'burst') burst(s.segs[0].x, s.segs[0].y, anim.c, 22); }
    }
    if (s.isPlayer) { if (NET) VR.net.send({ t: 'died', by: by && by.netId ? by.netId : null }); onPlayerDown(by); }
  }

  /* ---------- revive + spectate ---------- */
  function onPlayerDown(by) {
    killerName = by ? by.name : 'RED WALL';
    heal.casting = false;
    if (matchT < (G.autoReviveSeconds || 180) && !rv.auto) { rv.auto = true; revive('AUTO REVIVE!'); return; }
    var mates = aliveMates().length > 0;
    deadPlace = aliveCount() + 1; diedT = matchT;
    if (!rv.heart && mates) {
      var h = player.segs[0];
      if (!outsideSafe(h.x, h.y, safeRect(matchT), 0)) { hearts = [{ x: h.x, y: h.y, t: 25 }]; banner('HEART DROPPED - a teammate can revive you!', 3000); }
      enterSpec(); return;
    }
    if (mates) { enterSpec(); return; }
    endGame('dead');
  }
  function revive(msg) {
    var p = player, sp = safeSpot();
    p.dead = false; p.mass = G.startMass; p.hp = HPMAX; p.boost = false; p.fx = { sh: 3, mg: 0, sp: 0 };
    rebuild(p, sp.x, sp.y); cam.x = sp.x; cam.y = sp.y;
    hearts = []; leaveSpec();
    if (anim && anim.t === 'spawn') portal = { x: sp.x, y: sp.y, t: 1.4 };
    banner(msg, 2600);
  }
  function enterSpec() {
    spec.on = true; spec.idx = 0; spec.reported = false;
    $('spec').classList.add('on'); $('repMenu').classList.remove('on'); $('game').classList.add('sp');
  }
  function leaveSpec() { spec.on = false; $('spec').classList.remove('on'); $('repMenu').classList.remove('on'); $('game').classList.remove('sp'); }
  function specTarget() {
    var l = aliveMates(); if (!l.length) return null;
    spec.idx = ((spec.idx % l.length) + l.length) % l.length; return l[spec.idx];
  }

  /* ---------- movement ---------- */
  function stepSnake(s, dt) {
    var h = s.segs[0], rr = s.r, z = zoneAt(h.x, h.y);
    var diff = angDiff(s.targetAngle, s.angle), maxT = 4.4 * (s === player && VR.settings ? VR.settings.get('sens') / 100 : 1) * dt * (s.boost ? .8 : 1) * (z === 3 ? .42 : 1);
    s.angle += clamp(diff, -maxT, maxT);
    var sp = s.boost ? G.boostSpeed : G.speed;
    if (s.fx.sp > 0) sp = Math.max(sp, G.boostSpeed * .92);
    h.x = clamp(h.x + Math.cos(s.angle) * sp * dt, rr, WORLD - rr);
    h.y = clamp(h.y + Math.sin(s.angle) * sp * dt, rr, WORLD - rr);
    for (var q = 0; q < rocks.length; q++) {
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
    if (z === 4 && s.fx.sh <= 0) s.hp -= 2.5 * dt;                         // lava burns HP
    if (outsideSafe(h.x, h.y, safeRect(matchT), 0)) s.hp -= (4 + 10 * shrinkK(matchT)) * dt;   // red wall burns HP
    if (s.hp <= 0) { s.hp = 0; kill(s, null); return; }
    if (s.fx.sh > 0) s.fx.sh -= dt; if (s.fx.mg > 0) s.fx.mg -= dt; if (s.fx.sp > 0) s.fx.sp -= dt;
    var want = segCount(s);
    while (s.segs.length < want) { var l = s.segs[s.segs.length - 1]; s.segs.push({ x: l.x, y: l.y }); }
    while (s.segs.length > want) s.segs.pop();
    s.r = radiusOf(s);
  }

  function eat(s) {
    var h = s.segs[0], hr = s.r + 3, mag = s.fx.mg > 0, reach = mag ? 300 : 36, i;
    for (i = foods.length - 1; i >= 0; i--) {
      var f = foods[i], dx = h.x - f.x, dy = h.y - f.y;
      if (dx > 340 || dx < -340 || dy > 340 || dy < -340) continue;
      var d2 = dx * dx + dy * dy, m = hr + f.r + reach;
      if (d2 < m * m) {
        if (d2 < (hr + f.r) * (hr + f.r)) {
          s.mass += f.v * 0.5; if (s.isPlayer) orbs++;
          if (NET && s.isPlayer && f.id != null) eatQ.push(f.id);
          if (f.keep && NET) respawnStatic(f);
          else if (f.keep) { var p = randInZone(f.z); f.x = p.x; f.y = p.y; f.v = baseFoodV(f.z); f.r = 3 + f.v * 1.4; f.ci = (Math.random() * PAL.length) | 0; }
          else { foods[i] = foods[foods.length - 1]; foods.pop(); }
        } else { var pull = mag ? .3 : .18; f.x += dx * pull; f.y += dy * pull; }
      }
    }
    if (golden) {
      var gx = h.x - golden.x, gy = h.y - golden.y;
      if (gx * gx + gy * gy < (hr + golden.r) * (hr + golden.r)) {
        s.mass += golden.v;
        if (s.isPlayer) banner('GOLDEN ORB!  +' + Math.round(golden.v * 10), 2200);
        golden = null; nextGold = matchT + (G.goldenEvery || 50);
      }
    }
    for (i = 0; i < pickups.length; i++) {
      var u = pickups[i]; if (u.cd > 0) continue;
      var ux = h.x - u.x, uy = h.y - u.y;
      if (ux * ux + uy * uy < (hr + 24) * (hr + 24)) {
        var fx = FX[u.type]; s.fx[fx.k] = fx.t; u.cd = 22;
        if (s.isPlayer) banner(fx.n + '!', 1500);
      }
    }
    if (s.hp < HPMAX) for (i = 0; i < meds.length; i++) {          // medkits on the ground
      var md2 = meds[i]; if (md2.cd > 0) continue;
      var mx = h.x - md2.x, my = h.y - md2.y, mr = hr + (md2.big ? 26 : 20);
      if (mx * mx + my * my < mr * mr) {
        s.hp = Math.min(HPMAX, s.hp + (md2.big ? HEAL.l.hp : HEAL.s.hp)); md2.cd = 45;
        if (s.isPlayer) banner('+' + (md2.big ? HEAL.l.hp : HEAL.s.hp) + ' HP', 1200);
      }
    }
    if (s.isPlayer) for (i = 0; i < mcoins.length; i++) {          // match coins (for healing)
      var c = mcoins[i], cx = h.x - c.x, cy = h.y - c.y, cr = hr + 14 + (mag ? 120 : 0);
      if (cx * cx + cy * cy < cr * cr) { myCoins += c.v; var np = randInZone(c.z); c.x = np.x; c.y = np.y; }
    }
    if (s.mate && player.dead && hearts.length) {                  // teammate touches your heart
      var he = hearts[0], hx = h.x - he.x, hy = h.y - he.y;
      if (hx * hx + hy * hy < (hr + 30) * (hr + 30)) { rv.heart = true; revive(s.name.toUpperCase() + ' REVIVED YOU!'); }
    }
  }

  function collisions() {
    for (var a = 0; a < snakes.length; a++) {
      var A = snakes[a]; if (A.dead || A.remote) continue;
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
    var sr = safeRect(matchT), cx = (sr.x0 + sr.x1) / 2, cy = (sr.y0 + sr.y1) / 2;
    if (outsideSafe(h.x, h.y, sr, 150)) { s.targetAngle = Math.atan2(cy - h.y, cx - h.x); s.boost = outsideSafe(h.x, h.y, sr, 0) && s.mass > 20; return; }
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
    if (s.mate && player.dead && hearts.length) {                        // go and revive the player
      var he = hearts[0]; s.targetAngle = Math.atan2(he.y - h.y, he.x - h.x); s.boost = Math.hypot(he.x - h.x, he.y - h.y) > 400 && s.mass > 20; return;
    }
    if (s.hp < 60) {                                                     // look for a medkit
      var mb = null, mbd = 700;
      for (i = 0; i < meds.length; i++) { var m = meds[i]; if (m.cd > 0) continue; var md = Math.hypot(m.x - h.x, m.y - h.y); if (md < mbd) { mbd = md; mb = m; } }
      if (mb) { s.targetAngle = Math.atan2(mb.y - h.y, mb.x - h.x); return; }
    }
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
    if (golden && Math.hypot(golden.x - h.x, golden.y - h.y) < 1000) { s.targetAngle = Math.atan2(golden.y - h.y, golden.x - h.x); return; }
    for (i = 0; i < pickups.length; i++) {
      var u = pickups[i]; if (u.cd > 0) continue;
      if (Math.abs(u.x - h.x) < 420 && Math.abs(u.y - h.y) < 420) { s.targetAngle = Math.atan2(u.y - h.y, u.x - h.x); return; }
    }
    if (s.mate && !player.dead) {
      var pl = player.segs[0], pdd = Math.hypot(pl.x - h.x, pl.y - h.y);
      if (pdd > 230) { s.targetAngle = Math.atan2(pl.y - h.y, pl.x - h.x); s.boost = pdd > 520 && s.mass > 20; return; }
    }
    var best = null, bd = 900 * 900;
    for (i = 0; i < foods.length; i++) {
      var f = foods[i], fdx = f.x - h.x; if (fdx > 900 || fdx < -900) continue;
      var fdy = f.y - h.y, d2 = fdx * fdx + fdy * fdy;
      if (d2 < bd) { bd = d2; best = f; }
    }
    if (best) s.targetAngle = Math.atan2(best.y - h.y, best.x - h.x);
    else s.targetAngle = s.angle + Math.sin(s.wob) * .9;
  }

  /* ---------- player input + healing ---------- */
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

  function startHeal(size) {
    if (!player || player.dead || over || paused) return;
    var o = HEAL[size];
    if (heal.casting) return;
    if (heal.cd > 0) { VR.ui.toast('Heal is cooling down ' + Math.ceil(heal.cd) + 's'); return; }
    if (player.hp >= HPMAX) { VR.ui.toast('HP is already full'); return; }
    if (myCoins < o.cost) { VR.ui.toast('Need ' + (o.cost - myCoins) + ' more coins'); return; }
    heal.casting = true; heal.t = o.cast; heal.size = size;
  }
  function stepHeal(dt) {
    if (heal.cd > 0) heal.cd -= dt;
    if (!heal.casting) return;
    if (player.dead) { heal.casting = false; return; }
    if (player.boost) { heal.casting = false; VR.ui.toast('Healing stopped - you boosted'); return; }
    heal.t -= dt;
    if (heal.t <= 0) {
      var o = HEAL[heal.size]; heal.casting = false;
      if (myCoins < o.cost) return;
      myCoins -= o.cost; player.hp = Math.min(HPMAX, player.hp + o.hp);
      heal.cd = player.hp >= HPMAX ? 60 : 5;
      banner('+' + o.hp + ' HP', 1000);
    }
  }

  /* ---------- effects (animations you unlocked) ---------- */
  function burst(x, y, c, n) {
    for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, v = rnd(60, 220); parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: .8, ml: .8, c: c, r: rnd(3, 6) }); }
  }
  function spark(x, y, c, vx, vy, l, r) { parts.push({ x: x, y: y, vx: vx, vy: vy, l: l, ml: l, c: c, r: r }); }
  function stepFx(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.l -= dt; if (p.l <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (parts.length > 400) parts.splice(0, parts.length - 400);
    if (portal) { portal.t -= dt; if (portal.t <= 0) portal = null; }
    if (winFx > 0) winFx -= dt;
    if (!anim || player.dead) return;
    trailT -= dt;
    if (trailT <= 0) {
      trailT = .04;
      var sg = player.segs, tl = sg[Math.min(sg.length - 1, 4)];
      if (anim.t === 'trail') spark(tl.x + rnd(-8, 8), tl.y + rnd(-8, 8), anim.c, rnd(-20, 20), rnd(-20, 20), .7, rnd(2.5, 5));
      if (anim.t === 'fire' && player.boost) { var tail = sg[sg.length - 1]; for (var k = 0; k < 2; k++) spark(tail.x, tail.y, k ? '#FFD23F' : '#FF5A28', Math.cos(player.angle + 3.14) * rnd(40, 120) + rnd(-30, 30), Math.sin(player.angle + 3.14) * rnd(40, 120) + rnd(-30, 30), .5, rnd(4, 8)); }
    }
  }

  /* ---------- game flow ---------- */
  function banner(text, ms) {
    var b = $('banner'); b.textContent = text; b.classList.add('on');
    clearTimeout(bannerT); bannerT = setTimeout(function () { b.classList.remove('on'); }, ms || 2000);
  }

  function spawnGolden() {
    var sr = safeRect(matchT), m = 200;
    golden = { x: rnd(sr.x0 + m, sr.x1 - m), y: rnd(sr.y0 + m, sr.y1 - m), v: 40, r: 18, born: matchT };
    banner('GOLDEN ORB appeared! Check the map', 2600);
  }

  function start(c) {
    cfg = c || { mode: 'solo', squad: [] };
    lastPlace = '';
    if (VR.settings) VR.settings.apply();
    $('emoPanel').classList.remove('on');
    NET = cfg.net || null; byNet = {}; staticFoods = []; eatQ = []; dseq = 0; netT = 0;
    G = VR_CONFIG.game;
    if (NET) { G = {}; for (var gk in VR_CONFIG.game) G[gk] = VR_CONFIG.game[gk]; G.worldSize = NET.world; G.zoneMinSize = Math.min(G.zoneMinSize, NET.world * .15); }
    WORLD = G.worldSize; GOLD_R = WORLD * .11; HPMAX = G.hpMax || 100;
    snakes = []; foods = []; rocks = []; pickups = []; meds = []; mcoins = []; hearts = []; parts = []; portal = null; golden = null; nextGold = 25;
    kills = 0; orbs = 0; myCoins = 0; over = false; paused = false; uid = 0; matchT = 0; tAcc = 0; flags = {}; mapOpen = false; winT = 0; winFx = 0;
    rv = { auto: false, heart: false }; heal = { casting: false, t: 0, size: 's', cd: 0 }; deadPlace = 0; diedT = 0; killerName = ''; lastHp = -1;
    spec = { on: false, idx: 0, liked: {}, reported: false };
    var u = cfg.user || {}, eq = u.eq || {};
    anim = eq.anim ? VR.cos.find('anim', eq.anim) : null;
    $('hudKills').textContent = '0';
    ['result', 'pauseBox', 'bigMap', 'spec', 'repMenu', 'banner'].forEach(function (id) { $(id).classList.remove('on'); });
    resize();
    var realRandom = Math.random; if (NET) Math.random = prng(NET.seed);       // same world for every online player
    zc = { x: rnd(WORLD * .32, WORLD * .68), y: rnd(WORLD * .32, WORLD * .68) };
    Z.forEach(function (zn, zi) {
      var n = Math.round(zn.count * FOOD_K);
      for (var i = 0; i < n; i++) { var p = randInZone(zi); addFood(p.x, p.y, baseFoodV(zi), null, true, zi); }
    });
    PLACES.forEach(function (pl) {                                    // a few extra orbs in each named place
      for (var i = 0; i < 14; i++) { var a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * placeR() * .9; var fx = pl.fx * WORLD + Math.cos(a) * d, fy = pl.fy * WORLD + Math.sin(a) * d; addFood(fx, fy, baseFoodV(0), null, true, zoneAt(fx, fy)); }
    });
    for (var r = 0; r < 300; r++) {
      var rp = { x: rnd(300, WORLD - 300), y: rnd(300, WORLD - 300) };
      if (Math.hypot(rp.x - WORLD / 2, rp.y - WORLD / 2) < GOLD_R * .55) { r--; continue; }
      rocks.push({ x: rp.x, y: rp.y, r: rnd(38, 90) });
    }
    for (var q = 0; q < 90; q++) { var pp = freeSpot(0); pickups.push({ x: pp.x, y: pp.y, type: q % 3, cd: 0 }); }
    for (var md = 0; md < 100; md++) { var mp = freeSpot(0); meds.push({ x: mp.x, y: mp.y, big: md % 3 === 0, cd: 0 }); }
    // match coins: 50 each in dangerous places (gold core, lava), 10 each elsewhere, always single coins
    [[0, 144, 50], [4, 160, 50], [1, 240, 10], [2, 240, 10], [3, 240, 10]].forEach(function (zz) {
      for (var i = 0; i < zz[1]; i++) { var cp = randInZone(zz[0]); mcoins.push({ x: cp.x, y: cp.y, v: zz[2], z: zz[0] }); }
    });

    Math.random = realRandom;
    if (NET) { for (var fi = 0; fi < foods.length; fi++) { foods[fi].id = fi; foods[fi].rc = 0; } staticFoods = foods.slice(); nextGold = 1e9; }
    var me = u.name || 'You';
    var sp = randInZone(1 + ((Math.random() * 4) | 0)); sp.x = clamp(sp.x, 600, WORLD - 600); sp.y = clamp(sp.y, 600, WORLD - 600);
    var myNet = NET ? NET.players.filter(function (q) { return q.id === NET.you; })[0] : null; if (myNet) { sp.x = myNet.x; sp.y = myNet.y; }
    player = makeSnake({ name: me, ci: u.skin || 0, team: 1, isPlayer: true, x: sp.x, y: sp.y, skin: VR.cos.find('skin', eq.skin || 's0'), ch: VR.cos.find('char', eq.char || 'c0') });
    snakes.push(player);
    if (anim && anim.t === 'spawn') portal = { x: sp.x, y: sp.y, t: 1.6 };

    var mates = cfg.mode === 'squad' && !NET ? cfg.squad.filter(function (m) { return !m.you; }) : [];
    mates.forEach(function (m, idx) {
      snakes.push(makeSnake({ name: m.name, ci: m.color != null ? m.color % PAL.length : (idx + 1) % PAL.length, team: 1, mate: true, x: sp.x - 120 - idx * 60, y: sp.y + 90 + idx * 40 }));
    });
    var used = {}; snakes.forEach(function (s) { used[s.name] = 1; });
    var pool = NAMES.filter(function (n) { return !used[n]; });
    if (NET) {
      NET.players.forEach(function (q) {
        if (q.id === NET.you) return;
        var same = !!(myNet && myNet.code && q.code === myNet.code);
        var rs = makeSnake({ name: q.name, ci: q.ci || 0, team: same ? 1 : 0, mate: same, x: q.x, y: q.y, skin: VR.cos.find('skin', q.skin), ch: VR.cos.find('char', q.ch) });
        rs.remote = true; rs.netId = q.id; rs.uid = q.uid || ''; byNet[q.id] = rs; snakes.push(rs);
      });
      VR.net.onGame = onNet;
      hadEnemy = snakes.some(function (x) { return x.remote && !x.mate; });
    }
    var nBots = NET ? 0 : Math.max(0, (G.maxPlayers || 50) - 1 - mates.length);
    for (var b = 0; b < nBots; b++) {
      var p2 = freeSpot(900);
      snakes.push(makeSnake({ name: pool[b % pool.length] + (b >= pool.length ? b : ''), ci: (b + 2) % PAL.length, x: p2.x, y: p2.y, mass: rnd(10, 60) }));
    }
    cam.x = sp.x; cam.y = sp.y;
    buildSquadBar();
    $('gMic').classList.toggle('on', VR.voice.isOn());
    banner('VIPER ROYALE  -  last one alive is VIPER KING', 3000);
    running = true; last = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }

  function stop() { running = false; cancelAnimationFrame(raf); if (NET) { VR.net.onGame = null; VR.net.close(); } }

  function endGame(kind) {
    if (over) return;
    over = true; leaveSpec(); if (NET) { VR.net.onGame = null; VR.net.close(); }
    var alive = snakes.filter(function (s) { return !s.dead; });
    var place;
    if (kind === 'win') place = 1;
    else if (kind === 'time') place = player.dead ? (deadPlace || alive.length + 1) : alive.slice().sort(function (a, b) { return b.mass - a.mass; }).indexOf(player) + 1;
    else place = deadPlace || alive.length + 1;
    var win = kind === 'win' || (kind === 'time' && place === 1);
    var squadWin = win && cfg.mode === 'squad' && alive.some(function (s) { return s.mate; });
    var score = Math.floor(player.mass * 10);
    var res = (VR.lobby && VR.lobby.recordGame) ? VR.lobby.recordGame({ time: player.dead ? diedT : matchT, kills: kills, score: score, rank: place, win: win, orbs: orbs, squad: cfg.mode === 'squad', mode: cfg.mode }) : null;
    $('resTitle').textContent = win ? (squadWin ? 'SQUAD KINGS!' : 'VIPER KING!') : (kind === 'time' ? 'TIME UP' : 'YOU DIED');
    $('resCard').classList.toggle('win', win);
    $('resScore').textContent = score;
    $('resInfo').textContent = 'Place #' + place + '  |  Kills ' + kills + '  |  Orbs ' + orbs;
    $('resRewards').textContent = res ? ('+' + res.coins + ' COINS   +' + res.xp + ' XP   ' + (res.rp >= 0 ? '+' : '') + res.rp + ' RP') : '';
    if (win && anim && anim.t === 'win' && !player.dead) { winFx = 2; for (var i = 0; i < 40; i++) { var a = Math.random() * 6.283, v = rnd(80, 300), h = player.segs[0]; parts.push({ x: h.x, y: h.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, l: 1.6, ml: 1.6, c: 'hsl(' + ((Math.random() * 360) | 0) + ',85%,60%)', r: rnd(3, 6) }); } }
    setTimeout(function () { if (over) $('result').classList.add('on'); }, win ? 1500 : 700);
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
    $('hudAlive').textContent = aliveCount();
    $('hudTime').textContent = fmtTime(G.matchSeconds - matchT);
    var hpv = Math.ceil(player.hp) + (heal.casting ? 1000 : 0);
    if (hpv !== lastHp) {
      lastHp = hpv; var pc = clamp(player.hp / HPMAX * 100, 0, 100);
      $('hpFill').style.width = pc + '%'; $('hpFill').style.background = heal.casting ? '#7CFFB2' : (pc < 30 ? '#FF3B5C' : pc < 60 ? '#FFB11F' : '#7CFF3A');
      $('hpTxt').textContent = (heal.casting ? 'HEALING  ' : 'HP  ') + Math.ceil(player.hp) + ' / ' + HPMAX;
    }
    $('hudCoin').textContent = myCoins;
    ['s', 'l'].forEach(function (sz) {
      var b = $(sz === 's' ? 'healS' : 'healL'), o = HEAL[sz];
      var off = player.dead || heal.cd > 0 || myCoins < o.cost || player.hp >= HPMAX;
      b.classList.toggle('dis', off); b.classList.toggle('cast', heal.casting && heal.size === sz);
      b.querySelector('small').textContent = heal.cd > 0 ? Math.ceil(heal.cd) + 's' : o.cost + 'c';
    });
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
      var h = player.segs[0], zn = Z[zoneAt(h.x, h.y)], curPlace = placeAt(h.x, h.y), out = outsideSafe(h.x, h.y, safeRect(matchT), 0);
      if (!player.dead && curPlace !== lastPlace) { lastPlace = curPlace; if (curPlace) banner('ENTERING: ' + curPlace.toUpperCase(), 1800); }
      $('zoneTag').textContent = player.dead ? 'WATCHING YOUR TEAM' : (out ? 'OUTSIDE THE RED WALL - HP DRAINING!' : ('ZONE: ' + zn.n + (curPlace ? ' - ' + curPlace : '')));
      $('zoneTag').style.color = out && !player.dead ? '#FF6B7A' : '#fff';
      var fh = '';
      FX.forEach(function (f) { if (player.fx[f.k] > 0) fh += '<span class="fx" style="--c:' + f.c + '">' + f.n + ' ' + Math.ceil(player.fx[f.k]) + 's</span>'; });
      $('fxBar').innerHTML = fh;
      if (spec.on) {
        var tg = specTarget();
        $('specName').textContent = tg ? tg.name.toUpperCase() : '';
        $('specInfo').textContent = hearts.length ? 'REVIVE CHANCE ' + Math.ceil(hearts[0].t) + 's - teammate must touch the heart' : 'You were eliminated' + (killerName ? ' by ' + killerName : '');
        $('specReport').firstChild.nodeValue = 'REPORT ' + (killerName && killerName !== 'RED WALL' ? killerName.toUpperCase() : (tg ? tg.name.toUpperCase() : ''));
      }
    }
    if (!flags.zs && matchT >= G.zoneStart) { flags.zs = 1; banner('RED WALL IS CLOSING IN!', 2800); }
    if (!flags.ze && matchT >= G.zoneEnd) { flags.ze = 1; banner('FINAL ZONE!', 2400); }
    if (!flags.t60 && matchT >= G.matchSeconds - 60) { flags.t60 = 1; banner('1 MINUTE LEFT', 2000); }
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
    x.fillStyle = 'rgba(255,40,70,.38)'; x.beginPath(); x.rect(0, 0, S, S);
    x.rect(sr.x0 * k, sr.y0 * k, (sr.x1 - sr.x0) * k, (sr.y1 - sr.y0) * k); x.fill('evenodd');
    x.strokeStyle = '#fff'; x.lineWidth = big ? 3 : 1.6; x.strokeRect(sr.x0 * k, sr.y0 * k, (sr.x1 - sr.x0) * k, (sr.y1 - sr.y0) * k);
    for (i = 0; i < pickups.length; i++) { var u = pickups[i]; if (u.cd > 0) continue; x.fillStyle = FX[u.type].c; x.beginPath(); x.arc(u.x * k, u.y * k, big ? 5 : 2.6, 0, 6.283); x.fill(); }
    for (i = 0; i < meds.length; i++) { var m = meds[i]; if (m.cd > 0) continue; x.fillStyle = '#7CFF8A'; x.fillRect(m.x * k - (big ? 4 : 2), m.y * k - (big ? 4 : 2), big ? 8 : 4, big ? 8 : 4); }
    snakes.forEach(function (s) {
      if (s.dead) return; var h = s.segs[0];
      x.fillStyle = s.isPlayer ? '#B6FF3B' : (s.mate ? '#22D3EE' : '#FF6B6B');
      x.beginPath(); x.arc(h.x * k, h.y * k, s.isPlayer ? (big ? 8 : 5) : (big ? 5 : 3), 0, 6.283); x.fill();
      if (s.isPlayer) { x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); }
    });
    if (hearts.length) { x.fillStyle = '#FF4D8D'; x.beginPath(); x.arc(hearts[0].x * k, hearts[0].y * k, big ? 9 : 6, 0, 6.283); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke(); }
    if (golden) {
      var gx = golden.x * k, gy = golden.y * k, pr = (big ? 9 : 6) + Math.sin(tAcc * 6) * 2;
      x.strokeStyle = '#FFE45C'; x.lineWidth = 2; x.beginPath(); x.arc(gx, gy, pr + 4, 0, 6.283); x.stroke();
      x.fillStyle = '#FFD23F'; x.beginPath(); x.arc(gx, gy, pr, 0, 6.283); x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,.8)';
    for (i = 0; i < PLACES.length; i++) { x.beginPath(); x.arc(PLACES[i].fx * S, PLACES[i].fy * S, big ? 4 : 2, 0, 6.283); x.fill(); }
    if (!big) {
      var vw = (W / cam.s) * k, vh = (H / cam.s) * k;
      x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.2; x.strokeRect(cam.x * k - vw / 2, cam.y * k - vh / 2, vw, vh);
    } else {
      x.font = '700 15px Rajdhani, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#fff';
      x.fillText('JUNGLE', S * .25, S * .06); x.fillText('DESERT', S * .75, S * .06); x.fillText('ICE', S * .25, S * .97); x.fillText('LAVA', S * .75, S * .97); x.fillText('GOLD CORE', S / 2, S / 2 + GOLD_R * k + 16);
      x.font = '600 11px Rajdhani, sans-serif'; x.fillStyle = 'rgba(255,255,255,.9)';
      for (i = 0; i < PLACES.length; i++) x.fillText(PLACES[i].n, PLACES[i].fx * S, PLACES[i].fy * S - 8);
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

  function gearBack(c, hr) {                       // drawn before the head, snake faces +x
    switch (c.t) {
      case 'c': ctx.fillStyle = c.b; ctx.beginPath(); ctx.ellipse(-hr * .3, 0, hr * 1.35, hr * 1.9, 0, 0, 6.283); ctx.fill(); break;
      case 'B': ctx.strokeStyle = '#C41E3A'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, hr * 1.9, 0, 6.283); ctx.stroke(); break;
      case 'f': case 'V': case 'i': case 'D': case 'M':
        ctx.fillStyle = c.t === 'f' ? '#E8F7FF' : (c.t === 'V' ? c.b : (c.t === 'D' || c.t === 'i' ? '#FFD23F' : '#3A2020')); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
        [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(hr * .1, sd * hr * .6); ctx.lineTo(-hr * .1, sd * hr * 1.9); ctx.lineTo(hr * .7, sd * hr * .85); ctx.closePath(); ctx.fill(); ctx.stroke(); });
        break;
    }
  }
  function gearFront(c, hr) {
    switch (c.t) {
      case 's': ctx.fillStyle = '#0E0A24'; ctx.fillRect(hr * .05, -hr * .95, hr * .9, hr * 1.9); break;
      case 'r': ctx.fillStyle = '#0B2A3A'; ctx.strokeStyle = '#22D3EE'; ctx.lineWidth = 2; ctx.fillRect(hr * .15, -hr * .7, hr * .75, hr * 1.4); ctx.strokeRect(hr * .15, -hr * .7, hr * .75, hr * 1.4); break;
      case 'K': case 'D': ctx.fillStyle = '#FFD23F'; ctx.strokeStyle = '#7A4A00'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-hr * .5, -hr * .55); ctx.lineTo(-hr * .5, hr * .55); ctx.lineTo(-hr * .15, hr * .2); ctx.lineTo(-hr * .1, hr * .6); ctx.lineTo(hr * .2, hr * .15); ctx.lineTo(hr * .3, hr * .55); ctx.lineTo(hr * .3, -hr * .55); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'T': ctx.strokeStyle = c.e; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-hr * .3, -hr * .5); ctx.lineTo(0, -hr * .1); ctx.lineTo(-hr * .2, hr * .1); ctx.lineTo(hr * .1, hr * .5); ctx.stroke(); break;
      case 'M': ctx.strokeStyle = c.e; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-hr * .5, -hr * .4); ctx.lineTo(-hr * .1, 0); ctx.lineTo(-hr * .4, hr * .5); ctx.stroke(); break;
      case 'R': ctx.strokeStyle = '#E8E8F0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hr * .55, -hr * .5); ctx.lineTo(hr * .9, -hr * .5); ctx.moveTo(hr * .55, hr * .5); ctx.lineTo(hr * .9, hr * .5); ctx.stroke(); break;
    }
  }

  function drawSnake(s, vx0, vy0, vx1, vy1, t) {
    var sk = s.skin, n = s.segs.length, r = s.r, i, g, ty = sk.t, A = sk.a;
    if (s.boost || s.fx.sp > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(' + A.join(',') + ',.10)'; for (i = n - 1; i >= 0; i -= 2) { g = s.segs[i]; ctx.beginPath(); ctx.arc(g.x, g.y, r * 1.8, 0, 6.283); ctx.fill(); } ctx.globalCompositeOperation = 'source-over'; }
    ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(2,10,24,.55)';
    var spiky = ty === 'sp' || ty === 'fl' || ty === 'mg';
    for (i = n - 1; i >= 0; i--) {
      g = s.segs[i]; if (g.x < vx0 - r * 2 || g.x > vx1 + r * 2 || g.y < vy0 - r * 2 || g.y > vy1 + r * 2) continue;
      var k = i / n, rr = r * (.55 + .45 * Math.pow(1 - k, .5)), nx = 0, ny = 0;
      if (spiky && i % 3 === 0 && i > 0 && i < n - 1) {
        var a0 = s.segs[i - 1], a1 = s.segs[i + 1], dxx = a0.x - a1.x, dyy = a0.y - a1.y, dl = Math.sqrt(dxx * dxx + dyy * dyy) || 1;
        nx = -dyy / dl; ny = dxx / dl;
        ctx.fillStyle = ty === 'fl' ? (i % 2 ? '#FF8A1F' : '#FFD23F') : (ty === 'mg' ? '#FF6A1A' : '#A01020');
        [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(g.x + nx * sd * rr * .6 - dxx / dl * rr * .5, g.y + ny * sd * rr * .6 - dyy / dl * rr * .5); ctx.lineTo(g.x + nx * sd * rr * 1.9, g.y + ny * sd * rr * 1.9); ctx.lineTo(g.x + nx * sd * rr * .6 + dxx / dl * rr * .5, g.y + ny * sd * rr * .6 + dyy / dl * rr * .5); ctx.closePath(); ctx.fill(); });
      }
      ctx.fillStyle = VR.cos.segColor(sk, i, n);
      ctx.beginPath(); ctx.arc(g.x, g.y, rr, 0, 6.283); ctx.fill(); ctx.stroke();
      if (ty === 'dots' && i % 3 === 1) { ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(g.x, g.y, rr * .32, 0, 6.283); ctx.fill(); }
      else if (ty === 'stars' && i % 2 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(g.x + rr * .2, g.y - rr * .3, 2, 2); }
      else if (ty === 'mg' && i % 2) { ctx.fillStyle = '#FFB347'; ctx.beginPath(); ctx.arc(g.x, g.y, rr * .35, 0, 6.283); ctx.fill(); }
      else if (ty === 'bn' && i % 2 === 0) { ctx.fillStyle = '#F2F2F8'; ctx.fillRect(g.x - 1.3, g.y - rr * .8, 2.6, rr * 1.6); }
      else if (ty === 'th' && i % 5 === 2) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(g.x + 2, g.y - rr); ctx.lineTo(g.x - 2, g.y); ctx.lineTo(g.x + 2, g.y); ctx.lineTo(g.x - 2, g.y + rr); ctx.stroke(); ctx.strokeStyle = 'rgba(2,10,24,.55)'; }
    }
    var h = s.segs[0], hr = r * 1.12, ch = s.ch;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(s.angle);
    if (s.mate || s.isPlayer) { ctx.strokeStyle = s.isPlayer ? '#B6FF3B' : '#22D3EE'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, hr * 1.35, 0, 6.283); ctx.stroke(); }
    gearBack(ch, hr);
    ctx.fillStyle = ty === 'rainbow' ? 'hsl(300,85%,58%)' : (ty === 'fl' || ty === 'bn' || ty === 'sp' ? VR.cos.mix(A, A, 0) : VR.cos.mix(A, A, 0));
    ctx.strokeStyle = 'rgba(2,10,24,.7)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 0, hr * 1.05, hr * .95, 0, 0, 6.283); ctx.fill(); ctx.stroke();
    if (ch.L) {
      ctx.fillStyle = ch.t === 'B' ? '#FFE14A' : ch.e; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(hr * .05, sd * hr * .15); ctx.lineTo(hr * .75, sd * hr * .55); ctx.lineTo(hr * .6, sd * hr * .25); ctx.lineTo(hr * .1, sd * hr * .0); ctx.closePath(); ctx.fill(); ctx.stroke(); });
    } else {
      [-1, 1].forEach(function (sd) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(hr * .3, sd * hr * .5, hr * .3, hr * .26, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#0A0E1F'; ctx.beginPath(); ctx.arc(hr * .4, sd * hr * .5, hr * .13, 0, 6.283); ctx.fill();
      });
    }
    gearFront(ch, hr);
    ctx.restore();
    if (s.fx.sh > 0) { ctx.strokeStyle = 'rgba(34,211,238,' + (.55 + .3 * Math.sin(t * 8)) + ')'; ctx.fillStyle = 'rgba(34,211,238,.14)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(h.x, h.y, hr * 2.3, 0, 6.283); ctx.fill(); ctx.stroke(); }
    if (s.fx.mg > 0) { ctx.strokeStyle = 'rgba(255,122,217,.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]); ctx.beginPath(); ctx.arc(h.x, h.y, 150 + 14 * Math.sin(t * 5), 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
    if (s.isPlayer && anim && anim.t === 'aura') { ctx.strokeStyle = anim.c; ctx.lineWidth = 3; ctx.globalAlpha = .55 + .35 * Math.sin(t * 5); ctx.beginPath(); ctx.arc(h.x, h.y, hr * (2 + .35 * Math.sin(t * 5)), 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.arc(h.x, h.y, hr * (2.9 + .4 * Math.sin(t * 5 + 1)), 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
    if (s.isPlayer && winFx > 0) { ctx.fillStyle = '#FFD23F'; ctx.strokeStyle = '#7A4A00'; ctx.lineWidth = 2; var cy2 = h.y - hr * 2.6; ctx.beginPath(); ctx.moveTo(h.x - 22, cy2 + 16); ctx.lineTo(h.x - 26, cy2 - 8); ctx.lineTo(h.x - 12, cy2 + 4); ctx.lineTo(h.x, cy2 - 14); ctx.lineTo(h.x + 12, cy2 + 4); ctx.lineTo(h.x + 26, cy2 - 8); ctx.lineTo(h.x + 22, cy2 + 16); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.font = '700 ' + Math.max(11, r * 1.1) + 'px Rajdhani, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = s.isPlayer ? '#B6FF3B' : (s.mate ? '#22D3EE' : 'rgba(255,255,255,.85)');
    ctx.fillText(s.name, h.x, h.y - hr * 1.9 - (winFx > 0 && s.isPlayer ? 30 : 0));
    if (s.emo && s.emo.t > 0) {                           // emote bubble
      var ey = h.y - hr * 1.9 - 52 - (winFx > 0 && s.isPlayer ? 30 : 0), ea = Math.min(1, s.emo.t * 3), pop = 1 + .15 * Math.sin(s.emo.t * 8);
      ctx.save(); ctx.globalAlpha = ea; ctx.translate(h.x, ey); ctx.scale(pop, pop);
      ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, 21); ctx.lineTo(0, 32); ctx.lineTo(6, 21); ctx.fill();
      ctx.font = '30px sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText(s.emo.e, 0, 2); ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }
    if (s.hp < HPMAX) {                                  // small HP bar over the head
      var bw = 38, bx = h.x - bw / 2, by = h.y - hr * 1.9 - 20;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = s.hp < 30 ? '#FF3B5C' : s.hp < 60 ? '#FFB11F' : '#7CFF3A'; ctx.fillRect(bx, by, bw * clamp(s.hp / HPMAX, 0, 1), 5);
    }
  }

  function render(t) {
    var sc = cam.s, i;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#070A1C'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (W / 2 - cam.x * sc), dpr * (H / 2 - cam.y * sc));
    var vx0 = cam.x - W / 2 / sc, vy0 = cam.y - H / 2 / sc, vx1 = cam.x + W / 2 / sc, vy1 = cam.y + H / 2 / sc, hw = WORLD / 2;
    ctx.fillStyle = Z[1].floor; ctx.fillRect(0, 0, hw, hw);
    ctx.fillStyle = Z[2].floor; ctx.fillRect(hw, 0, hw, hw);
    ctx.fillStyle = Z[3].floor; ctx.fillRect(0, hw, hw, hw);
    ctx.fillStyle = Z[4].floor; ctx.fillRect(hw, hw, hw, hw);
    var gg = ctx.createRadialGradient(hw, hw, 0, hw, hw, GOLD_R);
    gg.addColorStop(0, '#6B5410'); gg.addColorStop(.8, Z[0].floor); gg.addColorStop(1, 'rgba(58,46,10,.0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(hw, hw, GOLD_R, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,63,.35)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(hw, hw, GOLD_R, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(159,176,255,.08)'; ctx.lineWidth = 1.5; ctx.beginPath();
    var gs = 90, gx = Math.max(0, Math.floor(vx0 / gs) * gs), gy = Math.max(0, Math.floor(vy0 / gs) * gs);
    for (var x = gx; x <= Math.min(WORLD, vx1); x += gs) { ctx.moveTo(x, Math.max(0, vy0)); ctx.lineTo(x, Math.min(WORLD, vy1)); }
    for (var y = gy; y <= Math.min(WORLD, vy1); y += gs) { ctx.moveTo(Math.max(0, vx0), y); ctx.lineTo(Math.min(WORLD, vx1), y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(hw, 0); ctx.lineTo(hw, WORLD); ctx.moveTo(0, hw); ctx.lineTo(WORLD, hw); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,60,90,.85)'; ctx.lineWidth = 10; ctx.strokeRect(0, 0, WORLD, WORLD);
    var PR = placeR();
    ctx.textAlign = 'center';
    for (i = 0; i < PLACES.length; i++) {                           // named places on the ground
      var pl = PLACES[i], px = pl.fx * WORLD, py = pl.fy * WORLD;
      if (px < vx0 - PR || px > vx1 + PR || py < vy0 - PR || py > vy1 + PR) continue;
      ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.beginPath(); ctx.arc(px, py, PR, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 8; ctx.setLineDash([60, 50]); ctx.beginPath(); ctx.arc(px, py, PR, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '800 64px Rajdhani, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillText(pl.n.toUpperCase(), px, py + 22);
    }
    for (i = 0; i < rocks.length; i++) {
      var rk = rocks[i]; if (rk.x < vx0 - rk.r || rk.x > vx1 + rk.r || rk.y < vy0 - rk.r || rk.y > vy1 + rk.r) continue;
      ctx.fillStyle = '#4B5575'; ctx.strokeStyle = '#2A3150'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(rk.x, rk.y, rk.r, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.arc(rk.x - rk.r * .25, rk.y - rk.r * .3, rk.r * .5, 0, 6.283); ctx.fill();
    }
    for (i = 0; i < foods.length; i++) {
      var f = foods[i]; if (f.x < vx0 - 30 || f.x > vx1 + 30 || f.y < vy0 - 30 || f.y > vy1 + 30) continue;
      var sz = f.r * 4.2 * (1 + .12 * Math.sin(t * 3 + f.x));
      ctx.drawImage(sprites[f.ci], f.x - sz / 2, f.y - sz / 2, sz, sz);
    }
    ctx.textAlign = 'center';
    for (i = 0; i < mcoins.length; i++) {                          // match coins
      var c = mcoins[i]; if (c.x < vx0 - 20 || c.x > vx1 + 20 || c.y < vy0 - 20 || c.y > vy1 + 20) continue;
      var cr = c.v >= 50 ? 12 : 8, bob = Math.sin(t * 4 + c.x) * 1.5;
      ctx.fillStyle = c.v >= 50 ? '#FF9F1C' : '#FFD23F'; ctx.strokeStyle = '#8A4B00'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(c.x, c.y + bob, cr, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8A4B00'; ctx.font = '800 ' + (cr * 1.1) + 'px Rajdhani, sans-serif'; ctx.fillText('C', c.x, c.y + bob + cr * .38);
    }
    for (i = 0; i < meds.length; i++) {                            // medkits
      var m = meds[i]; if (m.cd > 0 || m.x < vx0 - 40 || m.x > vx1 + 40 || m.y < vy0 - 40 || m.y > vy1 + 40) continue;
      var ms = m.big ? 26 : 19;
      ctx.fillStyle = '#F2F6FF'; ctx.strokeStyle = '#B91C3C'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(m.x - ms, m.y - ms * .8, ms * 2, ms * 1.6, 6) : ctx.rect(m.x - ms, m.y - ms * .8, ms * 2, ms * 1.6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#E11D48'; ctx.fillRect(m.x - ms * .12, m.y - ms * .5, ms * .24, ms), ctx.fillRect(m.x - ms * .5, m.y - ms * .12, ms, ms * .24);
    }
    for (i = 0; i < pickups.length; i++) {
      var u = pickups[i]; if (u.cd > 0 || u.x < vx0 - 40 || u.x > vx1 + 40 || u.y < vy0 - 40 || u.y > vy1 + 40) continue;
      var fx = FX[u.type], pr = 20 + 3 * Math.sin(t * 4 + u.x);
      ctx.fillStyle = 'rgba(10,8,40,.8)'; ctx.strokeStyle = fx.c; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(u.x, u.y, pr, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = fx.c; ctx.font = '800 ' + (pr * 1.1) + 'px Rajdhani, sans-serif'; ctx.fillText(fx.ch, u.x, u.y + pr * .38);
    }
    if (hearts.length) {                                           // revive heart
      var he = hearts[0], hp2 = 26 + 4 * Math.sin(t * 6);
      ctx.globalCompositeOperation = 'lighter'; var hg = ctx.createRadialGradient(he.x, he.y, 0, he.x, he.y, hp2 * 3);
      hg.addColorStop(0, 'rgba(255,90,140,.7)'); hg.addColorStop(1, 'rgba(255,90,140,0)'); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(he.x, he.y, hp2 * 3, 0, 6.283); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#FF3B7A'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(he.x, he.y + hp2 * .8); ctx.bezierCurveTo(he.x - hp2 * 1.4, he.y - hp2 * .2, he.x - hp2 * .7, he.y - hp2 * 1.1, he.x, he.y - hp2 * .4);
      ctx.bezierCurveTo(he.x + hp2 * .7, he.y - hp2 * 1.1, he.x + hp2 * 1.4, he.y - hp2 * .2, he.x, he.y + hp2 * .8); ctx.fill(); ctx.stroke();
    }
    if (golden && golden.x > vx0 - 80 && golden.x < vx1 + 80 && golden.y > vy0 - 80 && golden.y < vy1 + 80) {
      var gp = golden.r * (1.6 + .2 * Math.sin(t * 5));
      ctx.globalCompositeOperation = 'lighter';
      var gr2 = ctx.createRadialGradient(golden.x, golden.y, 0, golden.x, golden.y, gp * 4);
      gr2.addColorStop(0, 'rgba(255,240,150,.9)'); gr2.addColorStop(.4, 'rgba(255,190,40,.4)'); gr2.addColorStop(1, 'rgba(255,190,40,0)');
      ctx.fillStyle = gr2; ctx.beginPath(); ctx.arc(golden.x, golden.y, gp * 4, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#FFD23F'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(golden.x, golden.y, gp, 0, 6.283); ctx.fill(); ctx.stroke();
    }
    if (portal) {                                                  // spawn portal animation
      var pk = portal.t / 1.6; ctx.strokeStyle = anim ? anim.c : '#C084FC'; ctx.lineWidth = 5;
      for (var ri = 0; ri < 3; ri++) { ctx.globalAlpha = clamp(pk, 0, 1) * (1 - ri * .25); ctx.beginPath(); ctx.ellipse(portal.x, portal.y, 70 * pk + ri * 16, 30 * pk + ri * 7, 0, 0, 6.283); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    var order = snakes.filter(function (s) { return !s.dead; }).sort(function (a, b) { return (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0) || a.mass - b.mass; });
    order.forEach(function (s) { drawSnake(s, vx0, vy0, vx1, vy1, t); });
    for (i = 0; i < parts.length; i++) {                           // particles
      var p = parts[i]; ctx.globalAlpha = clamp(p.l / p.ml, 0, 1); ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
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
      if (!over) { matchT += dt; readInput(); stepHeal(dt); }
      for (var i = 0; i < snakes.length; i++) {
        var s = snakes[i];
        if (s.dead) continue;
        if (s.remote) { stepRemote(s, dt); continue; }
        if (!s.isPlayer) think(s, dt);
        if (s.emo) { s.emo.t -= dt; if (s.emo.t <= 0) s.emo = null; }
        else if (!s.isPlayer && Math.random() < dt * .004 && VR.store) { var EL = VR.store.EMOTES; s.emo = { e: EL[2 + Math.floor(Math.random() * (EL.length - 2))].e, t: 2.4 }; }
        stepSnake(s, dt); if (s.dead) continue; eat(s);
      }
      collisions();
      stepFx(dt); netTick(dt);
      for (var q = 0; q < pickups.length; q++) {
        var pu = pickups[q]; if (pu.cd > 0) { pu.cd -= dt; if (pu.cd <= 0) { var np = freeSpot(0); pu.x = np.x; pu.y = np.y; } }
      }
      for (var mq = 0; mq < meds.length; mq++) {
        var me = meds[mq]; if (me.cd > 0) { me.cd -= dt; if (me.cd <= 0) { var mp = freeSpot(0); me.x = mp.x; me.y = mp.y; } }
      }
      if (hearts.length) { hearts[0].t -= dt; if (hearts[0].t <= 0) { hearts = []; banner('The heart faded away', 1800); } }
      if (!over) {
        if (!golden && matchT >= nextGold) spawnGolden();
        else if (golden && matchT - golden.born > 35) { golden = null; nextGold = matchT + 30; }
        winT -= dt;
        if (winT <= 0) {
          winT = .4;
          if ((!NET || hadEnemy) && !snakes.some(function (x) { return !x.dead && x.team !== 1; })) endGame('win');
          else if (player.dead && !aliveMates().length) endGame('dead');
        }
        if (matchT >= G.matchSeconds) endGame('time');
      }
      var focus = cam;
      if (!player.dead) focus = player.segs[0];
      else { var tg = specTarget(); if (tg) focus = tg.segs[0]; }
      cam.x += (focus.x - cam.x) * Math.min(1, dt * 8); cam.y += (focus.y - cam.y) * Math.min(1, dt * 8);
      var base = player.dead && specTarget() ? specTarget().mass : player.mass;
      var targetS = (H / 400) / (1 + base / 900);
      cam.s += (clamp(targetS, .35, 2) - cam.s) * Math.min(1, dt * 3);
      updateHud(dt); drawMini();
    }
    render(tAcc);
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, { low: 1, mid: 1.5, high: 2 }[(VR.settings && VR.settings.get('quality')) || 'high']);
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

    var eb = $('emoBtn'), ep = $('emoPanel');
    eb.addEventListener('click', function () {
      if (ep.classList.contains('on')) { ep.classList.remove('on'); return; }
      var u = VR.lobby.openUser(), ids = (u && u.eq && u.eq.emotes) || ['em0', 'em1'];
      ep.innerHTML = ids.map(function (id) { var it = VR.store.find('emote', id); return it ? '<button type="button" data-e="' + id + '">' + it.e + '</button>' : ''; }).join('');
      ep.classList.add('on');
    });
    ep.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !player || player.dead) return;
      var it = VR.store.find('emote', b.dataset.e); if (it) { player.emo = { e: it.e, t: 3 }; if (NET) VR.net.send({ t: 'emo', e: it.e }); }
      ep.classList.remove('on');
    });
    $('healS').addEventListener('click', function () { startHeal('s'); });
    $('healL').addEventListener('click', function () { startHeal('l'); });

    window.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase(); input.keys[k] = true;
      if (e.key === ' ' && running) e.preventDefault();
      if (k === 'm' && running) toggleMap();
      if (k === 'h' && running) startHeal('s');
      if (k === 'j' && running) startHeal('l');
    });
    window.addEventListener('keyup', function (e) { input.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('mousemove', function (e) { if (e.pointerType !== 'touch') input.mouse = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('mousedown', function () { if (!input.touch) input.boost = true; });
    window.addEventListener('mouseup', function () { if (!input.touch && !bb.classList.contains('hold')) input.boost = false; });

    function toggleMap() { mapOpen = !mapOpen; $('bigMap').classList.toggle('on', mapOpen); if (mapOpen) drawMapTo(bctx, bigCv.width, true); }
    mini.addEventListener('click', toggleMap);
    $('bigMap').addEventListener('click', toggleMap);

    // after you die: watch teammates, report, like, leave
    $('specPrev').addEventListener('click', function () { spec.idx--; });
    $('specNext').addEventListener('click', function () { spec.idx++; });
    $('specLike').addEventListener('click', function () {
      var tg = specTarget(); if (!tg) return;
      if (spec.liked[tg.name]) { VR.ui.toast('You already liked ' + tg.name); return; }
      spec.liked[tg.name] = 1;
      // NETWORK HOOK: send the like for this player to the server here
      VR.ui.toast('You liked ' + tg.name + '!');
    });
    $('specReport').addEventListener('click', function () { $('repMenu').classList.toggle('on'); });
    document.querySelectorAll('#repMenu [data-r]').forEach(function (b) {
      b.addEventListener('click', function () {
        var tg = specTarget(), who = (killerName && killerName !== 'RED WALL') ? killerName : (tg ? tg.name : 'player');
        var rsn = snakes.filter(function (x) { return x.name === who; })[0];
        if (VR.auth && VR.auth.report) VR.auth.report({ target: who, targetUid: (rsn && rsn.uid) || '', reason: b.dataset.r, mode: cfg.mode, online: !!NET });
        spec.reported = true; $('repMenu').classList.remove('on');
        VR.ui.toast('Report sent for ' + who + ' (' + b.dataset.r + '). Thank you!');
      });
    });
    $('specLeave').addEventListener('click', function () { endGame('dead'); });

    $('pauseBtn').addEventListener('click', function () { paused = true; $('pauseBox').classList.add('on'); });
    $('resumeBtn').addEventListener('click', function () { paused = false; last = performance.now(); $('pauseBox').classList.remove('on'); });
    $('quitBtn').addEventListener('click', function () { stop(); $('pauseBox').classList.remove('on'); $('bigMap').classList.remove('on'); leaveSpec(); VR.app.go('lobby'); });
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
  VR.game = { init: init, start: start, stop: stop, resize: resize,
    // testing helper (used by automatic tests, harmless in the real game)
    debug: function () { return { foods: foods, snakes: snakes, player: player, hearts: hearts, rv: rv, heal: heal, spec: spec, setCoins: function (n) { myCoins = n; }, kill: kill, setTime: function (t) { matchT = t; }, medkits: meds, coins: mcoins }; } };
})();
