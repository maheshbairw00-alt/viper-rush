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
        return user;
      }).catch(function (e) { warn(e); return user; });                      // cloud problem: play with a local save
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
    // after reopening the app: take the newer copy (phone or cloud)
    pull: function () {
      var u = auth.user; if (!isReal(u)) return Promise.resolve(false);
      var ready = new Promise(function (res) { var off = fb().auth().onAuthStateChanged(function (x) { off(); res(x); }); });
      return ready.then(function (cu) { return cu && cu.uid === u.id ? cloudGet(u.id) : null; }).then(function (doc) {
        if (doc && doc.profile && (doc.profile.updatedAt || 0) > (u.updatedAt || 0)) {
          mergeProfile(u, doc.profile);
          try { localStorage.setItem(KEY, JSON.stringify(u)); } catch (e) {}
          if (VR.lobby && VR.lobby.refresh) VR.lobby.refresh();
          return true;
        }
        return false;
      }).catch(function (e) { warn(e); return false; });
    },
    login: function (provider) {
      var useReal = provider !== 'guest' && fbOn();
      var p = useReal ? realLogin(provider) : demoLogin(provider);
      return p.then(function (user) { auth.user = user; auth.save(); return user; });
    },
    logout: function () {
      auth.user = null;
      try { localStorage.removeItem(KEY); } catch (e) {}
      if (window.firebase && window.firebase.apps && window.firebase.apps.length) { try { window.firebase.auth().signOut(); } catch (e) {} }
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
