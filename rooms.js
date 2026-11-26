/* js/rooms.js
 * CUSTOM ROOM / TOURNAMENT screen. The admin makes rooms in the admin panel (Firestore viperrush_rooms/<code>):
 *   name, kind ('custom' | 'tournament'), max players, world size, startAt (ms, optional), entry (diamonds), prize, rules, status ('open' | 'closed')
 * A player opens the list (or types a code), pays the entry fee if there is one, and joins that room on the game server.
 * Everyone who joins the same code plays together. At the end each player's result is saved (viperrush_results) so the admin can give the prize.
 * API: VR.rooms.open()
 */
(function () {
  var list = [];
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function U() { return (VR.auth && VR.auth.user) || (VR.lobby && VR.lobby.openUser && VR.lobby.openUser()); }
  function fbOn() { return !!(window.VR_CONFIG && VR_CONFIG.firebase && window.firebase && window.firebase.firestore); }
  function db() { var f = window.firebase; if (!f.apps.length) f.initializeApp(VR_CONFIG.firebase); return f.firestore(); }
  function show(h) { $('pbox').innerHTML = h; $('sheet').classList.add('on'); }
  function close() { $('sheet').classList.remove('on'); }
  var WORLDS = { 6400: 'Small map', 16000: 'Medium map', 48000: 'Big map' };

  function fdt(t) { var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function card(r) {
    var when = r.startAt && r.startAt > Date.now() ? 'Starts ' + fdt(r.startAt) : 'Starts 2 min after the first player (or when full)';
    return '<div class="evc ' + (r.kind === 'tournament' ? 'live' : '') + '"><div class="evh"><b>' + esc(r.name) + '</b><em class="evs ' + (r.kind === 'tournament' ? 'on' : 'soon') + '">' + (r.kind === 'tournament' ? 'TOURNAMENT' : 'CUSTOM') + '</em></div>' +
      '<small>Code ' + esc(r.code) + ' &middot; up to ' + (r.max || 50) + ' players &middot; ' + (WORLDS[r.world] || 'Auto map') + '</small><small>' + when + '</small>' +
      (r.rules ? '<p>' + esc(r.rules) + '</p>' : '') +
      (r.prize ? '<div class="evr">PRIZE: ' + esc(r.prize) + '</div>' : '') +
      '<button type="button" class="gb" data-join="' + esc(r.code) + '">JOIN' + (r.entry > 0 ? ' &middot; ' + r.entry + ' 💎' : ' &middot; FREE') + '</button></div>';
  }
  function render(loading) {
    show('<div class="ph"><span>CUSTOM ROOM</span><button class="px" type="button" id="roomX">X</button></div><div class="pbody">' +
      '<div class="addid"><input id="roomCode" class="mi up" type="text" maxlength="12" placeholder="Room code" autocomplete="off" autocapitalize="characters"><button class="gb" type="button" data-go="1">GO</button></div>' +
      (loading ? '<p class="note">Loading rooms...</p>' : (list.length ? list.map(card).join('') : '<p class="note">No open rooms right now. If you have a code, type it above.</p>')) + '</div>');
  }
  function open() {
    var u = U();
    if (!VR.net || !VR.net.enabled()) return VR.ui.toast('Online server is not set up yet');
    if (!u || u.provider === 'guest') return VR.ui.toast('Log in with Google to join custom rooms');
    render(true);
    if (!fbOn()) { list = []; return render(); }
    db().collection('viperrush_rooms').where('status', '==', 'open').limit(20).get().then(function (s) {
      list = s.docs.map(function (d) { var r = d.data(); r.code = r.code || d.id; return r; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); render();
    }).catch(function () { list = []; render(); VR.ui.toast('Could not load rooms'); });
  }

  function byCode(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return VR.ui.toast('Type a room code');
    var f = list.filter(function (r) { return r.code === code; })[0];
    if (f) return confirmJoin(f);
    db().collection('viperrush_rooms').doc(code).get().then(function (d) {
      var r = d.exists ? d.data() : null;
      if (!r || r.status !== 'open') return VR.ui.toast('Room not found or closed');
      r.code = code; confirmJoin(r);
    }).catch(function () { VR.ui.toast('Could not reach the server'); });
  }
  function confirmJoin(r) {
    var u = U(), fee = r.entry > 0 ? r.entry | 0 : 0;
    if (fee > (u.gems || 0)) return VR.ui.toast('Need ' + (fee - (u.gems || 0)) + ' more diamonds');
    VR.ui.modal({
      title: (r.name || 'JOIN ROOM').toUpperCase(),
      body: fee ? 'Entry fee ' + fee + ' diamonds. It is returned if the room is cancelled. Join?' : 'Join this room?',
      actions: [{ label: 'CANCEL' }, { label: 'JOIN', primary: true, onClick: function () { join(r, fee); } }]
    });
  }
  function join(r, fee) {
    var u = U(), done = false, cancelled = false;
    if (fee) { u.gems -= fee; VR.auth.save(); if (VR.lobby && VR.lobby.refresh) VR.lobby.refresh(); }
    function refund() { if (fee && !done) { done = true; u.gems += fee; VR.auth.save(); if (VR.lobby && VR.lobby.refresh) VR.lobby.refresh(); } }
    close();
    VR.ui.modal({ title: r.name.toUpperCase(), html: '<p id="roomTxt">Connecting to the server... (the first time it can take up to a minute)</p>', actions: [
      { label: 'LEAVE', onClick: function () { cancelled = true; VR.net.close(); refund(); } }
    ] });
    function end(text) { if (cancelled) return; refund(); VR.ui.closeModal(); VR.ui.toast(text); }
    VR.net.find({ name: u.name, skin: u.eq.skin, ch: u.eq.char, ci: u.skin || 0, code: '', uid: u.id, room: r.code, cfg: { max: r.max, world: r.world, startAt: r.startAt } }, {
      wait: function (n, max, left) {
        var t = $('roomTxt'); if (!t) return;
        t.textContent = 'Players: ' + n + ' / ' + max + (left > 0 ? '  -  starts in ' + (left >= 120 ? Math.floor(left / 60) + ' min' : left + 's') : '  -  waiting for 1 more player');
      },
      start: function (msg) { if (cancelled) return; done = true; VR.ui.closeModal(); var cfg = VR.lobby.soloCfg(); cfg.net = msg; VR.app.startGame(cfg); },
      solo: function () { end('Room closed'); },
      cancel: function () { end('Not enough players - room cancelled' + (fee ? ', diamonds returned' : '')); },
      late: function () { end('This room has already started' + (fee ? ', diamonds returned' : '')); },
      fail: function () { end('Server not reachable' + (fee ? ', diamonds returned' : '')); }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var box = $('pbox');
    box.addEventListener('click', function (e) {
      if (!box.querySelector('#roomX')) return;
      var t = e.target.closest('button'); if (!t) return;
      if (t.id === 'roomX') return close();
      if (t.dataset.go) byCode($('roomCode').value);
      else if (t.dataset.join) byCode(t.dataset.join);
    });
  });

  window.VR = window.VR || {};
  VR.rooms = { open: open };
})();
