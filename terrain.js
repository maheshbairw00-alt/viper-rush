/* js/terrain.js
 * The "3D look" of the map: textured ground for every zone (jungle, desert, ice, lava), scenery (bushes, cacti, dunes,
 * ice crystals, lava rocks) with soft shadows and dome shading, and a dark vignette at the screen edges.
 * It is only decoration: nothing here changes how the game plays, and the scenery is placed by the map position
 * (not by random numbers) so every online player sees exactly the same map.
 * API: VR.terrain.ground(ctx, vx0, vy0, vx1, vy1, world)   VR.terrain.props(ctx, vx0, vy0, vx1, vy1, world, goldR, scale)
 *      VR.terrain.vignette(ctx, W, H)   VR.terrain.init()
 */
(function () {
  var TILE = 512, tiles = [], pats = [], atlas = null, vg = null, vgW = 0, vgH = 0, CELL = 560;

  function prng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function wrapDraw(x, S, fn) {                                   // draw a blob so it also wraps around the tile edge (seamless pattern)
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) fn(dx * S, dy * S);
  }

  /* ---------- ground tiles ---------- */
  function tile(z) {
    var c = mk(TILE, TILE), x = c.getContext('2d'), R = prng(1000 + z * 77), i;
    var base = ['#3A2E0A', '#0F2A1E', '#33270F', '#0F2640', '#3A1210'][z];
    x.fillStyle = base; x.fillRect(0, 0, TILE, TILE);
    function blob(col, n, r0, r1, a) {
      for (i = 0; i < n; i++) {
        var bx = R() * TILE, by = R() * TILE, br = r0 + R() * (r1 - r0);
        wrapDraw(0, TILE, function (ox, oy) { var g = x.createRadialGradient(bx + ox, by + oy, 0, bx + ox, by + oy, br); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0)); x.fillStyle = g; x.beginPath(); x.arc(bx + ox, by + oy, br, 0, 6.283); x.fill(); });
      }
    }
    if (z === 1) {                                                // JUNGLE: grass patches + blades
      blob('rgba(40,120,60,A)', 26, 40, 120, .30); blob('rgba(0,25,10,A)', 22, 40, 110, .35); blob('rgba(120,200,80,A)', 10, 20, 60, .12);
      x.lineWidth = 1.6;
      for (i = 0; i < 380; i++) { var gx = R() * TILE, gy = R() * TILE, ln = 6 + R() * 9, an = -1.9 + R() * .8; x.strokeStyle = R() < .5 ? 'rgba(110,200,90,.25)' : 'rgba(10,50,25,.4)'; x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + Math.cos(an) * ln, gy + Math.sin(an) * ln); x.stroke(); }
    } else if (z === 2) {                                         // DESERT: dune ripples + pebbles
      blob('rgba(210,160,70,A)', 22, 50, 140, .22); blob('rgba(60,35,5,A)', 20, 50, 130, .30);
      x.lineWidth = 2;
      for (i = 0; i < 16; i++) { var ry = R() * TILE, rx = R() * TILE, rw = 90 + R() * 160; x.strokeStyle = 'rgba(240,200,120,.14)'; wrapDraw(0, TILE, function (ox, oy) { x.beginPath(); x.moveTo(rx + ox, ry + oy); x.quadraticCurveTo(rx + rw / 2 + ox, ry - 14 + oy, rx + rw + ox, ry + oy); x.stroke(); x.strokeStyle = 'rgba(40,20,0,.18)'; x.beginPath(); x.moveTo(rx + ox, ry + 5 + oy); x.quadraticCurveTo(rx + rw / 2 + ox, ry - 9 + oy, rx + rw + ox, ry + 5 + oy); x.stroke(); x.strokeStyle = 'rgba(240,200,120,.14)'; }); }
      for (i = 0; i < 90; i++) { x.fillStyle = R() < .5 ? 'rgba(255,230,170,.18)' : 'rgba(40,20,0,.25)'; x.beginPath(); x.arc(R() * TILE, R() * TILE, 1 + R() * 2.4, 0, 6.283); x.fill(); }
    } else if (z === 3) {                                         // ICE: glossy patches + cracks
      blob('rgba(150,220,255,A)', 20, 60, 160, .16); blob('rgba(0,20,60,A)', 16, 50, 130, .30);
      x.lineWidth = 1.4;
      for (i = 0; i < 14; i++) { var cx = R() * TILE, cy = R() * TILE, a = R() * 6.283; x.strokeStyle = 'rgba(220,245,255,.2)'; x.beginPath(); x.moveTo(cx, cy); for (var j = 0; j < 5; j++) { a += (R() - .5) * 1.2; cx += Math.cos(a) * (18 + R() * 30); cy += Math.sin(a) * (18 + R() * 30); x.lineTo(cx, cy); } x.stroke(); }
    } else if (z === 4) {                                         // LAVA: dark rock + glowing cracks
      blob('rgba(0,0,0,A)', 22, 50, 140, .42); blob('rgba(255,90,30,A)', 12, 50, 140, .13);
      for (i = 0; i < 10; i++) {
        var lx = R() * TILE, ly = R() * TILE, la = R() * 6.283, pts = [[lx, ly]];
        for (var q = 0; q < 6; q++) { la += (R() - .5) * 1.3; lx += Math.cos(la) * (20 + R() * 34); ly += Math.sin(la) * (20 + R() * 34); pts.push([lx, ly]); }
        [['rgba(255,60,20,.14)', 8], ['rgba(255,150,40,.38)', 2.6]].forEach(function (st) { x.strokeStyle = st[0]; x.lineWidth = st[1]; x.beginPath(); pts.forEach(function (p, k) { k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.stroke(); });
      }
    } else {                                                      // GOLD
      blob('rgba(255,215,100,A)', 14, 40, 110, .12);
    }
    return c;
  }

  /* ---------- scenery sprites (shadow + dome shading), built once ---------- */
  var S = 160;
  function dome(x, cx, cy, r, c0, c1, c2) { var g = x.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r); g.addColorStop(0, c0); g.addColorStop(.6, c1); g.addColorStop(1, c2); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 6.283); x.fill(); }
  function shadow(x, cx, cy, rx, ry) { x.fillStyle = 'rgba(0,0,0,.30)'; x.beginPath(); x.ellipse(cx + rx * .28, cy + ry * .38, rx, ry, 0, 0, 6.283); x.fill(); }
  function makeAtlas() {
    var out = { 1: [], 2: [], 3: [], 4: [] }, R = prng(4242), v, c, x;
    for (v = 0; v < 4; v++) {                                     // jungle: bushes / trees
      c = mk(S, S); x = c.getContext('2d'); var r = 38 + v * 5;
      shadow(x, 80, 82, r * 1.05, r * .9); dome(x, 80, 78, r, '#5FBF6A', '#237A3E', '#0E3A1F');
      dome(x, 62 + v * 4, 66, r * .5, '#8EE08A', '#2F8F49', 'rgba(20,90,50,0)'); dome(x, 98 - v * 3, 92, r * .45, '#4FB05E', '#1F6E38', 'rgba(10,60,30,0)');
      if (v % 2) { x.fillStyle = '#FF7AD9'; for (var f = 0; f < 5; f++) { x.beginPath(); x.arc(60 + R() * 40, 60 + R() * 40, 3, 0, 6.283); x.fill(); } }
      out[1].push(c);
    }
    for (v = 0; v < 4; v++) {                                     // desert: dunes / cactus / rocks
      c = mk(S, S); x = c.getContext('2d');
      if (v < 2) {
        shadow(x, 80, 84, 62, 34); var g = x.createLinearGradient(30, 50, 120, 120); g.addColorStop(0, '#F2D493'); g.addColorStop(.55, '#C9994A'); g.addColorStop(1, '#8A5E22'); x.fillStyle = g; x.beginPath(); x.ellipse(80, 78, 62, 34, v ? .25 : -.2, 0, 6.283); x.fill();
        x.strokeStyle = 'rgba(255,240,200,.35)'; x.lineWidth = 3; x.beginPath(); x.ellipse(74, 70, 40, 16, v ? .25 : -.2, 3.4, 5.6); x.stroke();
      } else if (v === 2) {
        shadow(x, 80, 84, 34, 22); dome(x, 80, 78, 28, '#7FD36B', '#2E8B43', '#145A2A'); dome(x, 52, 74, 13, '#7FD36B', '#2E8B43', '#145A2A'); dome(x, 108, 70, 13, '#7FD36B', '#2E8B43', '#145A2A');
        x.fillStyle = 'rgba(255,255,255,.7)'; for (var k = 0; k < 8; k++) { x.beginPath(); x.arc(80 + Math.cos(k) * 20, 78 + Math.sin(k * 1.7) * 18, 1.6, 0, 6.283); x.fill(); }
      } else { shadow(x, 80, 84, 34, 26); dome(x, 80, 78, 30, '#C7A77A', '#8A6A44', '#4E3820'); dome(x, 98, 92, 14, '#B99A6E', '#7A5C3A', '#3E2C18'); }
      out[2].push(c);
    }
    for (v = 0; v < 4; v++) {                                     // ice: crystals
      c = mk(S, S); x = c.getContext('2d'); shadow(x, 80, 86, 40, 24);
      [[80, 74, 30 + v * 4, .0], [54, 88, 18, -.5], [106, 86, 20, .45]].forEach(function (cr, k) {
        if (k && v % 2) return;
        x.save(); x.translate(cr[0], cr[1]); x.rotate(cr[3]); var g = x.createLinearGradient(-cr[2] * .6, -cr[2], cr[2] * .6, cr[2] * .4);
        g.addColorStop(0, '#F4FDFF'); g.addColorStop(.5, '#8FD3F5'); g.addColorStop(1, '#2F78B8'); x.fillStyle = g; x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(0, -cr[2] * 1.2); x.lineTo(cr[2] * .55, -cr[2] * .1); x.lineTo(cr[2] * .35, cr[2] * .6); x.lineTo(-cr[2] * .35, cr[2] * .6); x.lineTo(-cr[2] * .55, -cr[2] * .1); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = 'rgba(255,255,255,.45)'; x.beginPath(); x.moveTo(0, -cr[2] * 1.2); x.lineTo(cr[2] * .2, -cr[2] * .1); x.lineTo(-cr[2] * .1, cr[2] * .5); x.lineTo(-cr[2] * .35, -cr[2] * .1); x.closePath(); x.fill(); x.restore();
      });
      out[3].push(c);
    }
    for (v = 0; v < 4; v++) {                                     // lava: dark rocks with a red glow
      c = mk(S, S); x = c.getContext('2d'); var gl = x.createRadialGradient(80, 80, 10, 80, 80, 66); gl.addColorStop(0, 'rgba(255,90,20,.45)'); gl.addColorStop(1, 'rgba(255,60,10,0)'); x.fillStyle = gl; x.fillRect(0, 0, S, S);
      shadow(x, 80, 84, 36, 28); dome(x, 80, 78, 32 + v * 2, '#6B5A58', '#2E2524', '#120C0C'); dome(x, 98, 92, 14, '#5A4A48', '#241C1B', '#100A0A');
      x.strokeStyle = 'rgba(255,140,40,.8)'; x.lineWidth = 2; x.beginPath(); x.moveTo(66, 70); x.lineTo(80, 80); x.lineTo(76, 94); x.stroke();
      out[4].push(c);
    }
    return out;
  }

  function init() {
    if (atlas) return;
    for (var z = 0; z < 5; z++) tiles[z] = tile(z);
    atlas = makeAtlas();
  }
  function patternFor(ctx, z) { if (!pats[z] || pats[z].ctx !== ctx) pats[z] = { ctx: ctx, p: ctx.createPattern(tiles[z], 'repeat') }; return pats[z].p; }

  function quad(ctx, z, x0, y0, x1, y1, vx0, vy0, vx1, vy1) {
    var a = Math.max(x0, vx0), b = Math.max(y0, vy0), c = Math.min(x1, vx1), d = Math.min(y1, vy1);
    if (c <= a || d <= b) return;
    ctx.fillStyle = patternFor(ctx, z); ctx.fillRect(a, b, c - a, d - b);
  }
  function ground(ctx, vx0, vy0, vx1, vy1, world) {
    init(); var hw = world / 2;
    quad(ctx, 1, 0, 0, hw, hw, vx0, vy0, vx1, vy1); quad(ctx, 2, hw, 0, world, hw, vx0, vy0, vx1, vy1);
    quad(ctx, 3, 0, hw, hw, world, vx0, vy0, vx1, vy1); quad(ctx, 4, hw, hw, world, world, vx0, vy0, vx1, vy1);
  }

  function hash(a, b) { var h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return (h ^ h >>> 16) >>> 0; }
  function props(ctx, vx0, vy0, vx1, vy1, world, goldR, scale) {
    init(); var hw = world / 2, m = 90, cx0 = Math.max(0, Math.floor((vx0 - m) / CELL)), cy0 = Math.max(0, Math.floor((vy0 - m) / CELL)), cx1 = Math.min(Math.floor(world / CELL), Math.floor((vx1 + m) / CELL)), cy1 = Math.min(Math.floor(world / CELL), Math.floor((vy1 + m) / CELL));
    var step = scale < .5 ? 2 : 1;                                // zoomed far out: draw fewer
    for (var cy = cy0; cy <= cy1; cy++) for (var cx = cx0; cx <= cx1; cx++) {
      if (step === 2 && ((cx + cy) & 1)) continue;
      var h = hash(cx, cy); if (h % 100 > 46) continue;
      var px = (cx + .15 + (h >>> 8 & 255) / 255 * .7) * CELL, py = (cy + .15 + (h >>> 16 & 255) / 255 * .7) * CELL;
      if (px < 60 || py < 60 || px > world - 60 || py > world - 60) continue;
      var dx = px - hw, dy = py - hw; if (dx * dx + dy * dy < (goldR + 80) * (goldR + 80)) continue;
      if (Math.abs(dx) < 60 || Math.abs(dy) < 60) continue;       // keep the zone borders clear
      var z = py < hw ? (px < hw ? 1 : 2) : (px < hw ? 3 : 4), arr = atlas[z], sp = arr[h % 4], sz = (z === 1 ? 120 : 110) * (.75 + (h >>> 4 & 15) / 30);
      ctx.drawImage(sp, px - sz / 2, py - sz / 2, sz, sz);
    }
  }
  function vignette(ctx, W, H) {
    if (!vg || vgW !== W || vgH !== H) { vgW = W; vgH = H; vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .38, W / 2, H / 2, Math.hypot(W, H) * .56); vg.addColorStop(0, 'rgba(0,0,10,0)'); vg.addColorStop(1, 'rgba(0,0,12,.55)'); }
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  window.VR = window.VR || {};
  VR.terrain = { init: init, ground: ground, props: props, vignette: vignette };
})();
