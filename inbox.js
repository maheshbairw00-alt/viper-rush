/* js/inbox.js
 * EVENTS and MAIL screens. Everything comes from Firestore, written from the admin panel:
 *   viperrush_events/{id} : title, desc, start, end (ms), reward, lines[] (updates list), ts, hidden
 *   viperrush_mail/{id}   : to ('all' or a player id), title, body, gems, coins, xp, item{kind,id}, from, ts, exp
 * A player's own "already read / claimed" list is user.mailDone (saved with the profile).
 * API: VR.inbox.openEvents()  VR.inbox.openMail()  VR.inbox.refresh()
 */
(function () {
  var events = [], mails = [], tab = 'live';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function U() { return (VR.auth && VR.auth.user) || (VR.lobby && VR.lobby.openUser && VR.lobby.openUser()); }
  function fbOn() { return !!(window.VR_CONFIG && VR_CONFIG.firebase && window.firebase && window.firebase.firestore); }
  function db() { var f = window.firebase; if (!f.apps.length) f.initializeApp(VR_CONFIG.firebase); return f.firestore(); }
  function real(u) { return !!(u && u.provider !== 'guest' && fbOn()); }
  function warn(e) { if (window.console) console.warn('inbox:', e && e.message ? e.message : e); }
  function done(u) { return (u.mailDone = u.mailDone || []); }

  /* ---------- loading ---------- */
  function loadEvents() {
    if (!fbOn()) return Promise.resolve([]);
    return db().collection('viperrush_events').orderBy('start', 'desc').limit(30).get().then(function (s) {
      return s.docs.map(function (d) { var e = d.data(); e.id = d.id; return e; }).filter(function (e) { return !e.hidden; });
    }).catch(function (e) { warn(e); return []; });
  }
  function loadMail(u) {
    if (!real(u)) return Promise.resolve([]);
    var ready = new Promise(function (res) { var off = window.firebase.auth().onAuthStateChanged(function (x) { off(); res(x); }); });
    return ready.then(function (cu) {
      if (!cu || cu.uid !== u.id) return [];
      return Promise.all([db().collection('viperrush_mail').where('to', '==', 'all').limit(50).get(), db().collection('viperrush_mail').where('to', '==', u.id).limit(50).get()]).then(function (r) {
        var out = [], seen = {};
        r.forEach(function (s) { s.docs.forEach(function (d) { if (seen[d.id]) return; seen[d.id] = 1; var m = d.data(); m.id = d.id; out.push(m); }); });
        var now = Date.now();
        out = out.filter(function (m) { return !m.exp || m.exp > now; });
        out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
        return out;
      });
    }).catch(function (e) { warn(e); return []; });
  }
  function status(e) { var n = Date.now(); return n < e.start ? 'soon' : (n < e.end ? 'live' : 'ended'); }
  function left(ms) {
    var m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
    return d > 0 ? d + 'd ' + h + 'h' : (h > 0 ? h + 'h ' + (m % 60) + 'm' : (m % 60) + 'm');
  }
  function fdate(t) { var d = new Date(t); return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]; }
  function hasReward(m) { return !!((m.gems || 0) || (m.coins || 0) || (m.xp || 0) || (m.item && m.item.id)); }
  function unread(u) { var d = done(u); return mails.filter(function (m) { return d.indexOf(m.id) < 0; }).length; }
  function newEvents(u) { return events.filter(function (e) { return status(e) !== 'ended' && (e.ts || e.start) > (u.evSeen || 0); }).length; }

  function dots() {
    var u = U(), mb = $('mailBtn'), eb = $('eventsBtn'); if (!u) return;
    if (mb) mb.classList.toggle('has', unread(u) > 0);
    if (eb) eb.classList.toggle('has', newEvents(u) > 0);
  }
  function refresh() {
    var u = U(); if (!u) return Promise.resolve();
    return Promise.all([loadEvents(), loadMail(u)]).then(function (r) { events = r[0]; mails = r[1]; dots(); });
  }

  /* ---------- sheet ---------- */
  function show(html) { $('pbox').innerHTML = html; $('sheet').classList.add('on'); }
  function close() { $('sheet').classList.remove('on'); }
  function head(t) { return '<div class="ph"><span>' + t + '</span><button class="px" type="button" id="inbX">X</button></div>'; }

  /* ----- EVENTS ----- */
  function eventCard(e) {
    var st = status(e), now = Date.now();
    var chip = st === 'live' ? '<em class="evs on">LIVE &middot; ends in ' + left(e.end - now) + '</em>'
      : st === 'soon' ? '<em class="evs soon">COMING &middot; starts in ' + left(e.start - now) + '</em>' : '<em class="evs end">ENDED</em>';
    var lines = (e.lines || []).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('');
    return '<div class="evc ' + st + '"><div class="evh"><b>' + esc(e.title) + '</b>' + chip + '</div>' +
      (e.desc ? '<p>' + esc(e.desc) + '</p>' : '') +
      '<small>' + fdate(e.start) + ' &ndash; ' + fdate(e.end) + '</small>' +
      (lines ? '<ul>' + lines + '</ul>' : '') +
      (e.reward ? '<div class="evr">REWARD: ' + esc(e.reward) + '</div>' : '') + '</div>';
  }
  function renderEvents() {
    var live = events.filter(function (e) { return status(e) === 'live'; }), soon = events.filter(function (e) { return status(e) === 'soon'; }).sort(function (a, b) { return a.start - b.start; }),
      end = events.filter(function (e) { return status(e) === 'ended'; });
    var list = tab === 'live' ? live : tab === 'soon' ? soon : end;
    var h = head('EVENTS') + '<div class="pbody"><div class="tabs">' +
      [['live', 'LIVE', live.length], ['soon', 'COMING SOON', soon.length], ['end', 'ENDED', end.length]].map(function (t) { return '<button type="button" class="tab' + (tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + (t[2] ? ' (' + t[2] + ')' : '') + '</button>'; }).join('') + '</div>' +
      (list.length ? list.map(eventCard).join('') : '<p class="note">' + (tab === 'live' ? 'No event is running right now.' : tab === 'soon' ? 'New events and updates will be shown here before they arrive.' : 'No old events.') + '</p>') + '</div>';
    show(h);
  }
  function openEvents() {
    var u = U(); tab = 'live'; show(head('EVENTS') + '<div class="pbody"><p class="note">Loading...</p></div>');
    refresh().then(function () {
      if (!events.some(function (e) { return status(e) === 'live'; }) && events.some(function (e) { return status(e) === 'soon'; })) tab = 'soon';
      renderEvents();
      if (u) { u.evSeen = Date.now(); VR.auth.save(); dots(); }
    });
  }

  /* ----- MAIL ----- */
  function rewardText(m) {
    var a = [];
    if (m.gems) a.push((m.gems > 0 ? '+' : '') + m.gems + ' DIAMONDS');
    if (m.coins) a.push((m.coins > 0 ? '+' : '') + m.coins + ' COINS');
    if (m.xp) a.push((m.xp > 0 ? '+' : '') + m.xp + ' XP');
    if (m.item && m.item.id) { var it = VR.store && VR.store.find(m.item.kind, m.item.id); a.push((it ? it.n : m.item.id).toUpperCase()); }
    return a.join('  ');
  }
  function mailCard(m, d) {
    var got = d.indexOf(m.id) >= 0, rw = hasReward(m);
    return '<div class="evc mail' + (got ? ' read' : '') + '"><div class="evh"><b>' + esc(m.title) + '</b><small>' + fdate(m.ts || Date.now()) + '</small></div>' +
      (m.from ? '<small>From ' + esc(m.from) + '</small>' : '') +
      (m.body ? '<p>' + esc(m.body) + '</p>' : '') +
      (rw ? '<div class="evr">' + rewardText(m) + '</div>' + (got ? '<button type="button" class="gb gr" disabled>CLAIMED &#10003;</button>' : '<button type="button" class="gb" data-claim="' + esc(m.id) + '">CLAIM</button>') : '') + '</div>';
  }
  function renderMail() {
    var u = U(), d = done(u);
    var h = head('MAIL') + '<div class="pbody">' + (mails.length ? mails.map(function (m) { return mailCard(m, d); }).join('') : '<p class="note">' + (real(u) ? 'No mail yet.' : 'Log in with Google to receive mail and gifts.') + '</p>') + '</div>';
    show(h);
  }
  function openMail() {
    var u = U(); show(head('MAIL') + '<div class="pbody"><p class="note">Loading...</p></div>');
    refresh().then(function () {
      renderMail();
      var d = done(u), ch = false;                           // mail with no reward counts as read once opened
      mails.forEach(function (m) { if (!hasReward(m) && d.indexOf(m.id) < 0) { d.push(m.id); ch = true; } });
      if (ch) { trim(u); VR.auth.save(); dots(); }
    });
  }
  function trim(u) { if (u.mailDone.length > 400) u.mailDone = u.mailDone.slice(-300); }
  function claim(id) {
    var u = U(), d = done(u), m = mails.filter(function (x) { return x.id === id; })[0];
    if (!m || d.indexOf(id) >= 0) return;
    if (m.item && m.item.id && VR.store && VR.store.give) VR.store.give(m.item.kind, m.item.id);
    u.gems = Math.max(0, (u.gems || 0) + (m.gems || 0)); u.coins = Math.max(0, (u.coins || 0) + (m.coins || 0)); u.xp = Math.max(0, (u.xp || 0) + (m.xp || 0));
    d.push(id); trim(u); VR.auth.save();
    if (VR.lobby && VR.lobby.refresh) VR.lobby.refresh();
    VR.ui.toast('Claimed: ' + rewardText(m)); renderMail(); dots();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var box = $('pbox');
    box.addEventListener('click', function (e) {
      if (!box.querySelector('#inbX')) return;
      var t = e.target.closest('button'); if (!t) return;
      if (t.id === 'inbX') return close();
      if (t.dataset.tab) { tab = t.dataset.tab; renderEvents(); }
      else if (t.dataset.claim) claim(t.dataset.claim);
    });
  });

  window.VR = window.VR || {};
  VR.inbox = { openEvents: openEvents, openMail: openMail, refresh: refresh };
})();
