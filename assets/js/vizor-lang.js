/* Vizor — unified EN/ES language switcher.
   Supports three translation formats used across the site:
     - [data-en] / [data-es]            → innerHTML swap
     - [data-en-html] / [data-es-html]  → innerHTML swap (alias)
     - [data-i] keyed into window.vizorT = { en:{...}, es:{...} } → textContent
   Persists choice in localStorage and exposes window.setLang. Pages can define
   window.onLangChange to run a callback (e.g. vz-credits re-renders the calc). */

(function () {
  var STORAGE_KEY = 'vz-lang';
  var DEFAULT = 'en';

  function applyButtons(l) {
    var en = document.getElementById('btn-en');
    var es = document.getElementById('btn-es');
    if (en) en.classList.toggle('active', l === 'en');
    if (es) es.classList.toggle('active', l === 'es');
  }

  function applyDataEn(l) {
    document.querySelectorAll('[data-en]').forEach(function (el) {
      var val = el.getAttribute('data-' + l);
      if (val !== null) el.innerHTML = val;
    });
  }

  function applyDataEnHtml(l) {
    document.querySelectorAll('[data-en-html]').forEach(function (el) {
      var val = l === 'es' ? (el.dataset.esHtml || el.dataset.enHtml) : el.dataset.enHtml;
      if (val) el.innerHTML = val;
    });
  }

  function applyDataI(l) {
    var T = window.vizorT;
    if (!T || !T[l]) return;
    document.querySelectorAll('[data-i]').forEach(function (el) {
      var key = el.getAttribute('data-i');
      if (T[l][key] != null) el.textContent = T[l][key];
    });
  }

  function setLang(l) {
    if (l !== 'en' && l !== 'es') l = DEFAULT;
    document.documentElement.lang = l;
    applyButtons(l);
    applyDataEn(l);
    applyDataEnHtml(l);
    applyDataI(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch (e) {}
    if (typeof window.onLangChange === 'function') window.onLangChange(l);
  }

  // Expose globally so existing onclick="setLang('es')" handlers keep working.
  window.setLang = setLang;

  // Restore saved preference on load.
  function init() {
    var saved = DEFAULT;
    try { saved = localStorage.getItem(STORAGE_KEY) || DEFAULT; } catch (e) {}
    setLang(saved);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
