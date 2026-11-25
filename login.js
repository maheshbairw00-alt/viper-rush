/* js/login.js
 * Login with Google, Facebook or Guest.
 *
 * DEMO MODE (default): no server needed, creates a local player so you can test every screen.
 * REAL MODE: put your Firebase config in js/config.js and uncomment the two Firebase
 * <script> lines in index.html. Google and Facebook then open the real sign-in popup.
 *
 * API:  VR.auth.user   VR.auth.load()   VR.auth.login(provider)   VR.auth.logout()
 *       VR.login.init()  (wires the three buttons)
 */
(function () {
  var KEY = 'vr_user';

  function makeUser(name, provider, id, photo) {
    return {
      id: id || ('u' + Date.now().toString(36)),
      name: name || 'Player',
      provider: provider,
      photo: photo || null,
      level: 1, coins: 500, gems: 20
    };
  }

  function realLogin(provider) {
    var fb = window.firebase;
    if (!fb.apps.length) fb.initializeApp(VR_CONFIG.firebase);
    var p = provider === 'google' ? new fb.auth.GoogleAuthProvider() : new fb.auth.FacebookAuthProvider();
    return fb.auth().signInWithPopup(p).then(function (res) {
      var u = res.user;
      return makeUser(u.displayName, provider, u.uid, u.photoURL);
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
    save: function () { try { localStorage.setItem(KEY, JSON.stringify(auth.user)); } catch (e) {} },
    login: function (provider) {
      var useReal = provider !== 'guest' && VR_CONFIG.firebase && window.firebase;
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
          VR.ui.toast('Login failed. Please try again.');
          if (window.console) console.warn('login error', err);
        });
      });
    });
  }

  window.VR = window.VR || {};
  VR.auth = auth;
  VR.login = { init: init };
})();
