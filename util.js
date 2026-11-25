// Small DOM + formatting helpers shared by every module. No dependencies.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v; // only used with static, trusted markup (icons)
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- icons (24px stroke icons, hand-drawn paths) ----------
const P = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  map: "M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  pin: "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  bed: "M3 18V7M3 14h18v4M21 14v-3a3 3 0 00-3-3h-7v6M7 11.5a1.5 1.5 0 100-.01",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M8 15h8",
  folder: "M3 6h6l2 2h10v11H3z",
  users: "M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 20v-1a4 4 0 00-3-3.9M16 4.2a3.5 3.5 0 010 6.6",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  pill: "M10.5 20.5a5 5 0 01-7-7l10-10a5 5 0 017 7zM8.5 8.5l7 7",
  tent: "M3 20L12 4l9 16zM12 20v-6",
  heart: "M12 21s-8-5.3-8-11a4.5 4.5 0 018-2.7A4.5 4.5 0 0120 10c0 5.7-8 11-8 11z",
  pulse: "M3 12h4l2-6 4 12 2-6h6",
  siren: "M7 18v-6a5 5 0 0110 0v6M4 18h16v3H4zM12 2v2M4.5 6l1.5 1.5M19.5 6L18 7.5",
  truck: "M2 6h12v10H2zM14 9h4l4 4v3h-8zM6 19a1.5 1.5 0 100-.01M17 19a1.5 1.5 0 100-.01",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 018 0v4",
  key: "M14 10a4 4 0 11-3 6.6L3 20v-3l7-7M15 8h.01",
  log: "M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3",
  chart: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3",
  bell: "M6 17V11a6 6 0 0112 0v6l2 2H4zM10 21h4",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5",
  plus: "M12 5v14M5 12h14",
  check: "M5 12l5 5 9-10",
  x: "M6 6l12 12M18 6L6 18",
  chat: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  mic: "M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM6 11a6 6 0 0012 0M12 17v4",
  speaker: "M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  wifioff: "M3 3l18 18M8.5 16.5a5 5 0 017 0M5 12.5a10 10 0 014-2.4M12 20h.01M19 12.5a10 10 0 00-6-2.5",
  cloud: "M7 18a4 4 0 010-8 5 5 0 019.5-1A4.5 4.5 0 0117 18z",
  navi: "M3 11l18-8-8 18-2-8z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5h.01",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  logout: "M9 4H4v16h5M16 8l4 4-4 4M20 12H9",
  menu: "M4 6h16M4 12h16M4 18h16",
  sun: "M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  contrast: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 3v18",
  stethoscope: "M6 3v6a4 4 0 008 0V3M10 13v2a5 5 0 0010 0v-1M20 12a2 2 0 100-.01",
  building: "M4 21V5l8-2 8 2v16M9 21v-5h6v5M8 9h2M14 9h2M8 13h2M14 13h2",
  scan: "M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M4 12h16",
  refresh: "M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  filter: "M3 5h18l-7 8v6l-4 2v-8z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  baby: "M9 12h.01M15 12h.01M10 16c1 .8 3 .8 4 0M12 3a3 3 0 00-3 3 9 9 0 106 0 3 3 0 00-3-3z",
};
export function icon(name, size = 18, cls = "") {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", size); s.setAttribute("height", size);
  s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.8");
  s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "ico " + cls);
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", P[name] || P.info);
  s.append(p); return s;
}

// ---------- formatting ----------
export const fmtDate = (d, withTime = false) => {
  if (!d) return "—";
  const dt = new Date(d); if (isNaN(dt)) return String(d);
  return dt.toLocaleString(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
};
export const isoDay = (d = new Date()) => { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const ago = (ts) => {
  if (!ts) return "never";
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const hh = Math.round(m / 60); if (hh < 48) return `${hh} h ago`;
  return `${Math.round(hh / 24)} d ago`;
};
export const km = (n) => n == null ? "—" : n < 10 ? n.toFixed(1) + " km" : Math.round(n) + " km";
export function haversine(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k]]));
export const groupBy = (arr, f) => arr.reduce((m, x) => { (m[f(x)] ||= []).push(x); return m; }, {});
export const sum = (a, f = x => x) => a.reduce((s, x) => s + (+f(x) || 0), 0);

// ---------- sync SHA-256 (used for the tamper-evident audit chain and demo hashing fallbacks) ----------
export function sha256(str) {
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const bytes = new TextEncoder().encode(str);
  const l = bytes.length, total = ((l + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total); buf.set(bytes); buf[l] = 0x80;
  const dv = new DataView(buf.buffer); dv.setUint32(total - 4, (l * 8) >>> 0); dv.setUint32(total - 8, Math.floor(l * 8 / 4294967296));
  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const w = new Uint32Array(64), rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = rr(w[i-15],7) ^ rr(w[i-15],18) ^ (w[i-15] >>> 3), s1 = rr(w[i-2],17) ^ rr(w[i-2],19) ^ (w[i-2] >>> 10); w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0; }
    let [a, b, c, d, e, f, g, hh] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H = H.map((x, i) => (x + [a, b, c, d, e, f, g, hh][i]) >>> 0);
  }
  return H.map(x => x.toString(16).padStart(8, "0")).join("");
}
export const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const refNo = (p) => `${p}-${new Date().getFullYear()}-${Math.floor(Math.random() * 900000 + 100000)}`;
