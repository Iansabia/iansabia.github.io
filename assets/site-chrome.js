/* Site chrome, loaded on every page as a module in <head>:
     <script type="module" src="../assets/site-chrome.js"></script>
   1. Room intro: when assets/desk-transition.js has marked this as the first page of the session
      (html.intro-on), load room/intro.js. It plays over whatever page was opened and lands on its #hash.
   2. Demo windows: imports assets/demo-window.js and calls its init().
   3. Same-page links (top bar, menu, section links, #hash jumps): the jump happens inside a same-document
      view transition, so a click plays the same desk swap as going to another page
      (assets/desk-transition.css). Plain scrolling never animates; reduced motion just jumps.
   4. Full-screen demos (swapchain/app/, continuum/hole/) opened on their own: the site's top bar
      (name, Currently, Work, the Projects pill, Milan, Off the clock, Contact, menu, theme switch) and a Back pill under it. The demo fills the rest of the screen.
      Nothing inside the apps changes: the layout is moved down with injected CSS only.
   5. Replay intro: the same button as the home page's, added to the top bar of every other page.
   6. External links: every link to another site (and to the Continuum product site at /continuum-caddy/) opens in
      a new tab with rel="noopener noreferrer" and a visually hidden "(opens in a new tab)" for screen readers.
      Set at load, on links added later, and once more at click time. mailto: and tel: links are left alone. */

const html = document.documentElement;
const ROOT = new URL('../', import.meta.url);          // the site root
const framed = window.top !== window;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- 1. room intro
if (html.classList.contains('intro-on')) {
  import(new URL('room/intro.js', ROOT).href).catch(() => html.classList.remove('intro-on'));
}

// ---------------------------------------------------------------- 4. demo chrome
const DEMO_APP = /\/(swapchain\/app|continuum\/hole)\/?(index\.html)?$/;
const embedded = framed || html.classList.contains('embed') || /[?&]embed\b/.test(location.search);
// the site is light unless the visitor picked dark; the apps follow the system setting when nothing is
// stored, so store the site default before their modules run (this module comes first in <head>)
if (DEMO_APP.test(location.pathname) && !/[?&]theme=/.test(location.search)) {
  try {
    const t = localStorage.getItem('theme');
    if (t !== 'light' && t !== 'dark') { localStorage.setItem('theme', 'light'); html.setAttribute('data-theme', 'light'); }
  } catch (e) { /* no storage: the app decides */ }
}
if (DEMO_APP.test(location.pathname) && !embedded) {
  if (document.body) demoChrome(); else document.addEventListener('DOMContentLoaded', demoChrome, { once: true });
}

function demoChrome() {
  if (document.querySelector('.sc-chrome')) return;
  const hole = /continuum\/hole/.test(location.pathname);
  const style = document.createElement('style');
  style.textContent = `
html.sc-demo{--sc-bar:64px;--sc-h:var(--sc-bar)}
@media (max-width:600px){html.sc-demo{--sc-bar:60px}}
.sc-chrome{--b:#F6F1E6;--t:#ECE5D6;--i:#0B0817;--y:#4A4363;--r:#D3CAB5;--a:#A84B22;--w:#C0632F;--l:#6D4FE8;
  position:fixed;top:0;left:0;right:0;z-index:2147482000;height:var(--sc-h);
  font:500 15px/1.2 "Instrument Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;letter-spacing:-.005em;color:var(--i);
  -webkit-font-smoothing:antialiased;font-synthesis:none;background:var(--b);border-bottom:1px solid var(--r);box-sizing:border-box}
html[data-theme="dark"] .sc-chrome{--b:#0B0817;--t:#15102A;--i:#EFEAF8;--y:#A79FBF;--r:#2A2342;--a:#E8916A;--w:#E08A5C;--l:#9B85FF}
.sc-chrome *{box-sizing:border-box;margin:0;padding:0}
.sc-chrome a{color:inherit;text-decoration:none}
.sc-chrome :focus-visible{outline:2px solid var(--l);outline-offset:3px;border-radius:4px}
.sc-top{position:relative;height:var(--sc-bar);display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 clamp(16px,4vw,52px);max-width:1304px;margin:0 auto}
.sc-left{display:flex;align-items:center;gap:12px;min-width:0}
.sc-brand{display:flex;align-items:center;gap:9px;white-space:nowrap;font-size:17px;letter-spacing:-.01em}
.sc-brand svg{width:24px;height:24px;flex:none;border-radius:8px}
html[data-theme="dark"] .sc-brand svg rect{fill:#1B1533}
html[data-theme="dark"] .sc-brand svg{box-shadow:0 0 0 1px var(--r)}
.sc-nav{display:flex;align-items:center;gap:4px}
.sc-links{display:flex;gap:4px}
.sc-links a{position:relative;display:inline-flex;align-items:center;min-height:36px;padding:7px 12px;border-radius:999px;color:var(--y);white-space:nowrap;transition:background-color .2s,color .2s}
@media (hover:hover){.sc-links a:hover{color:var(--i);background:var(--t)}}
.sc-pill{position:relative;display:inline-flex;align-items:center;gap:7px;margin:0 6px;padding:9px 16px 10px 14px;border-radius:999px;background:var(--i);color:var(--b)!important;font-size:14px;line-height:1;white-space:nowrap;transition:background-color .3s,color .3s,transform .25s cubic-bezier(.22,1,.36,1)}
.sc-pill::before{content:"";position:absolute;inset:-5px 0}
.sc-pill svg{width:8px;height:10px;fill:currentColor;flex:none}
@media (hover:hover){.sc-pill:hover{background:var(--w);color:#fff!important;transform:translateY(-1px)}}
.sc-menu-btn{position:relative;display:none;align-items:center;gap:7px;background:none;border:0;box-shadow:inset 0 0 0 1px var(--r);border-radius:999px;color:var(--i);height:36px;padding:0 14px 0 12px;cursor:pointer;font:inherit;font-size:14px;line-height:1}
@media (hover:hover){.sc-menu-btn:hover{background:var(--t);box-shadow:inset 0 0 0 1px var(--i)}}
.sc-menu-btn i{display:block;width:14px;height:8px;border-top:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transition:transform .3s}
.sc-menu-btn[aria-expanded="true"] i{transform:scaleY(.25)}
.sc-toggle{position:relative;display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:50%;background:none;color:var(--i);cursor:pointer;flex:none;opacity:.85;transition:opacity .2s,transform .3s cubic-bezier(.22,1,.36,1)}
.sc-toggle i{display:block;width:14px;height:14px;border-radius:50%;border:1.5px solid currentColor;background:linear-gradient(90deg,currentColor 50%,transparent 50%)}
.sc-toggle[aria-pressed="true"] i{background:linear-gradient(270deg,currentColor 50%,transparent 50%)}
@media (hover:hover){.sc-toggle:hover{opacity:1;transform:rotate(25deg)}}
.sc-toggle::after,.sc-menu-btn::after{content:"";position:absolute;inset:-4px}
.sc-menu{display:none;position:absolute;top:var(--sc-bar);left:0;right:0;background:var(--b);border-bottom:1px solid var(--r);padding:4px clamp(16px,4vw,52px) 16px;box-shadow:0 22px 44px -30px rgba(11,8,23,.55);max-height:calc(100dvh - var(--sc-bar));overflow-y:auto;z-index:2}
.sc-menu.open{display:grid}
.sc-menu a{display:flex;justify-content:space-between;align-items:baseline;min-height:56px;padding:14px 2px;border-bottom:1px solid var(--r);font-size:26px;letter-spacing:-.025em}
.sc-menu a:last-child{border-bottom:0}
.sc-menu a span{font:500 11px/1 "JetBrains Mono",ui-monospace,Menlo,monospace;letter-spacing:.1em;color:var(--a)}
.sc-back{position:relative;display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px 0 13px;white-space:nowrap;flex:none;border-radius:999px;box-shadow:inset 0 0 0 1px var(--r);color:var(--i)!important;font-size:14px;transition:background-color .2s,box-shadow .2s}
.sc-back::after{content:"";position:absolute;inset:-4px 0}
.sc-back b{font-weight:500;font-size:15px;line-height:1}
@media (hover:hover){.sc-back:hover{background:var(--t);box-shadow:inset 0 0 0 1px var(--i)}}
.sc-back:active{transform:scale(.97)}
@media (max-width:980px){.sc-links{display:none}.sc-menu-btn{display:inline-flex}.sc-nav{gap:6px}.sc-pill{margin:0}}
@media (max-width:640px){.sc-brand span{display:none}}
@media (max-width:420px){.sc-menu-btn{width:40px;padding:0;justify-content:center;font-size:0;gap:0}.sc-left{gap:8px}}
@media (max-width:400px){.sc-back{width:40px;padding:0;justify-content:center}.sc-back span{display:none}}
${hole
    ? `html.sc-demo .stage{top:var(--sc-h);height:calc(100vh - var(--sc-h))}
@supports (height:100svh){html.sc-demo .stage{height:calc(100svh - var(--sc-h))}}`
    : `html.sc-demo #app{top:var(--sc-h)}`}
`;
  document.head.appendChild(style);
  if (!document.querySelector('link[href*="family=Instrument+Sans"]')) {
    const f = document.createElement('link');
    f.rel = 'stylesheet';
    f.href = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500&family=JetBrains+Mono:wght@500&display=swap';
    document.head.appendChild(f);
  }
  html.classList.add('sc-demo');

  const home = ROOT.href;
  // the same bar as every page: Currently, Work, Projects (the pill), Milan, Off the clock, Contact.
  // Work and Projects are their own pages; the rest are sections of the home page.
  const items = [[home + '#currently', 'Currently'], [new URL('work/', ROOT).href, 'Work'], [new URL('projects/', ROOT).href, 'Projects'],
    [home + '#milan', 'Milan'], [home + '#off', 'Off the clock'], [home + '#contact', 'Contact']];
  const link = ([href, t]) => `<a href="${href}">${t}</a>`;
  const pill = `<a class="sc-pill" href="${items[2][0]}"><svg viewBox="0 0 11 13" aria-hidden="true"><path d="M0 0v13l11-6.5z"/></svg>Projects</a>`;

  // where Back goes: the page on this site the visitor came from, else the home page
  let from = null;
  try {
    const r = new URL(document.referrer);
    if (r.origin === location.origin && r.pathname !== location.pathname) from = r;
  } catch (e) { /* no referrer */ }

  const bar = document.createElement('div');
  bar.className = 'sc-chrome';
  bar.innerHTML = `
  <header class="sc-top">
    <div class="sc-left">
    <a class="sc-back" href="${from ? from.href : home}" aria-label="${from ? 'Back to the page you came from' : 'Back to Ian’s site'}"><b aria-hidden="true">&larr;</b><span>${from ? 'Back' : 'Ian’s site'}</span></a>
    <a class="sc-brand" href="${home}" aria-label="Ian Sabia, home">
      <svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0B0817"/><path d="M12 50 C 22 8, 44 6, 52 30" stroke="#9B85FF" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="52" cy="30" r="6" fill="#e08a55"/></svg>
      <span>Ian Sabia</span>
    </a>
    </div>
    <nav class="sc-nav" aria-label="Site">
      <span class="sc-links">${items.slice(0, 2).map(link).join('')}</span>
      ${pill}
      <span class="sc-links">${items.slice(3).map(link).join('')}</span>
      <button class="sc-menu-btn" type="button" aria-expanded="false" aria-controls="sc-menu">Menu <i aria-hidden="true"></i></button>
      <button class="sc-toggle" type="button" aria-label="Switch between light and dark"><i></i></button>
    </nav>
    <div class="sc-menu" id="sc-menu">
      ${items.map(([href, t], i) => `<a href="${href}">${t} <span>0${i + 1}</span></a>`).join('')}
    </div>
  </header>`;
  document.body.prepend(bar);

  const back = bar.querySelector('.sc-back');
  if (from) {
    // the page we came from is the entry right behind this one: going back keeps its scroll and state
    back.addEventListener('click', (e) => {
      if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (history.length > 1) { e.preventDefault(); history.back(); }
    });
  }

  const menuBtn = bar.querySelector('.sc-menu-btn'), menu = bar.querySelector('.sc-menu');
  const setMenu = (open) => { menu.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', open); };
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); setMenu(!menu.classList.contains('open')); });
  document.addEventListener('pointerdown', (e) => { if (menu.classList.contains('open') && !bar.contains(e.target)) setMenu(false); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('open')) { setMenu(false); menuBtn.focus(); } });

  // theme: the app's own switch when it has one (it recolors its 3D), else the site's way
  const toggle = bar.querySelector('.sc-toggle');
  const isDark = () => html.getAttribute('data-theme') === 'dark';   // the site is light unless dark was picked
  const sync = () => toggle.setAttribute('aria-pressed', isDark());
  sync();
  new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  toggle.addEventListener('click', () => {
    const want = isDark() ? 'light' : 'dark';
    const own = document.getElementById('theme-btn');
    if (own) own.click();
    if (isDark() !== (want === 'dark')) html.setAttribute('data-theme', want);
    try { localStorage.setItem('theme', want); } catch (e) { /* optional */ }
    sync();
  });

  // the apps size themselves from the window; a resize after the bar is in makes them measure again
  requestAnimationFrame(() => dispatchEvent(new Event('resize')));
}

// ---------------------------------------------------------------- 2. demo windows (assets/demo-window.js, Builder DEMOS)
const demoWindow = import(new URL('demo-window.js', import.meta.url).href)
  .then((m) => { const f = m.init || m.default; if (typeof f === 'function') f(); })
  .catch(() => { /* the links just navigate */ });

// ---------------------------------------------------------------- 3. same-page links get the desk swap
function revealNow() {
  // blocks that fade in on scroll: show the ones on screen at once, so the new snapshot is the finished page
  const shown = [];
  document.querySelectorAll('.reveal:not(.in), .rule:not(.in)').forEach((n) => {
    const r = n.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) { n.style.transition = 'none'; n.classList.add('in'); shown.push(n); }
  });
  return shown;
}

function onClick(e) {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
  if (a.origin !== location.origin || a.pathname !== location.pathname || a.search !== location.search) return;
  if (a.getAttribute('href') === '#') return;             // script buttons
  let id = '';
  try { id = decodeURIComponent(a.hash.slice(1)); } catch (err) { return; }
  const t = id ? document.getElementById(id) : null;
  if (id && !t) return;
  if (!document.startViewTransition || reduced() || framed || html.classList.contains('intro-on')) return; // plain jump

  e.preventDefault();
  const above = t ? t.getBoundingClientRect().top < 0 : scrollY > 0;
  if (above) html.setAttribute('data-dt-back', '');
  let shown = [];
  const jump = () => {
    const sb = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    try {
      if (t) {
        if (location.hash !== a.hash) location.hash = a.hash;   // :target, hashchange and a history entry
        t.scrollIntoView({ block: 'start', behavior: 'instant' });
      } else {
        if (location.hash) history.pushState(history.state, '', location.pathname + location.search);
        scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
    } finally { html.style.scrollBehavior = sb; }
    shown = revealNow();
  };
  let vt;
  try { vt = document.startViewTransition(jump); } catch (err) { html.removeAttribute('data-dt-back'); jump(); return; }
  const no = () => {};
  vt.ready.catch(no);
  vt.updateCallbackDone.catch(no);
  const done = () => { html.removeAttribute('data-dt-back'); shown.forEach((n) => { n.style.transition = ''; }); };
  vt.finished.then(done, done);
}

// ---------------------------------------------------------------- 5. Replay intro in every top bar
// The home page has its own button; every other page with the site bar gets the same one before the theme switch.
function addReplay() {
  if (framed || document.getElementById('replayIntro')) return;
  const toggle = document.querySelector('header.top nav #theme');
  if (!toggle) return;
  const b = document.createElement('button');
  b.className = 'replay'; b.id = 'replayIntro'; b.type = 'button'; b.setAttribute('aria-label', 'Replay intro');
  b.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.3 4.2A4.2 4.2 0 1 1 1.9 7.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M1.2 1.4v3.3h3.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Replay intro</span>';
  const replay = () => import(new URL('room/intro.js', ROOT).href).then((m) => m.playIntro({ force: true })).catch(() => { location.href = new URL('room/', ROOT).href; });
  b.addEventListener('click', replay);
  toggle.before(b);
  // phones hide the bar button; the menu gets the same Replay intro link the home page has
  const menu = document.getElementById('menu');
  if (menu && !document.getElementById('replayIntroMenu')) {
    const m = document.createElement('a');
    m.className = 'menu-replay'; m.id = 'replayIntroMenu'; m.href = new URL('room/', ROOT).href; m.setAttribute('data-demo', 'off');
    m.innerHTML = 'Replay intro <svg class="ri" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.3 4.2A4.2 4.2 0 1 1 1.9 7.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M1.2 1.4v3.3h3.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    m.addEventListener('click', (e) => {
      if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      replay();
    });
    menu.appendChild(m);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addReplay, { once: true }); else addReplay();

// after demo-window.js, so its own same-page demo links (#demo and friends) are handled there first
demoWindow.finally(() => document.addEventListener('click', onClick));

// ---------------------------------------------------------------- 6. external links open in a new tab
const PRODUCT = /^\/continuum-caddy(\/|$)/;   // the product site lives on this origin but is not this site
function isExternal(a) {
  if (!/^https?:$/.test(a.protocol)) return false;   // mailto:, tel:, javascript: stay as they are
  return a.origin !== location.origin || PRODUCT.test(a.pathname);
}
function markExternal(a) {
  if (a.__xl || !isExternal(a)) return;
  a.__xl = true;
  a.target = '_blank';
  const rel = new Set((a.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
  rel.add('noopener'); rel.add('noreferrer');
  a.setAttribute('rel', [...rel].join(' '));
  if (!a.querySelector('.xl-sr')) {
    // a plain text link with no arrow of its own gets a small one, in the link's own color
    const text = a.textContent || '';
    if (!a.children.length && !/[\u2197\u2192\u2190\u2193]/.test(text) && text.trim()) {
      const ic = document.createElement('span');
      ic.className = 'xl-ic'; ic.setAttribute('aria-hidden', 'true'); ic.textContent = '\u2197';
      a.appendChild(ic);
    }
    const sr = document.createElement('span');
    sr.className = 'xl-sr'; sr.textContent = ' (opens in a new tab)';
    a.appendChild(sr);
  }
}
function markAll(node) {
  if (!node || !node.querySelectorAll) return;
  if (node.matches && node.matches('a[href]')) markExternal(node);
  node.querySelectorAll('a[href]').forEach(markExternal);
}
(function externalLinks() {
  const st = document.createElement('style');
  st.textContent = '.xl-sr{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}' +
    '.xl-ic{display:inline-block;margin-left:.2em;font-size:.85em;line-height:1;opacity:.7;text-decoration:none;vertical-align:.05em}';
  document.head.appendChild(st);
  const run = () => {
    markAll(document.body);
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1 && !n.classList.contains('xl-ic') && !n.classList.contains('xl-sr')) markAll(n); })))
      .observe(document.body, { childList: true, subtree: true });
  };
  if (document.body && document.readyState !== 'loading') run(); else document.addEventListener('DOMContentLoaded', run, { once: true });
  // last line of defense: a link that slipped past still opens in a new tab (runs before the demo window and the desk swap look at it)
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && isExternal(a) && a.target !== '_blank') markExternal(a), (a.target = '_blank');
  }, true);
})();
