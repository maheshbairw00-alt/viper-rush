/* js/app.js
 * Starts the app and moves between screens: loading -> login -> lobby -> game.
 * Also holds the small shared helpers: VR.ui.toast() and VR.ui.modal().
 *
 * API:  VR.app.go('loading' | 'login' | 'lobby' | 'game')
 *       VR.app.startGame(cfg)
 * Debug: open index.html?screen=login  (or lobby / game) to jump straight to a screen.
 */
(function () {
  function $(id) { return document.getElementById(id); }
  var SCREENS = ['loading', 'login', 'lobby', 'game'];
  var toastT = 0;

  /* ---------- shared UI ---------- */
  var ui = {
    toast: function (msg) {
      var t = $('toast'); t.textContent = msg; t.classList.add('on');
      clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2200);
    },
    modal: function (o) {
      var box = $('modalBox'); box.innerHTML = '';
      var h = document.createElement('h3'); h.textContent = o.title || ''; box.appendChild(h);
      if (o.html) { var w = document.createElement('div'); w.innerHTML = o.html; box.appendChild(w); }
      if (o.body) { var p = document.createElement('p'); p.textContent = o.body; box.appendChild(p); }
      var row = document.createElement('div'); row.className = 'row'; box.appendChild(row);
      (o.actions || [{ label: 'OK' }]).forEach(function (a) {
        var b = document.createElement('button'); b.type = 'button';
        b.className = a.primary ? 'primary' : 'ghost'; b.textContent = a.label;
        b.addEventListener('click', function () {
          if (!a.keepOpen) ui.closeModal();
          if (a.onClick) a.onClick();
        });
        row.appendChild(b);
      });
      $('modal').classList.add('on');
    },
    closeModal: function () { $('modal').classList.remove('on'); }
  };

  /* ---------- screens ---------- */
  function go(name) {
    SCREENS.forEach(function (n) { $(n).classList.toggle('active', n === name); });
    VR.bg.setMode(name === 'lobby' ? 'lobby' : 'menu');
    if (name === 'game') VR.bg.stop(); else VR.bg.start();
    if (name !== 'lobby') $('chat').classList.remove('on');
    if (name === 'lobby') VR.lobby.refresh();
    if (VR.music) VR.music.sync(name);
  }

  function startGame(cfg) {
    go('game');
    VR.game.start(cfg);
  }

  /* ---------- loading ---------- */
  var TIPS = ['Eat glowing orbs to grow longer', 'Hold BOOST to sprint, but it costs length', 'Stay close to your squad', 'Cut off enemies to win their orbs', 'Stay away from the red wall'];
  function runLoading(done) {
    var fill = $('barFill'), pct = $('pct'), tip = $('tip');
    var total = VR_CONFIG.loadingSeconds * 1000, t0 = performance.now(), ti = 0;
    tip.textContent = TIPS[0];
    var tipTimer = setInterval(function () { ti = (ti + 1) % TIPS.length; tip.textContent = TIPS[ti]; }, 1100);
    // Replace this timer with real asset loading later (images, sounds, server connect).
    function tick(now) {
      var k = Math.min(1, (now - t0) / total), e = 1 - Math.pow(1 - k, 2);
      fill.style.width = (e * 100).toFixed(1) + '%'; pct.textContent = Math.round(e * 100) + '%';
      if (k < 1) requestAnimationFrame(tick); else { clearInterval(tipTimer); setTimeout(done, 250); }
    }
    requestAnimationFrame(tick);
  }

  /* ---------- fullscreen + landscape lock on phones ---------- */
  function tryFullscreen() {
    if (!(window.matchMedia && matchMedia('(pointer:coarse)').matches)) return;
    var el = document.documentElement;
    try {
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req && !document.fullscreenElement) {
        var r = req.call(el);
        var lock = function () { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); };
        if (r && r.then) r.then(lock).catch(function () {}); else lock();
      }
    } catch (e) {}
  }

  function init() {
    window.VR = window.VR || {};
    VR.bg.start();
    VR.login.init(); VR.lobby.init(); VR.game.init();
    document.addEventListener('pointerdown', tryFullscreen, { once: true });
    $('modal').addEventListener('pointerdown', function (e) { if (e.target === $('modal')) ui.closeModal(); });

    var q = new URLSearchParams(location.search).get('screen');
    VR.auth.load();
    function afterLoading() {
      if (VR.auth.user) { VR.lobby.enter(VR.auth.user); setTimeout(function () { VR.auth.pull().then(function () { if (VR.pay) VR.pay.sweep(); }); }, 1500); } else go('login');
    }
    if (q && SCREENS.indexOf(q) >= 0) {           // debug shortcut
      if (q === 'loading') { go('loading'); return; }
      if (q === 'login') { go('login'); return; }
      var u = VR.auth.user || { id: 'dev', name: 'Player_1', provider: 'guest', level: 3, coins: 1200, gems: 85 };
      VR.lobby.enter(u);
      if (q === 'game') {
        VR.app.startGame({ mode: 'squad', user: u, squad: [{ name: u.name, you: true }, { name: 'Ravi' }, { name: 'Alex' }, { name: 'Sam' }, { name: 'Zoya' }] });
      }
      return;
    }
    go('loading');
    runLoading(afterLoading);
  }

  window.VR = window.VR || {};
  VR.ui = ui;
  VR.app = { go: go, startGame: startGame, init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
