// Tiny DOM helpers and the line icon set (1.75px stroke, SF Symbols feel).

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function html(strings, ...vals) {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      if (v == null || v === false) return;
      if (Array.isArray(v)) out += v.join("");
      else if (typeof v === "object" && v.__raw) out += v.__raw;
      else out += esc(v);
    }
  });
  return { __raw: out, toString() { return out; } };
}
export const raw = (s) => ({ __raw: String(s), toString() { return String(s); } });

export function el(tag, attrs = {}, inner = "") {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  if (inner) e.innerHTML = String(inner);
  return e;
}

const P = {
  map: '<path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  loop: '<path d="M18.5 9A7 7 0 0 0 6 7.2"/><path d="M5.5 15a7 7 0 0 0 12.5 1.8"/><path d="M5 4.5v3h3"/><path d="M19 19.5v-3h-3"/>',
  plus: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M12 8v8M8 12h8"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  playCircle: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  chevron: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  send: '<path d="M12 19V5.5"/><path d="m6.5 11 5.5-5.5 5.5 5.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  zoomIn: '<path d="M12 5v14M5 12h14"/>',
  zoomOut: '<path d="M5 12h14"/>',
  tilt: '<path d="M4 17.5 9 6.5h6l5 11z"/><path d="M6.5 12h11"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="3"/><path d="M10.5 5.5h3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  check: '<path d="M5 12.5 10 17.5 19 7"/>',
  heart: '<path d="M12 19.5s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z"/>',
  camera: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="0.6" fill="currentColor"/>',
  swap: '<path d="M4.5 8.5h14l-3.5-3.5"/><path d="M19.5 15.5h-14l3.5 3.5"/>',
  arrowRight: '<path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5"/>',
  building: '<path d="M6 21V5.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1V21"/><path d="M15 9.5h3a1 1 0 0 1 1 1V21"/><path d="M3.5 21h17"/><path d="M9 8h3M9 11.5h3M9 15h3"/>',
  towers: '<path d="M4 21V8h4v13M10 21V4h4v17M16 21V8h4v13"/><path d="M2.5 21h19"/>',
  moonSmall: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  sunrise: '<path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 6v3M5.6 10.6l1.6 1.6M18.4 10.6l-1.6 1.6"/>',
  sparkle: '<path d="M12 4.5l1.6 4.4 4.4 1.6-4.4 1.6L12 16.5l-1.6-4.4L6 10.5l4.4-1.6z"/>',
  users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6"/><path d="M17.5 14.3c1.8.6 3 2.1 3.4 4.7"/>',
  warning: '<path d="M12 4.5 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor"/>',
  knot: '<path d="M7.5 15.5c-3-1-3.5-5.5 0-7.5 2.6-1.5 5.3.4 6.5 2.5s3.9 4 6.5 2.5c3.5-2 3-6.5 0-7.5"/><path d="M16.5 8.5c3 1 3.5 5.5 0 7.5-2.6 1.5-5.3-.4-6.5-2.5S6.6 9.5 4 11"/>',
  flag: '<path d="M5.5 21V4.5"/><path d="M5.5 5h11l-2 4 2 4h-11"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/>',
  stack: '<path d="M12 3.5 3.5 8 12 12.5 20.5 8z"/><path d="M3.5 12 12 16.5 20.5 12"/><path d="M3.5 16 12 20.5 20.5 16"/>',
};

export function icon(name, cls = "") {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ""}</svg>`;
}

export const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 15.5c-3-1-3.5-5.5 0-7.5 2.6-1.5 5.3.4 6.5 2.5s3.9 4 6.5 2.5c3.5-2 3-6.5 0-7.5"/><path d="M16.5 8.5c3 1 3.5 5.5 0 7.5-2.6 1.5-5.3-.4-6.5-2.5S6.6 9.5 4 11"/></svg>';

let toastHost = null;
export function toast(text, { iconName = "check", ms = 4000 } = {}) {
  toastHost = toastHost || document.querySelector(".toasts");
  if (!toastHost) return;
  const t = el("div", { class: "toast", role: "status" }, `<span class="ti">${icon(iconName)}</span><span>${esc(text)}</span>`);
  toastHost.appendChild(t);
  while (toastHost.children.length > 2) toastHost.firstElementChild.remove();
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, ms);
}
