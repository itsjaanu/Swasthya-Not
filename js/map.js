// Interactive map. Uses Leaflet + OpenStreetMap when they can load; otherwise falls back to a built-in schematic
// map (district centroids + markers) so the app still works offline. Same API either way.
import { h, clear } from "./util.js";
import { DISTRICTS } from "./seed.js";

export const KIND_STYLE = { govt_hospital: ["#0b6b5c", "H"], private_hospital: ["#1d4ed8", "H"], chc: ["#0e7490", "C"], phc: ["#4d7c0f", "P"], other: ["#64748b", "H"], diagnostic: ["#7c3aed", "D"], pharmacy: ["#be185d", "Rx"], ambulance: ["#c2410c", "A"], camp: ["#b45309", "⛺"], public: ["#64748b", "•"], me: ["#111827", "●"] };
let leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((res, rej) => {
    if (!navigator.onLine) return rej(new Error("offline"));
    const css = h("link", { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", integrity: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=", crossorigin: "" });
    const js = h("script", { src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", integrity: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=", crossorigin: "" });
    const to = setTimeout(() => rej(new Error("timeout")), 6000);
    js.onload = () => { clearTimeout(to); window.L ? res(window.L) : rej(new Error("no L")); }; js.onerror = () => { clearTimeout(to); rej(new Error("load failed")); };
    document.head.append(css, js);
  }).catch(e => { leafletP = null; throw e; });
  return leafletP;
}

export function createMap(container, { center = { lat: 16.0, lng: 80.2 }, zoom = 7, onSelect, height = "420px" } = {}) {
  container.classList.add("map-box"); container.style.height = height;
  let impl = null, markers = [], selected = null, me = null, view = { center, zoom }, destroyed = false;
  const api = {
    setMarkers(list) { markers = list; impl?.draw(); },
    setMe(p) { me = p; impl?.draw(); },
    focus(lat, lng, z = 12) { view = { center: { lat, lng }, zoom: z }; impl?.focus(); },
    select(id) { selected = id; impl?.draw(); },
    fit() { impl?.fit(); },
    get mode() { return impl?.mode; },
    destroy() { destroyed = true; impl?.destroy?.(); },
  };
  function fallback(reason) {
    clear(container);
    const W = 640, H = 520, bb = { n: 19.95, s: 12.4, w: 76.5, e: 84.9 };
    const proj = (lat, lng) => [((lng - bb.w) / (bb.e - bb.w)) * W, ((bb.n - lat) / (bb.n - bb.s)) * H];
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", "fallback-map"); svg.setAttribute("role", "group"); svg.setAttribute("aria-label", "Schematic map of Andhra Pradesh");
    const note = h("div", { class: "map-note" }, "Schematic map (street map unavailable " + (reason === "offline" ? "offline" : "right now") + "). Distances are still accurate.");
    container.append(svg, note);
    const mk = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
    let vb = { x: 0, y: 0, w: W, h: H };
    const apply = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const draw = () => {
      clear(svg);
      for (let la = 13; la <= 19; la += 1) { const [, y] = proj(la, 80); svg.append(mk("line", { x1: 0, x2: W, y1: y, y2: y, class: "grid" })); }
      for (let lo = 77; lo <= 84; lo += 1) { const [x] = proj(16, lo); svg.append(mk("line", { x1: x, x2: x, y1: 0, y2: H, class: "grid" })); }
      DISTRICTS.forEach(d => { const [x, y] = proj(d.lat, d.lng); svg.append(mk("circle", { cx: x, cy: y, r: 2.5, class: "dist" })); const t = mk("text", { x: x + 5, y: y + 3, class: "dist-l" }); t.textContent = d.name.replace("Dr. B.R. Ambedkar ", "").replace("Sri Potti Sriramulu ", "").replace("Y.S.R. ", "").slice(0, 14); svg.append(t); });
      markers.forEach(m => {
        const [x, y] = proj(m.lat, m.lng), [col, glyph] = KIND_STYLE[m.kind] || KIND_STYLE.other;
        const g = mk("g", { class: "pin" + (selected === m.id ? " sel" : ""), tabindex: 0, role: "button", "aria-label": m.title, transform: `translate(${x},${y})` });
        g.append(mk("circle", { r: selected === m.id ? 11 : 8, fill: col, stroke: "#fff", "stroke-width": 2 })); const t = mk("text", { "text-anchor": "middle", y: 3.5, class: "pin-g" }); t.textContent = glyph; g.append(t);
        const ti = mk("title", {}); ti.textContent = m.title; g.append(ti);
        const pick = () => { selected = m.id; onSelect?.(m); draw(); };
        g.addEventListener("click", pick); g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        svg.append(g);
      });
      if (me) { const [x, y] = proj(me.lat, me.lng); svg.append(mk("circle", { cx: x, cy: y, r: 6, class: "me" })); }
    };
    const focus = () => { const [x, y] = proj(view.center.lat, view.center.lng); const k = Math.max(0.18, Math.min(1, 1 / Math.pow(2, (view.zoom - 7) * 0.7))); vb = { w: W * k, h: H * k, x: Math.max(0, Math.min(W - W * k, x - W * k / 2)), y: Math.max(0, Math.min(H - H * k, y - H * k / 2)) }; apply(); };
    const fit = () => { if (!markers.length) { vb = { x: 0, y: 0, w: W, h: H }; return apply(); } const ps = markers.map(m => proj(m.lat, m.lng)); const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]); const pad = 40; let w = Math.max(120, Math.max(...xs) - Math.min(...xs) + pad * 2), hh = Math.max(95, Math.max(...ys) - Math.min(...ys) + pad * 2); const r = W / H; if (w / hh < r) w = hh * r; else hh = w / r; vb = { x: Math.max(0, (Math.min(...xs) + Math.max(...xs)) / 2 - w / 2), y: Math.max(0, (Math.min(...ys) + Math.max(...ys)) / 2 - hh / 2), w: Math.min(w, W), h: Math.min(hh, H) }; apply(); };
    impl = { mode: "schematic", draw: () => { draw(); }, focus, fit, destroy() { } };
    draw(); focus();
  }
  function useLeaflet(L) {
    clear(container);
    const map = L.map(container, { scrollWheelZoom: false }).setView([view.center.lat, view.center.lng], view.zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    const layer = L.layerGroup().addTo(map); let meLayer = null;
    const draw = () => {
      layer.clearLayers();
      markers.forEach(m => {
        const [col, glyph] = KIND_STYLE[m.kind] || KIND_STYLE.other;
        const ic = L.divIcon({ className: "", html: `<div class="lf-pin ${selected === m.id ? "sel" : ""}" style="background:${col}">${glyph}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
        L.marker([m.lat, m.lng], { icon: ic, title: m.title, keyboard: true }).on("click", () => { selected = m.id; onSelect?.(m); draw(); }).addTo(layer);
      });
      if (meLayer) meLayer.remove(); if (me) meLayer = L.circleMarker([me.lat, me.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#111827", fillOpacity: 1 }).addTo(map);
    };
    impl = { mode: "street", draw, focus: () => map.setView([view.center.lat, view.center.lng], view.zoom), fit: () => { if (markers.length) map.fitBounds(markers.map(m => [m.lat, m.lng]), { padding: [30, 30], maxZoom: 13 }); }, destroy: () => map.remove() };
    setTimeout(() => map.invalidateSize(), 80); draw();
  }
  loadLeaflet().then(L => { if (!destroyed) useLeaflet(L); }).catch(e => { if (!destroyed) fallback(e.message === "offline" ? "offline" : "x"); });
  return api;
}
export const directionsUrl = (to, from) => from ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from.lat}%2C${from.lng}%3B${to.lat}%2C${to.lng}` : `https://www.openstreetmap.org/?mlat=${to.lat}&mlon=${to.lng}#map=15/${to.lat}/${to.lng}`;
export const googleDirectionsUrl = (to) => `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`;
export function getPosition() {
  return new Promise((res, rej) => { if (!navigator.geolocation) return rej(new Error("This device does not support location.")); navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), e => rej(new Error(e.code === 1 ? "Location permission was denied. Choose a district instead." : "Could not get your location.")), { timeout: 8000, maximumAge: 300000 }); });
}
