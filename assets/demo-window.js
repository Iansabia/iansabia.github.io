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
   Never runs inside a frame: a page shown in the window just navigates normally. */

const APPS = [/\/swapchain\/app\/?(index\.html)?$/, /\/continuum\/hole\/?(index\.html)?$/, /\/room\/?(index\.html)?$/];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let dlg, box, frameWrap, titleEl, fullLink, backBtn, closeBtn, lastFocus, pendingNav, openUrl, savedScroll;

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
        '<span class="dw-title" id="dw-title"></span>' +
        '<a class="dw-full" href="#">Open full screen <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5 3 9"/></svg></a>' +
        '<button type="button" class="dw-x" aria-label="Close the demo"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12"/></svg></button>' +
      '</div>' +
      '<div class="dw-frame"><div class="dw-wait" aria-hidden="true"><i></i><span>Loading the demo</span></div></div>' +
    '</div>';
  document.body.appendChild(dlg);
  box = dlg.querySelector('.dw-box');
  frameWrap = dlg.querySelector('.dw-frame');
  titleEl = dlg.querySelector('.dw-title');
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
    const gap = innerWidth - r.clientWidth;
    r.classList.add('dw-lock');
    if (gap > 0) r.style.setProperty('--dw-gap', gap + 'px');
  } else {
    r.classList.remove('dw-lock');
    r.style.removeProperty('--dw-gap');
    if (Math.abs(scrollY - savedScroll) > 2) scrollTo(0, savedScroll);
  }
}

function tuneFrame(ifr) {
  // same-origin pages: hide their own top bar (the window has one) and let Esc close from inside
  try {
    const d = ifr.contentDocument;
    if (!d || !d.documentElement) return;
    const s = d.createElement('style');
    s.textContent = 'header.top,.skip{display:none!important}:root{--bar:0px}';
    d.head && d.head.appendChild(s);
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) requestClose(); });
    const id = decodeURIComponent((d.defaultView.location.hash || '').slice(1));
    const t = id && d.getElementById(id);
    if (t) t.scrollIntoView({ block: 'start' });
  } catch (e) { /* another origin: leave it */ }
}

function open(a) {
  build();
  const url = new URL(a.href, location.href);
  openUrl = url.href;
  lastFocus = a;
  titleEl.textContent = titleFor(a);
  fullLink.href = url.href;

  frameWrap.classList.remove('ready');
  frameWrap.querySelectorAll('iframe').forEach((f) => f.remove());
  const ifr = document.createElement('iframe');
  ifr.title = titleEl.textContent;
  ifr.allow = 'fullscreen; autoplay';
  ifr.src = frameSrc(url.href); // set before it is attached, so it adds no history entry
  ifr.addEventListener('load', () => { frameWrap.classList.add('ready'); tuneFrame(ifr); });
  frameWrap.appendChild(ifr);

  try { history.pushState(Object.assign({}, history.state, { dw: url.href }), ''); } catch (e) { /* closes by button only */ }
  lockScroll(true);
  dlg.classList.toggle('dw-anim', !reduced());
  dlg.showModal();
  backBtn.focus();
}

function close() {
  if (!dlg || !dlg.open) return;
  dlg.close();
  frameWrap.querySelectorAll('iframe').forEach((f) => f.remove()); // stops sound, video and WebGL
  lockScroll(false);
  openUrl = null;
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
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
