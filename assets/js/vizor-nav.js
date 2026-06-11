/* Vizor — mobile navigation.
   Injects a hamburger button + fullscreen menu built from the existing
   #mainNav links, so the menu stays in sync per page (active state and
   EN/ES data-attrs are cloned and keep working with vizor-lang.js).
   Self-contained: also injects its own styles with literal brand colors,
   so it works on pages that don't load vizor.css (vz-credits, sales-tool). */
(function () {
  var CSS = '' +
    '.nav-toggle{display:none;width:42px;height:42px;flex-direction:column;justify-content:center;align-items:center;gap:5px;background:transparent;border:1px solid rgba(255,255,255,.14);border-radius:2px;cursor:pointer;padding:0}' +
    '.nav-toggle span{display:block;width:18px;height:1.5px;background:#f5f3ef;transition:transform .3s ease,opacity .2s ease}' +
    'body.nav-open .nav-toggle span:nth-child(1){transform:translateY(6.5px) rotate(45deg)}' +
    'body.nav-open .nav-toggle span:nth-child(2){opacity:0}' +
    'body.nav-open .nav-toggle span:nth-child(3){transform:translateY(-6.5px) rotate(-45deg)}' +
    '.vz-mobile-menu{position:fixed;inset:0;z-index:95;background:rgba(10,10,10,.98);opacity:0;visibility:hidden;transition:opacity .35s ease,visibility .35s ease;display:flex;align-items:center;justify-content:center}' +
    'body.nav-open{overflow:hidden}' +
    'body.nav-open .vz-mobile-menu{opacity:1;visibility:visible}' +
    '.vz-mobile-menu-inner{display:flex;flex-direction:column;align-items:center;gap:30px;padding:24px;transform:translateY(12px);transition:transform .35s ease}' +
    'body.nav-open .vz-mobile-menu-inner{transform:none}' +
    '.vz-mobile-links{list-style:none;display:flex;flex-direction:column;align-items:center;gap:22px;margin:0;padding:0}' +
    '.vz-mobile-links a{font-family:"Bebas Neue",sans-serif;font-size:38px;letter-spacing:1px;color:#f5f3ef;text-decoration:none;transition:color .2s}' +
    '.vz-mobile-links a.active,.vz-mobile-links a:hover{color:#E8571E}' +
    '.vz-mobile-menu .nav-cta{font-family:"DM Sans",sans-serif;font-size:13px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#E8571E;border:1px solid #E8571E;padding:12px 30px;border-radius:2px;text-decoration:none;margin-top:8px;background:transparent}' +
    '@media(max-width:900px){.nav-toggle{display:flex}#mainNav .nav-cta{display:none}}' +
    '@media(min-width:901px){.vz-mobile-menu{display:none}}';

  function init() {
    var nav = document.getElementById('mainNav');
    if (!nav) return;

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.className = 'nav-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span></span><span></span><span></span>';
    nav.appendChild(btn);

    var menu = document.createElement('div');
    menu.className = 'vz-mobile-menu';
    var inner = document.createElement('div');
    inner.className = 'vz-mobile-menu-inner';

    var links = nav.querySelector('.nav-links');
    if (links) {
      var ul = links.cloneNode(true);
      ul.className = 'vz-mobile-links';
      inner.appendChild(ul);
    }
    var cta = nav.querySelector('.nav-cta');
    if (cta) inner.appendChild(cta.cloneNode(true));

    menu.appendChild(inner);
    document.body.appendChild(menu);

    function setOpen(open) {
      document.body.classList.toggle('nav-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('nav-open'));
    });
    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A' || e.target === menu) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) setOpen(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
