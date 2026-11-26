/* js/net.js
 * Connection to the Viper Rush game server (see the server folder).
 * If VR_CONFIG.serverUrl is empty the game works offline with bots, exactly like before.
 *
 * API: VR.net.enabled()
 *      VR.net.find(opts, cb)   opts = {name, skin, ch, ci, code, uid, room, cfg}   (room = custom room code, cfg = {max, world, startAt})
 *           cb = { wait(n, max, left), start(msg), solo(), fail(), cancel(), late() }
 *      VR.net.send(obj)   VR.net.close()   VR.net.onGame = function (msg) {}  (messages during the match)
 */
(function () {
  var ws = null, ping = 0, matched = false, failTimer = 0, cbs = null;

  function enabled() { return !!(VR_CONFIG.serverUrl && window.WebSocket); }
  function send(o) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); } catch (e) {} } }
  function close() {
    clearInterval(ping); clearTimeout(failTimer);
    if (ws) { var w = ws; ws = null; w.onmessage = w.onclose = w.onerror = null; try { w.close(); } catch (e) {} }
    matched = false;
  }
  function fail() { var c = cbs; close(); if (c && c.fail) c.fail(); }

  function find(opts, cb) {
    close(); cbs = cb;
    try { ws = new WebSocket(VR_CONFIG.serverUrl); } catch (e) { return fail(); }
    // a sleeping free server can need up to a minute to wake up
    failTimer = setTimeout(function () { if (!matched) fail(); }, 70000);
    ws.onopen = function () {
      send({ t: 'join', name: opts.name, skin: opts.skin, ch: opts.ch, ci: opts.ci, code: opts.code, uid: opts.uid, room: opts.room, cfg: opts.cfg });
      ping = setInterval(function () { send({ t: 'ping' }); }, 20000);
    };
    ws.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.t === 'wait') { if (cb.wait) cb.wait(m.n, m.max, m.left); }
      else if (m.t === 'start') { matched = true; clearTimeout(failTimer); cb.start(m); }
      else if (m.t === 'solo') { close(); if (cb.solo) cb.solo(); }
      else if (m.t === 'cancel') { close(); if (cb.cancel) cb.cancel(); }
      else if (m.t === 'late') { close(); if (cb.late) cb.late(); }
      else if (m.t === 'pong' || m.t === 'joined') { /* nothing */ }
      else if (net.onGame) net.onGame(m);
    };
    ws.onerror = function () { if (!matched) fail(); };
    ws.onclose = function () { if (!matched) fail(); else if (net.onGame) net.onGame({ t: 'closed' }); };
  }

  var net = { enabled: enabled, find: find, send: send, close: close, onGame: null };
  window.VR = window.VR || {};
  VR.net = net;
})();
