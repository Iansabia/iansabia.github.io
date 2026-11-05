/* Demo window: demos open in a large framed window over the current page instead of leaving it.
   site-chrome.js imports this on every page and calls init(). Calling init() twice is safe.

   Which links:
   - any <a data-demo> (optional data-demo-title="..." for the window title)
   - links to the full demo apps (swapchain/app/, continuum/hole/, room/) on any page, marked or not
   - a link to an anchor on this same page never opens a window: site-chrome.js scrolls there with the
     desk swap (plain jump under reduced motion)

   The window: a modal <dialog> (focus is trapped, the page behind is inert, Esc closes, focus goes
   back to the link) with a Back bar, a close button and an "Open full screen" link. Opening pushes a
   history entry, so the browser Back button closes the window. The page behind does not scroll.
   Never runs inside a frame: a page shown in the window just navigates normally.

   The same window can also hold a piece of this page instead of a frame: window.__dwOpenNode({...})
   (set by init()) moves a node in with mount(host), and on close calls unmount() to put it back.
   The SwapChain film (assets/swapfilm.js) plays this way, so there is only ever one video. */

const APPS = [/\/swapchain\/app\/?(index\.html)?$/, /\/continuum\/hole\/?(index\.html)?$/, /\/room\/?(index\.html)?$/];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let dlg, box, frameWrap, titleEl, subEl, fullLink, backBtn, closeBtn, lastFocus, pendingNav, openUrl, savedScroll, savedTop, readyTimers = [], nodeOpts = null;

function css() {
  if (document.querySelector('link[data-demo-window]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('demo-window.css', import.meta.url).href;
  l.setAttribute('data-demo-window', '');
  document.head.appendChild(l);
}

function build() {
  if (dlg) return;
  dlg = document.createElement('dialog');
  dlg.className = 'dw';
  dlg.setAttribute('aria-labelledby', 'dw-title');
  dlg.innerHTML =
    '<div class="dw-box">' +
      '<div class="dw-bar">' +
        '<button type="button" class="dw-back"><span aria-hidden="true">&larr;</span> Back</button>' +
        '<span class="dw-head"><span class="dw-title" id="dw-title"></span><span class="dw-sub" id="dw-sub"></span></span>' +
        '<a class="dw-full" href="#">Open full screen <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5 3 9"/></svg></a>' +
        '<button type="button" class="dw-x" aria-label="Close the demo"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12"/></svg></button>' +
      '</div>' +
      '<div class="dw-frame"><div class="dw-wait" aria-hidden="true"><i></i><span>Loading the demo</span></div></div>' +
    '</div>';
  document.body.appendChild(dlg);
  box = dlg.querySelector('.dw-box');
  frameWrap = dlg.querySelector('.dw-frame');
  titleEl = dlg.querySelector('.dw-title');
  subEl = dlg.querySelector('.dw-sub');
  fullLink = dlg.querySelector('.dw-full');
  backBtn = dlg.querySelector('.dw-back');
  closeBtn = dlg.querySelector('.dw-x');

  backBtn.addEventListener('click', requestClose);
  closeBtn.addEventListener('click', requestClose);
  // a press on the dimmed page around the window closes it
  dlg.addEventListener('click', (e) => { if (e.target === dlg) requestClose(); });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); requestClose(); });
  fullLink.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    pendingNav = fullLink.href;
    requestClose();
  });
}

function titleFor(a) {
  if (a.dataset.demoTitle) return a.dataset.demoTitle;
  const card = a.closest('article, figure, section');
  const h = card && card.querySelector('h3, h2, figcaption .mono');
  const t = (h ? h.textContent : a.textContent) || '';
  return t.replace(/\s+/g, ' ').trim() || 'Demo';
}

function frameSrc(url) {
  const u = new URL(url, location.href);
  // the home page and project pages skip their intros when shown in the window (the apps have none,
  // and room/ is the intro itself)
  if (!APPS.some((re) => re.test(u.pathname)) && !u.searchParams.has('nointro')) u.searchParams.set('nointro', '1');
  return u.href;
}

function lockScroll(on) {
  const r = document.documentElement;
  if (on) {
    savedScroll = scrollY;
    savedTop = lastFocus && lastFocus.getBoundingClientRect().height ? lastFocus.getBoundingClientRect().top : null;
    const gap = innerWidth - r.clientWidth;
    r.classList.add('dw-lock');
    if (gap > 0) r.style.setProperty('--dw-gap', gap + 'px');
  } else {
    r.classList.remove('dw-lock');
    r.style.removeProperty('--dw-gap');
    // put the link back where it was on screen, even if something above it changed height meanwhile
    // (late images, a video poster); without the link, fall back to the old scroll position
    const anchor = lastFocus && document.contains(lastFocus) && lastFocus.getBoundingClientRect().height ? lastFocus : null;
    if (anchor && savedTop != null) {
      const d = anchor.getBoundingClientRect().top - savedTop;
      if (Math.abs(d) > 2) scrollTo({ top: scrollY + d, left: 0, behavior: 'instant' });
    } else if (Math.abs(scrollY - savedScroll) > 2) scrollTo({ top: savedScroll, left: 0, behavior: 'instant' });
  }
}

function tuneFrame(ifr) {
  // same-origin pages: hide their own top bar (the window has one) and let Esc close from inside
  try {
    const d = ifr.contentDocument;
    if (!d || !d.documentElement) return;
    if (!d.__dwTuned) tuneOnce(d);
    const id = decodeURIComponent((d.defaultView.location.hash || '').slice(1));
    const t = id && d.getElementById(id);
    if (t) t.scrollIntoView({ block: 'start' });
  } catch (e) { /* another origin: leave it */ }
}

function tuneOnce(d) {
  d.__dwTuned = true;
  // a link inside the window that leaves the framed page: close the window and go there at the top
  // level, so the window never fills up with its own history
  d.addEventListener('click', (e) => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
    const h = a.getAttribute('href') || '';
    if (h.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(h)) return;
    const here = d.defaultView.location;
    if (a.origin === here.origin && a.pathname === here.pathname && a.search === here.search) return; // same page
    e.preventDefault();
    e.stopPropagation();
    pendingNav = a.href;
    requestClose();
  }, true);
  const s = d.createElement('style');
  // no bar in the window, so an anchor lands flush with the window's top edge (nothing from the section above peeks in)
  s.textContent = 'header.top,.skip{display:none!important}:root{--bar:0px}html{scroll-padding-top:0!important}';
  d.head && d.head.appendChild(s);
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) requestClose(); });
}

function isApp(url) { try { return APPS.some((re) => re.test(new URL(url, location.href).pathname)); } catch (e) { return false; } }

// show the frame as soon as its page has parsed (not after every image); the full apps wait for their
// first canvas, so the window never shows a half built app. Fallbacks: 1.2s for pages, 2.5s for apps.
function watchReady(ifr, app) {
  readyTimers.forEach(clearTimeout);
  readyTimers = [];
  const t0 = performance.now();
  let canvasAt = 0;
  const ready = () => { readyTimers.forEach(clearTimeout); readyTimers = []; if (ifr.isConnected) frameWrap.classList.add('ready'); };
  const poll = () => {
    if (!ifr.isConnected) return;
    let d = null;
    try { d = ifr.contentDocument; } catch (e) { ready(); return; }
    const parsed = d && d.URL !== 'about:blank' && d.readyState !== 'loading';
    if (parsed) tuneFrame(ifr);
    if (parsed && !app) { ready(); return; }
    if (parsed && app) {
      const c = d.querySelector('canvas');
      // a canvas the app has sized (a fresh one is 300x150 until the app sets it up)
      if (c && c.width > 0 && (c.width !== 300 || c.height !== 150) && !canvasAt) canvasAt = performance.now();
      if (canvasAt && performance.now() - canvasAt > 450) { ready(); return; }
    }
    if (performance.now() - t0 > (app ? 2500 : 1200)) { ready(); return; }
    readyTimers.push(setTimeout(poll, 80));
  };
  readyTimers.push(setTimeout(poll, 60));
}

function open(a) {
  build();
  const url = new URL(a.href, location.href);
  openUrl = url.href;
  lastFocus = a;
  titleEl.textContent = titleFor(a);
  subEl.textContent = a.dataset.demoCaption || '';
  subEl.hidden = !a.dataset.demoCaption;
  fullLink.href = url.href;
  fullLink.hidden = false;
  dlg.classList.remove('dw-node');

  frameWrap.classList.remove('ready');
  frameWrap.querySelectorAll('iframe').forEach((f) => f.remove());
  const ifr = document.createElement('iframe');
  ifr.title = titleEl.textContent;
  ifr.allow = 'fullscreen; autoplay';
  ifr.src = frameSrc(url.href); // set before it is attached, so it adds no history entry
  const app = isApp(url.href);
  ifr.addEventListener('load', () => { tuneFrame(ifr); if (!app) frameWrap.classList.add('ready'); });
  frameWrap.appendChild(ifr);
  watchReady(ifr, app);

  try { history.pushState(Object.assign({}, history.state, { dw: url.href }), ''); } catch (e) { /* closes by button only */ }
  lockScroll(true);
  dlg.classList.toggle('dw-anim', !reduced());
  dlg.showModal();
  backBtn.focus();
}

// a piece of this page in the window (the SwapChain film): same frame, bar, Back, Esc and history step
// opts: { key, opener, title, caption, mount(host), unmount() }
function openNode(opts) {
  if (!opts || typeof opts.mount !== 'function') return false;
  build();
  if (dlg.open) return false;
  openUrl = 'node:' + (opts.key || 'page');
  lastFocus = opts.opener || document.activeElement;
  titleEl.textContent = opts.title || 'Demo';
  subEl.textContent = opts.caption || '';
  subEl.hidden = !opts.caption;
  fullLink.hidden = true;
  readyTimers.forEach(clearTimeout);
  readyTimers = [];
  frameWrap.querySelectorAll('iframe').forEach((f) => f.remove());
  frameWrap.classList.add('ready');
  dlg.classList.add('dw-node');
  try { history.pushState(Object.assign({}, history.state, { dw: openUrl }), ''); } catch (e) { /* closes by button only */ }
  lockScroll(true); // measured while the opener is still on the page
  nodeOpts = opts;
  opts.mount(frameWrap);
  dlg.classList.toggle('dw-anim', !reduced());
  dlg.showModal();
  backBtn.focus();
  return true;
}

function close() {
  if (!dlg || !dlg.open) return;
  dlg.close();
  frameWrap.querySelectorAll('iframe').forEach((f) => f.remove()); // stops sound, video and WebGL
  if (nodeOpts) {
    const o = nodeOpts; nodeOpts = null;
    try { if (typeof o.unmount === 'function') o.unmount(); } catch (e) { /* the page part stays where it is */ }
    dlg.classList.remove('dw-node');
  }
  lockScroll(false);
  openUrl = null;
  readyTimers.forEach(clearTimeout);
  readyTimers = [];
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  // with a #hash in the URL, Chrome can clear focus on the history step back: put it on the link again
  const lf = lastFocus;
  setTimeout(() => { if (lf && document.contains(lf) && document.activeElement !== lf) lf.focus({ preventScroll: true }); }, 0);
  if (pendingNav) { const go = pendingNav; pendingNav = null; location.href = go; }
}

function requestClose() {
  if (!dlg || !dlg.open) return;
  // go back through the entry the window pushed; popstate then closes it
  if (history.state && history.state.dw) history.back();
  else close();
}

function isDemoLink(a) {
  if (a.hasAttribute('data-demo')) return a.getAttribute('data-demo') !== 'off';
  if (a.origin !== location.origin) return false;
  return APPS.some((re) => re.test(a.pathname));
}

function onClick(e) {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a || (dlg && dlg.contains(a)) || !isDemoLink(a)) return;
  if (a.origin !== location.origin) return; // never wrap another site
  if (a.target && a.target !== '_self') return;
  // a link to this same page (an in-page demo) is not a window: site-chrome.js scrolls there with the desk swap
  if (a.pathname === location.pathname && a.search === location.search) return;
  e.preventDefault();
  open(a);
}

export function init() {
  if (window.__demoWindow) return;
  window.__demoWindow = true;
  if (window.top !== window) return; // pages shown inside the window navigate normally
  css();
  window.__dwOpenNode = openNode;
  document.addEventListener('click', onClick);
  addEventListener('popstate', () => {
    if (dlg && dlg.open && !(history.state && history.state.dw === openUrl)) close();
  });
  // coming back to a page whose entry was a window: the window is gone, so step past that entry
  addEventListener('pageshow', () => {
    try {
      if (history.state && history.state.dw && !(dlg && dlg.open)) {
        history.replaceState(Object.assign({}, history.state, { dw: null }), '');
      }
    } catch (e) { /* fine */ }
  });
}

export default init;
