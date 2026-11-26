/* js/rtc.js
 * TEAM VOICE CHAT (WebRTC). Only players with the same TEAM CODE hear each other, during an online match.
 * The game server only passes the small "connection setup" messages (type 'rtc'); the voice itself goes straight
 * from phone to phone. The MIC button (lobby and in the match) is the speak on/off switch, the SOUND button mutes what you hear.
 *
 * If some players cannot hear each other (strict mobile networks), add a TURN server in config.js:
 *   iceServers: [{ urls: 'turn:YOUR_SERVER:3478', username: '...', credential: '...' }]
 *
 * API: VR.rtc.start(netStartMsg)   VR.rtc.stop()   VR.rtc.onMsg(msg)
 */
(function () {
  var peers = {}, me = '', audios = [], muteT = 0, unsub = false;

  function ice() {
    var l = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
    return (window.VR_CONFIG && VR_CONFIG.iceServers ? l.concat(VR_CONFIG.iceServers) : l);
  }
  function send(to, d) { VR.net.send({ t: 'rtc', to: to, d: d }); }
  function micTrack() { var s = VR.voice && VR.voice.stream; return s && s.getAudioTracks()[0] ? s.getAudioTracks()[0] : null; }
  function refreshTracks() { Object.keys(peers).forEach(function (id) { var p = peers[id]; if (p.sender) p.sender.replaceTrack(micTrack()).catch(function () {}); }); }

  function make(id) {
    var pc = new RTCPeerConnection({ iceServers: ice() });
    var p = peers[id] = { pc: pc, queue: [], ready: false, sender: null };
    var tr = pc.addTransceiver('audio', { direction: 'sendrecv' }); p.sender = tr.sender;
    if (micTrack()) p.sender.replaceTrack(micTrack()).catch(function () {});
    pc.onicecandidate = function (e) { if (e.candidate) send(id, { c: e.candidate }); };
    pc.ontrack = function (e) {
      var a = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline', ''); a.srcObject = e.streams[0] || new MediaStream([e.track]);
      a.style.display = 'none'; document.body.appendChild(a); audios.push(a); a.muted = VR.sound === false;
      var pr = a.play(); if (pr && pr.catch) pr.catch(function () {});
    };
    return p;
  }
  function flush(p) { p.ready = true; p.queue.forEach(function (c) { p.pc.addIceCandidate(c).catch(function () {}); }); p.queue = []; }

  function call(id) {                                        // the player with the smaller id starts the call
    var p = peers[id] || make(id);
    p.pc.createOffer().then(function (o) { return p.pc.setLocalDescription(o).then(function () { send(id, { sdp: p.pc.localDescription }); }); }).catch(function () {});
  }
  function onMsg(m) {
    var id = m.from, d = m.d; if (!id || !d || !peers[id] && !d.sdp) return;
    var p = peers[id] || make(id);
    if (d.sdp) {
      p.pc.setRemoteDescription(d.sdp).then(function () {
        flush(p);
        if (d.sdp.type === 'offer') return p.pc.createAnswer().then(function (a) { return p.pc.setLocalDescription(a).then(function () { send(id, { sdp: p.pc.localDescription }); }); });
      }).catch(function () {});
    } else if (d.c) { if (p.ready) p.pc.addIceCandidate(d.c).catch(function () {}); else p.queue.push(d.c); }
  }

  function start(net) {
    stop();
    if (!window.RTCPeerConnection || !net || !net.players) return;
    var self = net.players.filter(function (q) { return q.id === net.you; })[0];
    if (!self || !self.code) return;                         // not in a team: nobody to talk to
    me = net.you;
    net.players.forEach(function (q) {
      if (q.id !== me && q.code === self.code && me < q.id) {
        // the other phone may still be loading the match: try again if the call did not connect
        setTimeout(function () { call(q.id); }, 2500);
        setTimeout(function () { var p = peers[q.id]; if (p && p.pc.connectionState !== 'connected') call(q.id); }, 8000);
      }
    });
    if (!unsub) { unsub = true; VR.voice.onChange(function () { refreshTracks(); }); }
    muteT = setInterval(function () { audios.forEach(function (a) { a.muted = VR.sound === false; }); }, 800);
  }
  function stop() {
    clearInterval(muteT);
    Object.keys(peers).forEach(function (id) { try { peers[id].pc.close(); } catch (e) {} });
    peers = {}; audios.forEach(function (a) { try { a.srcObject = null; a.remove(); } catch (e) {} }); audios = [];
  }

  window.VR = window.VR || {};
  VR.rtc = { start: start, stop: stop, onMsg: onMsg, state: function () { return Object.keys(peers).map(function (id) { return peers[id].pc.connectionState; }); } };
})();
