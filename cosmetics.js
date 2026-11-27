/* js/cosmetics.js
 * All skins, characters and animations (names, prices, looks) in one place.
 *  - SKINS: body colours/patterns.   - CHARS: the snake's face / head gear.   - ANIMS: effects.
 *  - Everything except the free starter items is locked and opens with DIAMONDS.
 *  - Items marked pass:true can only be had with the Season 1 membership.
 * To add a new item just add a line to the lists below.
 *
 * API: VR.cos.SKINS / CHARS / ANIMS, VR.cos.find(kind,id), VR.cos.segColor(skin,i,n),
 *      VR.cos.svgBody(skin), VR.cos.svgFace(char), VR.cos.svgAnim(anim,frame)
 */
(function () {
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function mix(a, b, t) { return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }).join(',') + ')'; }

  // a = light colour, b = dark colour, t = pattern, L = legendary (dangerous look)
  var SKINS = [
    { id: 's0', n: 'Classic green', p: 0, a: [182, 255, 59], b: [16, 185, 129], t: 'plain' },
    { id: 's1', n: 'Neon cyan', p: 499, a: [34, 211, 238], b: [37, 99, 235], t: 'dots' },
    { id: 's2', n: 'Royal purple', p: 599, a: [192, 132, 252], b: [91, 33, 182], t: 'stripe' },
    { id: 's3', n: 'Fire dragon', p: 699, a: [255, 214, 64], b: [220, 38, 38], t: 'fade' },
    { id: 's4', n: 'Frost ice', p: 799, a: [240, 250, 255], b: [56, 148, 220], t: 'dots' },
    { id: 's5', n: 'Golden cobra', p: 999, a: [255, 215, 70], b: [120, 80, 10], t: 'stripe' },
    { id: 's6', n: 'Galaxy', p: 1199, a: [200, 120, 255], b: [20, 10, 70], t: 'stars' },
    { id: 's7', n: 'Rainbow', p: 1499, a: [255, 255, 255], b: [120, 120, 120], t: 'rainbow' },
    { id: 'L1', n: 'Blood scales', p: 1999, a: [200, 20, 40], b: [30, 0, 8], t: 'sp', L: 1 },
    { id: 'L2', n: 'Toxic venom', p: 2299, a: [120, 255, 60], b: [70, 10, 120], t: 'tx', L: 1 },
    { id: 'L3', n: 'Black flame', p: 2599, a: [30, 28, 38], b: [10, 8, 14], t: 'fl', L: 1 },
    { id: 'L4', n: 'Thunder strike', p: 2899, a: [255, 225, 60], b: [30, 60, 170], t: 'th', L: 1 },
    { id: 'L5', n: 'Skeleton', p: 3299, a: [235, 235, 240], b: [20, 20, 28], t: 'bn', L: 1 },
    { id: 'L6', n: 'Magma core', p: 3799, a: [255, 130, 30], b: [45, 15, 10], t: 'mg', L: 1 },
    { id: 'sx1', n: 'Void Reaper', p: 0, spin: 1, a: [150, 60, 255], b: [8, 0, 24], t: 'sp', L: 1 },
    { id: 'sp1', n: 'Royal scales', p: 0, pass: 1, a: [255, 215, 70], b: [60, 20, 110], t: 'stripe', L: 1 }
  ];

  // a = head colour, b = dark colour, e = accent, t = head gear
  var CHARS = [
    { id: 'c0', n: 'Viper', p: 0, a: '#7BE04A', b: '#2E9E4F', e: '#E0245E', t: 'v', note: 'Free starter' },
    { id: 'c1', n: 'Cobra king', p: 1499, a: '#F5C842', b: '#9A6A10', e: '#E0245E', t: 'c', note: 'Golden hood' },
    { id: 'c2', n: 'Frost mamba', p: 1799, a: '#BFE8FF', b: '#3A8FD0', e: '#E0245E', t: 'f', note: 'Ice crystals' },
    { id: 'c3', n: 'Inferno', p: 1999, a: '#FF7A3D', b: '#B3261E', e: '#FFD23F', t: 'i', note: 'Flame horns' },
    { id: 'c4', n: 'Shadow', p: 2299, a: '#6B4FA8', b: '#1E1440', e: '#E9B8FF', t: 's', note: 'Ninja mask' },
    { id: 'c5', n: 'Robo viper', p: 2499, a: '#B8C2D6', b: '#5A6680', e: '#22D3EE', t: 'r', note: 'Metal visor' },
    { id: 'LC1', n: 'Reaper', p: 2999, a: '#2A2A35', b: '#0B0B12', e: '#FF2A3D', t: 'R', L: 1, note: 'Skull and red eyes' },
    { id: 'LC2', n: 'Venom lord', p: 3299, a: '#7CFF3A', b: '#3B0F6B', e: '#E9FF3A', t: 'V', L: 1, note: 'Toxic fangs' },
    { id: 'LC3', n: 'Thunder fang', p: 3599, a: '#FFE14A', b: '#1E3A8A', e: '#7DF9FF', t: 'T', L: 1, note: 'Lightning storm' },
    { id: 'LC4', n: 'Dragon emperor', p: 3999, a: '#E0312B', b: '#7A0F10', e: '#FFD23F', t: 'D', L: 1, note: 'Gold horns and crown' },
    { id: 'LC5', n: 'Blood moon', p: 4299, a: '#8E1020', b: '#2A0509', e: '#FFFFFF', t: 'B', L: 1, note: 'Scars and red moon' },
    { id: 'LC6', n: 'Magma demon', p: 4999, a: '#2B1B1B', b: '#0A0505', e: '#FF8A1F', t: 'M', L: 1, note: 'Burning cracks' },
    { id: 'cx1', n: 'Abyss Fang', p: 0, spin: 1, a: '#3B1C7A', b: '#12052E', e: '#00F0FF', t: 'V', L: 1, note: 'Reward spin' },
    { id: 'csov', n: 'Viper Sovereign', p: 0, pass: 1, a: '#FFD23F', b: '#3A1A00', e: '#FFF3A8', t: 'K', L: 1, note: 'Season 1 only' }
  ];

  var ANIMS = [
    { id: 'a_trail', n: 'Trail effect', p: 599, c: '#22D3EE', t: 'trail', note: 'Sparkles behind you' },
    { id: 'a_aura', n: 'Glow aura', p: 699, c: '#B6FF3B', t: 'aura', note: 'Ring around the head' },
    { id: 'a_burst', n: 'Kill burst', p: 799, c: '#FF9F43', t: 'burst', note: 'Orbs fly when you kill' },
    { id: 'a_spawn', n: 'Spawn portal', p: 899, c: '#C084FC', t: 'spawn', note: 'Rise from a portal' },
    { id: 'a_fire', n: 'Boost flames', p: 999, c: '#FF5A28', t: 'fire', note: 'Fire while boosting' },
    { id: 'a_win', n: 'Victory crown', p: 1199, c: '#FFD23F', t: 'win', note: 'Crown when you win' },
    { id: 'a_crown', n: 'Crown trail', p: 0, pass: 1, c: '#FFD23F', t: 'trail', note: 'Season 1 only' }
  ];

  function find(kind, id) {
    var L = kind === 'skin' ? SKINS : kind === 'char' ? CHARS : ANIMS;
    for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return L[0];
  }

  /* colour of body segment i of n (0 = head) for the canvas game */
  function segColor(s, i, n) {
    var u = 1 - i / n, a = s.a, b = s.b;
    switch (s.t) {
      case 'rainbow': return 'hsl(' + Math.round((1 - u) * 300) + ',85%,58%)';
      case 'stripe': return (i % 4 < 2) ? mix(b, a, .35 + u * .5) : mix(b, a, .9);
      case 'fade': return mix(a, b, 1 - u);
      case 'stars': return mix(b, a, u * .45);
      case 'sp': return (i % 4 < 2) ? mix(a, b, .1 + u * .2) : mix(b, a, .15);
      case 'tx': return i % 3 === 0 ? mix(a, a, 0) : mix(b, a, .15);
      case 'th': return (i % 4 < 2) ? mix(a, a, 0) : mix(b, a, .1);
      case 'bn': return mix(b, [60, 60, 75], u * .4);
      case 'fl': case 'mg': return mix(b, a, .12 + u * .1);
      default: return mix(b, a, .3 + u * .7);
    }
  }

  /* ---------- pictures (inline SVG) ---------- */
  function svgBody(s) {
    var N = 32, o = '', i, p = [], t = s.t;
    for (i = 0; i < N; i++) { var u = i / (N - 1); p.push([20 + u * 114, 60 + Math.sin(u * 6.2 - .6) * 24]); }
    for (i = 0; i < N; i++) {
      var r = 5 + (i / (N - 1)) * 6, x = p[i][0], y = p[i][1], c = segColor(s, N - 1 - i, N);
      if (t === 'sp' || t === 'fl' || t === 'mg') o += '<path d="M' + (x - r * .6).toFixed(1) + ' ' + (y - r * .7).toFixed(1) + ' L' + x.toFixed(1) + ' ' + (y - r * (t === 'fl' ? 2.2 : 1.9)).toFixed(1) + ' L' + (x + r * .6).toFixed(1) + ' ' + (y - r * .7).toFixed(1) + 'Z" fill="' + (t === 'fl' ? (i % 2 ? '#FF8A1F' : '#FFD23F') : (t === 'mg' ? '#FF6A1A' : '#7A0F10')) + '" stroke="#000" stroke-width=".8"/>';
      o += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + c + '" stroke="#000" stroke-opacity=".5"/>';
      if (t === 'dots' && i % 3 === 1) o += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r * .35).toFixed(1) + '" fill="rgba(255,255,255,.8)"/>';
      if (t === 'stars' && i % 2 === 0) o += '<circle cx="' + (x + r * .3).toFixed(1) + '" cy="' + (y - r * .3).toFixed(1) + '" r="1.4" fill="#fff"/>';
      if (t === 'bn' && i % 2 === 0) o += '<rect x="' + (x - 1.4).toFixed(1) + '" y="' + (y - r * .8).toFixed(1) + '" width="2.8" height="' + (r * 1.6).toFixed(1) + '" rx="1.4" fill="#F2F2F8"/>';
      if (t === 'mg' && i % 2 === 1) o += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r * .4).toFixed(1) + '" fill="#FFB347"/>';
      if (t === 'th' && i % 5 === 2) o += '<path d="M' + (x + 2) + ' ' + (y - r) + ' L' + (x - 2) + ' ' + y + ' L' + (x + 2) + ' ' + y + ' L' + (x - 2) + ' ' + (y + r) + '" stroke="#fff" stroke-width="1.6" fill="none"/>';
    }
    var h = p[N - 1];
    if (s.L) o += '<path d="M' + (h[0] - 2) + ' ' + (h[1] - 9) + ' L' + (h[0] + 10) + ' ' + (h[1] - 3) + ' L' + (h[0] + 2) + ' ' + (h[1] - 1) + 'Z M' + (h[0] - 2) + ' ' + (h[1] + 10) + ' L' + (h[0] + 10) + ' ' + (h[1] + 4) + ' L' + (h[0] + 2) + ' ' + (h[1] + 2) + 'Z" fill="#FF2A3D" stroke="#000" stroke-width=".8"/>';
    else o += '<circle cx="' + (h[0] + 3) + '" cy="' + (h[1] - 4) + '" r="3.4" fill="#fff"/><circle cx="' + (h[0] + 3) + '" cy="' + (h[1] + 5) + '" r="3.4" fill="#fff"/><circle cx="' + (h[0] + 4.2) + '" cy="' + (h[1] - 4) + '" r="1.6" fill="#111"/><circle cx="' + (h[0] + 4.2) + '" cy="' + (h[1] + 5) + '" r="1.6" fill="#111"/>';
    return '<svg viewBox="0 0 170 116" width="100%" aria-hidden="true"><rect width="170" height="116" rx="8" fill="#0D0817"/>' + o + '</svg>';
  }

  /* head gear drawn BEHIND the head, portrait coords (head centre 60,62) */
  function accBack(c) {
    var a = c.a, b = c.b, e = c.e;
    switch (c.t) {
      case 'c': return '<path d="M60 12 C108 12 112 70 92 92 L28 92 C8 70 12 12 60 12Z" fill="' + b + '" stroke="rgba(0,0,0,.35)"/><path d="M40 30 L50 52 M80 30 L70 52" stroke="' + a + '" stroke-width="4" stroke-linecap="round"/>';
      case 'f': return '<path d="M30 40 L36 8 L46 34Z M52 32 L60 2 L68 32Z M74 34 L84 8 L90 40Z" fill="#E8F7FF" stroke="' + b + '" stroke-width="1.5"/>';
      case 'i': return '<path d="M34 40 L22 10 L50 34Z M86 40 L98 10 L70 34Z" fill="#FFD23F" stroke="' + b + '" stroke-width="1.5"/><path d="M52 32 C50 20 58 16 60 4 C64 16 70 20 68 32Z" fill="#FFB02E"/>';
      case 'r': return '<path d="M60 28 L60 10" stroke="' + b + '" stroke-width="3"/><circle cx="60" cy="9" r="4" fill="#FF4D6D"/>';
      case 'D': return '<path d="M30 40 L10 4 L48 30Z M90 40 L110 4 L72 30Z" fill="' + e + '" stroke="#000" stroke-width="1.5"/><path d="M44 32 L48 14 L54 26 L60 10 L66 26 L72 14 L76 32Z" fill="' + e + '" stroke="#000"/>';
      case 'M': return '<path d="M32 42 L14 8 L50 32Z M88 42 L106 8 L70 32Z" fill="#3A2020" stroke="' + e + '" stroke-width="2"/>';
      case 'R': return '<path d="M60 8 C98 8 110 46 100 70 L20 70 C10 46 22 8 60 8Z" fill="' + b + '" stroke="#000"/>';
      case 'T': return '<path d="M52 2 L40 26 L54 24 L46 44 L70 18 L56 20 L66 2Z" fill="' + e + '" stroke="#000"/>';
      case 'V': return '<path d="M24 44 L16 14 L44 32Z M96 44 L104 14 L76 32Z" fill="' + b + '" stroke="' + a + '" stroke-width="1.5"/>';
      case 'B': return '<circle cx="60" cy="48" r="46" fill="#C41E3A" opacity=".55"/>';
      case 'K': return '<path d="M38 36 L40 14 L50 26 L60 8 L70 26 L80 14 L82 36Z" fill="#FFD23F" stroke="#7A4A00" stroke-width="1.5"/><circle cx="60" cy="16" r="3" fill="#FF2A3D"/>';
    }
    return '';
  }
  /* gear drawn IN FRONT of the face */
  function accFront(c) {
    var a = c.a, b = c.b, e = c.e;
    switch (c.t) {
      case 's': return '<path d="M24 52 Q60 40 96 52 L96 66 Q60 56 24 66Z" fill="#0E0A24"/><circle cx="46" cy="57" r="5" fill="' + e + '"/><circle cx="74" cy="57" r="5" fill="' + e + '"/><path d="M30 88 Q60 100 90 88 L86 80 Q60 90 34 80Z" fill="#C0392B"/>';
      case 'r': return '<rect x="26" y="44" width="68" height="22" rx="8" fill="#0B2A3A" stroke="#22D3EE" stroke-width="2"/><rect x="34" y="51" width="18" height="8" rx="3" fill="#22D3EE"/><rect x="68" y="51" width="18" height="8" rx="3" fill="#22D3EE"/>';
      case 'R': return '<path d="M60 36 L60 48 M40 76 L80 76 M46 76 L46 84 M54 76 L54 84 M62 76 L62 84 M70 76 L70 84" stroke="#E8E8F0" stroke-width="2.4" stroke-linecap="round"/>';
      case 'b': return '';
      case 'B': return '<path d="M36 40 L48 62 M40 38 L52 58" stroke="#000" stroke-width="2.4"/>';
      case 'M': return '<path d="M40 42 L50 56 L44 70 M82 44 L72 58 L80 72 M60 76 L56 88" stroke="' + e + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
      case 'T': return '<path d="M86 40 L78 54 L88 54 L80 70" stroke="' + b + '" stroke-width="3" fill="none"/>';
    }
    return '';
  }
  function angryEyes(c) {
    var col = c.e;
    if (c.t === 'B') col = '#FFE14A'; if (c.t === 'T') col = '#fff';
    return '<path d="M28 48 L52 54 L50 64 L30 58Z" fill="' + col + '" stroke="#000" stroke-width="1.2"/><path d="M92 48 L68 54 L70 64 L90 58Z" fill="' + col + '" stroke="#000" stroke-width="1.2"/><ellipse cx="42" cy="58" rx="2" ry="4.5" fill="#000"/><ellipse cx="78" cy="58" rx="2" ry="4.5" fill="#000"/>';
  }
  function eye(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="7.5" fill="#fff" stroke="rgba(0,0,0,.35)"/><circle cx="' + (x + 1.5) + '" cy="' + y + '" r="3.6" fill="#111"/>'; }

  function svgFace(c) {
    var o = accBack(c);
    o += '<ellipse cx="60" cy="62" rx="36" ry="30" fill="' + c.a + '" stroke="' + (c.L ? '#000' : 'rgba(0,0,0,.35)') + '" stroke-width="1.6"/><ellipse cx="60" cy="74" rx="22" ry="14" fill="' + c.b + '" opacity=".35"/>';
    if (c.L) { o += accFront(c).replace(/^/, ''); o += angryEyes(c); o += '<path d="M38 80 L46 94 L52 80Z M68 80 L74 94 L82 80Z" fill="#fff" stroke="#000" stroke-width="1.2"/>'; if (c.t === 'K') o += '<path d="M38 34 L40 22" stroke="none"/>'; }
    else { o += eye(46, 54) + eye(74, 54) + accFront(c); o += '<path d="M60 84 L60 94 M60 94 L55 99 M60 94 L65 99" stroke="' + c.e + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>'; }
    return '<svg viewBox="0 0 120 104" width="100%" aria-hidden="true"><rect width="120" height="104" rx="8" fill="' + (c.L ? '#0D0817' : '#14103A') + '"/>' + o + '</svg>';
  }

  /* animation picture: 3 small frames */
  function svgAnim(an) {
    var c = hex(an.c).join(','), rgb = 'rgb(' + c + ')';
    function snk(x, y, n) { var o = ''; for (var i = n; i >= 0; i--) o += '<circle cx="' + (x - i * 9) + '" cy="' + (y + Math.sin(i * .7) * 3) + '" r="' + (5 + (n - i) * .3) + '" fill="#7BE04A" stroke="rgba(0,0,0,.3)"/>'; return o + '<circle cx="' + (x + 2) + '" cy="' + (y - 2) + '" r="1.8" fill="#fff"/><circle cx="' + (x + 2) + '" cy="' + (y + 3) + '" r="1.8" fill="#fff"/>'; }
    var out = '';
    for (var k = 0; k < 3; k++) {
      var o = '';
      if (an.t === 'trail') { o += snk(70, 40, 3); for (var i = 0; i < (k + 1) * 3; i++) o += '<circle cx="' + (40 - i * 4) + '" cy="' + (40 + ((i * 13) % 17 - 8)) + '" r="' + Math.max(.8, 2.2 - i * .1) + '" fill="' + rgb + '" opacity="' + (1 - i * .08) + '"/>'; }
      if (an.t === 'aura') { for (var j = 0; j <= k; j++) o += '<circle cx="60" cy="40" r="' + (14 + j * 9) + '" fill="none" stroke="' + rgb + '" stroke-width="' + (3 - j * .8) + '" opacity="' + (1 - j * .3) + '"/>'; o += snk(62, 40, 3); }
      if (an.t === 'burst') { for (var q = 0; q < 10; q++) { var d = 6 + k * 13, anl = q * .628; o += '<circle cx="' + (60 + Math.cos(anl) * d) + '" cy="' + (40 + Math.sin(anl) * d) + '" r="' + (4 - k * .8) + '" fill="' + rgb + '"/>'; } }
      if (an.t === 'spawn') { o += '<ellipse cx="60" cy="58" rx="' + (30 - k * 4) + '" ry="9" fill="none" stroke="' + rgb + '" stroke-width="3"/>'; if (k) o += snk(60, 58 - k * 14, 0); }
      if (an.t === 'fire') { o += snk(78, 40, 3); for (var f = 0; f <= k + 1; f++) o += '<ellipse cx="' + (50 - f * 9) + '" cy="40" rx="' + (8 - f) + '" ry="' + (5 - f * .8) + '" fill="' + (f % 2 ? '#FFD23F' : '#FF5A28') + '"/>'; }
      if (an.t === 'win') { o += snk(60, 52, 3); o += '<path d="M48 34 L52 22 L58 30 L64 22 L68 34 Z" fill="#FFD23F" stroke="#B8860B" opacity="' + (k ? 1 : .2) + '"/>'; for (var w = 0; w < k * 5; w++) o += '<rect x="' + (15 + w * 22 % 90) + '" y="' + (8 + w * 17 % 60) + '" width="4" height="4" fill="hsl(' + w * 70 + ',85%,60%)"/>'; }
      out += '<svg viewBox="0 0 120 80" width="100%" aria-hidden="true"><rect width="120" height="80" rx="6" fill="#14103A"/>' + o + '</svg>';
    }
    return '<div class="afr">' + out + '</div>';
  }

  window.VR = window.VR || {};
  VR.cos = { SKINS: SKINS, CHARS: CHARS, ANIMS: ANIMS, find: find, segColor: segColor, mix: mix, hex: hex, svgBody: svgBody, svgFace: svgFace, svgAnim: svgAnim, accBack: accBack, accFront: accFront };
})();
