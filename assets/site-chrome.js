/* Site chrome, loaded on every page as a module in <head>:
     <script type="module" src="../assets/site-chrome.js"></script>
   1. Room intro: when assets/desk-transition.js has marked this as the first page of the session
      (html.intro-on), load room/intro.js. It plays over whatever page was opened and lands on its #hash.
   2. Demo windows: imports assets/demo-window.js and calls its init().
   3. Same-page links (top bar, menu, section links, #hash jumps): the jump happens inside a same-document
      view transition, so a click plays the same desk swap as going to another page
      (assets/desk-transition.css). Plain scrolling never animates; reduced motion just jumps.
   4. Full-screen demos (swapchain/app/, continuum/hole/) opened on their own: the site's top bar
      (name, Demos, menu, theme switch) and a Back pill under it. The demo fills the rest of the screen.
      Nothing inside the apps changes: the layout is moved down with injected CSS only. */

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
if (DEMO_APP.test(location.pathname) && !embedded) {
  if (document.body) demoChrome(); else document.addEventListener('DOMContentLoaded', demoChrome, { once: true });
}

function demoChrome() {
  if (document.querySelector('.sc-chrome')) return;
  const hole = /continuum\/hole/.test(location.pathname);
  const style = document.createElement('style');
  style.textContent = `
html.sc-demo{--sc-bar:60px;--sc-back:46px;--sc-h:calc(var(--sc-bar) + var(--sc-back))}
@media (max-width:640px){html.sc-demo{--sc-bar:56px;--sc-back:44px}}
.sc-chrome{--b:#F6F1E6;--i:#0B0817;--y:#4A4363;--r:#D3CAB5;--a:#6D4FE8;--w:#c0632f;
  position:fixed;top:0;left:0;right:0;z-index:2147482000;height:var(--sc-h);
  font:500 15px/1.2 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:var(--i);
  -webkit-font-smoothing:antialiased;background:var(--b);border-bottom:1px solid var(--r);box-sizing:border-box}
html[data-theme="dark"] .sc-chrome{--b:#1C1B21;--i:#F4F2F7;--y:#C3BECF;--r:#3D3A47;--a:#AE9CFF;--w:#EE9A63}
@media (prefers-color-scheme:dark){html:not([data-theme="light"]) .sc-chrome{--b:#1C1B21;--i:#F4F2F7;--y:#C3BECF;--r:#3D3A47;--a:#AE9CFF;--w:#EE9A63}}
.sc-chrome *{box-sizing:border-box;margin:0;padding:0}
.sc-chrome a{color:inherit;text-decoration:none}
.sc-chrome :focus-visible{outline:2px solid var(--a);outline-offset:3px}
.sc-top{position:relative;height:var(--sc-bar);display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 clamp(16px,4vw,48px);max-width:1216px;margin:0 auto}
.sc-brand{display:flex;align-items:center;gap:10px;white-space:nowrap}
.sc-brand svg{width:26px;height:26px;flex:none}
.sc-brand span{font-size:13px;letter-spacing:.01em}
.sc-nav{display:flex;align-items:center;gap:20px}
.sc-links{display:flex;gap:20px}
.sc-links a{position:relative;padding:4px 0;white-space:nowrap}
.sc-links a::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:2px;background:var(--i);transform:scaleX(0);transform-origin:left;transition:transform .35s cubic-bezier(.22,1,.36,1)}
@media (hover:hover){.sc-links a:hover::after{transform:scaleX(1)}}
.sc-pill{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px 0 10px;border:1.5px solid var(--a);border-radius:999px;color:var(--a)!important;font-size:13px;font-weight:600;transition:background-color .2s,color .2s}
.sc-pill svg{width:9px;height:11px;fill:currentColor;flex:none}
@media (hover:hover){.sc-pill:hover{background:var(--a);color:var(--b)!important}}
.sc-menu-btn{display:none;align-items:center;gap:8px;background:none;border:1.5px solid var(--r);border-radius:999px;color:var(--i);height:30px;padding:0 12px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:500;line-height:1}
.sc-menu-btn i{display:block;width:14px;height:8px;border-top:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transition:transform .3s}
.sc-menu-btn[aria-expanded="true"] i{transform:scaleY(.25)}
.sc-toggle{background:none;border:1.5px solid var(--r);color:var(--i);border-radius:999px;width:58px;height:30px;position:relative;cursor:pointer;flex:none}
.sc-toggle i{position:absolute;top:4px;left:5px;width:19px;height:19px;border-radius:50%;background:var(--w);transition:transform .45s cubic-bezier(.22,1,.36,1),background .3s}
.sc-toggle[aria-pressed="true"] i{transform:translateX(26px);background:var(--a)}
.sc-toggle::after,.sc-menu-btn::after{content:"";position:absolute;inset:-8px 0}
.sc-menu-btn{position:relative}
.sc-menu{display:none;position:absolute;top:var(--sc-bar);left:0;right:0;background:var(--b);border-bottom:1px solid var(--r);padding:6px clamp(16px,4vw,48px) 14px;box-shadow:0 18px 30px -24px rgba(11,8,23,.5);max-height:calc(100dvh - var(--sc-bar));overflow-y:auto;z-index:2}
.sc-menu.open{display:grid}
.sc-menu a{display:flex;justify-content:space-between;align-items:baseline;padding:12px 2px;border-bottom:1px solid var(--r);font-weight:600;font-size:24px;letter-spacing:-.015em;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",Arial,sans-serif}
.sc-menu a:last-child{border-bottom:0}
.sc-menu a span{font-size:13px;font-weight:500;color:var(--a)}
.sc-backrow{height:var(--sc-back);display:flex;align-items:center;padding:0 clamp(16px,4vw,48px) 8px;max-width:1216px;margin:0 auto}
.sc-back{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 16px 0 12px;border-radius:999px;background:var(--i);color:var(--b)!important;font-size:14px;font-weight:600;letter-spacing:-.005em;transition:transform .2s cubic-bezier(.32,.72,0,1),opacity .2s}
.sc-back b{font-weight:600;font-size:16px;line-height:1}
@media (hover:hover){.sc-back:hover{opacity:.86}}
.sc-back:active{transform:scale(.96)}
@media (max-width:860px){.sc-links{display:none}.sc-menu-btn{display:inline-flex}}
@media (max-width:520px){.sc-nav{gap:10px}}
@media (max-width:640px){.sc-brand span{display:none}}
${hole
    ? `html.sc-demo .stage{top:var(--sc-h);height:calc(100vh - var(--sc-h))}
@supports (height:100svh){html.sc-demo .stage{height:calc(100svh - var(--sc-h))}}`
    : `html.sc-demo #app{top:var(--sc-h)}`}
`;
  document.head.appendChild(style);
  html.classList.add('sc-demo');

  const home = ROOT.href;
  const demos = new URL('demos/', ROOT).href;
  const sections = [['currently', 'Currently'], ['work', 'Work'], ['projects', 'Projects'], ['milan', 'Milan'], ['off', 'Off the clock'], ['contact', 'Contact']];
  const pill = `<a class="sc-pill" href="${demos}"><svg viewBox="0 0 11 13" aria-hidden="true"><path d="M0 0v13l11-6.5z"/></svg>Demos</a>`;

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
    <a class="sc-brand" href="${home}" aria-label="Ian Sabia, home">
      <svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0B0817"/><path d="M12 50 C 22 8, 44 6, 52 30" stroke="#9B85FF" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="52" cy="30" r="6" fill="#e08a55"/></svg>
      <span>Ian Sabia</span>
    </a>
    <nav class="sc-nav" aria-label="Site">
      ${pill}
      <span class="sc-links">${sections.map(([id, t]) => `<a href="${home}#${id}">${t}</a>`).join('')}</span>
      <button class="sc-menu-btn" type="button" aria-expanded="false" aria-controls="sc-menu">Menu <i aria-hidden="true"></i></button>
      <button class="sc-toggle" type="button" aria-label="Switch between light and dark"><i></i></button>
    </nav>
    <div class="sc-menu" id="sc-menu">
      <a href="${demos}">Demos <span aria-hidden="true">&nearr;</span></a>
      ${sections.map(([id, t], i) => `<a href="${home}#${id}">${t} <span>0${i + 1}</span></a>`).join('')}
    </div>
  </header>
  <div class="sc-backrow">
    <a class="sc-back" href="${from ? from.href : home}"><b aria-hidden="true">&larr;</b>${from ? 'Back' : 'Ian’s site'}</a>
  </div>`;
  document.body.prepend(bar);

  const back = bar.querySelector('.sc-back');
  if (from) {
    back.setAttribute('aria-label', 'Back to the page you came from');
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
  const isDark = () => {
    const t = html.getAttribute('data-theme');
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const sync = () => toggle.setAttribute('aria-pressed', isDark());
  sync();
  new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
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

// after demo-window.js, so its own same-page demo links (#demo and friends) are handled there first
demoWindow.finally(() => document.addEventListener('click', onClick));
