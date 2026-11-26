/* js/gift.js
 * Gift a store item (skin, character, animation, emote, frame, badge, banner) to another player. Diamonds can NOT be gifted.
 * The sender pays the normal price. The friend finds the gift in MAIL and presses CLAIM.
 * The friend is found by the 10-digit Player ID shown on their profile (viperrush_ids/<id> -> uid).
 * API: VR.gift.open(kind, id)
 */
(function () {
  var DAILY_MAX = 5;
  function U() { return (VR.auth && VR.auth.user) || (VR.lobby && VR.lobby.openUser && VR.lobby.openUser()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function today() { return Math.floor(Date.now() / 86400000); }

  function open(kind, id) {
    var u = U(), it = VR.store && VR.store.find(kind, id);
    if (!u || !it) return;
    if (u.provider === 'guest') return VR.ui.toast('Log in with Google to send gifts');
    if (!(it.p > 0) || it.pass) return VR.ui.toast('This item cannot be gifted');
    var g = u.giftsDay && u.giftsDay.d === today() ? u.giftsDay : { d: today(), n: 0 };
    if (g.n >= DAILY_MAX) return VR.ui.toast('You can send ' + DAILY_MAX + ' gifts per day');
    VR.ui.modal({
      title: 'GIFT ' + it.n.toUpperCase(),
      html: '<p>Price: <b>' + it.p + ' diamonds</b> (you pay). Your friend gets it in MAIL.</p>' +
        '<input id="giftId" class="mi" type="text" maxlength="12" inputmode="numeric" placeholder="Friend\'s Player ID (1234 5678 90)" autocomplete="off">',
      actions: [
        { label: 'CANCEL' },
        { label: 'NEXT', primary: true, keepOpen: true, onClick: function () { next(kind, id, it); } }
      ]
    });
  }

  function next(kind, id, it) {
    var u = U(), pid = (document.getElementById('giftId').value || '').replace(/\s+/g, '');
    if (!/^\d{10}$/.test(pid)) return VR.ui.toast('Enter the 10-digit Player ID');
    if (pid === VR.pidOf(u.id)) return VR.ui.toast('That is your own ID');
    if ((u.gems || 0) < it.p) return VR.ui.toast('Need ' + (it.p - (u.gems || 0)) + ' more diamonds');
    VR.ui.toast('Searching...');
    VR.auth.lookupPid(pid).then(function (p) {
      if (!p) return VR.ui.toast('Player not found. They must open the game once with Google login.');
      var key = VR.store.invKey(kind) + ':' + id;
      if ((p.own || []).indexOf(key) >= 0) return VR.ui.toast(p.name + ' already has this item');
      VR.ui.modal({
        title: 'SEND GIFT?', body: 'Send ' + it.n + ' to ' + p.name + ' for ' + it.p + ' diamonds?',
        actions: [{ label: 'CANCEL' }, { label: 'SEND', primary: true, onClick: function () { send(kind, id, it, p); } }]
      });
    }).catch(function () { VR.ui.toast('Could not reach the server. Try again.'); });
  }

  function send(kind, id, it, p) {
    var u = U();
    if ((u.gems || 0) < it.p) return VR.ui.toast('Not enough diamonds');
    u.gems -= it.p;
    var g = u.giftsDay && u.giftsDay.d === today() ? u.giftsDay : { d: today(), n: 0 }; g.n++; u.giftsDay = g;
    VR.auth.save(); if (VR.lobby && VR.lobby.refresh) VR.lobby.refresh();
    VR.auth.sendMail({ to: p.uid, title: 'A gift for you!', body: (u.name || 'A friend') + ' sent you ' + it.n + '.', item: { kind: kind, id: id } }).then(function () {
      VR.ui.toast('Gift sent to ' + p.name + '!');
    }).catch(function () {                                                     // failed: give the diamonds back
      u.gems += it.p; g.n = Math.max(0, g.n - 1); VR.auth.save(); if (VR.lobby && VR.lobby.refresh) VR.lobby.refresh();
      VR.ui.toast('Gift failed - diamonds returned');
    });
  }

  window.VR = window.VR || {};
  VR.gift = { open: open };
})();
