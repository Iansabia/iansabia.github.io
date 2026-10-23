/* Shared behavior for the project pages: theme toggle, sticky bar border, phone menu, scroll reveal, reading progress + toc. */
(() => {
  const root = document.documentElement;
  const themeBtn = document.getElementById('theme');
  if (themeBtn) {
    themeBtn.setAttribute('aria-pressed', root.dataset.theme === 'dark');
    themeBtn.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
      themeBtn.setAttribute('aria-pressed', root.dataset.theme === 'dark');
      document.dispatchEvent(new CustomEvent('themechange'));
    });
  }
  // links to other sites open in a new tab (Ian, 10/23)
  document.querySelectorAll('a[href^="http"]').forEach((l) => { if (l.host !== location.host) { l.target = '_blank'; l.rel = 'noopener'; } });
  const top = document.querySelector('header.top');
  const onScroll = () => top && top.classList.toggle('stuck', scrollY > 4);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const btn = document.getElementById('menuBtn'), menu = document.getElementById('menu');
  if (btn && menu) {
    const set = (open) => { menu.classList.toggle('open', open); btn.setAttribute('aria-expanded', open); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); set(!menu.classList.contains('open')); });
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('open')) { set(false); btn.focus(); } });
  }

  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  document.querySelectorAll('.reveal,.rule').forEach((n) => io.observe(n));

  const bar = document.querySelector('.progress'), article = document.querySelector('[data-read]');
  if (bar && article) {
    const upd = () => {
      const r = article.getBoundingClientRect(), h = r.height - innerHeight;
      bar.style.width = Math.max(0, Math.min(1, -r.top / Math.max(1, h))) * 100 + '%';
    };
    addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
  }
  const toc = document.querySelectorAll('.toc a[href^="#"]');
  if (toc.length) {
    const map = new Map([...toc].map((a) => [a.getAttribute('href').slice(1), a]));
    const spy = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      toc.forEach((a) => a.removeAttribute('aria-current'));
      const a = map.get(e.target.id); if (a) a.setAttribute('aria-current', 'true');
    }), { rootMargin: '-20% 0px -70% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }
})();
