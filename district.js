// District Health Officer workspace. AGGREGATES ONLY: no patient names or identifiable records are ever shown.
// Patient-derived counts (appointments, admissions, tests, camp registrations, ASHA caseload) use small-cell
// suppression: any count between 1 and k-1 is displayed as "<k" (k = platform setting, default 5).
import { h, icon, ago, fmtDate, isoDay, sum } from "../util.js";
import { db, audit } from "../db.js";
import { DISTRICTS, BED_CATS, FACILITY_TYPES } from "../seed.js";
import { provenance, bedRows, bedTotals, isStale, PROV } from "../services.js";
import { card, stat, grid, table, barChart, donut, pageHead, notice, demoNote, provBadge, statusBadge, badge, btn, empty, meter } from "../ui.js";
import { t } from "../i18n.js";
import { fetchPublicFacilities } from "../gis.js";
import { createMap } from "../map.js";

export const nav = [
  { id: "overview", icon: "chart", key: "nav.overview", label: "Overview" },
  { id: "coverage", icon: "map", key: "dh.coverage", label: "Coverage" },
  { id: "gaps", icon: "alert", key: "dh.gaps", label: "Service gaps" },
  { id: "facilities", icon: "building", key: "dh.facilities", label: "Facility register" },
  { id: "camps", icon: "tent", key: "dh.camps", label: "Medical camps" },
  { id: "programmes", icon: "heart", key: "dh.programmes", label: "Community health" },
  { id: "reports", icon: "download", key: "dh.reports", label: "Reports" },
];

export const strings = {
  "dh.coverage": { te: "కవరేజ్", hi: "कवरेज", ta: "பரவல்" }, "dh.gaps": { te: "సేవా లోటులు", hi: "सेवा अंतराल", ta: "சேவை இடைவெளிகள்" },
  "dh.facilities": { te: "సదుపాయాల రిజిస్టర్", hi: "सुविधा रजिस्टर", ta: "மையங்களின் பதிவேடு" }, "dh.camps": { te: "వైద్య శిబిరాలు", hi: "चिकित्सा शिविर", ta: "மருத்துவ முகாம்கள்" },
  "dh.programmes": { te: "కమ్యూనిటీ ఆరోగ్యం", hi: "सामुदायिक स्वास्थ्य", ta: "சமூக சுகாதாரம்" }, "dh.reports": { te: "నివేదికలు", hi: "रिपोर्ट", ta: "அறிக்கைகள்" },
  "dh.export": { te: "CSV ఎగుమతి", hi: "CSV निर्यात", ta: "CSV ஏற்றுமதி" }, "dh.loadPublic": { te: "పబ్లిక్ డైరెక్టరీ లెక్కలు లోడ్ చేయండి", hi: "सार्वजनिक निर्देशिका गणना लोड करें", ta: "பொது அடைவு எண்ணிக்கையை ஏற்று" },
  "dh.district": { te: "జిల్లా", hi: "ज़िला", ta: "மாவட்டம்" }, "dh.download": { te: "డౌన్‌లోడ్", hi: "डाउनलोड", ta: "பதிவிறக்கு" },
};

const K = () => db.cfg().kAnonymity || 5;
const sup = (n) => (n > 0 && n < K() ? `<${K()}` : String(n));
const supVal = (n) => (n > 0 && n < K() ? 0 : n); // bar length must not reveal a suppressed count
const countBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const STATUS_TONE = { requested: "warn", submitted: "warn", received: "info", under_review: "info", info_requested: "warn", confirmed: "ok", accepted: "ok", completed: "ok", report_ready: "ok", arrived: "ok", admitted: "ok", discharged: "muted", rejected: "danger", cancelled: "muted", no_show: "danger", sample_collected: "info", processing: "info" };
const sLabel = (s) => t("status." + s, s.replace(/_/g, " ").replace(/^./, c => c.toUpperCase()));
const statusBars = (counts) => barChart(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ label: sLabel(s), value: supVal(n), display: sup(n), tone: STATUS_TONE[s] || "muted" })), { max: Math.max(1, ...Object.values(counts).map(supVal)) });

// ---------- aggregation (one place so overview, coverage and reports agree) ------------------------------
function agg(d) {
  const orgs = db.where("orgs", o => o.district === d);
  const ver = orgs.filter(o => o.verification === "verified");
  const ids = new Set(orgs.map(o => o.id));
  const hospitals = ver.filter(o => o.kind === "hospital");
  const beds = {}; BED_CATS.forEach(([k, l]) => beds[k] = { label: l, total: 0, occupied: 0, available: 0, unavailable: 0 });
  hospitals.forEach(o => bedRows(o).forEach(r => { const b = beds[r.key]; b.total += r.total; b.occupied += r.occupied; b.unavailable += r.unavailable || 0; b.available += r.available; }));
  const withBeds = hospitals.filter(o => Object.keys(o.beds || {}).length);
  const stale = withBeds.filter(o => isStale(bedTotals(o).updatedAt));
  const inD = (coll) => db.where(coll, x => ids.has(x.orgId));
  const ashaIds = new Set(db.where("users", u => u.role === "asha" && u.district === d).map(u => u.id));
  const hh = db.where("ashaHouseholds", x => ashaIds.has(x.ashaId));
  const fu = db.where("followups", x => ashaIds.has(x.ashaId));
  const refs = db.where("referrals", x => ashaIds.has(x.fromId) || ids.has(x.toOrgId));
  const camps = db.where("camps", c => c.district === d);
  const campIds = new Set(camps.map(c => c.id));
  const today = isoDay();
  const prov = countBy(ver, o => provenance(o, bedTotals(o).updatedAt || o.createdAt));
  return {
    d, orgs, ver, hospitals, beds, withBeds, stale, byType: countBy(ver, o => o.type),
    appts: countBy(inD("appointments"), x => x.status), adms: countBy(inD("admissions"), x => x.status), diag: countBy(inD("diagBookings"), x => x.status),
    camps, campsMonth: camps.filter(c => c.date?.slice(0, 7) === today.slice(0, 7) && ["published", "completed"].includes(c.status)),
    campRegs: db.where("campRegs", r => campIds.has(r.campId) && r.status !== "cancelled").length,
    ashaCount: ashaIds.size, hh, members: sum(hh, x => x.members?.length), fu, fuDone: fu.filter(x => x.done).length, fuOverdue: fu.filter(x => !x.done && x.due < today).length, fuDue: fu.filter(x => !x.done && x.due >= today).length,
    refs, refStatus: countBy(refs, x => x.status), prov, demoOrgs: ver.filter(o => o.demo).length,
    er24: hospitals.filter(o => o.emergency24x7).length, icuHosp: hospitals.filter(o => (o.beds?.icu?.total || 0) > 0).length,
    pharm: ver.filter(o => o.kind === "pharmacy").length, diagC: ver.filter(o => o.kind === "diagnostic").length, amb: ver.filter(o => o.kind === "ambulance").length,
    campsPub: camps.filter(c => ["published", "completed"].includes(c.status)).length,
  };
}
const bedSum = (a) => Object.values(a.beds).reduce((s, b) => ({ total: s.total + b.total, occupied: s.occupied + b.occupied, available: s.available + b.available }), { total: 0, occupied: 0, available: 0 });

const FIELDS = ["name", "type", "district", "mandal", "address", "pin", "phone", "lat", "lng", "hours"];
const HFIELDS = ["depts", "services", "emergencyPhone"];
function completeness(o) {
  const f = [...FIELDS, ...(o.kind === "hospital" ? HFIELDS : [])];
  const miss = f.filter(k => { const v = o[k]; return v == null || v === "" || (Array.isArray(v) && !v.length); });
  return { score: Math.round((f.length - miss.length) / f.length * 100), miss };
}
function downloadCsv(name, rows) {
  const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const a = h("a", { href: URL.createObjectURL(new Blob(["﻿" + rows.map(r => r.map(cell).join(",")).join("\n")], { type: "text/csv" })), download: name });
  document.body.append(a); a.click(); a.remove();
}
const exportBtn = (ctx, name, rowsFn) => btn(t("dh.export", "Export CSV"), () => { downloadCsv(name, rowsFn()); audit("district.export", name, ctx.user.district, ctx.user); }, "", "download");
const distOf = (ctx) => (DISTRICTS.some(x => x.name === ctx.user.district) ? ctx.user.district : DISTRICTS[0].name);
const basis = (text) => h("p", { class: "small muted" }, icon("info", 12), " ", text);

// ---------- routes ----------------------------------------------------------------------------------------
export const routes = {
  async overview(ctx) {
    const d = distOf(ctx), a = agg(d), bt = bedSum(a);
    const staleN = a.stale.length, total = a.withBeds.length;
    const prov = Object.entries(a.prov).map(([k, n]) => ({ label: PROV[k]?.label || k, value: n, tone: { demo: "info", provider: "ok", verified: "ok", outdated: "danger", unverified: "warn", public: "muted" }[k] || "muted" }));
    const fuRate = a.fu.length >= K() ? Math.round(a.fuDone / a.fu.length * 100) + "%" : (a.fu.length ? `<${K()} records` : "—");
    return h("div", {},
      pageHead(`${d} — ${t("nav.overview", "Overview")}`, "District-level monitoring. Aggregated data only; no identifiable patient information is shown.", exportBtn(ctx, `district-${d}-overview.csv`, () => summaryRows([a]))),
      a.demoOrgs ? demoNote() : null,
      staleN ? notice("warn", h("strong", {}, "Incomplete / outdated. "), `${staleN} of ${total} hospital(s) with bed data have not updated within ${db.cfg().staleHours} h. Bed figures below may under- or over-state real availability.`) : null,
      !a.ver.length ? notice("warn", `No verified participating facilities are registered in ${d} yet. Use Coverage to load the public directory, and Service gaps to see where onboarding is needed.`) : null,
      grid(4,
        stat("Participating facilities", a.ver.length, `${a.hospitals.length} hospitals · verified only`),
        stat("Beds reported available", bt.available, `of ${bt.total} capacity · provider-reported`, staleN ? "warn" : ""),
        stat("Camps this month", a.campsMonth.length, "published or completed"),
        stat("ASHA follow-up completion", fuRate, `${a.ashaCount} ASHA account(s) · patient-derived (suppressed <${K()})`)),
      h("div", { style: { height: "1rem" } }),
      h("div", { class: "split even" },
        card({ title: "Verified facilities by type", sub: "Source: platform registry (verification = verified)" },
          Object.keys(a.byType).length ? barChart(Object.entries(a.byType).map(([k, n]) => ({ label: FACILITY_TYPES[k] || k, value: n })), {}) : empty("No verified facilities in this district."),
          basis("Counts of facilities are not patient data and are not suppressed.")),
        card({ title: "Data basis", sub: "How reliable are these numbers?" },
          prov.length ? donut(prov, { center: a.ver.length }) : empty("No facility data."),
          h("div", { class: "cluster", style: { marginTop: ".6rem" } }, Object.keys(a.prov).map(k => provBadge(k))),
          basis(`${a.demoOrgs} of ${a.ver.length} facilities here are DEMO records. Real provider-reported data is flagged outdated after ${db.cfg().staleHours} h without an update.`))),
      card({ title: "Beds by category", sub: "Capacity, occupied and available across verified hospitals · provider-reported" },
        total ? table([
          { h: "Category", f: r => r.label }, { h: "Capacity", f: r => r.total, cls: "right" }, { h: "Occupied", f: r => r.occupied, cls: "right" }, { h: "Available", f: r => h("strong", {}, r.available), cls: "right" },
          { h: "Utilisation", f: r => r.total ? h("div", { class: "cluster" }, meter(r.occupied, r.total, `${r.label} utilisation`), h("small", {}, Math.round(r.occupied / r.total * 100) + "%")) : "—" },
        ], Object.values(a.beds).filter(b => b.total), { label: "Beds by category" }) : empty("No bed data reported for this district."),
        basis(staleN ? `${staleN} hospital(s) stale → treat availability as an upper-bound estimate.` : "All reporting hospitals updated within the freshness window.")),
      h("div", { class: "split even" },
        card({ title: "Appointment requests by status", sub: `Aggregated · counts under ${K()} suppressed` }, Object.keys(a.appts).length ? statusBars(a.appts) : empty("No appointment activity.")),
        card({ title: "Admission requests by status", sub: "A request is not a confirmed admission" }, Object.keys(a.adms).length ? statusBars(a.adms) : empty("No admission requests."))),
      h("div", { class: "split even" },
        card({ title: "Diagnostic test requests by status", sub: "Aggregated across diagnostic centres and hospital labs" }, Object.keys(a.diag).length ? statusBars(a.diag) : empty("No diagnostic requests.")),
        card({ title: "Medical camps", sub: "Registrations are patient-derived (suppressed)" }, h("p", {}, `${a.campsPub} published/completed camp(s) in ${d}; ${a.campsMonth.length} this month.`), h("p", { class: "muted" }, `Total camp registrations: ${sup(a.campRegs)}`), h("a", { class: "btn sm", href: "#/app/camps" }, "Open camps"))));
  },

  async coverage(ctx) {
    const d = ctx.param || distOf(ctx), a = agg(d);
    const out = h("div", { id: "dh-public" }, basis("Not loaded. Public directory data are reference records from AP GIS — not live operations data."));
    const loadPublic = async (force) => {
      out.replaceChildren(h("p", { class: "muted" }, "Loading public directory…"));
      const r = await fetchPublicFacilities(d, { force });
      const els = [];
      if (r.error && !r.items.length) els.push(notice("danger", h("strong", {}, "Could not load public directory. "), r.error + " The Andhra Pradesh GIS service may be unreachable or blocking this browser. Nothing has been estimated."));
      else {
        const by = {}; r.items.forEach(i => { const k = i.typeLabel || i.type; by[k] = (by[k] || 0) + 1; });
        els.push(h("div", { class: "cluster" }, badge("Public directory — not live", "muted", "info"), r.fromCache ? badge(`Cached ${ago(r.fetchedAt)}${r.stale ? " (stale)" : ""}`, r.stale ? "warn" : "muted") : badge(`Fetched ${ago(r.fetchedAt)}`, "ok")),
          r.error ? notice("warn", "Showing cached copy because the live request failed: " + r.error) : null,
          h("p", {}, h("strong", {}, r.items.length), ` public record(s) for ${d}. These are listings, not participating providers; recorded bed numbers are NOT availability.`),
          r.items.length ? barChart(Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => ({ label: k, value: n, tone: "muted" }))) : empty("No public records returned for this district."));
      }
      els.push(btn("Refresh from source", () => loadPublic(true), "sm", "refresh")); out.replaceChildren(...els);
    };
    const sel = h("select", { id: "dh-dsel", onchange: e => ctx.go("coverage/" + encodeURIComponent(e.target.value)) }, DISTRICTS.map(x => h("option", { value: x.name, selected: x.name === d }, x.name)));
    const rows = DISTRICTS.map(x => ({ x, a: agg(x.name) }));
    return h("div", {},
      pageHead(t("dh.coverage", "Coverage"), "Participating (verified) providers versus public directory listings."),
      h("div", { class: "filters" }, h("div", { class: "field" }, h("label", { for: "dh-dsel" }, t("dh.district", "District")), sel)),
      grid(4, stat("Verified facilities", a.ver.length), stat("Hospitals", a.hospitals.length), stat("Beds available", bedSum(a).available, "provider-reported"), stat("Camps (published/completed)", a.campsPub)),
      h("div", { style: { height: "1rem" } }),
      card({ title: `${d}: ASHA activity`, sub: "Patient-derived; suppressed below " + K() }, h("p", {}, `${a.ashaCount} ASHA account(s) · ${sup(a.hh.length)} household(s) on caseload · ${sup(a.fu.length)} follow-up(s) tracked`)),
      card({ title: "Public directory counts", sub: "Public directory — not live", actions: btn(t("dh.loadPublic", "Load public directory counts"), () => loadPublic(false), "primary sm", "cloud") }, out),
      card({ title: "All districts compared", sub: "Participating (verified) providers on this platform" },
        table([
          { h: "District", f: r => h("a", { href: "#/app/coverage/" + encodeURIComponent(r.x.name) }, r.x.name) }, { h: "Facilities", f: r => r.a.ver.length, cls: "right" }, { h: "Hospitals", f: r => r.a.hospitals.length, cls: "right" },
          { h: "Beds available", f: r => bedSum(r.a).available, cls: "right" }, { h: "Camps", f: r => r.a.campsPub, cls: "right" }, { h: "ASHA households", f: r => sup(r.a.hh.length), cls: "right" },
        ], rows, { label: "District comparison" })));
  },

  async gaps(ctx) {
    const d = ctx.param || distOf(ctx);
    const all = DISTRICTS.map(x => ({ x, a: agg(x.name) }));
    const M = [["er24", "24×7 emergency hospitals"], ["icuHosp", "Hospitals with ICU beds"], ["pharm", "Pharmacies"], ["diagC", "Diagnostic centres"], ["campsPub", "Published camps"], ["amb", "Ambulance operators"]];
    const max = Object.fromEntries(M.map(([k]) => [k, Math.max(0, ...all.map(r => r.a[k]))]));
    all.forEach(r => { r.parts = M.map(([k]) => max[k] ? r.a[k] / max[k] : 0); r.index = Math.round(r.parts.reduce((s, v) => s + v, 0) / M.length * 100); r.none = r.a.ver.length === 0; });
    const ranked = [...all].sort((p, q) => p.index - q.index);
    const zero = ranked.filter(r => r.none);
    const mapBox = h("div", {}); const a = all.find(r => r.x.name === d)?.a || agg(d);
    const dd = DISTRICTS.find(x => x.name === d);
    const sel = h("select", { id: "dh-gsel", onchange: e => ctx.go("gaps/" + encodeURIComponent(e.target.value)) }, DISTRICTS.map(x => h("option", { value: x.name, selected: x.name === d }, x.name)));
    queueMicrotask(() => {
      const map = createMap(mapBox, { center: { lat: dd.lat, lng: dd.lng }, zoom: 9, height: "360px" });
      map.setMarkers(a.ver.filter(o => o.lat).map(o => ({ id: o.id, lat: o.lat, lng: o.lng, kind: o.type, title: `${o.name} (${FACILITY_TYPES[o.type] || o.kind})${o.demo ? " — DEMO" : ""}` })));
      if (a.ver.length) setTimeout(() => map.fit(), 200); else map.focus(dd.lat, dd.lng, 9);
    });
    return h("div", {},
      pageHead(t("dh.gaps", "Service gaps"), "Where participating services are thin — to guide onboarding, camps and outreach."),
      notice("warn", h("strong", {}, "Read with care. "), "This index counts participating, verified providers on this platform only. It has no population or travel-time denominator in this prototype, so it shows where the platform has little coverage — not proven unmet need. Districts with real facilities that have not joined will rank low."),
      card({ title: "How the index is calculated" },
        h("p", { class: "small" }, "For each district we count: ", M.map(m => m[1].toLowerCase()).join(", "), ". Each count is divided by the highest district count for that measure (0–1), then the six values are averaged and scaled to 0–100. Higher = more participating services relative to the best-covered district. Equal weights; no clinical weighting."),),
      zero.length ? card({ title: `Districts with no participating providers (${zero.length})`, cls: "warnc" }, h("div", { class: "cluster" }, zero.map(r => h("a", { class: "badge danger", href: "#/app/gaps/" + encodeURIComponent(r.x.name) }, r.x.name)))) : notice("ok", "Every district has at least one verified participating provider."),
      h("div", { class: "split rev" },
        card({ title: "District ranking (lowest first)" }, barChart(ranked.map(r => ({ label: r.x.name, value: r.index, display: String(r.index), tone: r.index < 20 ? "danger" : r.index < 50 ? "warn" : "ok" })), { max: 100 })),
        h("div", {}, h("div", { class: "filters" }, h("div", { class: "field" }, h("label", { for: "dh-gsel" }, "Show facilities in"), sel)),
          card({ title: `Facilities in ${d}`, sub: a.ver.length ? `${a.ver.length} verified marker(s)` : "No verified facilities to show" }, mapBox, !a.ver.length ? empty(`${d} has no participating providers yet.`) : null, a.demoOrgs ? basis("Markers marked DEMO are sample locations near the district centre, not real addresses.") : null))));
  },

  async facilities(ctx) {
    const d = distOf(ctx);
    const orgs = db.where("orgs", o => o.district === d).map(o => ({ o, c: completeness(o), ts: bedTotals(o).updatedAt }));
    const avg = orgs.length ? Math.round(sum(orgs, r => r.c.score) / orgs.length) : 0;
    const rowsCsv = () => [["Name", "Kind", "Type", "Verification", "Last bed update", "Completeness %", "Missing fields", "Provenance"], ...orgs.map(r => [r.o.name, r.o.kind, FACILITY_TYPES[r.o.type] || r.o.type, r.o.verification, r.ts || "", r.c.score, r.c.miss.join("; "), provenance(r.o, r.ts || r.o.createdAt)])];
    return h("div", {},
      pageHead(t("dh.facilities", "Facility register"), `Registered facilities in ${d} (all verification states)`, exportBtn(ctx, `district-${d}-facilities.csv`, rowsCsv)),
      orgs.some(r => r.o.demo) ? demoNote() : null,
      grid(3, stat("Registered", orgs.length), stat("Verified", orgs.filter(r => r.o.verification === "verified").length), stat("Average completeness", avg + "%", "share of expected profile fields filled", avg < 70 ? "warn" : "")),
      h("div", { style: { height: "1rem" } }),
      card({ title: "Facility register" }, table([
        { h: "Facility", f: r => h("div", {}, h("strong", {}, r.o.name), h("div", { class: "small muted" }, FACILITY_TYPES[r.o.type] || r.o.kind)) },
        { h: "Verification", f: r => statusBadge(r.o.verification) },
        { h: "Last bed update", f: r => r.ts ? `${ago(r.ts)}` : h("span", { class: "muted" }, "n/a") },
        { h: "Completeness", f: r => h("div", {}, h("div", { class: "cluster" }, meter(r.c.score, 100, "Completeness"), h("small", {}, r.c.score + "%")), r.c.miss.length ? h("small", { class: "muted" }, "Missing: " + r.c.miss.join(", ")) : null) },
        { h: "Data basis", f: r => provBadge(provenance(r.o, r.ts || r.o.createdAt), r.ts) },
      ], orgs, { empty: `No facilities are registered in ${d} yet.`, label: "Facility register" })));
  },

  async camps(ctx) {
    const d = distOf(ctx), a = agg(d);
    const att = sum(a.camps, c => c.report?.attended), ref = sum(a.camps, c => c.report?.referred);
    const regOf = (c) => db.where("campRegs", r => r.campId === c.id && r.status !== "cancelled").length;
    return h("div", {},
      pageHead(t("dh.camps", "Medical camps"), `Camps in ${d}`, exportBtn(ctx, `district-${d}-camps.csv`, () => [["Title", "Date", "Mandal", "Status", "Registrations (suppressed)", "Attended (report)"], ...a.camps.map(c => [c.title, c.date, c.mandal, c.status, sup(regOf(c)), c.report?.attended ?? ""])])),
      a.camps.some(c => c.demo) ? demoNote() : null,
      grid(4, stat("Camps listed", a.camps.length), stat("Published", a.camps.filter(c => c.status === "published").length), stat("Attendance (reported)", att, "sum of submitted camp reports"), stat("Referred from camps", ref)),
      h("div", { style: { height: "1rem" } }),
      card({ title: "Camp list", sub: "Registrations are suppressed below " + K() }, table([
        { h: "Camp", f: c => h("div", {}, h("strong", {}, c.title), c.demo ? h("div", {}, badge("DEMO DATA", "demo")) : null) }, { h: "Date", f: c => fmtDate(c.date) }, { h: "Mandal", f: c => c.mandal || "—" },
        { h: "Status", f: c => statusBadge(c.status) }, { h: "Registrations", f: c => sup(regOf(c)), cls: "right" }, { h: "Attended", f: c => c.report ? c.report.attended : h("span", { class: "muted" }, "no report"), cls: "right" },
      ], a.camps, { empty: `No camps in ${d}.`, label: "Camps" })));
  },

  async programmes(ctx) {
    const d = distOf(ctx), a = agg(d);
    const today = isoDay();
    return h("div", {},
      pageHead(t("dh.programmes", "Community health"), `ASHA and community programme activity in ${d} — aggregates only, no names.`),
      a.hh.some(x => x.demo) ? demoNote() : null,
      grid(4, stat("ASHA accounts", a.ashaCount), stat("Households on caseload", sup(a.hh.length)), stat("Follow-ups due", sup(a.fuDue)), stat("Follow-ups overdue", sup(a.fuOverdue), "due before " + fmtDate(today), a.fuOverdue ? "warn" : "")),
      h("div", { style: { height: "1rem" } }),
      h("div", { class: "split even" },
        card({ title: "Households visited" }, (() => {
          const b = { "≤14 days": 0, "15–30 days": 0, ">30 days / never": 0 };
          a.hh.forEach(x => { const dd = x.lastVisit ? (Date.now() - new Date(x.lastVisit)) / 864e5 : 999; b[dd <= 14 ? "≤14 days" : dd <= 30 ? "15–30 days" : ">30 days / never"]++; });
          return a.hh.length ? barChart(Object.entries(b).map(([k, n], i) => ({ label: k, value: supVal(n), display: sup(n), tone: i === 2 ? "warn" : "ok" })), { max: Math.max(1, ...Object.values(b).map(supVal)) }) : empty("No household data from ASHA workers in this district.");
        })(), basis("Time since last recorded household visit. Counts below " + K() + " are suppressed.")),
        card({ title: "Referrals by status" }, Object.keys(a.refStatus).length ? statusBars(a.refStatus) : empty("No referrals recorded."))),
      card({ title: "Follow-up completion" }, a.fu.length ? h("div", {}, h("p", {}, a.fu.length >= K() ? `${a.fuDone} of ${a.fu.length} follow-ups completed (${Math.round(a.fuDone / a.fu.length * 100)}%).` : `Fewer than ${K()} follow-up records — not shown to protect individuals.`), basis("Offline-recorded entries appear here only after the ASHA worker syncs.")) : empty("No follow-ups recorded.")));
  },

  async reports(ctx) {
    const d = distOf(ctx);
    return h("div", {},
      pageHead(t("dh.reports", "Reports"), "Download aggregate data as CSV. Exports are recorded in the audit log."),
      notice("info", "Reports contain aggregates only. Patient-derived counts below " + K() + " are suppressed, as on screen."),
      grid(3,
        card({ title: "All-district summary" }, h("p", { class: "small muted" }, "Facilities, beds, camps and ASHA caseload for all 28 districts."), exportBtn(ctx, "all-districts-summary.csv", () => summaryRows(DISTRICTS.map(x => agg(x.name))))),
        card({ title: `${d}: facility register` }, h("p", { class: "small muted" }, "Verification, completeness and provenance per facility."), btn("Open register", () => { ctx.go("facilities"); }, "", "building")),
        card({ title: `${d}: request volumes` }, h("p", { class: "small muted" }, "Appointments, admissions and diagnostics by status (suppressed)."), exportBtn(ctx, `district-${d}-requests.csv`, () => { const a = agg(d); const rows = [["Type", "Status", "Count"]]; [["Appointments", a.appts], ["Admission requests", a.adms], ["Diagnostic requests", a.diag]].forEach(([n, c]) => Object.entries(c).forEach(([s, v]) => rows.push([n, s, sup(v)]))); return rows; }))));
  },
};

function summaryRows(list) {
  return [["District", "Verified facilities", "Hospitals", "Beds capacity", "Beds available", "24x7 emergency hospitals", "Pharmacies", "Diagnostic centres", "Camps (published/completed)", "ASHA households (suppressed)", "Stale-bed hospitals", "Demo facilities"],
    ...list.map(a => { const b = bedSum(a); return [a.d, a.ver.length, a.hospitals.length, b.total, b.available, a.er24, a.pharm, a.diagC, a.campsPub, sup(a.hh.length), a.stale.length, a.demoOrgs]; })];
}
