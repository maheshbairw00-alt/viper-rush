/* js/pay.js
 * BUY DIAMONDS (Razorpay). Opened by the + on the diamond chip.
 *  1. the game asks OUR server for an order  (the server decides the price from the pack name)
 *  2. the Razorpay window opens and the player pays with UPI / card
 *  3. the server checks the payment with Razorpay and writes a record in viperrush_payments
 *  4. this file takes the diamonds from that record (once only) and puts them in the account.
 * Keep the PACKS table in step with PACKS in server/server.js.
 * API: VR.pay.open()   VR.pay.sweep()  (sweep = collect any paid diamonds that are still waiting)
 */
(function () {
  var PACKS = [
    { id: 'd100', g: 100, rs: 90 }, { id: 'd300', g: 300, rs: 270 }, { id: 'd500', g: 500, rs: 450 },
    { id: 'd1000', g: 1000, rs: 900 }, { id: 'd2000', g: 2000, rs: 1800 }, { id: 'd3000', g: 3000, rs: 2000, best: 1 }
  ];
  var busy = false, sweeping = false;

  function $(id) { return document.getElementById(id); }
  function U() { return VR.auth && VR.auth.user; }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function base() { var s = (window.VR_CONFIG && VR_CONFIG.serverUrl) || ''; return s ? s.replace(/^ws/, 'http').replace(/\/+$/, '') : ''; }
  function real() { var u = U(); return !!(u && u.provider !== 'guest'); }

  function post(path, body) {
    return VR.auth.idToken().then(function (tok) {
      body.token = tok;
      return fetch(base() + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || 'error'); e.code = j.error; throw e; } return j; }); });
  }
  function loadRzp() {
    return new Promise(function (ok, no) {
      if (window.Razorpay) return ok();
      var s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = function () { ok(); }; s.onerror = function () { no(new Error('script')); };
      document.head.appendChild(s);
    });
  }

  /* ---------- take paid diamonds (safe to call many times: every payment is added only once) ---------- */
  function sweep() {
    var u = U(); if (!u || !real() || sweeping || !VR.auth.payList) return Promise.resolve(0);
    sweeping = true;
    return VR.auth.payList().then(function (list) {
      u.payDone = u.payDone || [];
      var add = 0, claim = [];
      list.forEach(function (p) {
        if (u.payDone.indexOf(p.id) < 0) { u.payDone.push(p.id); add += p.gems; }
        claim.push(p.id);
      });
      if (add) { u.gems = (u.gems || 0) + add; VR.auth.save(); if (VR.lobby && VR.lobby.refresh) VR.lobby.refresh(); }
      return Promise.all(claim.map(function (id) { return VR.auth.payClaim(id).catch(function () {}); })).then(function () {
        if (add && VR.ui) { if (VR.sfx) VR.sfx.play('win'); VR.ui.toast('+' + fmt(add) + ' diamonds added!'); }
        if (U() && $('sheet').classList.contains('on') && $('pbox').querySelector('#pyX')) render();
        return add;
      });
    }).catch(function () { return 0; }).then(function (n) { sweeping = false; return n; });
  }

  /* ---------- screen ---------- */
  function render() {
    var u = U(), h = '<div class="ph"><span>BUY DIAMONDS</span><button class="px" type="button" id="pyX">X</button></div><div class="pbody">' +
      '<div class="dbal">' + fmt(u.gems || 0) + ' 💎</div><div class="pks">' +
      PACKS.map(function (p) {
        return '<button type="button" class="pk1' + (p.best ? ' best' : '') + '" data-pack="' + p.id + '"' + (busy ? ' disabled' : '') + '>' + (p.best ? '<em>BEST VALUE</em>' : '') +
          '<span class="pg">💎</span><b>' + fmt(p.g) + '</b><small>&#8377;' + fmt(p.rs) + '</small></button>';
      }).join('') + '</div>' +
      '<p class="note">Pay safely with UPI, card or net banking (Razorpay). Diamonds arrive in a few seconds.</p>' +
      '<p class="note pyl"><a href="privacy.html" target="_blank">Privacy</a> &middot; <a href="terms.html" target="_blank">Terms</a> &middot; <a href="refund.html" target="_blank">Refunds</a></p></div>';
    $('pbox').innerHTML = h; $('sheet').classList.add('on');
  }
  function open() {
    if (!real()) return VR.ui.toast('Login with Google to buy diamonds');
    if (!base()) return VR.ui.toast('Store is offline right now');
    busy = false; render(); sweep();
  }

  function buy(id) {
    var p = PACKS.filter(function (x) { return x.id === id; })[0], u = U(); if (!p || busy) return;
    busy = true; render(); VR.ui.toast('Connecting... the first time can take up to a minute');
    Promise.all([loadRzp(), post('/pay/order', { pack: id })]).then(function (r) {
      var o = r[1], paid = false;
      return new Promise(function (done) {
        var rz = new window.Razorpay({
          key: o.key, amount: o.amount, currency: 'INR', order_id: o.order_id, name: 'Viper Rush', description: fmt(p.g) + ' diamonds',
          prefill: { name: u.name || '', email: u.email || '' }, theme: { color: '#7B3FF2' },
          handler: function (resp) { paid = true; done(resp); },
          modal: { ondismiss: function () { if (!paid) done(null); } }
        });
        rz.on('payment.failed', function () { VR.ui.toast('Payment failed. You were not charged. Try again.'); });
        rz.open();
      }).then(function (resp) {
        if (!resp) { busy = false; render(); return; }
        VR.ui.toast('Confirming your payment...');
        return post('/pay/verify', { order_id: resp.razorpay_order_id, payment_id: resp.razorpay_payment_id, signature: resp.razorpay_signature })
          .then(function () { return sweep(); })
          .catch(function () {
            VR.ui.modal({ title: 'PAYMENT RECEIVED', body: 'Your payment went through. The diamonds will be added automatically in a few minutes. Open the game again if they do not show.', actions: [{ label: 'OK', primary: true }] });
          }).then(function () { busy = false; render(); });
      });
    }).catch(function (e) {
      busy = false; render();
      VR.ui.toast(e && e.code === 'login' ? 'Please login again' : e && e.code === 'not_configured' ? 'Store is not ready yet' : 'Could not start the payment. Try again.');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('pbox').addEventListener('click', function (e) {
      if (!$('pbox').querySelector('#pyX')) return;
      var t = e.target.closest('button'); if (!t) return;
      if (t.id === 'pyX') { if (!busy) $('sheet').classList.remove('on'); }
      else if (t.dataset.pack) buy(t.dataset.pack);
    });
  });

  window.VR = window.VR || {};
  VR.pay = { open: open, sweep: sweep };
})();
