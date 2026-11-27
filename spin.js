/* js/spin.js
 * REWARD screen with two spins.
 *  - LUCKY SPIN: always 19 diamonds, 24 items (mostly small things, a few better ones, 2 normal skins), the result is random, nothing is guaranteed.
 *  - MEGA SPIN: 5 spins, 199 / 299 / 399 / 499 / 599 diamonds (1,995 in total). Spins 1-3 give normal items, spin 4 gives the snake face "Abyss Fang",
 *    spin 5 gives the dangerous skin "Void Reaper". It is a one-time spin: progress is saved (stop after spin 3 and continue tomorrow),
 *    and after spin 5 it turns grey for good. Those two rare items cannot be bought anywhere else.
 * An item the player already owns turns into coins. Change the lists below to change the prizes.
 * API: VR.spin.open()
 */
(function () {
  var tab = 'lucky', busy = false, hot = -1;

  /* ---------- LUCKY SPIN prizes (w = weight: bigger = more often) ---------- */
  var LUCKY_COST = 19, DUP_COINS = 150;
  var LUCKY = [
    { c: 100, w: 16 }, { c: 200, w: 10 }, { c: 500, w: 5 }, { c: 1000, w: 2 },
    { g: 5, w: 8 }, { g: 10, w: 5 }, { g: 25, w: 2 }, { g: 50, w: 1 },
    { x: 30, w: 8 }, { x: 100, w: 4 },
    { k: 'emote', id: 'em2', w: 3 }, { k: 'emote', id: 'em3', w: 3 }, { k: 'emote', id: 'em4', w: 3 }, { k: 'emote', id: 'em5', w: 3 }, { k: 'emote', id: 'em6', w: 3 }, { k: 'emote', id: 'em7', w: 3 },
    { k: 'frame', id: 'f1', w: 2 }, { k: 'frame', id: 'f4', w: 2 },
    { k: 'badge', id: 'b1', w: 2 }, { k: 'badge', id: 'b2', w: 2 },
    { k: 'banner', id: 'n1', w: 2 }, { k: 'banner', id: 'n2', w: 2 },
    { k: 'skin', id: 's1', w: 1 }, { k: 'skin', id: 's2', w: 1 }
  ];

  /* ---------- MEGA SPIN (fixed order, one time) ---------- */
  var MEGA = [
    { cost: 199, items: [{ k: 'emote', id: 'em3' }], c: 300 },
    { cost: 299, items: [{ k: 'frame', id: 'f1' }], c: 500 },
    { cost: 399, items: [{ k: 'badge', id: 'b2' }], c: 800 },
    { cost: 499, items: [{ k: 'char', id: 'cx1' }], big: 1 },
    { cost: 599, items: [{ k: 'skin', id: 'sx1' }], big: 1 }
  ];

  function $(id) { return document.getElementById(id); }
  function U() { return (VR.auth && VR.auth.user) || (VR.lobby && VR.lobby.openUser && VR.lobby.openUser()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function find(k, id) { return VR.store.find(k, id); }
  function owns(k, id) { return VR.store.own(k, id); }

  function name(p) {
    if (p.c) return p.c + ' coins'; if (p.g) return p.g + ' diamonds'; if (p.x) return p.x + ' XP';
    var it = find(p.k, p.id); return it ? it.n : p.id;
  }
  function icon(p, big) {
    if (p.c) return '<div class="spi">🪙</div>'; if (p.g) return '<div class="spi">💎</div>'; if (p.x) return '<div class="spi">⭐</div>';
    var it = find(p.k, p.id);
    if (p.k === 'emote' || p.k === 'badge') return '<div class="spi">' + it.e + '</div>';
    if (p.k === 'frame') return '<div class="spi"><i class="sfr" style="box-shadow:0 0 0 3px ' + it.c + ',0 0 12px ' + it.c + '">P</i></div>';
    if (p.k === 'banner') return '<div class="spi"><i class="sbn" style="background:' + it.g + '"></i></div>';
    if (p.k === 'skin') return '<div class="spi sk">' + VR.cos.svgBody(it) + '</div>';
    if (p.k === 'char') return '<div class="spi sk">' + VR.cos.svgFace(it) + '</div>';
    return '<div class="spi">🎁</div>';
  }

  // gives one prize to the player; an item they already own turns into coins. Returns the text to show.
  function award(u, p) {
    if (p.c) { u.coins = (u.coins || 0) + p.c; return '+' + p.c + ' coins'; }
    if (p.g) { u.gems = (u.gems || 0) + p.g; return '+' + p.g + ' diamonds'; }
    if (p.x) { u.xp = (u.xp || 0) + p.x; return '+' + p.x + ' XP'; }
    var it = find(p.k, p.id);
    if (owns(p.k, p.id)) { u.coins = (u.coins || 0) + DUP_COINS; return it.n + ' (you already have it) +' + DUP_COINS + ' coins'; }
    VR.store.give(p.k, p.id); return it.n;
  }

  function pickLucky() {
    var tot = 0, i; LUCKY.forEach(function (p) { tot += p.w; });
    var r = Math.random() * tot; for (i = 0; i < LUCKY.length; i++) { r -= LUCKY[i].w; if (r < 0) return i; }
    return LUCKY.length - 1;
  }
  function mega(u) { return (u.mega = u.mega || { n: 0 }); }

  /* ---------- screen ---------- */
  function show(h) { $('pbox').innerHTML = h; $('sheet').classList.add('on'); }
  function close() { $('sheet').classList.remove('on'); }
  function render() {
    var u = U(), h = '<div class="ph"><span>REWARD</span><button class="px" type="button" id="spX">X</button></div><div class="pbody">' +
      '<div class="dbal">' + fmt(u.gems || 0) + ' 💎</div><div class="tabs">' +
      '<button type="button" class="tab' + (tab === 'lucky' ? ' on' : '') + '" data-tab="lucky">LUCKY SPIN</button>' +
      '<button type="button" class="tab' + (tab === 'mega' ? ' on' : '') + '" data-tab="mega">MEGA SPIN' + (mega(u).n >= 5 ? ' ✓' : '') + '</button></div>';
    if (tab === 'lucky') {
      h += '<p class="note">Spin for ' + LUCKY_COST + ' 💎. You can win coins, diamonds, XP, emotes, frames, badges, banners and skins. Nothing is guaranteed.</p><div class="spg">' +
        LUCKY.map(function (p, i) { return '<div class="spt' + (hot === i ? ' hot' : '') + '" data-i="' + i + '">' + icon(p) + '<small>' + esc(name(p)) + '</small></div>'; }).join('') + '</div>' +
        '<button type="button" class="gb pk spgo" data-go="lucky"' + (busy ? ' disabled' : '') + '>SPIN &middot; ' + LUCKY_COST + ' 💎</button>';
    } else {
      var n = mega(u).n, done = n >= 5;
      h += '<div class="mega' + (done ? ' fin' : '') + '"><p class="note">' + (done ? 'MEGA SPIN completed. All 5 rewards are yours!' : 'One-time spin. Spin ' + (n + 1) + ' of 5. The rare items come at spin 4 and spin 5. Your progress is saved.') + '</p><div class="spg m5">' +
        MEGA.map(function (st, i) {
          var p = st.items[0], cls = 'spt' + (i < n ? ' got' : '') + (i === n && !done ? ' next' : '') + (st.big ? ' big' : '') + (hot === i ? ' hot' : '');
          return '<div class="' + cls + '">' + icon(p) + '<small>' + esc(name(p)) + (st.c ? '<br>+' + st.c + ' coins' : '') + '</small><em>' + (i < n ? '✓ GOT' : st.cost + ' 💎') + '</em></div>';
        }).join('') + '</div>' +
        (done ? '<button type="button" class="gb dis spgo" disabled>COMPLETED</button>'
          : '<button type="button" class="gb pk spgo" data-go="mega"' + (busy ? ' disabled' : '') + '>SPIN ' + (n + 1) + ' &middot; ' + MEGA[n].cost + ' 💎</button>') + '</div>';
    }
    show(h + '</div>');
  }
  function open() { var u = U(); if (!u) return; tab = 'lucky'; hot = -1; busy = false; render(); }

  /* ---------- spinning ---------- */
  function run(n, stopAt, tileCount, done) {                // the highlight runs over the tiles, slows down, stops on stopAt
    var steps = 18 + Math.floor(Math.random() * 6), i = 0, cur = stopAt - steps;
    cur = ((cur % tileCount) + tileCount) % tileCount;
    (function tick() {
      hot = cur % tileCount; paint();
      if (VR.sfx) VR.sfx.play('eat');
      if (i++ >= steps) { done(); return; }
      cur++; setTimeout(tick, 45 + i * i * 0.45);
    })();
  }
  function paint() {
    var tiles = document.querySelectorAll('#pbox .spg .spt');
    tiles.forEach(function (t, i) { t.classList.toggle('hot', i === hot); });
  }
  function result(txt, big) {
    if (VR.sfx) VR.sfx.play(big ? 'win' : 'golden');
    VR.ui.modal({ title: big ? 'AMAZING!' : 'YOU GOT', body: txt, actions: [{ label: 'OK', primary: true }] });
  }
  function after() { busy = false; hot = -1; VR.auth.save(); if (VR.lobby && VR.lobby.refresh) VR.lobby.refresh(); render(); }

  function goLucky() {
    var u = U(); if (busy) return;
    if ((u.gems || 0) < LUCKY_COST) return VR.ui.toast('Need ' + (LUCKY_COST - (u.gems || 0)) + ' more diamonds');
    u.gems -= LUCKY_COST; busy = true; var idx = pickLucky(); VR.auth.save(); render();
    run(0, idx, LUCKY.length, function () { var t = award(u, LUCKY[idx]); after(); result(t, false); });
  }
  function goMega() {
    var u = U(), m = mega(u); if (busy || m.n >= 5) return;
    var st = MEGA[m.n];
    if ((u.gems || 0) < st.cost) return VR.ui.toast('Need ' + (st.cost - (u.gems || 0)) + ' more diamonds');
    u.gems -= st.cost; busy = true; var at = m.n; m.n++; VR.auth.save(); render();
    run(0, at, 5, function () {
      var txt = st.items.map(function (p) { return award(u, p); }).join(' + ') + (st.c ? ' + ' + st.c + ' coins' : '');
      if (st.c) u.coins = (u.coins || 0) + st.c;
      after(); result(txt, !!st.big);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var box = $('pbox');
    box.addEventListener('click', function (e) {
      if (!box.querySelector('#spX')) return;
      var t = e.target.closest('button'); if (!t) return;
      if (t.id === 'spX') { if (!busy) close(); return; }
      if (t.dataset.tab) { if (!busy) { tab = t.dataset.tab; render(); } }
      else if (t.dataset.go === 'lucky') goLucky();
      else if (t.dataset.go === 'mega') goMega();
    });
  });

  window.VR = window.VR || {};
  VR.spin = { open: open };
})();
