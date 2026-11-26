/* js/lobby.js
 * Lobby screen: profile bar, squad of 5 (you + 4 friends), team code, friends list,
 * guild (50 members), profile cards with likes + danger rating, mic / sound, mode, START.
 *
 * OFFLINE NOW: friends, requests, guild members and teammates are demo data saved in this
 * phone's localStorage, so you can try the full flow. Teammates are bots.
 * MULTIPLAYER LATER: look for the "NETWORK HOOK" comments and replace them with calls to your
 * server (create party, join with code, friend request, accept, invite, like, guild).
 *
 * Also: daily + weekly missions, ranks (solo and squad are separate) with seasons.
 * API:  VR.lobby.init()   VR.lobby.enter(user)   VR.lobby.refresh()   VR.lobby.recordGame(result)
 */
(function () {
  var NAMES = ['Rudra', 'Kabir', 'Zoya', 'Arjun', 'Naga', 'Vyom', 'Mira', 'Tej', 'Ishaan', 'Rhea', 'Dev', 'Anaya', 'Kavya', 'Veer', 'Sia', 'Aarav'];
  // skin colours: [light, dark]
  var COLS = [['#C6FF4D', '#10B981'], ['#7DE8FF', '#2563EB'], ['#FF9AD5', '#BE185D'], ['#FFC36B', '#EA580C'], ['#D8B4FE', '#7C3AED'], ['#CBD5E1', '#64748B']];
  var SIZE = VR_CONFIG.squadSize || 5;
  var GUILD_MAX = 50;
  var user = null, squad = [], mode = 'squad', code = '', raf = 0, soundOn = true, social = null;
  var sheet = '', ftab = 'friends', sv = 0;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hash(s) { var h = 7; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function newCode() {
    var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }
  function randName() {
    var used = squad.filter(Boolean).map(function (m) { return m.name; });
    var pool = NAMES.filter(function (n) { return used.indexOf(n) < 0; });
    return pool[Math.floor(Math.random() * pool.length)] || 'Player';
  }
  function copyText(t, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { VR.ui.toast(msg); }, function () { VR.ui.toast(t); });
    else VR.ui.toast(t);
  }
  function squadCount() { return squad.filter(Boolean).length; }
  function inSquad(name) { return squad.some(function (m) { return m && m.name === name; }); }

  /* ---------- saved social data (friends, requests, guild) ---------- */
  function makeGuild(me) {
    var pool = ['Raja_X', 'Naga', 'Sia', 'Mira', 'Rexx', 'Kaal', 'Vyom', 'Tej', 'Ishaan', 'Rhea', 'Dev', 'Anaya', 'Kavya', 'Veer', 'Aarav', 'Rudra', 'Kabir', 'Zoya', 'Arjun', 'Neel', 'Yash', 'Pari', 'Om', 'Riya', 'Aditya', 'Sana', 'Jay', 'Isha', 'Lakshya', 'Mohit', 'Tara', 'Vihaan', 'Nisha', 'Parth', 'Ria', 'Sahil'];
    var m = pool.map(function (n, i) { return { name: n, role: i === 0 ? 'LEADER' : (i < 4 ? 'ELDER' : 'MEMBER'), level: 6 + hash(n) % 40, online: hash(n) % 3 !== 0 }; });
    m.splice(5, 0, { name: me, role: 'MEMBER', you: true, online: true }); // 36 + you = 37
    return { name: 'VIPER KINGS', id: 'VK-2048', level: 5, members: m };
  }
  function loadSocial() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem('vr_social_' + user.id)); } catch (e) { d = null; }
    if (!d || !d.friends) {
      d = {
        friends: [
          { name: 'Sia', level: 21, status: 'online', color: 2 },
          { name: 'Mira', level: 9, status: 'online', color: 4 },
          { name: 'Rexx', level: 15, status: 'match', color: 3 },
          { name: 'Kaal', level: 33, status: 'offline', color: 5 }
        ],
        requests: [{ name: 'Rudra', level: 14, color: 1 }, { name: 'Zoya', level: 6, color: 2 }],
        sent: {}, liked: {}, guild: makeGuild(user.name)
      };
    }
    social = d;
  }
  function saveSocial() { try { localStorage.setItem('vr_social_' + user.id, JSON.stringify(social)); } catch (e) {} if (VR.auth && VR.auth.user === user && VR.auth.saveSocial) VR.auth.saveSocial(social); }
  function isFriend(name) { return social.friends.some(function (f) { return f.name === name; }); }

  /* ---------- player stats, danger rating ---------- */
  function initUser() {
    user.stats = user.stats || { wins: 0, kills: 0, best: 0, matches: 0, bestRank: 0 };
    user.likes = user.likes || 0;
    user.xp = user.xp || 0;
    user.skin = user.skin || 0;
    user.level = Math.max(user.level || 1, 1 + Math.floor(user.xp / 500));
    user.coins = user.coins == null ? 500 : user.coins;
    user.gems = user.gems == null ? 20 : user.gems;
    user.inv = user.inv || { skins: { s0: true }, chars: { c0: true }, anims: {} };
    user.inv.skins = user.inv.skins || { s0: true }; user.inv.chars = user.inv.chars || { c0: true }; user.inv.anims = user.inv.anims || {};
    user.eq = user.eq || { skin: 's0', char: 'c0', anim: '' };
    if (VR.store) VR.store.initUser(user);
    user.pass = !!user.pass;
    var gm = (location.search.match(/[?&]gems=(\d+)/) || [])[1]; if (gm) user.gems = +gm;     // testing: index.html?gems=5000
    user.rp = user.rp || { solo: 0, squad: 0 };
    var sn = seasonNo();
    if (user.season !== sn) {            // new season: ranks drop a little
      if (user.season) { user.rp.solo = Math.floor(user.rp.solo * .75); user.rp.squad = Math.floor(user.rp.squad * .75); }
      user.season = sn;
    }
    ensureMissions();
  }

  /* ---------- ranks (solo and squad are separate), seasons ---------- */
  var TIERS = [['BRONZE', '#CD7F32'], ['SILVER', '#C0C8D8'], ['GOLD', '#FFD23F'], ['PLATINUM', '#5EEAD4'], ['DIAMOND', '#60A5FA']];
  var LEGEND_RP = 1500, SEASON_DAYS = 28;
  function dayNo() { return Math.floor(Date.now() / 864e5); }
  function seasonNo() { return Math.floor(dayNo() / SEASON_DAYS) + 1; }
  function seasonLeft() { return SEASON_DAYS - dayNo() % SEASON_DAYS; }
  function rankOf(rp) {
    if (rp >= LEGEND_RP) return { name: 'VIPER LEGEND', sub: '', color: '#FF4DA6', into: rp - LEGEND_RP, need: 0 };
    var idx = Math.floor(rp / 100), t = Math.floor(idx / 3);
    return { name: TIERS[t][0], sub: ['III', 'II', 'I'][idx % 3], color: TIERS[t][1], into: rp % 100, need: 100 };
  }
  function rankLabel(rp) { var r = rankOf(rp); return r.name + (r.sub ? ' ' + r.sub : ''); }
  function rpGain(g) {
    var base = g.win ? 40 : g.rank <= 3 ? 20 : g.rank <= 8 ? 8 : g.rank <= 15 ? 0 : -6;
    return base + Math.min(30, g.kills * 3);
  }
  function rankBadge(color) {
    return '<svg viewBox="0 0 60 66"><path d="M30 2 L56 12 V34 C56 50 44 60 30 64 C16 60 4 50 4 34 V12 Z" fill="' + color + '" stroke="#fff" stroke-width="3"/><path d="M30 10 L48 17 V34 C48 45 40 52 30 56 C20 52 12 45 12 34 V17 Z" fill="rgba(10,0,40,.55)"/><path d="M19 24 L30 44 L41 24" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function rpOther(name, mode) { var lv = (otherData({ name: name }).level) || 5; return Math.min(1700, hash(name + mode) % (lv * 45 + 250)); }

  /* ---------- missions (daily + weekly) ---------- */
  var DAILY = [
    { id: 'matches', t: 'Play 3 matches', goal: 3, coins: 30, gems: 0, f: 'matches' },
    { id: 'orbs', t: 'Eat 500 orbs', goal: 500, coins: 40, gems: 0, f: 'orbs' },
    { id: 'kills', t: 'Eliminate 5 snakes', goal: 5, coins: 60, gems: 0, f: 'kills' },
    { id: 'win', t: 'Become VIPER KING (win a match)', goal: 1, coins: 100, gems: 0, f: 'wins' }
  ];
  var WEEKLY = [
    { id: 'squad10', t: 'Play 10 squad matches with friends', goal: 10, coins: 300, gems: 0, f: 'squad' },
    { id: 'kills30', t: 'Eliminate 30 snakes', goal: 30, coins: 250, gems: 0, f: 'kills' },
    { id: 'win3', t: 'Win 3 matches', goal: 3, coins: 400, gems: 0, f: 'wins' }
  ];
  function dayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function ensureMissions() {
    var m = user.missions, wk = Math.floor(dayNo() / 7), dk = dayKey();
    if (!m) m = user.missions = { day: dk, week: wk, d: {}, w: {} };
    if (m.day !== dk) { m.day = dk; m.d = {}; }
    if (m.week !== wk) { m.week = wk; m.w = {}; }
    DAILY.forEach(function (x) { if (!m.d[x.id]) m.d[x.id] = { p: 0, c: false }; });
    WEEKLY.forEach(function (x) { if (!m.w[x.id]) m.w[x.id] = { p: 0, c: false }; });
  }
  function addProgress(g) {
    ensureMissions();
    var add = { matches: 1, orbs: g.orbs || 0, kills: g.kills || 0, wins: g.win ? 1 : 0, squad: g.squad ? 1 : 0 };
    DAILY.forEach(function (x) { user.missions.d[x.id].p = Math.min(x.goal, user.missions.d[x.id].p + add[x.f]); });
    WEEKLY.forEach(function (x) { if (x.f !== 'orbs') user.missions.w[x.id].p = Math.min(x.goal, user.missions.w[x.id].p + add[x.f]); });
  }
  function claimable() {
    ensureMissions(); var any = false, m = user.missions;
    DAILY.forEach(function (x) { var q = m.d[x.id]; if (q.p >= x.goal && !q.c) any = true; });
    WEEKLY.forEach(function (x) { var q = m.w[x.id]; if (q.p >= x.goal && !q.c) any = true; });
    return any;
  }
  function saveUser() { if (VR.auth && VR.auth.user === user) VR.auth.save(); }
  function recordGame(g) {
    if (!user) return null;
    var s = user.stats, key = g.squad ? 'squad' : 'solo';
    s.matches++; s.kills += g.kills; s.best = Math.max(s.best, g.score);
    if (g.win) s.wins++;
    s.bestRank = s.bestRank ? Math.min(s.bestRank, g.rank) : g.rank;
    var xp = Math.floor(g.score / 10) + g.kills * 5 + (g.win ? 150 : 0), coins = Math.floor(g.score / 40) + (g.win ? 50 : 0);
    user.xp += xp; user.level = 1 + Math.floor(user.xp / 500); user.coins += coins;
    var old = user.rp[key], floor = old >= LEGEND_RP ? LEGEND_RP : Math.floor(old / 300) * 300;
    var nw = Math.max(floor, old + rpGain(g)); user.rp[key] = nw;
    addProgress(g); saveUser();
    return { coins: coins, xp: xp, rp: nw - old, rank: rankLabel(nw) };
  }

  function otherData(p) {
    var h = hash(p.name), lv = p.level || (3 + h % 30);
    var matches = 10 + lv * 14 + h % 40;
    return {
      stats: {
        matches: matches, wins: Math.round(matches * (.05 + (h % 25) / 100)), kills: Math.round(matches * (1.2 + (h % 30) / 10)),
        best: 800 + lv * 700 + h % 3000, bestRank: 1 + h % 200
      },
      likes: 50 + lv * 40 + h % 900 + (social.liked[p.name] ? 1 : 0), level: lv
    };
  }
  function danger(s) {
    var score = s.kills * 3 + s.wins * 20 + Math.floor(s.best / 100);
    var pct = Math.min(99, Math.round(score / (score + 3000) * 100));
    var tier = pct < 25 ? 'ROOKIE' : pct < 50 ? 'HUNTER' : pct < 75 ? 'PREDATOR' : 'VIPER KING';
    return { pct: pct, tier: tier };
  }
  function userId() {
    var n = String(hash(user.id) * 7919 % 10000000000); while (n.length < 10) n = '0' + n;
    return n.slice(0, 4) + ' ' + n.slice(4, 8) + ' ' + n.slice(8);
  }

  /* ---------- snake picture for the lobby stage ---------- */
  function snakeSVG(ci, me) {
    var c = COLS[ci % COLS.length], id = 'sg' + (++sv), s = '', ch = null;
    if (me && user && user.eq) {
      var sk = VR.cos.find('skin', user.eq.skin); ch = VR.cos.find('char', user.eq.char);
      c = sk.t === 'rainbow' ? ['#FF4DA6', '#4D9DFF'] : ['rgb(' + sk.a + ')', 'rgb(' + sk.b + ')'];
    }
    var gearT = 'translate(22 -172) scale(1.05) translate(-60 -62)';
    s += '<svg class="snk" viewBox="-130 -215 260 245" aria-hidden="true"><defs>' +
      '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient>' +
      '<radialGradient id="' + id + 'p"><stop offset="0" stop-color="#FFE9A8" stop-opacity=".9"/><stop offset=".6" stop-color="#FFB11F" stop-opacity=".5"/><stop offset="1" stop-color="#FFB11F" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id + 'a"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".45" stop-color="' + c[0] + '" stop-opacity=".3"/><stop offset="1" stop-color="' + c[0] + '" stop-opacity="0"/></radialGradient></defs>';
    s += '<circle cx="8" cy="-100" r="110" fill="url(#' + id + 'a)"/>';
    s += '<ellipse cx="0" cy="6" rx="120" ry="22" fill="url(#' + id + 'p)"/><ellipse cx="0" cy="6" rx="94" ry="15" fill="none" stroke="#FFF3B0" stroke-opacity=".8" stroke-width="2"/>';
    [[-12, 70, 16, 26], [-36, 56, 14, 24], [-58, 42, 12, 22]].forEach(function (q) {
      s += '<ellipse cx="0" cy="' + q[0] + '" rx="' + q[1] + '" ry="' + q[2] + '" fill="none" stroke="#0B2B1A" stroke-opacity=".35" stroke-width="' + (q[3] + 4) + '"/>' +
        '<ellipse cx="0" cy="' + q[0] + '" rx="' + q[1] + '" ry="' + q[2] + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + q[3] + '"/>' +
        '<ellipse cx="0" cy="' + (q[0] - 3) + '" rx="' + q[1] + '" ry="' + q[2] + '" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="4" stroke-dasharray="26 18"/>';
    });
    var d = 'M -14 -62 C -16 -104, 34 -112, 22 -152';
    s += '<path d="' + d + '" fill="none" stroke="#0B2B1A" stroke-opacity=".35" stroke-width="36" stroke-linecap="round"/>' +
      '<path d="' + d + '" fill="none" stroke="url(#' + id + ')" stroke-width="32" stroke-linecap="round"/>' +
      '<path d="' + d + '" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="5" stroke-linecap="round" transform="translate(-7 0)"/>' +
      (ch ? '<g transform="' + gearT + '">' + VR.cos.accBack(ch) + '</g>' : '') +
      '<ellipse cx="22" cy="-172" rx="38" ry="32" fill="url(#' + id + ')" stroke="#0B2B1A" stroke-opacity=".6" stroke-width="3"/>' +
      '<ellipse cx="14" cy="-184" rx="16" ry="8" fill="#fff" fill-opacity=".3"/>';
    [-1, 1].forEach(function (sx) {
      s += '<ellipse cx="' + (22 + sx * 14) + '" cy="-176" rx="10" ry="11" fill="#fff"/><circle cx="' + (22 + sx * 14 + 1.5) + '" cy="-175" r="5" fill="#101530"/><circle cx="' + (22 + sx * 14 + 3) + '" cy="-177" r="1.8" fill="#fff"/>';
    });
    if (ch) s += '<g transform="' + gearT + '">' + VR.cos.accFront(ch) + '</g>';
    s += '<path d="M22 -146 v12 l-5 6 m5 -6 l5 6" stroke="#FF3B5C" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';
    return s;
  }

  /* ---------- lobby rendering ---------- */
  function renderProfile() {
    $('meDp').textContent = (user.name || 'P').charAt(0).toUpperCase();
    $('meName').textContent = user.name;
    $('meLv').textContent = 'LV ' + user.level;
    if (VR.store) VR.store.decorate(user);
    $('meXp').style.width = ((user.xp % 500) / 5) + '%';
    $('coins').textContent = fmt(user.coins);
    $('gems').textContent = fmt(user.gems);
    $('codeText').textContent = code;
    $('modeBtn').textContent = 'MODE: ' + mode.toUpperCase();
    $('lobby').classList.toggle('solo', mode === 'solo');
    var n = social ? social.requests.length : 0;
    $('frBadge').textContent = n ? n : '';
    updateMissionDot();
  }

  function order() { // you in the middle, friends on both sides
    var l = [], r = [];
    for (var i = 1; i < SIZE; i++) (i % 2 ? l : r).push(i);
    return l.reverse().concat([0], r);
  }

  function renderSlots() {
    var box = $('slots'), n = squadCount(), html = '';
    box.style.setProperty('--sw', n <= 1 ? 36 : n === 2 ? 32 : n === 3 ? 28 : n === 4 ? 24 : 21);
    order().forEach(function (i) {
      var m = squad[i];
      if (i === 0) {
        html += '<div class="slot you"><button class="who" type="button" data-act="who" data-i="0">' + snakeSVG(user.skin, true) +
          '<span class="ntag"><em>LV ' + user.level + '</em><span>' + esc(user.name) + '</span></span></button>' +
          '<div class="ms"><button class="pillb" id="micBtn" type="button" data-act="mic" aria-pressed="false"><svg><use href="#icoMic"/></svg>MIC</button>' +
          '<button class="pillb" id="sndBtn" type="button" data-act="snd"><svg><use href="#icoSnd"/></svg>SOUND</button></div></div>';
      } else if (m) {
        var add = '';
        if (!isFriend(m.name)) {
          if (social.sent[m.name]) add = '<span class="addf pend" title="Request sent">...</span>';
          else add = '<button class="addf" type="button" data-act="addf" data-i="' + i + '" aria-label="Add friend">+</button><span class="tip">ADD FRIEND</span>';
        } else add = '<span class="addf done">&#10003;</span>';
        html += '<div class="slot member" style="animation-delay:' + (i * .5) + 's"><button class="who" type="button" data-act="who" data-i="' + i + '">' + snakeSVG(m.color == null ? hash(m.name) % 5 : m.color) +
          '</button><div class="tagrow"><span class="ntag"><em>LV ' + (m.level || 1) + '</em><span>' + esc(m.name) + '</span></span>' + add + '</div></div>';
      } else if (mode === 'squad') {
        html += '<button class="slot empty" type="button" data-act="ghost" data-i="' + i + '" aria-label="Invite"><span class="gp">+</span><small>INVITE</small></button>';
      }
    });
    box.innerHTML = html;
    renderMic(); renderSound();
  }

  function micAnim() {
    var btn = $('micBtn');
    if (btn && VR.voice.isOn()) { btn.style.setProperty('--lvl', VR.voice.level().toFixed(2)); raf = requestAnimationFrame(micAnim); }
    else if (btn) btn.style.setProperty('--lvl', 0);
  }
  function renderMic() {
    var on = VR.voice.isOn(), b = $('micBtn');
    if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    var g = $('gMic'); if (g) g.classList.toggle('on', on);
    cancelAnimationFrame(raf); if (on) micAnim();
  }
  function renderSound() {
    var b = $('sndBtn'); if (!b) return;
    b.classList.toggle('off', !soundOn);
    b.querySelector('use').setAttribute('href', soundOn ? '#icoSnd' : '#icoSndOff');
  }

  function toggleMic() {
    VR.voice.toggle().then(function (on) {
      if (!on) VR.ui.toast('Allow microphone access to use voice chat');
      renderMic();
    });
  }
  function toggleSound() {
    soundOn = !soundOn; VR.sound = soundOn; // NETWORK HOOK: mute incoming squad voice here
    renderSound(); VR.ui.toast(soundOn ? 'Sound on - you can hear your squad' : 'Sound off');
  }

  /* ---------- squad actions ---------- */
  function freeSlot() { for (var i = 1; i < SIZE; i++) if (!squad[i]) return i; return -1; }
  function addToSquad(p, msg) {
    var i = freeSlot();
    if (i < 0) { VR.ui.toast('Squad is full (' + SIZE + '/' + SIZE + ')'); return false; }
    mode = 'squad';
    squad[i] = { name: p.name, level: p.level || (3 + hash(p.name) % 30), color: p.color == null ? hash(p.name) % 5 : p.color, bot: true };
    renderProfile(); renderSlots();
    if (msg) VR.ui.toast(msg);
    if (sheet === 'friends') openFriends();
    return true;
  }

  function openInvite() {
    VR.ui.modal({
      title: 'INVITE TO SQUAD',
      html: '<p>Invite a friend, or share your team code</p><div class="codebig">' + esc(code) + '</div>',
      actions: [
        { label: 'FRIENDS', primary: true, onClick: function () { openFriends(); } },
        { label: 'COPY CODE', keepOpen: true, onClick: function () { copyText(code, 'Team code copied'); } },
        // NETWORK HOOK: remove this test button when real players can join with the code.
        { label: 'ADD TEST PLAYER', onClick: function () { var n = randName(); addToSquad({ name: n }, n + ' joined with team code ' + code); } },
        { label: 'CLOSE' }
      ]
    });
  }

  function openEnterCode() {
    VR.ui.modal({
      title: 'ENTER TEAM CODE',
      html: '<p>Type your friend\'s 5 letter team code</p><input id="mIn" class="mi up" type="text" maxlength="5" placeholder="XXXXX" autocomplete="off" autocapitalize="characters">',
      actions: [
        { label: 'JOIN', primary: true, keepOpen: true, onClick: function () {
          var v = ($('mIn').value || '').trim().toUpperCase();
          if (v.length !== 5) return VR.ui.toast('A team code has 5 letters or numbers');
          if (v === code) return VR.ui.toast('That is your own team code');
          VR.ui.closeModal(); joinTeam(v);
        } },
        { label: 'CANCEL' }
      ]
    });
  }
  function joinTeam(v) {
    // NETWORK HOOK: ask your server to put this player into the lobby that owns code v.
    // OFFLINE DEMO: you land in a demo lobby with the code owner.
    var host = randName();
    code = v; mode = 'squad';
    squad = [{ name: user.name, you: true }]; for (var i = 1; i < SIZE; i++) squad.push(null);
    squad[1] = { name: host, level: 3 + hash(host) % 30, color: hash(host) % 5, bot: true };
    renderProfile(); renderSlots();
    VR.ui.toast('You joined ' + host + '\'s team (' + v + ')');
  }

  function sendRequest(p) {
    if (!p || isFriend(p.name) || social.sent[p.name]) return;
    // NETWORK HOOK: send a friend request to p on the server.
    social.sent[p.name] = true; saveSocial(); renderSlots();
    VR.ui.toast('Friend request sent to ' + p.name);
    setTimeout(function () { // OFFLINE DEMO: the other player accepts after a moment
      if (!social.sent[p.name]) return;
      delete social.sent[p.name];
      social.friends.push({ name: p.name, level: p.level || 5, status: 'online', color: p.color == null ? hash(p.name) % 5 : p.color });
      saveSocial(); renderSlots(); renderProfile();
      VR.ui.toast(p.name + ' accepted - now your friend');
      if (sheet === 'friends') openFriends();
    }, 2200);
  }

  function inviteFriend(name) {
    var f = social.friends.filter(function (x) { return x.name === name; })[0];
    if (!f) return VR.ui.toast('Add ' + name + ' as a friend first');
    if (f.status !== 'online' || inSquad(name)) return;
    if (squadCount() >= SIZE) return VR.ui.toast('Squad is full (' + SIZE + '/' + SIZE + ')');
    // NETWORK HOOK: send a squad invite to the friend; join when they accept.
    VR.ui.toast('Invite sent to ' + name);
    setTimeout(function () { if (!inSquad(name)) addToSquad(f, name + ' joined your squad'); }, 1200);
  }

  /* ---------- sheets (friends, guild, profile) ---------- */
  function openSheet(html) { $('pbox').innerHTML = html; $('sheet').classList.add('on'); }
  function closeSheet() { $('sheet').classList.remove('on'); sheet = ''; }
  function head(title) { return '<div class="ph"><b>' + title + '</b><button class="px" type="button" data-a="close" aria-label="Close">X</button></div>'; }
  function av(color, name) { return '<i class="av2" style="--c:' + COLS[(color == null ? hash(name) % 5 : color) % COLS.length][0] + '">' + esc(name.charAt(0).toUpperCase()) + '</i>'; }

  function openFriends() {
    sheet = 'friends';
    var rq = social.requests.length;
    var h = head('FRIENDS') + '<div class="pbody"><div class="tabs">' +
      '<button class="tab' + (ftab === 'friends' ? ' on' : '') + '" type="button" data-a="tab" data-t="friends">FRIENDS ' + social.friends.length + '</button>' +
      '<button class="tab' + (ftab === 'requests' ? ' on' : '') + '" type="button" data-a="tab" data-t="requests">REQUESTS ' + rq + (rq && ftab !== 'requests' ? '<em>' + rq + '</em>' : '') + '</button>' +
      '<button class="tab' + (ftab === 'add' ? ' on' : '') + '" type="button" data-a="tab" data-t="add">ADD BY ID</button></div>';
    if (ftab === 'friends') {
      h += '<div class="flist">';
      if (!social.friends.length) h += '<p class="empty-note">No friends yet. Tap + on a player in your lobby to add them.</p>';
      social.friends.forEach(function (f) {
        var st = f.status === 'online' ? 'Online' : f.status === 'match' ? 'In match' : 'Offline';
        var btn;
        if (inSquad(f.name)) btn = '<button class="gb gr" type="button" disabled>IN SQUAD</button>';
        else if (f.status === 'online') btn = '<button class="gb" type="button" data-a="invite" data-n="' + esc(f.name) + '">INVITE</button>';
        else btn = '<button class="gb dis" type="button" disabled>' + (f.status === 'match' ? 'IN MATCH' : 'OFFLINE') + '</button>';
        h += '<div class="frow" data-a="prof" data-n="' + esc(f.name) + '">' + av(f.color, f.name) +
          '<div class="fi"><b><span>' + esc(f.name) + '</span><em class="lvt">LV ' + f.level + '</em></b><small><i class="sd ' + f.status + '"></i>' + st + '</small></div>' + btn + '</div>';
      });
      h += '</div><div class="foot"><span>Friends ' + social.friends.length + ' / 100</span><span>Tap INVITE to call a friend into your squad</span></div>';
    } else if (ftab === 'requests') {
      h += '<div class="flist">';
      if (!rq) h += '<p class="empty-note">No new requests</p>';
      social.requests.forEach(function (r) {
        h += '<div class="frow" data-a="prof" data-n="' + esc(r.name) + '">' + av(r.color, r.name) +
          '<div class="fi"><b><span>' + esc(r.name) + '</span><em class="lvt">LV ' + r.level + '</em></b><small>wants to be your friend</small></div>' +
          '<button class="gb gr" type="button" data-a="accept" data-n="' + esc(r.name) + '">ACCEPT</button>' +
          '<button class="gb dis" type="button" data-a="decline" data-n="' + esc(r.name) + '">DECLINE</button></div>';
      });
      h += '</div>';
    } else {
      h += '<p class="empty-note" style="padding:0">Enter your friend\'s player ID (shown on their profile)</p>' +
        '<div class="addid"><input id="mIdIn" class="mi" type="text" maxlength="12" placeholder="1234 5678 90" autocomplete="off" inputmode="numeric"><button class="gb" type="button" data-a="sendid">SEND REQUEST</button></div>' +
        '<div class="foot"><span>Your ID: ' + userId() + '</span><button class="gb dis" type="button" data-a="copyid" style="min-width:0;height:calc(var(--u)*5)">COPY</button></div>';
    }
    openSheet(h + '</div>');
  }

  function guildHTML() {
    var g = social.guild;
    if (!g) {
      return head('GUILD') + '<div class="pbody" style="align-items:center;text-align:center"><p class="empty-note">You are not in a guild.<br>Create your own, or join one with up to ' + GUILD_MAX + ' players.</p>' +
        '<div class="brow" style="width:100%"><button class="gb" type="button" data-a="gcreate">CREATE GUILD</button><button class="gb gr" type="button" data-a="gjoin">JOIN VIPER KINGS</button></div></div>';
    }
    var h = head('GUILD') + '<div class="pbody gl"><div class="gside">' +
      '<svg class="emblem" viewBox="0 0 100 112"><path d="M50 4 L92 16 V52 C92 80 74 96 50 108 C26 96 8 80 8 52 V16 Z" fill="#FFB11F" stroke="#fff" stroke-width="4"/><path d="M50 14 L82 23 V50 C82 72 68 85 50 95 C32 85 18 72 18 50 V23 Z" fill="#4B1FA8"/><g transform="translate(50 56) scale(.9)"><path d="M -26 -24 L -6 26 L 6 26 L 26 -24 L 12 -24 L 0 10 L -12 -24 Z" fill="#FFE45C"/><ellipse cx="0" cy="-33" rx="9" ry="7" fill="#FFE45C"/></g></svg>' +
      '<h4>' + esc(g.name) + '</h4><span class="lvb">GUILD LV ' + g.level + '</span>' +
      '<div class="gcount"><small>MEMBERS</small><b>' + g.members.length + ' / ' + GUILD_MAX + '</b></div>' +
      '<div class="xp"><i style="width:' + (g.members.length / GUILD_MAX * 100) + '%"></i></div>' +
      '<button class="gb" type="button" data-a="ginvite">INVITE FRIENDS</button>' +
      '<div class="brow" style="width:100%"><button class="gb pk" type="button" data-a="gchat" style="min-width:0">CHAT</button><button class="gb dis" type="button" data-a="gleave" style="min-width:0">LEAVE</button></div></div>' +
      '<div class="gmain"><h5><span>MEMBERS ' + g.members.length + ' / ' + GUILD_MAX + '</span><span>LV</span></h5><div class="gmem">';
    g.members.forEach(function (m) {
      var you = !!m.you, name = you ? user.name : m.name, lv = you ? user.level : m.level;
      h += '<div class="frow" data-a="prof" data-n="' + esc(name) + '">' + av(null, name) +
        '<div class="fi"><b><span>' + esc(name) + (you ? ' (YOU)' : '') + '</span></b><small><i class="sd ' + (m.online ? 'online' : '') + '"></i>' + (m.online ? 'Online' : 'Offline') + '</small></div>' +
        '<span class="role ' + m.role + '">' + (m.role === 'LEADER' ? '&#9819; ' : '') + m.role + '</span><span class="glv">' + lv + '</span></div>';
    });
    return h + '</div></div></div>';
  }
  function openGuild() { sheet = 'guild'; openSheet(guildHTML()); }

  /* ---------- missions + ranks panels ---------- */
  var mtab = 'daily', rtab = 'solo';
  function updateMissionDot() { var b = $('missionBtn'); if (b && user) b.classList.toggle('has', claimable()); }

  function openMissions() {
    sheet = 'missions'; ensureMissions();
    var list = mtab === 'daily' ? DAILY : WEEKLY, st = mtab === 'daily' ? user.missions.d : user.missions.w;
    var h = head('MISSIONS') + '<div class="pbody"><div class="tabs">' +
      '<button class="tab' + (mtab === 'daily' ? ' on' : '') + '" type="button" data-a="mtab" data-t="daily">DAILY</button>' +
      '<button class="tab' + (mtab === 'weekly' ? ' on' : '') + '" type="button" data-a="mtab" data-t="weekly">WEEKLY</button></div><div class="flist">';
    list.forEach(function (x) {
      var q = st[x.id], done = q.p >= x.goal, rew = '+' + x.coins + ' COINS' + (x.gems ? '  +' + x.gems + ' DIAMONDS' : '');
      var btn = q.c ? '<button class="gb dis" type="button" disabled>DONE &#10003;</button>' :
        (done ? '<button class="gb" type="button" data-a="claim" data-w="' + mtab + '" data-id="' + x.id + '">CLAIM</button>' : '<button class="gb dis" type="button" disabled>' + q.p + ' / ' + x.goal + '</button>');
      h += '<div class="mrow"><div class="fi"><b><span>' + esc(x.t) + '</span></b><div class="mbar"><i style="width:' + Math.min(100, q.p / x.goal * 100) + '%"></i></div><span class="mrew">' + rew + '</span></div>' + btn + '</div>';
    });
    h += '</div><div class="foot"><span>' + (mtab === 'daily' ? 'Daily missions reset every day' : 'Weekly missions reset every 7 days') + '</span><span>Win a match = VIPER KING!</span></div></div>';
    openSheet(h);
  }

  function lbList(mode) {
    var names = ['Raja_X', 'Naga', 'Sia', 'Rexx', 'Kaal', 'Vyom', 'Tej', 'Ishaan', 'Rhea', 'Dev', 'Anaya', 'Kavya', 'Veer', 'Aarav', 'Rudra', 'Kabir', 'Zoya', 'Arjun', 'Neel', 'Yash'];
    var rows = names.map(function (n, i) { return { name: n, rp: 2100 - i * 52 - hash(n + mode) % 30 }; });
    var mine = user.rp[mode], out = [], placed = false;
    rows.forEach(function (r) { if (!placed && mine >= r.rp) { out.push({ name: user.name, rp: mine, you: true }); placed = true; } out.push(r); });
    var rank = 0, youRow = null;
    out.forEach(function (r, i) { r.n = i + 1; if (r.you) youRow = r; });
    if (!youRow) { youRow = { name: user.name, rp: mine, you: true, n: Math.max(21, 21 + Math.round((LEGEND_RP - mine) * 2.2)) }; }
    return { top: out.slice(0, 12), you: youRow, inTop: out.slice(0, 12).some(function (r) { return r.you; }) };
  }

  function openRanks() {
    sheet = 'ranks';
    var rp = user.rp[rtab], r = rankOf(rp), L = lbList(rtab);
    var h = head('RANKS') + '<div class="pbody"><div class="tabs">' +
      '<button class="tab' + (rtab === 'solo' ? ' on' : '') + '" type="button" data-a="rtab" data-t="solo">SOLO</button>' +
      '<button class="tab' + (rtab === 'squad' ? ' on' : '') + '" type="button" data-a="rtab" data-t="squad">SQUAD</button></div>' +
      '<div class="rkcard" style="--c:' + r.color + '"><div class="rkbadge">' + rankBadge(r.color) + '</div><div style="flex:1;min-width:0"><b>' + r.name + (r.sub ? ' ' + r.sub : '') + '</b>' +
      '<small>' + rp + ' RP' + (r.need ? '  -  ' + (r.need - r.into) + ' RP TO NEXT' : '  -  TOP RANK') + '</small>' +
      '<div class="mbar" style="margin-top:calc(var(--u)*1)"><i style="width:' + (r.need ? r.into / r.need * 100 : 100) + '%"></i></div></div>' +
      '<div style="text-align:right"><small>SEASON ' + seasonNo() + '</small><small>' + seasonLeft() + ' DAYS LEFT</small></div></div>' +
      '<div class="flist">';
    L.top.forEach(function (x) {
      h += '<div class="lbrow' + (x.you ? ' you' : '') + '"><span class="n">' + x.n + '</span><span class="nm">' + esc(x.you ? x.name + ' (YOU)' : x.name) + '</span><span class="rk">' + rankLabel(x.rp) + '</span><span class="rp">' + x.rp + '</span></div>';
    });
    if (!L.inTop) h += '<div class="lbrow you"><span class="n">' + L.you.n + '</span><span class="nm">' + esc(L.you.name) + ' (YOU)</span><span class="rk">' + rankLabel(L.you.rp) + '</span><span class="rp">' + L.you.rp + '</span></div>';
    h += '</div><div class="foot"><span>Win = +40 RP, top 3 = +20, each kill = +3</span><span>Solo and Squad ranks are separate</span></div></div>';
    openSheet(h);
  }

  /* ---------- skins / characters / animations (all unlocked with diamonds) + membership ---------- */
  var ctab = 'skin', SEASON_PRICE = 995;
  var INVKEY = { skin: 'skins', char: 'chars', anim: 'anims' };
  var DIA = '<svg class="di" aria-hidden="true"><use href="#icoD"/></svg>';
  function openCosmetics(keepScroll) {
    sheet = 'cos';
    var L = ctab === 'skin' ? VR.cos.SKINS : ctab === 'char' ? VR.cos.CHARS : VR.cos.ANIMS, inv = user.inv[INVKEY[ctab]], eqid = user.eq[ctab];
    var h = head('CUSTOMIZE') + '<div class="pbody"><div class="tabs">' +
      ['skin', 'char', 'anim'].map(function (k) { return '<button class="tab' + (ctab === k ? ' on' : '') + '" type="button" data-a="ctab" data-t="' + k + '">' + (k === 'skin' ? 'SKINS' : k === 'char' ? 'CHARACTERS' : 'ANIMATIONS') + '</button>'; }).join('') +
      '</div><div class="dbal">' + DIA + ' ' + fmt(user.gems) + ' DIAMONDS</div><div class="cgrid">';
    if (ctab === 'anim') h += '<div class="cc' + (!eqid ? ' eq' : '') + '"><div class="s1chip" style="color:#9FB0FF;box-shadow:inset 0 0 0 2px #444">NONE</div><b>No animation</b><small>Free</small>' +
      (!eqid ? '<button class="gb dis" type="button" disabled>EQUIPPED</button>' : '<button class="gb" type="button" data-a="ceq" data-id="">EQUIP</button>') + '</div>';
    L.forEach(function (x) {
      var own = !!inv[x.id], pic = ctab === 'skin' ? VR.cos.svgBody(x) : ctab === 'char' ? VR.cos.svgFace(x) : VR.cos.svgAnim(x);
      var sub = x.pass ? 'SEASON 1 ONLY' : (ctab === 'char' ? x.note : (x.L ? 'LEGENDARY' : (x.note || 'NORMAL')));
      var btn;
      if (own) btn = eqid === x.id ? '<button class="gb dis" type="button" disabled>EQUIPPED</button>' : '<button class="gb" type="button" data-a="ceq" data-id="' + x.id + '">EQUIP</button>';
      else if (x.pass) btn = '<button class="gb pk" type="button" data-a="openmem">SEASON PASS</button>';
      else btn = '<button class="gb pk" type="button" data-a="cbuy" data-id="' + x.id + '">' + DIA + ' ' + x.p + '</button>';
      h += '<div class="cc' + (x.L ? ' L' : '') + (own && eqid === x.id ? ' eq' : '') + '">' + pic + '<b>' + esc(x.n) + '</b><small>' + sub + '</small>' + btn + '</div>';
    });
    h += '</div></div>';
    var st = keepScroll && $('pbox').querySelector('.pbody') ? $('pbox').querySelector('.pbody').scrollTop : 0;
    openSheet(h);
    if (st) $('pbox').querySelector('.pbody').scrollTop = st;
  }

  function openMembership() {
    sheet = 'mem';
    var c = VR.cos, sk = c.find('skin', 'sp1'), ch = c.find('char', 'csov'), an = c.find('anim', 'a_crown');
    var h = head('MEMBERSHIP') + '<div class="pbody"><div class="memhero"><b>SEASON 1</b><small>' + (user.pass ? 'You are a Season 1 member!' : 'Rare items you can only get this season') + '</small></div>' +
      '<div class="cgrid"><div class="cc L">' + c.svgFace(ch) + '<b>' + ch.n + '</b><small>Character</small></div>' +
      '<div class="cc L">' + c.svgBody(sk) + '<b>' + sk.n + '</b><small>Skin</small></div>' +
      '<div class="cc">' + c.svgAnim(an) + '<b>' + an.n + '</b><small>Animation</small></div></div>' +
      '<div class="cgrid" style="grid-template-columns:1fr 2fr;margin-top:calc(var(--u)*1.6)"><div class="cc"><div class="s1chip">S1</div><small>Badge</small></div>' +
      '<div class="cc" style="justify-content:center"><b>' + (user.pass ? 'MEMBER' : 'SEASON 1 MEMBERSHIP') + '</b><small>' + fmt(user.gems) + ' diamonds in your wallet</small>' +
      (user.pass ? '<button class="gb dis" type="button" disabled>JOINED &#10003;</button>' : '<button class="gb pk" type="button" data-a="joinmem">' + DIA + ' ' + SEASON_PRICE + '  JOIN</button>') + '</div></div></div>';
    openSheet(h);
  }

  function findPerson(name) {
    if (name === user.name) return null;
    var p = null;
    squad.forEach(function (m) { if (m && m.name === name) p = m; });
    if (!p) social.friends.forEach(function (m) { if (m.name === name) p = m; });
    if (!p) social.requests.forEach(function (m) { if (m.name === name) p = m; });
    if (!p && social.guild) social.guild.members.forEach(function (m) { if (m.name === name) p = { name: m.name, level: m.level }; });
    return p || { name: name };
  }

  function rankChip(lab, rp) { var r = rankOf(rp); return '<div class="rkb" style="--c:' + r.color + '"><i></i><div><small>' + lab + ' RANK</small>' + r.name + (r.sub ? ' ' + r.sub : '') + '</div></div>'; }

  function openProfile(p) {
    var me = !p, d, name, color, lvl, likes, st, bg = null;
    if (me) { name = user.name; color = user.skin; lvl = user.level; likes = user.likes; st = user.stats; }
    else { d = otherData(p); name = p.name; color = p.color == null ? hash(name) % 5 : p.color; lvl = d.level; likes = d.likes; st = d.stats; }
    sheet = 'profile';
    var dg = danger(st), wr = st.matches ? Math.round(st.wins / st.matches * 100) : 0;
    var g = social.guild;
    var inG = me ? !!g : (g && g.members.some(function (m) { return m.name === name; }));
    var gtxt = inG ? esc(g.name) : 'NO GUILD';
    var btns;
    if (me) btns = '<button class="gb" type="button" data-a="edit">EDIT NAME</button><button class="gb dis" type="button" data-a="soon" data-n="Skins">SKINS</button>';
    else {
      var b1 = isFriend(name) ? '<button class="gb dis" type="button" disabled>&#10003; FRIENDS</button>' :
        (social.sent[name] ? '<button class="gb dis" type="button" disabled>REQUEST SENT</button>' : '<button class="gb" type="button" data-a="addfriend" data-n="' + esc(name) + '">+ ADD FRIEND</button>');
      var b2 = inSquad(name) ? '<button class="gb dis" type="button" data-a="remove" data-n="' + esc(name) + '">REMOVE FROM SQUAD</button>' :
        '<button class="gb gr" type="button" data-a="invite" data-n="' + esc(name) + '" data-from="prof">INVITE TO SQUAD</button>';
      btns = b1 + b2;
    }
    var liked = !me && social.liked[name];
    var likeBtn = me ? '' : '<button class="gb pk" type="button" data-a="like" data-n="' + esc(name) + '"' + (liked ? ' disabled' : '') + ' style="min-width:0">' + (liked ? '&#9829; LIKED' : '&#9829; LIKE') + '</button>';
    var heart = '<svg viewBox="0 0 24 24"><path d="M12 21C5 15.5 2.5 12 2.5 8.5A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 9.5 2C21.5 12 19 15.5 12 21z" fill="#FF3B6B" stroke="#fff" stroke-width="1.4"/></svg>';
    var shield = '<svg viewBox="0 0 50 56"><path d="M25 2 L47 9 V28 C47 42 37 50 25 54 C13 50 3 42 3 28 V9 Z" fill="#FF3B3B" stroke="#FFD0D0" stroke-width="2.5"/><path d="M14 20 L25 40 L36 20" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var stats = [['WINS', fmt(st.wins)], ['KILLS', fmt(st.kills)], ['BEST LENGTH', fmt(st.best)], ['WIN RATE', wr + '%'], ['MATCHES', fmt(st.matches)], ['BEST RANK', st.bestRank ? '#' + st.bestRank : '-']];
    var h = head(me ? 'MY PROFILE' : 'PLAYER PROFILE') + '<div class="pbody prof"><div class="pl">' +
      '<i class="avb" style="--c:' + COLS[color % COLS.length][0] + '">' + esc(name.charAt(0).toUpperCase()) + '</i>' +
      '<b class="pn">' + esc(name) + '</b><span class="pid">ID: ' + (me ? userId() : (function () { var n = String(hash(name) * 7919 % 10000000000); while (n.length < 10) n = '0' + n; return n.slice(0, 4) + ' ' + n.slice(4, 8) + ' ' + n.slice(8); })()) + '</span>' +
      '<span class="lvb">LV ' + lvl + '</span>' + (me ? '<div class="xp"><i style="width:' + ((user.xp % 500) / 5) + '%"></i></div>' : '') + '</div>' +
      '<div class="pr"><div class="danger">' + shield + '<div class="dtx"><b style="color:#FF6B4A">' + dg.tier + '</b><small>DANGER LEVEL ' + dg.pct + '%</small><div class="dbar"><i style="width:' + dg.pct + '%"></i></div></div></div>' +
      '<div class="likes">' + heart + '<div><b>' + fmt(likes) + '</b><small>' + (me ? 'LIKES RECEIVED' : 'LIKES') + '</small></div>' + likeBtn + '</div>' +
      '<div class="sgrid">' + stats.map(function (x) { return '<div class="st3"><b>' + x[1] + '</b><small>' + x[0] + '</small></div>'; }).join('') + '</div>' +
      '<div class="rkrow">' + rankChip('SOLO', me ? user.rp.solo : rpOther(name, 'solo')) + rankChip('SQUAD', me ? user.rp.squad : rpOther(name, 'squad')) + (me && user.pass ? '<div class="rkb" style="--c:#FFD23F"><i></i><div><small>SEASON 1</small>S1 MEMBER</div></div>' : '') + '</div>' +
      '<div class="grow"><i></i>' + gtxt + '<span>' + (inG ? 'MEMBER' : '') + '</span></div>' +
      '<div class="brow">' + btns + '</div></div></div>';
    openSheet(h);
  }

  function onSheetClick(e) {
    var t = e.target.closest('[data-a]'); if (!t || t.disabled) return;
    var a = t.dataset.a, n = t.dataset.n, f, i;
    if (a === 'close') closeSheet();
    else if (a === 'rtab') { rtab = t.dataset.t; openRanks(); }
    else if (a === 'ctab') { ctab = t.dataset.t; openCosmetics(); }
    else if (a === 'ceq') { user.eq[ctab] = t.dataset.id; saveUser(); renderSlots(); openCosmetics(true); VR.ui.toast('Equipped!'); }
    else if (a === 'cbuy') {
      var it = VR.cos.find(ctab, t.dataset.id);
      if (user.gems < it.p) { VR.ui.toast('Need ' + (it.p - user.gems) + ' more diamonds'); }
      else { user.gems -= it.p; user.inv[INVKEY[ctab]][it.id] = true; user.eq[ctab] = it.id; saveUser(); renderProfile(); renderSlots(); VR.ui.toast(it.n + ' unlocked and equipped!'); }
      openCosmetics(true);
    }
    else if (a === 'openmem') openMembership();
    else if (a === 'joinmem') {
      if (user.pass) return;
      if (user.gems < SEASON_PRICE) { VR.ui.toast('Need ' + (SEASON_PRICE - user.gems) + ' more diamonds'); return; }
      user.gems -= SEASON_PRICE; user.pass = true;
      user.inv.skins.sp1 = true; user.inv.chars.csov = true; user.inv.anims.a_crown = true;
      saveUser(); renderProfile(); VR.ui.toast('Welcome to Season 1! Items added to CUSTOMIZE'); openMembership();
    }
    else if (a === 'mtab') { mtab = t.dataset.t; openMissions(); }
    else if (a === 'claim') {
      var lst = t.dataset.w === 'daily' ? DAILY : WEEKLY, st = t.dataset.w === 'daily' ? user.missions.d : user.missions.w;
      lst.forEach(function (x) {
        if (x.id !== t.dataset.id) return; var q = st[x.id];
        if (q.p >= x.goal && !q.c) { q.c = true; user.coins += x.coins; user.gems += (x.gems || 0); saveUser(); renderProfile(); VR.ui.toast('Reward claimed: +' + x.coins + ' coins' + (x.gems ? ' +' + x.gems + ' diamonds' : '')); }
      });
      openMissions();
    }
    else if (a === 'tab') { ftab = t.dataset.t; openFriends(); }
    else if (a === 'prof') openProfile(findPerson(n));
    else if (a === 'invite') { inviteFriend(n); if (t.dataset.from === 'prof') closeSheet(); }
    else if (a === 'accept') {
      // NETWORK HOOK: accept on the server.
      social.requests = social.requests.filter(function (r) { if (r.name === n) { social.friends.push({ name: r.name, level: r.level, status: 'online', color: r.color }); return false; } return true; });
      saveSocial(); renderProfile(); renderSlots(); openFriends(); VR.ui.toast(n + ' is now your friend');
    } else if (a === 'decline') {
      social.requests = social.requests.filter(function (r) { return r.name !== n; });
      saveSocial(); renderProfile(); openFriends();
    } else if (a === 'sendid') {
      var v = (($('mIdIn').value || '').replace(/\s+/g, ''));
      if (v.length < 8) return VR.ui.toast('Enter a valid player ID');
      // NETWORK HOOK: look up the player by ID and send a request.
      VR.ui.toast('Friend request sent to ID ' + v); $('mIdIn').value = '';
    } else if (a === 'copyid') copyText(userId(), 'Your ID copied');
    else if (a === 'addfriend') { var p = findPerson(n); sendRequest(p); openProfile(p); }
    else if (a === 'like') {
      // NETWORK HOOK: send the like to the server (one like per player per day).
      social.liked[n] = true; saveSocial(); openProfile(findPerson(n)); VR.ui.toast('You liked ' + n);
    } else if (a === 'remove') {
      for (i = 1; i < SIZE; i++) if (squad[i] && squad[i].name === n) squad[i] = null;
      renderSlots(); closeSheet(); VR.ui.toast(n + ' removed from squad');
    } else if (a === 'edit') editName();
    else if (a === 'soon') VR.ui.toast(n + ' - coming soon');
    else if (a === 'ginvite') {
      var g = social.guild;
      if (g.members.length >= GUILD_MAX) return VR.ui.toast('Guild is full (' + GUILD_MAX + '/' + GUILD_MAX + ')');
      copyText(g.id, 'Guild ID ' + g.id + ' copied - share it with friends'); // NETWORK HOOK: real guild invites
    } else if (a === 'gchat') VR.ui.toast('Guild chat - coming soon');
    else if (a === 'gleave') {
      VR.ui.modal({ title: 'LEAVE GUILD?', body: 'You will leave ' + social.guild.name + '.', actions: [
        { label: 'LEAVE', primary: true, onClick: function () { social.guild = null; saveSocial(); openGuild(); } }, { label: 'STAY' }] });
    } else if (a === 'gcreate') {
      VR.ui.modal({ title: 'CREATE GUILD', html: '<input id="mIn" class="mi" type="text" maxlength="14" placeholder="Guild name" autocomplete="off">', actions: [
        { label: 'CREATE', primary: true, keepOpen: true, onClick: function () {
          var nm = ($('mIn').value || '').trim();
          if (nm.length < 3) return VR.ui.toast('Guild name needs 3 or more letters');
          social.guild = { name: nm.toUpperCase(), id: 'G-' + newCode(), level: 1, members: [{ name: user.name, role: 'LEADER', you: true, online: true }] };
          saveSocial(); VR.ui.closeModal(); openGuild();
        } }, { label: 'CANCEL' }] });
    } else if (a === 'gjoin') { social.guild = makeGuild(user.name); saveSocial(); openGuild(); }
  }

  function editName() {
    VR.ui.modal({ title: 'EDIT NAME', html: '<input id="mIn" class="mi" type="text" maxlength="14" autocomplete="off" value="' + esc(user.name) + '">', actions: [
      { label: 'SAVE', primary: true, keepOpen: true, onClick: function () {
        var nm = ($('mIn').value || '').trim();
        if (nm.length < 3) return VR.ui.toast('Name needs 3 or more letters');
        user.name = nm; if (squad[0]) squad[0].name = nm;
        if (VR.auth && VR.auth.user === user) VR.auth.save();
        VR.ui.closeModal(); renderProfile(); renderSlots(); openProfile(null);
      } }, { label: 'CANCEL' }] });
  }

  /* ---------- chat, settings ---------- */
  function addChat(who, text) {
    var list = $('chatList'), row = document.createElement('div');
    var b = document.createElement('b'); b.textContent = who + ': ';
    row.appendChild(b); row.appendChild(document.createTextNode(text));
    list.appendChild(row); list.scrollTop = list.scrollHeight;
  }
  function openSettings() { VR.settings.open(); }

  /* ---------- enter / init ---------- */
  function resetSquad() { squad = [{ name: user.name, you: true }]; for (var i = 1; i < SIZE; i++) squad.push(null); }

  function enter(u) {
    user = u; initUser(); loadSocial();
    resetSquad(); code = newCode(); mode = 'squad';
    $('chatList').innerHTML = ''; addChat('SYSTEM', 'Welcome to Viper Rush. Invite friends with your team code.');
    closeSheet();
    if (VR.settings) VR.settings.apply();
    renderProfile(); renderSlots();
    VR.app.go('lobby');
  }

  function init() {
    $('slots').addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var a = t.dataset.act, i = +t.dataset.i;
      if (a === 'who') openProfile(i === 0 ? null : squad[i]);
      else if (a === 'addf') { sendRequest(squad[i]); }
      else if (a === 'ghost') openInvite();
      else if (a === 'mic') toggleMic();
      else if (a === 'snd') toggleSound();
    });
    $('pbox').addEventListener('click', onSheetClick);
    $('sheet').addEventListener('pointerdown', function (e) { if (e.target === $('sheet')) closeSheet(); });
    $('meBtn').addEventListener('click', function () { openProfile(null); });
    $('friendsBtn').addEventListener('click', function () { ftab = social.requests.length ? 'requests' : 'friends'; openFriends(); });
    $('guildBtn').addEventListener('click', openGuild);
    $('missionBtn').addEventListener('click', openMissions);
    $('ranksBtn').addEventListener('click', openRanks);
    $('skinsBtn').addEventListener('click', function () { openCosmetics(); });
    $('storeBtn').addEventListener('click', function () { VR.store.open(); });
    $('memBtn').addEventListener('click', openMembership);
    $('codeBtn').addEventListener('click', function () { copyText(code, 'Team code ' + code + ' copied'); });
    $('enterBtn').addEventListener('click', openEnterCode);
    $('modeBtn').addEventListener('click', function () {
      mode = mode === 'squad' ? 'solo' : 'squad';
      if (mode === 'solo') for (var i = 1; i < SIZE; i++) squad[i] = null;
      renderProfile(); renderSlots();
    });
    $('chatBtn').addEventListener('click', function () { $('chat').classList.toggle('on'); });
    $('chatClose').addEventListener('click', function () { $('chat').classList.remove('on'); });
    $('chatForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var inp = $('chatInput'), t = inp.value.trim(); if (!t) return;
      addChat(user.name, t); inp.value = '';  // NETWORK HOOK: send t to your squad chat channel
    });
    VR.voice.onChange(renderMic);
    document.querySelectorAll('#lobby [data-soon]').forEach(function (b) {
      b.addEventListener('click', function () { VR.ui.toast(b.dataset.soon + ' - coming soon'); });
    });
    $('coinChip').addEventListener('click', function () { VR.ui.toast('Viper Coin store - coming soon'); });
    $('gemChip').addEventListener('click', function () { VR.ui.toast('Diamond store - coming soon'); });
    $('navSettings').addEventListener('click', openSettings);
    $('settingsBtn').addEventListener('click', openSettings);
    $('startBtn').addEventListener('click', function () {
      $('chat').classList.remove('on'); closeSheet();
      // NETWORK HOOK: start matchmaking with your party here.
      VR.app.startGame({ mode: mode, squad: squad.filter(Boolean), user: user });
    });
  }

  window.VR = window.VR || {};
  VR.sound = true;
  VR.lobby = { init: init, enter: enter, openSkins: function () { openCosmetics(); }, openUser: function () { return user; }, decorate: function () { renderProfile(); renderSlots(); }, recordGame: recordGame, refresh: function () { if (user) { renderProfile(); renderSlots(); } } };
})();
