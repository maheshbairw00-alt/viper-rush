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
function verifyAdmin(tok, cb) {
  try {
    const [h, p, sig] = String(tok).split('.');
    const head = JSON.parse(Buffer.from(h, 'base64url')), pay = JSON.parse(Buffer.from(p, 'base64url'));
    if (pay.aud !== FB_PROJECT || pay.iss !== 'https://securetoken.google.com/' + FB_PROJECT || pay.exp * 1000 < Date.now() || head.alg !== 'RS256') return cb(false);
    getCerts((c) => {
      const cert = c && c[head.kid]; if (!cert) return cb(false);
      const ok = crypto.createVerify('RSA-SHA256').update(h + '.' + p).verify(cert, Buffer.from(sig, 'base64url'));
      cb(!!(ok && pay.email_verified !== false && ADMINS.indexOf(String(pay.email || '').toLowerCase()) >= 0));
    });
  } catch (e) { cb(false); }
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

/* ---------- http server ---------- */
const server = http.createServer((req, res) => {
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
