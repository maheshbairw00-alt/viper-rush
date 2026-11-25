/* js/voice.js
 * Microphone for the squad voice chat.
 *
 * WHAT WORKS NOW: asks mic permission, turns the mic on/off, measures how loud you are
 * (used for the glowing MIC button and the green dot).
 *
 * WHAT YOU ADD LATER: to let teammates HEAR each other, send `VR.voice.stream` to the
 * other 3 players with a voice service (Agora, Photon Voice, Vivox, or WebRTC + your own
 * signalling server). Look for the TODO below.
 *
 * API:  VR.voice.toggle() -> Promise<boolean isOn>
 *       VR.voice.isOn()   VR.voice.level() (0..1)   VR.voice.onChange(fn)
 */
(function () {
  var stream = null, audioCtx = null, analyser = null, data = null, on = false, listeners = [];

  function emit() { listeners.forEach(function (fn) { try { fn(on); } catch (e) {} }); }

  function init() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no-mic-api'));
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(function (s) {
        stream = s;
        var AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
        var src = audioCtx.createMediaStreamSource(s);
        analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
        src.connect(analyser);
        data = new Uint8Array(analyser.frequencyBinCount);
        VR.voice.stream = s;
        // TODO (multiplayer): publish `s` to your voice service here, e.g.
        //   agoraClient.publish(s)   or   peerConnection.addTrack(s.getAudioTracks()[0], s)
      });
  }

  function setOn(v) {
    on = v;
    if (stream) stream.getAudioTracks().forEach(function (t) { t.enabled = v; });
    if (audioCtx && audioCtx.state === 'suspended' && v) audioCtx.resume();
    emit();
  }

  function toggle() {
    if (!stream) {
      return init().then(function () { setOn(true); return true; })
        .catch(function () { setOn(false); return false; });
    }
    setOn(!on);
    return Promise.resolve(on);
  }

  function level() {
    if (!analyser || !on) return 0;
    analyser.getByteFrequencyData(data);
    var s = 0; for (var i = 0; i < data.length; i++) s += data[i];
    return Math.min(1, s / data.length / 90);
  }

  window.VR = window.VR || {};
  VR.voice = {
    stream: null,
    toggle: toggle,
    isOn: function () { return on; },
    level: level,
    onChange: function (fn) { listeners.push(fn); }
  };
})();
