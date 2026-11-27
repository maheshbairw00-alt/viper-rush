/* js/settings.js
 * SETTINGS screen (account + logout, controls, sound, graphics). Saved with the player's account.
 * API: VR.settings.get(key)  VR.settings.set(key,val)  VR.settings.apply()  VR.settings.open()
 */
(function () {
  var DEF = {
    sens: 100,              // turn speed %
    stickSize: 100, stickOpa: 100, stickX: 0, stickY: 0,
    boostSize: 100, boostX: 0, boostY: 0,
    healSize: 100, swap: false, floatStick: false,
    music: true, musicVol: 70, tune: 'venom',
    sfx: true, sfxVol: 80, vibe: true,
    quality: 'high'         // low / mid / high
  };
  var tmp = null;           // used when nobody is logged in yet
  function cur() { return (VR.auth && VR.auth.user) || (VR.lobby && VR.lobby.openUser && VR.lobby.openUser()); }
  function store() { var u = cur(); if (!u) return (tmp = tmp || {}); return (u.settings = u.settings || {}); }
  function get(k) { var s = store(); return s[k] === undefined ? DEF[k] : s[k]; }
  function set(k, v) { store()[k] = v; if (VR.auth && VR.auth.user) VR.auth.save(); apply(); }

  function apply() {
    var g = document.getElementById('game'); if (!g) return;
    var st = g.style, u = 'var(--u)';
    st.setProperty('--stS', get('stickSize') / 100);
    st.setProperty('--stO', get('stickOpa') / 100);
    st.setProperty('--stX', get('stickX') * 0.3 + 'vh');
    st.setProperty('--stY', get('stickY') * 0.3 + 'vh');
    st.setProperty('--bsS', get('boostSize') / 100);
    st.setProperty('--bsX', get('boostX') * 0.3 + 'vh');
    st.setProperty('--bsY', get('boostY') * 0.3 + 'vh');
    st.setProperty('--hlS', get('healSize') / 100);
    g.classList.toggle('swap', !!get('swap')); g.classList.toggle('fl', !!get('floatStick'));
    if (VR.game && VR.game.resize) VR.game.resize();
    if (VR.music) VR.music.refresh();
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var TABS = [['acc', 'ACCOUNT'], ['ctl', 'CONTROLS'], ['snd', 'SOUND'], ['gfx', 'GRAPHICS']], tab = 'acc';

  function slider(k, label, min, max, step, unit) {
    return '<label class="srow"><span>' + label + '</span><input type="range" data-k="' + k + '" min="' + min + '" max="' + max + '" step="' + (step || 5) + '" value="' + get(k) + '"><b>' + get(k) + (unit || '%') + '</b></label>';
  }
  function toggle(k, label) {
    return '<div class="srow"><span>' + label + '</span><button type="button" class="tg' + (get(k) ? ' on' : '') + '" data-tg="' + k + '">' + (get(k) ? 'ON' : 'OFF') + '</button></div>';
  }

  function body() {
    var u = cur() || {}, h = '';
    if (tab === 'acc') {
      var prov = u.provider === 'google' ? 'Google' : u.provider === 'facebook' ? 'Facebook' : 'Guest';
      h += '<div class="acc"><div class="avb" style="--c:#7BE04A">' + esc((u.name || 'P').charAt(0).toUpperCase()) + '</div><div class="ainfo">' +
        '<b>' + esc(u.name) + '</b><small>Login: ' + prov + '</small>' +
        (u.email ? '<small>' + esc(u.email) + '</small>' : '') +
        '<small>Player ID: ' + esc(String(u.id || '').slice(-10).toUpperCase()) + '</small>' +
        '<small>' + (prov === 'Guest' ? 'Guest: progress is saved on this phone only' : 'Progress is saved to your account (cloud)') + '</small></div></div>' +
        '<button type="button" class="gb pk" id="stLogout" style="width:100%;height:calc(var(--u)*8)">LOG OUT</button>';
    } else if (tab === 'ctl') {
      h += slider('sens', 'Turn sensitivity', 60, 160) +
        toggle('swap', 'Left-handed layout (swap joystick and BOOST sides)') + toggle('floatStick', 'Floating joystick (appears where you touch)') +
        slider('stickSize', 'Joystick size', 70, 140) + slider('stickOpa', 'Joystick opacity', 30, 100) +
        slider('stickX', 'Joystick left / right', -30, 60, 5, '') + slider('stickY', 'Joystick up / down', -30, 30, 5, '') +
        slider('boostSize', 'BOOST button size', 70, 140) +
        slider('boostX', 'BOOST left / right', -60, 30, 5, '') + slider('boostY', 'BOOST up / down', -30, 30, 5, '') +
        slider('healSize', 'Heal buttons size', 70, 140) +
        '<button type="button" class="gb" id="stReset" style="width:100%">RESET CONTROLS</button>';
    } else if (tab === 'snd') {
      h += toggle('music', 'Music (lobby + match)') + slider('musicVol', 'Music volume', 0, 100) + toggle('sfx', 'Sound effects') + slider('sfxVol', 'Effects volume', 0, 100) + toggle('vibe', 'Vibration on kills') + '<p class="note">Lobby tune:</p><div class="tunes">';
      VR.music.TRACKS.forEach(function (t) {
        var ok = VR.music.allowed(t), on = (get('tune') === t.id && ok);
        h += '<button type="button" class="tune' + (on ? ' on' : '') + (ok ? '' : ' lock') + (t.pass ? ' rare' : '') + '" data-tune="' + t.id + '"><b>' + esc(t.n) + '</b><small>' +
          (ok ? esc(t.note) : 'Season 1 members only') + '</small><em>' + (on ? 'PLAYING' : ok ? 'PLAY' : 'LOCKED') + '</em></button>';
      });
      h += '</div>';
    } else {
      var q = get('quality');
      h += '<div class="srow"><span>Graphics quality</span><div class="seg">' +
        [['low', 'LOW'], ['mid', 'MEDIUM'], ['high', 'HIGH']].map(function (x) { return '<button type="button" class="' + (q === x[0] ? 'on' : '') + '" data-q="' + x[0] + '">' + x[1] + '</button>'; }).join('') +
        '</div></div><p class="note">Pick LOW if the game feels slow on your phone.</p>';
    }
    return h;
  }

  function render() {
    var box = document.getElementById('pbox');
    box.innerHTML = '<div class="ph"><span>SETTINGS</span><button class="px" type="button" id="stX">X</button></div><div class="pbody"><div class="tabs">' +
      TABS.map(function (t) { return '<button type="button" class="tab' + (t[0] === tab ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '</div><div class="sbody">' + body() + '</div></div>';
  }

  function close() { document.getElementById('sheet').classList.remove('on'); }
  function open() { tab = 'acc'; render(); document.getElementById('sheet').classList.add('on'); }

  function doLogout() {
    var u = cur() || {}, guest = u.provider === 'guest';
    VR.ui.modal({
      title: 'LOG OUT?',
      body: guest ? 'You are a Guest. Your progress is saved only on this phone and will be LOST if you log out.' : 'Your progress is saved in your account. You can log in again anytime.',
      actions: [
        { label: 'LOG OUT', primary: true, onClick: function () { close(); VR.auth.logout().then(function () { VR.app.go('login'); }); } },
        { label: 'CANCEL' }
      ]
    });
  }

  function onClick(e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.id === 'stX') return close();
    if (t.id === 'stLogout') return doLogout();
    if (t.id === 'stReset') { ['sens', 'stickSize', 'stickOpa', 'stickX', 'stickY', 'boostSize', 'boostX', 'boostY', 'healSize', 'swap', 'floatStick'].forEach(function (k) { store()[k] = DEF[k]; }); set('sens', DEF.sens); return render(); }
    if (t.dataset.tab) { tab = t.dataset.tab; return render(); }
    if (t.dataset.tg) { set(t.dataset.tg, !get(t.dataset.tg)); return render(); }
    if (t.dataset.q) { set('quality', t.dataset.q); return render(); }
    if (t.dataset.tune) {
      var tr = VR.music.find(t.dataset.tune);
      if (!VR.music.allowed(tr)) { VR.ui.toast('This tune is only for Season 1 members'); return; }
      set('tune', tr.id); return render();
    }
  }
  function onInput(e) {
    var k = e.target.dataset && e.target.dataset.k; if (!k) return;
    var v = +e.target.value; set(k, v);
    var b = e.target.parentNode.querySelector('b'); if (b) b.textContent = v + (/X$|Y$/.test(k) ? '' : '%');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var box = document.getElementById('pbox');
    box.addEventListener('click', function (e) { if (box.querySelector('#stX')) onClick(e); });
    box.addEventListener('input', onInput);
  });

  window.VR = window.VR || {};
  VR.settings = { get: get, set: set, apply: apply, open: open, DEF: DEF };
})();
