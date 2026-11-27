/* js/audio.js
 * Music. Lobby tunes in the lobby, and the Battle Ready tune during a match (faster in the final fight).
 *  - 5 free lobby tunes + 1 rare tune (Legend Awakens) for SEASON 1 members.
 *  - The player picks the tune, volume and on/off in SETTINGS -> SOUND.
 *  - Phones only allow sound after the first touch, so the music starts on the first tap.
 *
 * API: VR.music.sync(screenName)   VR.music.refresh()   VR.music.TRACKS   VR.music.find(id)   VR.music.allowed(track)
 */
(function () {
  var TRACKS = [
    { id: 'venom', n: 'Venom Pulse', f: 'tune_venom.mp3', note: 'Dark electronic' },
    { id: 'cobra', n: 'Royal Cobra', f: 'tune_cobra.mp3', note: 'Epic and royal' },
    { id: 'neon', n: 'Neon Slither', f: 'tune_neon.mp3', note: 'Bright synthwave' },
    { id: 'desert', n: 'Desert Hunt', f: 'tune_desert.mp3', note: 'Eastern strings' },
    { id: 'battle', n: 'Battle Ready', f: 'tune_battle.mp3', note: 'Hard trap' },
    { id: 'legend', n: 'Legend Awakens', f: 'tune_legend.mp3', note: 'Season 1 only', pass: true }
  ];

  var el = null, curId = '', screen = '', pending = false, fadeTimer = 0;

  function S(k) { return VR.settings ? VR.settings.get(k) : null; }
  function find(id) { for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].id === id) return TRACKS[i]; return null; }
  function allowed(t) { var u = (VR.auth && VR.auth.user) || (VR.lobby && VR.lobby.openUser && VR.lobby.openUser()); return !t.pass || !!(u && u.pass); }
  function chosen() { var t = find(S('tune')); return (t && allowed(t)) ? t : TRACKS[0]; }
  function target() { return S('music') ? Math.max(0, Math.min(1, S('musicVol') / 100)) * 0.85 : 0; }

  function fade(a, v, ms, done) {
    if (!a) { if (done) done(); return; }
    clearInterval(a._ft);
    var from = a.volume, t0 = Date.now();
    a._ft = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / ms);
      try { a.volume = Math.max(0, Math.min(1, from + (v - from) * k)); } catch (e) {}
      if (k >= 1) { clearInterval(a._ft); if (done) done(); }
    }, 40);
  }
  function fadeTo(v, ms, done) { fade(el, v, ms, done); }

  /* ---------- match music (plays during a match, a bit quieter so the sound effects are clear) ---------- */
  var mel = null, mpending = false, duckK = 1;
  function mtarget() { return target() * 0.55 * duckK; }
  function matchPlay() {
    if (!VR.settings || !S('music') || target() <= 0) { matchStop(); return; }
    if (!mel) { mel = new Audio(find('battle').f); mel.loop = true; mel.preload = 'auto'; mel.volume = 0; }
    var p; try { p = mel.play(); } catch (e) { p = null; }
    if (p && p.catch) p.catch(function () { mpending = true; });
    fade(mel, mtarget(), 900);
  }
  function matchStop() {
    mpending = false; if (!mel) return; var a = mel; fade(a, 0, 500, function () { if (screen !== 'game') { try { a.pause(); a.currentTime = 0; a.playbackRate = 1; } catch (e) {} } });
  }

  function ensure(t) {
    if (el && curId === t.id) return el;
    if (el) { try { el.pause(); } catch (e) {} }
    el = new Audio(t.f); el.loop = true; el.preload = 'auto'; el.volume = 0; curId = t.id;
    el.addEventListener('error', function () { pending = false; });
    return el;
  }

  function play() {
    if (!VR.settings) return;
    if (!S('music') || target() <= 0) { stop(); return; }
    var a = ensure(chosen()), p;
    try { p = a.play(); } catch (e) { p = null; }
    if (p && p.catch) p.catch(function () { pending = true; });      // blocked until the first tap
    fadeTo(target(), 700);
  }

  function stop() {
    pending = false;
    if (!el) return;
    var a = el;
    fadeTo(0, 400, function () { if (screen !== 'lobby') { try { a.pause(); } catch (e) {} } });
  }

  function sync(name) {
    screen = name; duckK = 1;
    if (name === 'lobby') play(); else stop();
    if (name === 'game') matchPlay(); else matchStop();
  }

  // called when volume / on-off / tune changes
  function refresh() {
    if (screen === 'game') { matchPlay(); return; }
    if (screen !== 'lobby') return;
    if (el && curId !== chosen().id) { var old = el; el = null; try { old.pause(); } catch (e) {} }
    play();
  }

  document.addEventListener('pointerdown', function () {
    if (pending && screen === 'lobby') { pending = false; play(); }
    if (mpending && screen === 'game') { mpending = false; matchPlay(); }
  }, true);
  document.addEventListener('visibilitychange', function () {
    if (!el && !mel) return;
    if (document.hidden) { try { el.pause(); } catch (e) {} if (mel) { try { mel.pause(); } catch (e) {} } }
    else if (screen === 'lobby') play(); else if (screen === 'game') matchPlay();
  });

  window.VR = window.VR || {};
  VR.music = {
    TRACKS: TRACKS, find: find, allowed: allowed, sync: sync, refresh: refresh,
    intensity: function (k) { if (mel) { try { mel.playbackRate = k ? 1.1 : 1; } catch (e) {} } },     // faster music in the final fight
    duck: function (k) { duckK = k; if (mel) fade(mel, mtarget(), 600); }                                // quieter on the result screen
  };
})();
