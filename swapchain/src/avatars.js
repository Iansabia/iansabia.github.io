// iOS Contacts style avatars: a soft two-stop gradient circle with white initials.
// Deterministic from the person's avatar seed and hue. Generated in code, no images.

const cache = new Map();

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  const a = parts[0] ? parts[0][0] : "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

/**
 * @param {{id:string,name:string,avatar?:{seed:string,hue:number}}} person
 * @param {{size?:number, ring?:string, verified?:boolean}} [opts]
 */
export function avatarSvg(person, opts = {}) {
  const size = opts.size || 40;
  const key = `${person.id}|${size}|${opts.ring || ""}|${opts.verified ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const seed = (person.avatar && person.avatar.seed) || person.id;
  const hue = person.avatar && typeof person.avatar.hue === "number" ? person.avatar.hue : hash(seed) % 360;
  const h = hash(seed);
  const sat = 30 + (h % 12); // dusty, to sit with the Continuum palette
  const l1 = 66 + ((h >> 4) % 8);
  const l2 = 46 + ((h >> 8) % 8);
  const gid = `g${hash(key).toString(36)}`;
  const text = initials(person.name);
  const ring = opts.ring
    ? `<circle cx="50" cy="50" r="48" fill="none" stroke="${opts.ring}" stroke-width="4"/>`
    : "";
  const r = opts.ring ? 44 : 50;
  const dot = opts.verified
    ? `<circle cx="84" cy="84" r="12" fill="#604C9C" stroke="#fff" stroke-width="4"/><path d="M78.5 84.5l3.6 3.4 6.4-7" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Avatar for ${escapeAttr(person.name)}">` +
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} ${sat}% ${l1}%)"/><stop offset="1" stop-color="hsl(${hue} ${sat}% ${l2}%)"/></linearGradient></defs>` +
    `<circle cx="50" cy="50" r="${r}" fill="url(#${gid})"/>${ring}` +
    `<text x="50" y="50" dy="0.35em" text-anchor="middle" fill="#fff" font-family="ui-rounded, 'SF Pro Rounded', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Inter, sans-serif" font-weight="600" font-size="${text.length > 1 ? 38 : 44}" letter-spacing="0.5">${text}</text>` +
    `${dot}</svg>`;
  cache.set(key, svg);
  return svg;
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
