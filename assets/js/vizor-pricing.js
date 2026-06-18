/* Vizor — pricing loader.
   Single source of truth = assets/data/pricing.json
   Loads it at startup, exposes window.VizorPricing API, and falls back to a
   hardcoded snapshot if the fetch fails or the JSON is broken. The site never
   shows an empty calculator — the worst-case scenario is showing the previous
   pricing while logging the error to the console for the admin to fix. */

(function () {
  var URL = 'assets/data/pricing.json';

  // Fallback snapshot — keep in sync with pricing.json so the site is robust
  // against typos, broken commits or transient fetch failures.
  var FALLBACK = {
    entregables: [
      { id: 'interior',   vz: 10 },
      { id: 'exterior',   vz: 15 },
      { id: 'aerial',     vz: 20 },
      { id: 'anim_short', vz: 25 },
      { id: 'vr',         vz: 30 },
      { id: 'anim_long',  vz: 50 }
    ],
    planes: [
      { id: 'starter', vz: 50,  validez_dias: 60,
        ejemplo: [
          { cantidad: 2, entregable_id: 'interior' },
          { cantidad: 1, entregable_id: 'exterior' },
          { cantidad: 1, entregable_id: 'aerial' }
        ] },
      { id: 'pro', vz: 150, validez_dias: 90,
        ejemplo: [
          { cantidad: 6, entregable_id: 'interior' },
          { cantidad: 2, entregable_id: 'vr' },
          { cantidad: 1, entregable_id: 'aerial' }
        ] },
      { id: 'partner', vz: 300, validez_dias: 180,
        ejemplo: [
          { cantidad: 1,  entregable_id: 'anim_long' },
          { cantidad: 4,  entregable_id: 'vr' },
          { cantidad: 10, entregable_id: 'interior' }
        ] }
    ]
  };

  var data = FALLBACK;
  var ready = false;
  var pendingCallbacks = [];

  function indexBy(arr, key) {
    var out = {};
    arr.forEach(function (item) { out[item[key]] = item; });
    return out;
  }

  function apiFromData(d) {
    var entregablesById = indexBy(d.entregables, 'id');
    var planesById = indexBy(d.planes, 'id');
    return {
      entregables: d.entregables,
      planes: d.planes,
      getEntregable: function (id) { return entregablesById[id]; },
      getPlan: function (id) { return planesById[id]; },
      // Total cost of a plan example based on current item prices.
      planExampleTotal: function (planId) {
        var plan = planesById[planId];
        if (!plan || !plan.ejemplo) return 0;
        return plan.ejemplo.reduce(function (sum, line) {
          var item = entregablesById[line.entregable_id];
          return sum + (item ? line.cantidad * item.vz : 0);
        }, 0);
      },
      // Plan VZ range, e.g. "50–300" used in the hero stat.
      planRange: function () {
        var vzs = d.planes.map(function (p) { return p.vz; });
        return Math.min.apply(null, vzs) + '–' + Math.max.apply(null, vzs);
      }
    };
  }

  window.VizorPricing = apiFromData(FALLBACK);

  function publish(d) {
    data = d;
    window.VizorPricing = apiFromData(d);
    ready = true;
    pendingCallbacks.splice(0).forEach(function (cb) {
      try { cb(window.VizorPricing); } catch (e) { console.error('[VizorPricing] callback error', e); }
    });
  }

  window.onPricingReady = function (cb) {
    if (typeof cb !== 'function') return;
    if (ready) cb(window.VizorPricing);
    else pendingCallbacks.push(cb);
  };

  fetch(URL, { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (json) {
      if (!json || !Array.isArray(json.entregables) || !Array.isArray(json.planes)) {
        throw new Error('Invalid pricing.json shape');
      }
      publish(json);
    })
    .catch(function (err) {
      console.warn('[VizorPricing] using fallback snapshot — failed to load pricing.json:', err.message);
      publish(FALLBACK);
    });
})();
