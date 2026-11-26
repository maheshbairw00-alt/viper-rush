/* js/login.js
 * Login with Google, Facebook or Guest + saving the player in the cloud.
 *
 * REAL MODE (when VR_CONFIG.firebase is set and the Firebase scripts loaded):
 *   - Google / Facebook open the real sign-in popup.
 *   - The player (coins, diamonds, skins, rank, missions, membership) and the friends/guild
 *     data are saved in Firestore: collection VR_CONFIG.cloudCollection, document = player id.
 *     Changing phone? Sign in again and everything comes back.
 * GUEST / DEMO MODE: no server needed, saved only on this phone (localStorage).
 *
 * If the cloud is not reachable (offline, security rules not set yet) the game keeps working
 * and saves on the phone only.
 *
 * API:  VR.auth.user   VR.auth.load()   VR.auth.save()   VR.auth.login(provider)   VR.auth.logout()
 *       VR.auth.saveSocial(obj)   VR.auth.pull()
 *       VR.login.init()  (wires the three buttons)
 */
(function () {
  var KEY = 'vr_user';

  function warn(e) { if (window.console) console.warn('cloud:', e && e.message ? e.message : e); }

  function makeUser(name, provider, id, photo) {
    return {
      id: id || ('u' + Date.now().toString(36)),
      name: name || 'Player',
      provider: provider,
      photo: photo || null,
      level: 1, coins: 500, gems: 20
    };
  }

  /* ---------- Firebase helpers ---------- */
  function fbOn() { return !!(VR_CONFIG.firebase && window.firebase && window.firebase.auth && window.firebase.firestore); }
  function fb() { var f = window.firebase; if (!f.apps.length) f.initializeApp(VR_CONFIG.firebase); return f; }
  function col() { return fb().firestore().collection(VR_CONFIG.cloudCollection || 'viperrush_users'); }
  function isReal(u) { return u && u.provider !== 'guest' && fbOn(); }

  var saveT = 0, socialT = 0;
  function cloudSave() {
    var u = auth.user;                                   // remember WHICH player this save belongs to
    if (!isReal(u)) return;
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      var data = JSON.parse(JSON.stringify(u)); delete data.id;
      col().doc(u.id).set({ profile: data }, { merge: true }).catch(warn);
    }, 1500);
  }
  function col2(name) { return fb().firestore().collection(name); }
  // Admin panel: gifts (diamonds / coins / XP) and bans are written to viperrush_admin/<player id>. The game applies them here.
  function applyGrants(user, d) {
    if (!d || !d.grants || !d.grants.length) return false;
    var done = user.grantsDone = user.grantsDone || [], changed = false;
    d.grants.forEach(function (g) {
      if (done.indexOf(g.id) >= 0) return;
      user.gems = Math.max(0, (user.gems || 0) + (g.gems || 0));
      user.coins = Math.max(0, (user.coins || 0) + (g.coins || 0));
      user.xp = Math.max(0, (user.xp || 0) + (g.xp || 0));
      done.push(g.id); changed = true;
    });
    if (done.length > 200) user.grantsDone = done.slice(-200);
    return changed;
  }
  function adminCheck(user) {                                // resolves true if something changed, rejects with vr/banned
    return col2('viperrush_admin').doc(user.id).get().then(function (a) {
      var d = a.exists ? a.data() : null;
      if (d && d.banned) { var e = new Error('banned'); e.code = 'vr/banned'; e.reason = d.banReason || ''; throw e; }
      return applyGrants(user, d);
    }).catch(function (e) { if (e && e.code === 'vr/banned') throw e; warn(e); return false; });
  }
  function cloudGet(uid) { return col().doc(uid).get().then(function (d) { return d.exists ? d.data() : null; }); }

  function mergeProfile(user, prof) {
    if (!prof) return;
    Object.keys(prof).forEach(function (k) { if (k !== 'id') user[k] = prof[k]; });
  }

  function realLogin(provider) {
    var f = fb();
    var p = provider === 'google' ? new f.auth.GoogleAuthProvider() : new f.auth.FacebookAuthProvider();
    return f.auth().signInWithPopup(p).then(function (res) {
      var u = res.user, user = makeUser(u.displayName, provider, u.uid, u.photoURL);
      return cloudGet(u.uid).then(function (doc) {
        if (doc && doc.profile) mergeProfile(user, doc.profile);          // welcome back: restore everything
        if (doc && doc.social) { try { localStorage.setItem('vr_social_' + u.uid, JSON.stringify(doc.social)); } catch (e) {} }
        user.provider = provider; user.photo = u.photoURL || user.photo || null;
        user.email = u.email || user.email || '';
        return user;
      }).catch(function (e) { warn(e); user.email = u.email || ''; return user; })  // cloud problem: play with a local save
        .then(function (usr) {
          return adminCheck(usr).then(function () { return usr; }, function (e) { try { f.auth().signOut(); } catch (x) {} throw e; });
        });
    });
  }

  function demoLogin(provider) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        var n = 1000 + Math.floor(Math.random() * 9000);
        var name = provider === 'guest' ? 'Guest_' + n : (provider === 'google' ? 'Google_' + n : 'Facebook_' + n);
        resolve(makeUser(name, provider));
      }, 900);
    });
  }

  var auth = {
    user: null,
    load: function () {
      try { auth.user = JSON.parse(localStorage.getItem(KEY)); } catch (e) { auth.user = null; }
      return auth.user;
    },
    save: function () {
      if (auth.user) auth.user.updatedAt = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify(auth.user)); } catch (e) {}
      cloudSave();
    },
    // friends / guild data from the lobby
    saveSocial: function (obj) {
      var u = auth.user;
      if (!isReal(u)) return;
      clearTimeout(socialT);
      socialT = setTimeout(function () {
        col().doc(u.id).set({ social: JSON.parse(JSON.stringify(obj)) }, { merge: true }).catch(warn);
      }, 1500);
    },
    // a player sends a report (shown in the admin panel)
    report: function (o) {
      var u = auth.user; if (!isReal(u)) return;
      o.byId = u.id; o.byName = u.name; o.ts = Date.now(); o.status = 'new';
      col2('viperrush_reports').add(o).catch(warn);
    },
    // after reopening the app: take the newer copy (phone or cloud)
    pull: function () {
      var u = auth.user; if (!isReal(u)) return Promise.resolve(false);
      var ready = new Promise(function (res) { var off = fb().auth().onAuthStateChanged(function (x) { off(); res(x); }); });
      return ready.then(function (cu) { return cu && cu.uid === u.id ? cloudGet(u.id) : null; }).then(function (doc) {
        var merged = false;
        if (doc && doc.profile && (doc.profile.updatedAt || 0) > (u.updatedAt || 0)) { mergeProfile(u, doc.profile); merged = true; }
        return adminCheck(u).then(function (gift) {
          if (merged || gift) {
            if (gift) auth.save(); else { try { localStorage.setItem(KEY, JSON.stringify(u)); } catch (e) {} }
            if (VR.lobby && VR.lobby.refresh) VR.lobby.refresh();
            if (gift && VR.ui) VR.ui.toast('You received a gift from the Viper Rush team!');
            return true;
          }
          return false;
        });
      }).catch(function (e) {
        if (e && e.code === 'vr/banned') { auth.logout(); if (VR.app) VR.app.go('login'); if (VR.ui) VR.ui.toast('This account is banned' + (e.reason ? ': ' + e.reason : '')); return false; }
        warn(e); return false;
      });
    },
    login: function (provider) {
      var useReal = provider !== 'guest' && fbOn();
      var p = useReal ? realLogin(provider) : demoLogin(provider);
      return p.then(function (user) { auth.user = user; auth.save(); return user; });
    },
    logout: function () {
      var u = auth.user, flush = Promise.resolve();
      if (isReal(u)) {                                   // send the latest progress to the cloud before leaving
        clearTimeout(saveT); clearTimeout(socialT);
        var data = JSON.parse(JSON.stringify(u)); delete data.id;
        flush = col().doc(u.id).set({ profile: data }, { merge: true }).catch(warn);
      }
      auth.user = null;
      try { localStorage.removeItem(KEY); } catch (e) {}
      return flush.then(function () {
        if (window.firebase && window.firebase.apps && window.firebase.apps.length) { try { window.firebase.auth().signOut(); } catch (e) {} }
      });
    }
  };

  function init() {
    var btns = Array.prototype.slice.call(document.querySelectorAll('#login .btn'));
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        var lbl = b.querySelector('.lbl'), old = lbl.textContent;
        btns.forEach(function (x) { x.disabled = true; });
        lbl.textContent = 'Signing in…';
        var sp = document.createElement('span'); sp.className = 'spin'; sp.setAttribute('aria-hidden', 'true');
        b.insertBefore(sp, lbl);
        function reset() { btns.forEach(function (x) { x.disabled = false; }); lbl.textContent = old; if (sp.parentNode) sp.remove(); }
        auth.login(b.getAttribute('data-provider')).then(function (user) {
          reset();
          VR.lobby.enter(user);
        }).catch(function (err) {
          reset();
          var code = err && err.code ? err.code : '';
          var msg = code === 'auth/unauthorized-domain' ? 'This website is not allowed yet in Firebase (add it to Authorized domains)'
            : code === 'auth/operation-not-allowed' ? 'This login is not turned on in Firebase yet'
            : code === 'auth/popup-closed-by-user' ? 'Login cancelled'
            : code === 'vr/banned' ? 'This account is banned' + (err.reason ? ': ' + err.reason : '')
            : code === 'auth/popup-blocked' ? 'Allow pop-ups for this site and try again'
            : 'Login failed. Please try again.';
          VR.ui.toast(msg);
          if (window.console) console.warn('login error', err);
        });
      });
    });
  }

  window.VR = window.VR || {};
  VR.auth = auth;
  VR.login = { init: init };
})();
