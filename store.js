/* js/store.js
 * STORE: emotes, collections (bundles), avatar frames, badges, banners + daily offers.
 * Everything is bought with DIAMONDS (minimum price 499). Skins/characters/animations stay in the SKINS screen.
 * To add an item, add a line to the lists below.
 * API: VR.store.open()  VR.store.initUser(user)  VR.store.decorate(user)  VR.store.EMOTES  VR.store.find(kind,id)
 */
(function () {
  // r = rarity: 1 rare, 2 epic, 3 legendary  (free starters have r:0)
  var EMOTES = [
    { id: 'em0', n: 'GG', e: '👍', p: 0, r: 0 },
    { id: 'em1', n: 'LOL', e: '😂', p: 0, r: 0 },
    { id: 'em2', n: 'Cool', e: '😎', p: 499, r: 1 },
    { id: 'em3', n: 'On fire', e: '🔥', p: 499, r: 1 },
    { id: 'em4', n: 'Clap', e: '👏', p: 499, r: 1 },
    { id: 'em5', n: 'Scared', e: '😱', p: 499, r: 1 },
    { id: 'em6', n: 'Friends', e: '🤝', p: 499, r: 1 },
    { id: 'em7', n: 'Sleepy', e: '😴', p: 499, r: 1 },
    { id: 'em8', n: 'Rage', e: '😡', p: 599, r: 1 },
    { id: 'em9', n: 'Dead', e: '💀', p: 599, r: 2 },
    { id: 'em10', n: 'Love', e: '💖', p: 599, r: 1 },
    { id: 'em11', n: 'Hiss', e: '🐍', p: 699, r: 2 },
    { id: 'em12', n: 'King', e: '👑', p: 899, r: 2 },
    { id: 'em13', n: 'Champion', e: '🏆', p: 1299, r: 3 }
  ];
  var FRAMES = [
    { id: 'f0', n: 'No frame', c: '#FFFFFF', p: 0, r: 0 },
    { id: 'f1', n: 'Neon green', c: '#B6FF3B', p: 499, r: 1 },
    { id: 'f4', n: 'Ice blue', c: '#7DE8FF', p: 599, r: 1 },
    { id: 'f2', n: 'Royal gold', c: '#FFD23F', p: 799, r: 2 },
    { id: 'f3', n: 'Fire ring', c: '#FF5A28', p: 999, r: 2 },
    { id: 'f5', n: 'Royal purple', c: '#C084FC', p: 1199, r: 3 },
    { id: 'f6', n: 'Blood red', c: '#FF2A3D', p: 1299, r: 3 }
  ];
  var BADGES = [
    { id: 'b1', n: 'Snake charmer', e: '🐍', p: 499, r: 1 },
    { id: 'b2', n: 'Speedster', e: '⚡', p: 599, r: 1 },
    { id: 'b4', n: 'Hot streak', e: '🔥', p: 699, r: 2 },
    { id: 'b3', n: 'Rich', e: '💎', p: 899, r: 2 },
    { id: 'b6', n: 'Slayer', e: '☠️', p: 999, r: 2 },
    { id: 'b5', n: 'Royal', e: '👑', p: 1299, r: 3 }
  ];
  var BANNERS = [
    { id: 'n1', n: 'Sunset', g: 'linear-gradient(90deg,#FF7A00,#EC4899)', p: 499, r: 1 },
    { id: 'n2', n: 'Ocean', g: 'linear-gradient(90deg,#0EA5E9,#6366F1)', p: 599, r: 1 },
    { id: 'n3', n: 'Toxic', g: 'linear-gradient(90deg,#84CC16,#7C3AED)', p: 699, r: 2 },
    { id: 'n4', n: 'Galaxy', g: 'linear-gradient(90deg,#1E1B4B,#C026D3)', p: 899, r: 2 },
    { id: 'n5', n: 'Gold rush', g: 'linear-gradient(90deg,#B45309,#FFD23F)', p: 1299, r: 3 }
  ];
  var COLLECTIONS = [
    { id: 'col1', n: 'Fire Lord', items: [['skin', 's3'], ['char', 'c3'], ['anim', 'a_fire'], ['emote', 'em3'], ['frame', 'f3']] },
    { id: 'col2', n: 'Frost Queen', items: [['skin', 's4'], ['char', 'c2'], ['anim', 'a_trail'], ['emote', 'em7'], ['frame', 'f4']] },
    { id: 'col3', n: 'Shadow Venom', items: [['skin', 'L2'], ['char', 'LC2'], ['anim', 'a_aura'], ['emote', 'em11'], ['badge', 'b6']] },
    { id: 'col4', n: 'Royal Gold', items: [['skin', 's5'], ['char', 'c1'], ['anim', 'a_win'], ['emote', 'em12'], ['frame', 'f2'], ['banner', 'n5']] }
  ];
  var DISCOUNT = 0.75, RARE = ['', 'RARE', 'EPIC', 'LEGENDARY'], RCOL = ['#9CA3AF', '#38BDF8', '#C084FC', '#FFB11F'];

  var LISTS = { emote: EMOTES, frame: FRAMES, badge: BADGES, banner: BANNERS };
  var INV = { skin: 'skins', char: 'chars', anim: 'anims', emote: 'emotes', frame: 'frames', badge: 'badges', banner: 'banners' };
  var tab = 'offers', invMode = false;

  function U() { return (VR.auth && VR.auth.user) || (VR.lobby && VR.lobby.openUser && VR.lobby.openUser()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function find(kind, id) {
    if (LISTS[kind]) { for (var i = 0; i < LISTS[kind].length; i++) if (LISTS[kind][i].id === id) return LISTS[kind][i]; return null; }
    return VR.cos.find(kind, id);
  }
  function own(kind, id) { var u = U(); return !!(u && u.inv && u.inv[INV[kind]] && u.inv[INV[kind]][id]); }
  function grant(kind, id) { var u = U(); u.inv[INV[kind]] = u.inv[INV[kind]] || {}; u.inv[INV[kind]][id] = true; }

  function initUser(u) {
    var inv = u.inv;
    inv.emotes = inv.emotes || { em0: true, em1: true }; inv.frames = inv.frames || { f0: true };
    inv.badges = inv.badges || {}; inv.banners = inv.banners || {};
    var eq = u.eq;
    if (!eq.emotes) eq.emotes = ['em0', 'em1'];
    if (eq.frame == null) eq.frame = 'f0'; if (eq.badge == null) eq.badge = ''; if (eq.banner == null) eq.banner = '';
  }

  // frame / badge / banner on the lobby profile
  function decorate(u) {
    var dp = document.getElementById('meDp'), nm = document.getElementById('meName'); if (!dp || !u || !u.eq) return;
    var fr = find('frame', u.eq.frame), bd = find('badge', u.eq.badge), bn = find('banner', u.eq.banner);
    dp.style.boxShadow = fr && fr.id !== 'f0' ? '0 0 0 3px ' + fr.c + ',0 0 16px ' + fr.c : '';
    nm.textContent = (bd ? bd.e + ' ' : '') + u.name;
    var me = dp.parentNode; me.style.background = bn ? bn.g : ''; me.style.borderRadius = bn ? '99px' : ''; me.style.padding = bn ? '0 14px 0 4px' : '';
  }

  /* ---------- prices / offers ---------- */
  function dayNo() { return Math.floor(Date.now() / 86400000); }
  function offers() {                                   // 3 daily items with 20% off, changes every day
    var pool = [];
    ['emote', 'frame', 'badge', 'banner'].forEach(function (k) { LISTS[k].forEach(function (it) { if (it.p >= 599 && !own(k, it.id)) pool.push([k, it]); }); });
    var out = [], d = dayNo();
    for (var i = 0; i < 3 && pool.length; i++) { var j = (d * 7 + i * 5) % pool.length; out.push(pool.splice(j, 1)[0]); }
    return out.map(function (x) { return { kind: x[0], it: x[1], price: Math.max(499, Math.round(x[1].p * 0.8)) }; });
  }
  function colPrice(c) {
    var sum = 0, left = 0;
    c.items.forEach(function (x) { if (!own(x[0], x[1])) { var it = find(x[0], x[1]); sum += it ? it.p : 0; left++; } });
    return { sum: sum, left: left, price: Math.round(sum * DISCOUNT) };
  }

  /* ---------- pictures ---------- */
  function pic(kind, it) {
    if (kind === 'emote') return '<div class="spic" style="font-size:calc(var(--u)*9)">' + it.e + '</div>';
    if (kind === 'badge') return '<div class="spic" style="font-size:calc(var(--u)*9)">' + it.e + '</div>';
    if (kind === 'frame') return '<div class="spic"><i class="sfr" style="box-shadow:0 0 0 3px ' + it.c + ',0 0 12px ' + (it.id === 'f0' ? 'transparent' : it.c) + '">P</i></div>';
    if (kind === 'banner') return '<div class="spic"><i class="sbn" style="background:' + it.g + '"></i></div>';
    if (kind === 'skin') return VR.cos.svgBody(it);
    if (kind === 'char') return VR.cos.svgFace(it);
    return VR.cos.svgAnim(it);
  }
  function rtag(it) { return it.r ? '<em class="rt" style="color:' + RCOL[it.r] + '">' + RARE[it.r] + '</em>' : ''; }

  function card(kind, it, priceOverride) {
    var has = own(kind, it.id), u = U(), eqd = false, btn;
    if (kind === 'emote') eqd = u.eq.emotes.indexOf(it.id) >= 0; else eqd = u.eq[kind] === it.id;
    var price = priceOverride != null ? priceOverride : it.p;
    if (has) btn = '<button type="button" class="gb' + (eqd ? ' gr' : '') + '" data-a="eq" data-k="' + kind + '" data-id="' + it.id + '">' + (eqd ? (kind === 'emote' ? 'UNEQUIP' : 'EQUIPPED') : 'EQUIP') + '</button>';
    else btn = '<button type="button" class="gb" data-a="buy" data-k="' + kind + '" data-id="' + it.id + '" data-p="' + price + '">' + price + ' 💎</button>';
    var gbtn = it.p > 0 && !invMode ? '<button type="button" class="gb pk gft" data-a="gift" data-k="' + kind + '" data-id="' + it.id + '">GIFT 🎁</button>' : '';
    return '<div class="cc sc r' + (it.r || 0) + (eqd ? ' eq' : '') + '">' + pic(kind, it) + '<b>' + esc(it.n) + '</b>' + rtag(it) +
      (priceOverride != null && !has ? '<small><s>' + it.p + '</s> deal</small>' : '') + btn + gbtn + '</div>';
  }

  function colCard(c) {
    var cp = colPrice(c), done = cp.left === 0, mini = c.items.map(function (x) { var it = find(x[0], x[1]); return '<span class="mi' + (own(x[0], x[1]) ? ' ok' : '') + '">' + esc(it ? it.n : x[1]) + '</span>'; }).join('');
    return '<div class="colc"><div class="colh"><b>' + esc(c.n) + '</b><em>25% OFF</em></div><div class="colm">' + mini + '</div>' +
      (done ? '<button type="button" class="gb gr" disabled>COLLECTION OWNED</button>'
        : '<button type="button" class="gb" data-a="bcol" data-id="' + c.id + '">BUY ALL ' + cp.price + ' 💎 <s>' + cp.sum + '</s></button>') + '</div>';
  }

  var TABS = [['offers', 'OFFERS'], ['emote', 'EMOTES'], ['col', 'COLLECTIONS'], ['frame', 'FRAMES'], ['badge', 'BADGES'], ['banner', 'BANNERS']];
  function render(keep) {
    var u = U(), box = document.getElementById('pbox'), old = keep && box.querySelector('.pbody') ? box.querySelector('.pbody').scrollTop : 0, h = '';
    if (invMode) return renderInv(u, box, old, keep);
    if (tab === 'offers') {
      h += '<p class="note">Today’s deals – 20% off. New deals every day!</p><div class="cgrid">' + offers().map(function (o) { return card(o.kind, o.it, o.price); }).join('') + '</div>' +
        '<p class="note">Best value: collections have skin + character + animation + emote together at 25% off.</p>' +
        '<button type="button" class="gb" data-a="skins" style="width:100%">SKINS, CHARACTERS &amp; ANIMATIONS</button>';
    } else if (tab === 'col') h += COLLECTIONS.map(colCard).join('');
    else {
      if (tab === 'emote') h += '<p class="note">Choose up to 4 emotes to use in a match (EMOTE button). Equipped: ' + u.eq.emotes.length + ' / 4</p>';
      h += '<div class="cgrid">' + LISTS[tab].map(function (it) { return card(tab, it); }).join('') + '</div>';
    }
    box.innerHTML = '<div class="ph"><span>STORE</span><button class="px" type="button" id="stoX">X</button></div><div class="pbody"><div class="dbal">' + VR.fmtGems(u.gems) + ' 💎</div>' +
      '<div class="tabs" style="overflow-x:auto">' + TABS.map(function (t) { return '<button type="button" class="tab' + (t[0] === tab ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' + h + '</div>';
    if (keep) box.querySelector('.pbody').scrollTop = old;
  }
  /* ---------- INVENTORY: only the items the player owns ---------- */
  var INV_TABS = [['skin', 'SKINS'], ['char', 'CHARACTERS'], ['anim', 'ANIMATIONS'], ['emote', 'EMOTES'], ['frame', 'FRAMES'], ['badge', 'BADGES'], ['banner', 'BANNERS']];
  function listOf(kind) { return LISTS[kind] || (kind === 'skin' ? VR.cos.SKINS : kind === 'char' ? VR.cos.CHARS : VR.cos.ANIMS); }
  function renderInv(u, box, old, keep) {
    var items = listOf(tab).filter(function (it) { return own(tab, it.id) && !(tab === 'frame' && it.id === 'f0'); });
    var h = '';
    if (tab === 'anim') h += '<div class="cc sc' + (!u.eq.anim ? ' eq' : '') + '"><div class="spic" style="font-size:calc(var(--u)*6)">&mdash;</div><b>No animation</b><button type="button" class="gb' + (!u.eq.anim ? ' gr' : '') + '" data-a="eq" data-k="anim" data-id="">' + (!u.eq.anim ? 'EQUIPPED' : 'EQUIP') + '</button></div>';
    h += items.map(function (it) { return card(tab, it); }).join('');
    box.innerHTML = '<div class="ph"><span>INVENTORY</span><button class="px" type="button" id="stoX">X</button></div><div class="pbody">' +
      '<div class="tabs" style="overflow-x:auto">' + INV_TABS.map(function (t) { return '<button type="button" class="tab' + (t[0] === tab ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      (tab === 'emote' ? '<p class="note">Choose up to 4 emotes to use in a match. Equipped: ' + u.eq.emotes.length + ' / 4</p>' : '') +
      (items.length || tab === 'anim' ? '<div class="cgrid">' + h + '</div>' : '<p class="note">You do not own anything here yet. Buy or win items in the STORE.</p>') + '</div>';
    if (keep) box.querySelector('.pbody').scrollTop = old;
  }
  VR.fmtGems = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };

  function refreshLobby() { if (VR.lobby) VR.lobby.decorate(); }
  function buy(kind, id, price) {
    var u = U(), it = find(kind, id);
    if (u.gems < price) { VR.ui.toast('Not enough diamonds'); return; }
    u.gems -= price; grant(kind, id);
    if (kind === 'emote') { if (u.eq.emotes.length < 4) u.eq.emotes.push(id); } else u.eq[kind] = id;
    VR.auth.save(); refreshLobby(); render(true); VR.ui.toast(it.n + ' unlocked!');
  }
  function buyCol(id) {
    var c = COLLECTIONS.filter(function (x) { return x.id === id; })[0], cp = colPrice(c), u = U();
    if (u.gems < cp.price) { VR.ui.toast('Not enough diamonds'); return; }
    u.gems -= cp.price;
    c.items.forEach(function (x) { grant(x[0], x[1]); });
    VR.auth.save(); refreshLobby(); render(true); VR.ui.toast(c.n + ' collection unlocked!');
  }
  function equip(kind, id) {
    var u = U();
    if (kind === 'emote') {
      var i = u.eq.emotes.indexOf(id);
      if (i >= 0) { if (u.eq.emotes.length > 1) u.eq.emotes.splice(i, 1); else { VR.ui.toast('Keep at least 1 emote'); return; } }
      else { if (u.eq.emotes.length >= 4) { VR.ui.toast('Only 4 emotes can be equipped'); return; } u.eq.emotes.push(id); }
    } else if (kind === 'skin' || kind === 'char' || kind === 'anim') u.eq[kind] = id;
    else if (u.eq[kind] === id && kind !== 'frame') u.eq[kind] = ''; else u.eq[kind] = id;
    VR.auth.save(); refreshLobby(); render(true);
  }

  function open() { invMode = false; tab = 'offers'; render(); document.getElementById('sheet').classList.add('on'); }
  function openInventory() { invMode = true; tab = 'skin'; render(); document.getElementById('sheet').classList.add('on'); }
  function close() { document.getElementById('sheet').classList.remove('on'); }

  document.addEventListener('DOMContentLoaded', function () {
    var box = document.getElementById('pbox');
    box.addEventListener('click', function (e) {
      if (!box.querySelector('#stoX')) return;
      var t = e.target.closest('button'); if (!t) return;
      if (t.id === 'stoX') return close();
      if (t.dataset.tab) { tab = t.dataset.tab; return render(); }
      var a = t.dataset.a;
      if (a === 'buy') buy(t.dataset.k, t.dataset.id, +t.dataset.p);
      else if (a === 'bcol') buyCol(t.dataset.id);
      else if (a === 'eq') equip(t.dataset.k, t.dataset.id);
      else if (a === 'skins') { close(); VR.lobby.openSkins(); }
      else if (a === 'gift') VR.gift.open(t.dataset.k, t.dataset.id);
    });
  });

  window.VR = window.VR || {};
  VR.store = { open: open, openInventory: openInventory, initUser: initUser, decorate: decorate, EMOTES: EMOTES, find: find, own: own, invKey: function (k) { return INV[k]; }, give: function (kind, id) { if (!find(kind, id)) return false; grant(kind, id); return true; } };
})();
