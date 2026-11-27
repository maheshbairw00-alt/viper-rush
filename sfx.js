/* js/sfx.js
 * Sound effects made with the browser's Web Audio (no sound files needed): eating orbs, boost, kills (with combo), death,
 * healing, power-ups, warnings, victory. Volume / on-off are in SETTINGS -> SOUND.
 * API: VR.sfx.play(name, opts)   VR.sfx.boost(on)   VR.sfx.vibrate(pattern)
 *   names: eat coin golden power heal hurt kill die revive win warn
 */
(function () {
  var ac = null, master = null, bGain = null, bSrc = null, nbuf = null, last = {};
  function S(k) { return VR.settings ? VR.settings.get(k) : null; }
  function vol() { return S('sfx') ? Math.max(0, Math.min(1, (S('sfxVol') == null ? 80 : S('sfxVol')) / 100)) : 0; }
  function ctx() {
    if (!ac) {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      try { ac = new AC(); } catch (e) { return null; }
      master = ac.createGain(); master.gain.value = .9;
      var comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
      nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); var d = nbuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    return ac;
  }
  function tone(type, f0, f1, dur, gain, delay) {
    var t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, gain * vol()), t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  function hiss(dur, gain, freq, delay, q) {
    var t = ac.currentTime + (delay || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nbuf; f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = q || 1;
    g.gain.setValueAtTime(Math.max(.0002, gain * vol()), t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .05);
  }
  function gate(name, ms) { var n = Date.now(); if (last[name] && n - last[name] < ms) return false; last[name] = n; return true; }

  var SND = {
    eat: function () { if (!gate('eat', 55)) return; var r = Math.random() * 160; tone('sine', 560 + r, 900 + r, .07, .22); },
    coin: function () { if (!gate('coin', 60)) return; tone('triangle', 988, 988, .08, .25); tone('triangle', 1319, 1319, .14, .25, .07); },
    golden: function () { [660, 880, 1100, 1320, 1760].forEach(function (f, i) { tone('triangle', f, f, .22, .3, i * .07); }); },
    power: function () { tone('sawtooth', 220, 900, .35, .22); hiss(.3, .25, 2400, 0, 1.5); },
    heal: function () { tone('sine', 660, 660, .18, .3); tone('sine', 880, 880, .25, .3, .1); tone('sine', 1320, 1320, .35, .22, .2); },
    hurt: function () { if (!gate('hurt', 450)) return; tone('square', 150, 80, .12, .2); },
    kill: function (o) {
      var n = Math.max(1, (o && o.n) | 0), up = 1 + .14 * (n - 1);
      tone('sine', 170, 40, .3, .85); hiss(.18, .4, 900, 0, .8);
      tone('square', 720 * up, 240, .16, .32, .02);
      if (n > 1) { for (var i = 0; i < Math.min(n, 5); i++) tone('triangle', 520 * up * (1 + i * .25), 520 * up * (1 + i * .25), .12, .26, .12 + i * .07); }
    },
    die: function () { tone('sawtooth', 420, 55, .9, .5); hiss(.6, .4, 500, 0, .7); tone('sine', 120, 30, .8, .6, .05); },
    revive: function () { [392, 523, 659, 784].forEach(function (f, i) { tone('triangle', f, f, .2, .3, i * .09); }); },
    win: function () { [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone('triangle', f, f, .26, .34, i * .13); tone('sine', f / 2, f / 2, .3, .2, i * .13); }); },
    warn: function () { if (!gate('warn', 700)) return; tone('square', 880, 880, .09, .25); tone('square', 880, 880, .09, .25, .16); }
  };
  function play(name, o) { if (vol() <= 0) return; if (!ctx()) return; try { if (SND[name]) SND[name](o); } catch (e) {} }

  // boost: a rushing wind while the player boosts
  function boost(on) {
    if (!on && !bSrc) return;
    if (on && vol() <= 0) on = false;
    if (!ctx()) return;
    if (on && !bSrc) {
      bSrc = ac.createBufferSource(); bSrc.buffer = nbuf; bSrc.loop = true;
      var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = .7;
      bGain = ac.createGain(); bGain.gain.value = 0; bSrc.connect(f); f.connect(bGain); bGain.connect(master); bSrc.start();
    }
    if (bGain) bGain.gain.setTargetAtTime(on ? .22 * vol() : 0, ac.currentTime, .06);
    if (!on && bSrc) { var s = bSrc; bSrc = null; var g = bGain; bGain = null; setTimeout(function () { try { s.stop(); } catch (e) {} }, 400); }
  }
  function vibrate(p) { if (S('vibe') && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } }

  // phones only allow sound after a tap: wake the audio on the first touch
  document.addEventListener('pointerdown', function () { if (vol() > 0) ctx(); }, true);

  window.VR = window.VR || {};
  VR.sfx = { play: play, boost: boost, vibrate: vibrate };
})();
