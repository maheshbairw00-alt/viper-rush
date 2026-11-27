/* Viper Rush game server  (no packages needed - just Node.js 18 or newer)
 *
 * What it does
 *  - Players connect with a WebSocket and ask for a match.
 *  - Players wait a few seconds in a room, then the match starts for everyone in the room.
 *  - Players with the same TEAM CODE are put in the same room and become teammates.
 *  - During the match the server only passes messages between the players (positions, eaten orbs, deaths, emotes).
 *
 * Settings (environment variables, all optional)
 *  PORT          port to listen on (hosting sets this by itself)
 *  ROOM_MAX      players in one match (default 50)
 *  WAIT_SECONDS  how long a room waits for more players before it starts (default 15)
 *  WORLD_SIZE    force the map size (otherwise: few players = small map, many players = big map)
 *
 * Run:  node server.js
 */
const http = require('http');
const crypto = require('crypto');
const https = require('https');

const PORT = +process.env.PORT || 8080;
const ROOM_MAX = +process.env.ROOM_MAX || 50;
const WAIT = (+process.env.WAIT_SECONDS || 15) * 1000;
const WORLD_FORCE = +process.env.WORLD_SIZE || 0;
// admin live-watch: the admin panel proves who it is with its Google/Firebase login token
const FB_PROJECT = process.env.FIREBASE_PROJECT || 'viper-rush';
const ADMINS = (process.env.ADMIN_EMAILS || 'maheshbohra347@gmail.com').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
let certs = null, certsAt = 0;
function getCerts(cb) {
  if (process.env.TEST_CERTS) { try { return cb(JSON.parse(process.env.TEST_CERTS)); } catch (e) { return cb(null); } }   // only used for local tests
  if (certs && Date.now() - certsAt < 3600e3) return cb(certs);
  https.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', (res) => {
    let d = ''; res.on('data', (c) => { d += c; });
    res.on('end', () => { try { certs = JSON.parse(d); certsAt = Date.now(); cb(certs); } catch (e) { cb(null); } });
  }).on('error', () => cb(null));
}
function verifyUser(tok, cb) {                       // checks a Firebase login token, gives back its data (uid, email) or null
  try {
    const [h, p, sig] = String(tok).split('.');
    const head = JSON.parse(Buffer.from(h, 'base64url')), pay = JSON.parse(Buffer.from(p, 'base64url'));
    if (pay.aud !== FB_PROJECT || pay.iss !== 'https://securetoken.google.com/' + FB_PROJECT || pay.exp * 1000 < Date.now() || head.alg !== 'RS256' || !pay.sub) return cb(null);
    getCerts((c) => {
      const cert = c && c[head.kid]; if (!cert) return cb(null);
      const ok = crypto.createVerify('RSA-SHA256').update(h + '.' + p).verify(cert, Buffer.from(sig, 'base64url'));
      cb(ok ? { uid: pay.sub, email: String(pay.email || '').toLowerCase(), verified: pay.email_verified !== false } : null);
    });
  } catch (e) { cb(null); }
}
function verifyAdmin(tok, cb) {
  verifyUser(tok, (u) => cb(!!(u && u.verified && ADMINS.indexOf(u.email) >= 0)));
}

/* ---------- tiny WebSocket (RFC 6455) ---------- */
class Conn {
  constructor(socket, onMessage, onClose) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.open = true; this.frag = null;
    this.onMessage = onMessage; this.onClose = onClose;
    socket.on('data', (d) => this.data(d));
    socket.on('close', () => this.close());
    socket.on('error', () => this.close());
  }
  data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    if (this.buf.length > 4e6) return this.close();
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const op = b[0] & 15, fin = !!(b[0] & 128), masked = !!(b[1] & 128); let len = b[1] & 127, p = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); p = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); p = 10; }
      if (len > 2e6) return this.close();
      const need = p + (masked ? 4 : 0) + len; if (b.length < need) return;
      let payload = b.slice(p + (masked ? 4 : 0), need);
      if (masked) { const m = b.slice(p, p + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
      this.buf = b.slice(need);
      if (op === 8) { this.close(); return; }
      if (op === 9) { this.frame(10, payload); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2) { this.frag = payload; } else if (op === 0 && this.frag) { this.frag = Buffer.concat([this.frag, payload]); }
      if (fin && this.frag) { const t = this.frag.toString('utf8'); this.frag = null; try { this.onMessage(t); } catch (e) { console.error('msg error', e.message); } }
    }
  }
  frame(op, payload) {
    if (!this.open) return;
    const n = payload.length; let h;
    if (n < 126) h = Buffer.from([128 | op, n]);
    else if (n < 65536) { h = Buffer.alloc(4); h[0] = 128 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
    else { h = Buffer.alloc(10); h[0] = 128 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
    try { this.socket.write(Buffer.concat([h, payload])); } catch (e) { this.close(); }
  }
  send(text) { this.frame(1, Buffer.from(text)); }
  close() {
    if (!this.open) return; this.open = false;
    try { this.socket.destroy(); } catch (e) {}
    this.onClose();
  }
}

/* ---------- rooms ---------- */
let pidSeq = 0, roomSeq = 0;
const rooms = new Set();

function newRoom(custom) {
  const r = { id: ++roomSeq, players: new Map(), spec: new Set(), info: null, started: false, createdAt: Date.now(), tick: null, custom: custom || null };
  r.tick = setInterval(() => roomTick(r), 1000);
  rooms.add(r); return r;
}
function broadcast(r, obj, exceptId) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  for (const p of r.players.values()) if (p.id !== exceptId) p.conn.send(s);
  if (r.spec.size && typeof obj !== 'string') {                // admins watching this match get a lighter copy (fewer body points)
    let o = obj;
    if (obj.t === 's' && obj.g) { const g = []; for (let i = 0; i < obj.g.length; i += 2) if (i < 4 || (i / 2) % 6 === 0) g.push(obj.g[i], obj.g[i + 1]); o = Object.assign({}, obj, { g }); }
    const t = JSON.stringify(o); for (const c of r.spec) c.send(t);
  }
}
// custom rooms / tournaments made in the admin panel: everybody who joins the same room code plays together
function findCustom(code, cfg) {
  for (const r of rooms) if (r.custom && r.custom.code === code) return r;
  const c = cfg || {};
  const max = Math.max(2, Math.min(ROOM_MAX, c.max | 0 || ROOM_MAX));
  const startAt = +c.startAt > Date.now() ? +c.startAt : 0;
  return newRoom({ code, max, world: [6400, 16000, 48000].indexOf(c.world | 0) >= 0 ? c.world | 0 : 0, startAt, wait: 120000 });
}
function findRoom(code) {
  let open = null;
  for (const r of rooms) {
    if (r.custom) continue;
    if (r.started || r.players.size >= ROOM_MAX) continue;
    if (code) for (const p of r.players.values()) if (p.code === code) return r;      // friends go to the same room
    if (!open || r.players.size > open.players.size) open = r;
  }
  return open || newRoom();
}
function roomTick(r) {
  if (r.started) return;
  if (r.custom) {                                            // custom room: starts at the planned time, or when full, or 2 minutes after the first player
    const c = r.custom, at = c.startAt || (r.createdAt + c.wait), left = Math.max(0, Math.ceil((at - Date.now()) / 1000));
    if (r.players.size >= c.max || (left <= 0 && r.players.size >= 2)) return startRoom(r);
    if (left <= 0) {                                         // time is up but nobody else came
      if (Date.now() - at > 60000) { broadcast(r, { t: 'cancel' }); closeRoom(r); return; }
    }
    broadcast(r, { t: 'wait', n: r.players.size, max: c.max, left });
    return;
  }
  const left = Math.max(0, Math.ceil((r.createdAt + WAIT - Date.now()) / 1000));
  if (r.players.size >= ROOM_MAX || left <= 0) return startRoom(r);
  broadcast(r, { t: 'wait', n: r.players.size, max: ROOM_MAX, left });
}
function startRoom(r) {
  r.started = true;
  const list = [...r.players.values()];
  if (list.length < 2 && !r.custom) {                        // nobody else came: the game plays offline with bots
    broadcast(r, { t: 'solo' }); closeRoom(r); return;
  }
  const n = list.length;
  const world = (r.custom && r.custom.world) || WORLD_FORCE || (n <= 6 ? 6400 : n <= 20 ? 16000 : 48000);
  const seed = (Math.random() * 2 ** 31) | 0;
  const spots = {};                                          // one spawn area per team code, everyone else alone
  const pad = Math.min(1500, world * .1);
  const players = list.map((p) => {
    const key = p.code || p.id;
    if (!spots[key]) spots[key] = { x: pad + Math.random() * (world - 2 * pad), y: pad + Math.random() * (world - 2 * pad) };
    const s = spots[key];
    return { id: p.id, name: p.name, skin: p.skin, ch: p.ch, ci: p.ci, code: p.code, uid: p.uid, x: Math.round(s.x + (Math.random() - .5) * 200), y: Math.round(s.y + (Math.random() - .5) * 200) };
  });
  r.started = true;
  r.info = { world, players: players.map((q) => ({ id: q.id, name: q.name, ci: q.ci, code: q.code, uid: q.uid })), code: r.custom ? r.custom.code : '', started: Date.now() };
  for (const p of list) p.conn.send(JSON.stringify({ t: 'start', seed, world, you: p.id, players, room: r.custom ? r.custom.code : '' }));
  console.log('match started:', n, 'players, world', world);
}
function closeRoom(r) { clearInterval(r.tick); rooms.delete(r); for (const c of r.spec) c.send('{"t":"end"}'); r.spec.clear(); }

function onConnect(conn) {
  const me = { id: 'p' + (++pidSeq), conn, room: null, code: '', name: 'Player', skin: 's0', ch: 'c0', ci: 0 };
  conn.onMessage = (text) => {
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    if (m.t === 'admin') {                                   // admin panel: prove who you are, then list / watch matches
      verifyAdmin(m.token, (ok) => { me.admin = ok; conn.send(JSON.stringify({ t: 'admin', ok })); });
      return;
    }
    if (me.admin) {
      if (m.t === 'rooms') {
        const list = [...rooms].map((r) => ({ id: r.id, started: r.started, n: r.players.size, code: r.custom ? r.custom.code : '', world: r.info ? r.info.world : 0, names: [...r.players.values()].slice(0, 4).map((p) => p.name), age: Math.round((Date.now() - r.createdAt) / 1000) }));
        conn.send(JSON.stringify({ t: 'rooms', list })); return;
      }
      if (m.t === 'watch') {
        if (me.watching) me.watching.spec.delete(conn);
        let rr = null; for (const r of rooms) if (r.id === m.room) rr = r;
        if (!rr || !rr.info) { conn.send(JSON.stringify({ t: 'end' })); return; }
        me.watching = rr; rr.spec.add(conn);
        conn.send(JSON.stringify({ t: 'init', id: rr.id, world: rr.info.world, players: rr.info.players, code: rr.info.code })); return;
      }
      if (m.t === 'unwatch') { if (me.watching) me.watching.spec.delete(conn); me.watching = null; return; }
      return;
    }
    if (m.t === 'join' && !me.room) {
      me.name = String(m.name || 'Player').slice(0, 14); me.skin = String(m.skin || 's0').slice(0, 8); me.ch = String(m.ch || 'c0').slice(0, 8);
      me.uid = String(m.uid || '').slice(0, 40); me.ci = (m.ci | 0) % 6; me.code = String(m.code || '').toUpperCase().slice(0, 5);
      const rc = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      if (rc) {
        me.code = '';                                          // everyone in a custom room is on their own
        let cr = null; for (const r2 of rooms) if (r2.custom && r2.custom.code === rc) cr = r2;
        if (cr && (cr.started || cr.players.size >= cr.custom.max)) { conn.send(JSON.stringify({ t: 'late' })); return; }
        me.room = findCustom(rc, m.cfg);
      } else me.room = findRoom(me.code);
      me.room.players.set(me.id, me);
      conn.send(JSON.stringify({ t: 'joined', id: me.id }));
      roomTick(me.room); return;
    }
    const r = me.room; if (!r || !r.started) { if (m.t === 'leave' && r) leave(me); return; }
    if (m.t === 'ping') { conn.send('{"t":"pong"}'); return; }
    // in a match: pass the message on to the others (the sender id is added by the server)
    if (m.t === 'rtc') {                                     // voice chat set-up messages: only between players of the same team code
      const to = r.players.get(String(m.to));
      if (to && me.code && to.code === me.code && JSON.stringify(m.d || '').length < 8000) to.conn.send(JSON.stringify({ t: 'rtc', from: me.id, d: m.d }));
      return;
    }
    if (m.t === 's' || m.t === 'eat' || m.t === 'drop' || m.t === 'died' || m.t === 'emo') { m.id = me.id; broadcast(r, m, me.id); }
  };
  conn.onClose = () => { if (me.watching) me.watching.spec.delete(conn); leave(me); };
}
function leave(me) {
  const r = me.room; if (!r) return; me.room = null;
  r.players.delete(me.id);
  if (r.started) broadcast(r, { t: 'left', id: me.id });
  if (r.players.size === 0) closeRoom(r);
}

/* ---------- payments (Razorpay) ----------
 * Settings (set them in Render -> Environment, NEVER in the game files):
 *  RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET   from the Razorpay dashboard (test keys first, live keys later)
 *  RAZORPAY_WEBHOOK_SECRET                 optional, the secret you type when you create the webhook
 *  FIREBASE_SERVICE_ACCOUNT                the whole JSON of the Firebase service account key (lets the server write the payment record)
 * The player never sets the price: the browser only says which pack it wants, the price and the diamonds come from this table.
 */
const RZP_KEY = process.env.RAZORPAY_KEY_ID || '', RZP_SECRET = process.env.RAZORPAY_KEY_SECRET || '', RZP_HOOK = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const RZP_BASE = process.env.RAZORPAY_BASE || 'https://api.razorpay.com';
const FS_BASE = process.env.FIRESTORE_BASE || 'https://firestore.googleapis.com';
const PACKS = {           // gems = diamonds the player gets, rs = price in rupees  (keep js/pay.js in step with this table)
  d100: { gems: 100, rs: 90 }, d300: { gems: 300, rs: 270 }, d500: { gems: 500, rs: 450 },
  d1000: { gems: 1000, rs: 900 }, d2000: { gems: 2000, rs: 1800 }, d3000: { gems: 3000, rs: 2000 }
};
const ORIGINS = (process.env.ALLOW_ORIGINS || 'https://maheshbairw00-alt.github.io,http://localhost:8123,http://127.0.0.1:8123').split(',').map((x) => x.trim());

function call(method, url, headers, body, cb) {       // small https/http helper -> cb(err, status, json)
  let u; try { u = new URL(url); } catch (e) { return cb(e); }
  const lib = u.protocol === 'http:' ? http : https;
  const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
  const h = Object.assign({}, headers); if (data != null) { h['Content-Length'] = Buffer.byteLength(data); if (!h['Content-Type']) h['Content-Type'] = 'application/json'; }
  const rq = lib.request({ method, hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, headers: h, timeout: 15000 }, (res) => {
    let d = ''; res.on('data', (c) => { d += c; });
    res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} cb(null, res.statusCode, j); });
  });
  rq.on('error', (e) => cb(e)); rq.on('timeout', () => { rq.destroy(new Error('timeout')); });
  if (data != null) rq.write(data); rq.end();
}
const rzpAuth = () => ({ Authorization: 'Basic ' + Buffer.from(RZP_KEY + ':' + RZP_SECRET).toString('base64') });
const rzp = (method, path, body, cb) => call(method, RZP_BASE + path, rzpAuth(), body, cb);

// a Google access token for the Firestore REST api, made from the service account key
let gTok = null, gExp = 0;
function googleToken(cb) {
  if (process.env.TEST_GTOKEN) return cb(null, process.env.TEST_GTOKEN);
  if (gTok && Date.now() < gExp - 60e3) return cb(null, gTok);
  let sa; try { sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || ''); } catch (e) { return cb(new Error('FIREBASE_SERVICE_ACCOUNT missing')); }
  const now = Math.floor(Date.now() / 1000), b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const un = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  let sig; try { sig = crypto.createSign('RSA-SHA256').update(un).sign(sa.private_key, 'base64url'); } catch (e) { return cb(new Error('bad service account key')); }
  call('POST', 'https://oauth2.googleapis.com/token', { 'Content-Type': 'application/x-www-form-urlencoded' },
    'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + un + '.' + sig, (err, st, j) => {
      if (err || st !== 200 || !j || !j.access_token) return cb(err || new Error('google token ' + st));
      gTok = j.access_token; gExp = Date.now() + (j.expires_in || 3600) * 1000; cb(null, gTok);
    });
}
// writes viperrush_payments/{paymentId}; the same payment can never be written twice (Firestore answers 409)
function writePayment(rec, cb) {
  googleToken((err, tok) => {
    if (err) return cb(err);
    const f = { uid: { stringValue: rec.uid }, gems: { integerValue: String(rec.gems) }, amount: { integerValue: String(rec.amount) }, pack: { stringValue: rec.pack },
      orderId: { stringValue: rec.orderId }, paymentId: { stringValue: rec.paymentId }, claimed: { booleanValue: false }, ts: { integerValue: String(Date.now()) } };
    call('POST', FS_BASE + '/v1/projects/' + FB_PROJECT + '/databases/(default)/documents/viperrush_payments?documentId=' + encodeURIComponent(rec.paymentId),
      { Authorization: 'Bearer ' + tok }, { fields: f }, (e, st) => { if (e) return cb(e); cb(null, st === 200 ? 'new' : st === 409 ? 'dup' : 'err' + st); });
  });
}
// checks a payment with Razorpay itself and records it. expectUid = the logged in player (or null from the webhook)
function creditPayment(orderId, paymentId, expectUid, cb) {
  rzp('GET', '/v1/orders/' + encodeURIComponent(orderId), null, (e1, s1, order) => {
    if (e1 || s1 !== 200 || !order) return cb('order');
    const n = order.notes || {}, pk = PACKS[n.pack];
    if (!pk || !n.uid || (expectUid && n.uid !== expectUid)) return cb('mismatch');
    if (order.amount !== pk.rs * 100 || order.currency !== 'INR') return cb('amount');
    rzp('GET', '/v1/payments/' + encodeURIComponent(paymentId), null, (e2, s2, pay) => {
      if (e2 || s2 !== 200 || !pay || pay.order_id !== orderId || pay.amount !== order.amount) return cb('payment');
      const done = (p) => {
        if (p.status !== 'captured') return cb('notpaid');
        writePayment({ uid: n.uid, gems: pk.gems, amount: pk.rs, pack: n.pack, orderId, paymentId }, (e3, r) => {
          if (e3 || String(r).indexOf('err') === 0) return cb('save'); cb(null, { gems: pk.gems, dup: r === 'dup' });
        });
      };
      if (pay.status === 'authorized') rzp('POST', '/v1/payments/' + encodeURIComponent(paymentId) + '/capture', { amount: pay.amount, currency: 'INR' }, (e4, s4, p2) => done(e4 || s4 !== 200 ? pay : p2));
      else done(pay);
    });
  });
}
const orderLog = new Map();            // uid -> times, a small limit so nobody can spam orders
function orderOk(uid) { const t = Date.now(), a = (orderLog.get(uid) || []).filter((x) => t - x < 3600e3); if (a.length >= 15) return false; a.push(t); orderLog.set(uid, a); return true; }
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function readBody(req, cb) {
  let d = '', big = false;
  req.on('data', (c) => { d += c; if (d.length > 20000) { big = true; req.destroy(); } });
  req.on('end', () => { if (!big) cb(d); });
}
function sendJson(res, code, obj, origin) {
  const h = { 'Content-Type': 'application/json' };
  if (origin && ORIGINS.indexOf(origin) >= 0) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; }
  res.writeHead(code, h); res.end(JSON.stringify(obj));
}
function payRoute(req, res) {
  const path = req.url.split('?')[0], origin = req.headers.origin;
  if (req.method === 'OPTIONS') {
    const h = { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
    if (ORIGINS.indexOf(origin) >= 0) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; }
    res.writeHead(204, h); return res.end();
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'post' }, origin);
  if (!RZP_KEY || !RZP_SECRET) return sendJson(res, 503, { error: 'not_configured' }, origin);
  readBody(req, (raw) => {
    if (path === '/pay/webhook') {                                  // Razorpay tells us a payment was captured, even if the player closed the app
      if (!RZP_HOOK) return sendJson(res, 503, { error: 'no_webhook_secret' });
      const want = crypto.createHmac('sha256', RZP_HOOK).update(raw).digest('hex');
      if (!safeEq(want, req.headers['x-razorpay-signature'] || '')) return sendJson(res, 400, { error: 'sig' });
      let ev; try { ev = JSON.parse(raw); } catch (e) { return sendJson(res, 400, { error: 'json' }); }
      const pe = ev && ev.payload && ev.payload.payment && ev.payload.payment.entity;
      if (!pe || (ev.event !== 'payment.captured' && ev.event !== 'order.paid')) return sendJson(res, 200, { ok: true, ignored: true });
      return creditPayment(pe.order_id, pe.id, null, (err) => sendJson(res, err && err !== 'mismatch' ? 500 : 200, { ok: !err, err: err || undefined }));
    }
    let b; try { b = JSON.parse(raw); } catch (e) { return sendJson(res, 400, { error: 'json' }, origin); }
    verifyUser(b.token, (u) => {
      if (!u) return sendJson(res, 401, { error: 'login' }, origin);
      if (path === '/pay/order') {
        const pk = PACKS[b.pack]; if (!pk) return sendJson(res, 400, { error: 'pack' }, origin);
        if (!orderOk(u.uid)) return sendJson(res, 429, { error: 'slow_down' }, origin);
        rzp('POST', '/v1/orders', { amount: pk.rs * 100, currency: 'INR', receipt: ('vr' + Date.now().toString(36) + u.uid.slice(0, 8)).slice(0, 40), notes: { uid: u.uid, pack: b.pack } }, (err, st, o) => {
          if (err || st !== 200 || !o || !o.id) return sendJson(res, 502, { error: 'razorpay' }, origin);
          sendJson(res, 200, { order_id: o.id, amount: o.amount, key: RZP_KEY, gems: pk.gems }, origin);
        });
      } else if (path === '/pay/verify') {
        const oid = String(b.order_id || ''), pid = String(b.payment_id || '');
        const want = crypto.createHmac('sha256', RZP_SECRET).update(oid + '|' + pid).digest('hex');
        if (!safeEq(want, String(b.signature || ''))) return sendJson(res, 400, { error: 'sig' }, origin);
        creditPayment(oid, pid, u.uid, (err, r) => err ? sendJson(res, 400, { error: err }, origin) : sendJson(res, 200, { ok: true, gems: r.gems }, origin));
      } else sendJson(res, 404, { error: 'nope' }, origin);
    });
  });
}

/* ---------- http server ---------- */
const server = http.createServer((req, res) => {
  if (req.url.indexOf('/pay/') === 0) return payRoute(req, res);
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Viper Rush server is running. Rooms: ' + rooms.size + '\n');
});
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  onConnect(new Conn(socket, () => {}, () => {}));
});
server.listen(PORT, () => console.log('Viper Rush server on port ' + PORT));
