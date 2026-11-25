// Facility discovery (public + citizen): search, filters, GPS, map, hospital profile.
import { h, clear, icon, haversine, km, debounce, ago } from "../util.js";
import { db } from "../db.js";
import { DISTRICTS, DEPARTMENTS, FACILITY_TYPES, districtByName } from "../seed.js";
import { bedRows, bedTotals, provenance, orgName } from "../services.js";
import { provBadge, card, empty, notice, btn, grid, kv, table } from "../ui.js";
import { createMap, getPosition, directionsUrl, googleDirectionsUrl } from "../map.js";
import { fetchPublicFacilities } from "../gis.js";
import { t } from "../i18n.js";

const KINDS = [["", "All facility types"], ["govt_hospital", "Government hospital"], ["private_hospital", "Private hospital"], ["chc", "Community Health Centre"], ["phc", "Primary Health Centre"], ["diagnostic", "Diagnostic centre"], ["pharmacy", "Pharmacy"]];
const state = { q: "", district: "", type: "", dept: "", me: null, public: [], pubInfo: null, sel: null };

export function allFacilities() {
  const orgs = db.where("orgs", o => o.kind !== "ambulance" && o.lat && (o.verification === "verified" || o.demo)).map(o => ({ ...o, platform: true }));
  return [...orgs, ...state.public];
}
export const typeLabel = (f) => FACILITY_TYPES[f.type] || f.typeLabel || "Facility";

export function explorer(ctx) {
  const root = h("div", { class: "stack" });
  const listEl = h("div", { class: "stack", style: { maxHeight: "560px", overflow: "auto", paddingRight: ".2rem" } });
  const mapEl = h("div", {});
  const status = h("div", { class: "small muted", "aria-live": "polite" });
  let map;
  const q = h("input", { type: "search", placeholder: "Hospital name, mandal, village, town or PIN code", value: state.q, "aria-label": "Search facilities", oninput: debounce(e => { state.q = e.target.value; apply(); }, 200) });
  const sel = (label, key, opts) => h("div", { class: "field" }, h("label", {}, label), h("select", { onchange: e => { state[key] = e.target.value; if (key === "district") { const d = districtByName(state.district); if (d && map) map.focus(d.lat, d.lng, 10); loadPublicFor(state.district); } apply(); } }, opts.map(([v, l]) => h("option", { value: v, selected: v === state[key] }, l))));
  const filters = h("div", { class: "filters" },
    h("div", { class: "field", style: { flex: 3 } }, h("label", {}, t("common.search", "Search")), q),
    sel(t("common.district", "District"), "district", [["", t("common.all", "All")], ...DISTRICTS.map(d => [d.name, d.name])]),
    sel("Type", "type", KINDS), sel("Department", "dept", [["", "Any department"], ...DEPARTMENTS.map(d => [d, d])]),
    h("div", { class: "field", style: { flex: "0 0 auto" } }, h("label", { "aria-hidden": "true" }, " "), btn(t("common.nearMe", "Near me"), async () => { try { status.textContent = "Finding your location…"; state.me = await getPosition(); map?.setMe(state.me); map?.focus(state.me.lat, state.me.lng, 11); status.textContent = ""; apply(); } catch (e) { status.textContent = e.message; } }, "", "navi")));
  const results = () => {
    const needle = state.q.trim().toLowerCase();
    let a = allFacilities().filter(f => (!state.district || f.district === state.district) && (!state.type || f.type === state.type) && (!state.dept || f.depts?.includes(state.dept)) &&
      (!needle || [f.name, f.mandal, f.village, f.address, f.pin, f.district].some(x => (x || "").toLowerCase().includes(needle))));
    if (state.me) a = a.map(f => ({ ...f, dist: haversine(state.me, f) })).sort((x, y) => x.dist - y.dist); else a = a.map(f => ({ ...f })).sort((x, y) => (y.platform ? 1 : 0) - (x.platform ? 1 : 0) || x.name.localeCompare(y.name));
    return a;
  };
  function card_(f) {
    const prov = f.kind === "public" ? "public" : provenance(f, bedTotals(f).updatedAt);
    const bt = f.platform && f.kind === "hospital" ? bedTotals(f) : null;
    return h("article", { class: "fac" + (state.sel === f.id ? " sel" : ""), tabindex: 0, onclick: () => { state.sel = f.id; map?.select(f.id); map?.focus(f.lat, f.lng, 13); paint(); }, onkeydown: e => { if (e.key === "Enter") e.target.click(); } },
      h("div", { class: "spread" }, h("h3", {}, f.name), provBadge(prov, bt?.updatedAt)),
      h("div", { class: "small muted" }, `${typeLabel(f)} · ${f.district}${f.mandal ? " · " + f.mandal : ""}${f.dist != null ? " · " + km(f.dist) : ""}`),
      bt ? h("div", { class: "bedcell" }, icon("bed", 14), h("b", {}, bt.available), ` beds reported free of ${bt.total} · updated ${ago(bt.updatedAt)}`) : f.recordedBeds ? h("div", { class: "small muted" }, `${f.recordedBeds} beds recorded in public directory (not live availability)`) : null,
      h("div", { class: "cluster" }, f.platform && (f.kind === "hospital") ? h("a", { class: "btn sm primary", href: `#/${ctx.user ? "app/hospital" : "find"}/${f.id}` }, t("common.view", "View")) : null,
        h("a", { class: "btn sm", href: directionsUrl(f, state.me), target: "_blank", rel: "noopener" }, icon("navi", 14), t("common.directions", "Directions")), f.phone ? h("a", { class: "btn sm", href: "tel:" + f.phone.replace(/[^+\d]/g, "") }, icon("phone", 14), t("common.call", "Call")) : null));
  }
  function paint() {
    const r = results(); clear(listEl);
    if (!r.length) listEl.append(empty("No facilities match. Try another district or clear filters."));
    r.slice(0, 80).forEach(f => listEl.append(card_(f)));
    status.textContent = `${r.length} facilities` + (r.length > 80 ? " (showing nearest 80)" : "") + (state.pubInfo ? ` · public directory ${state.pubInfo}` : "");
    map?.setMarkers(r.slice(0, 300).map(f => ({ id: f.id, lat: f.lat, lng: f.lng, kind: f.kind === "public" ? "public" : f.kind === "hospital" ? f.type : f.kind, title: f.name })));
  }
  const apply = paint;
  async function loadPublicFor(d) {
    if (!d) return; status.textContent = "Loading public directory…";
    const r = await fetchPublicFacilities(d); state.public = [...state.public.filter(x => x.district !== d), ...r.items];
    state.pubInfo = r.error && !r.items.length ? "unavailable (" + r.error + ")" : `${r.fromCache ? "cached " : "fetched "}${ago(r.fetchedAt)}`; paint();
  }
  map = createMap(mapEl, { height: "560px", onSelect: m => { state.sel = m.id; paint(); document.querySelector(".fac.sel")?.scrollIntoView({ block: "nearest" }); } });
  root.append(notice("info", h("strong", {}, "How to read this: "), "Platform hospitals show bed counts reported by the facility with a timestamp. Public-directory records come from government GIS layers: they confirm a facility exists, not that it has beds, doctors or stock today — call before travelling."), filters, status,
    h("div", { class: "split rev" }, listEl, mapEl));
  if (state.district) loadPublicFor(state.district);
  paint(); setTimeout(() => map.fit(), 300);
  return root;
}

export function profile(ctx, orgId) {
  const o = db.get("orgs", orgId); if (!o) return empty("Facility not found.");
  const prov = provenance(o, bedTotals(o).updatedAt);
  const needLogin = (fn) => () => (ctx.user ? fn() : (sessionStorage.setItem("swasthya.next", location.hash), location.hash = "#/login"));
  const docs = db.where("doctors", d => d.orgId === o.id);
  const mapEl = h("div", {}); const m = createMap(mapEl, { center: o, zoom: 13, height: "240px" }); m.setMarkers([{ id: o.id, lat: o.lat, lng: o.lng, kind: o.type, title: o.name }]);
  const beds = bedRows(o);
  return h("div", { class: "stack" },
    h("header", { class: "page-head" }, h("div", {}, h("h1", {}, o.name), h("p", { class: "sub" }, `${typeLabel(o)} · ${o.district}${o.mandal ? " · " + o.mandal : ""}`), h("div", { class: "cluster", style: { marginTop: ".4rem" } }, provBadge(o.demo ? "demo" : o.verification === "verified" ? "provider" : "unverified"), o.emergency24x7 ? h("span", { class: "badge danger" }, icon("siren", 12), "24×7 emergency") : null)),
      h("div", { class: "actions" }, btn(t("common.book", "Book appointment"), needLogin(() => ctx.go(`book/${o.id}`)), "primary", "calendar"), btn("Request admission", needLogin(() => ctx.go(`admit/${o.id}`)), "", "bed"), h("a", { class: "btn", href: directionsUrl(o), target: "_blank", rel: "noopener" }, icon("navi", 16), t("common.directions", "Directions")))),
    notice("warn", "Emergency? Call 108 / 112 or go straight to the emergency department. Online requests are never a substitute and never wait for approval in an emergency."),
    h("div", { class: "split even" }, card({ title: "Contact & hours" }, kv([["Address", o.address], ["Phone", o.phone ? h("a", { href: "tel:" + o.phone.replace(/[^+\d]/g, "") }, o.phone) : "—"], ["Emergency", o.emergencyPhone || "—"], ["Hours", o.hours], ["PIN", o.pin]])), mapEl),
    card({ title: "Bed availability", sub: "Reported by the hospital. An admission request does not reserve a bed.", actions: [provBadge(prov, bedTotals(o).updatedAt)] },
      beds.length ? table([{ h: "Category", f: r => r.label }, { h: "Total", f: r => r.total }, { h: "Occupied", f: r => r.occupied }, { h: "Unavailable", f: r => r.unavailable || 0 }, { h: "Available", f: r => h("b", {}, r.available) }, { h: "Updated", f: r => ago(r.updatedAt) }], beds) : empty("This facility has not published bed information.")),
    card({ title: "Departments & services" }, h("div", { class: "cluster" }, (o.depts || []).map(d => h("span", { class: "badge info" }, d)), (o.services || []).map(s => h("span", { class: "badge" }, s)))),
    card({ title: "Doctors" }, docs.length ? h("div", { class: "list" }, docs.map(d => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, d.name), h("div", { class: "small muted" }, `${d.spec} · ${(d.languages || []).join(", ")}`)), btn(t("common.book", "Book appointment"), needLogin(() => ctx.go(`book/${o.id}/${d.id}`)), "sm primary")))) : empty("No doctors listed yet.")),
    o.tests?.length ? card({ title: "Diagnostic services" }, h("div", { class: "list" }, o.tests.filter(x => x.available).map(x => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, x.name), h("div", { class: "small muted" }, `${x.category} · ₹${x.price} · report ${x.tat}${x.fasting ? " · fasting needed" : ""}`)), btn("Book test", needLogin(() => ctx.go(`booktest/${o.id}/${x.code}`)), "sm"))))) : null);
}
