// ASHA / community health worker workspace. Offline-first: entries made offline are queued and synced later.
import { h, icon, ago, fmtDate, isoDay, haversine, km } from "../util.js";
import { db, audit, net } from "../db.js";
import { districtByName } from "../seed.js";
import { card, stat, grid, table, form, modal, toast, badge, statusBadge, pageHead, empty, notice, btn } from "../ui.js";
import { t } from "../i18n.js";

const mk = (rows) => Object.fromEntries(rows.map(([k, te, hi, ta]) => [k, { te, hi, ta }]));
export const strings = mk([
  ["as.nav.assist", "అపాయింట్‌మెంట్ సహాయం", "अपॉइंटमेंट सहायता", "சந்திப்பு உதவி"], ["as.nav.sync", "సింక్", "सिंक", "ஒத்திசை"], ["as.title.home", "ఈ రోజు పనులు", "आज के कार्य", "இன்றைய பணிகள்"],
  ["as.title.households", "కుటుంబాల జాబితా", "परिवारों की सूची", "குடும்பங்கள் பட்டியல்"], ["as.title.followups", "ఫాలో-అప్‌లు", "फॉलो-अप", "தொடர் பணிகள்"], ["as.title.referrals", "రిఫరల్స్", "रेफरल", "பரிந்துரைகள்"],
  ["as.title.assist", "అపాయింట్‌మెంట్ సహాయం", "अपॉइंटमेंट सहायता", "சந்திப்பு உதவி"], ["as.title.camps", "సమీప శిబిరాలు", "नज़दीकी शिविर", "அருகிலுள்ள முகாம்கள்"], ["as.title.sync", "సింక్ క్యూ", "सिंक कतार", "ஒத்திசைவு வரிசை"],
  ["as.addHh", "కుటుంబాన్ని జోడించండి", "परिवार जोड़ें", "குடும்பத்தைச் சேர்"], ["as.visit", "సందర్శన నమోదు", "विज़िट दर्ज करें", "வருகை பதிவு"], ["as.done", "పూర్తయింది", "हो गया", "முடிந்தது"],
  ["as.newFu", "కొత్త ఫాలో-అప్", "नया फॉलो-अप", "புதிய தொடர் பணி"], ["as.newRef", "కొత్త రిఫరల్", "नया रेफरल", "புதிய பரிந்துரை"], ["as.syncNow", "సింక్ చేయండి", "अभी सिंक करें", "இப்போது ஒத்திசை"],
  ["as.pending", "పెండింగ్", "लंबित", "நிலுவை"], ["as.synced", "సింక్ అయింది", "सिंक हो गया", "ஒத்திசைந்தது"],
]);
export const nav = [
  { id: "home", icon: "home", key: "nav.home", label: "Today" }, { id: "households", icon: "users", key: "nav.households", label: "Households" },
  { id: "followups", icon: "calendar", key: "nav.followups", label: "Follow-ups" }, { id: "referrals", icon: "navi", key: "nav.referrals", label: "Referrals" },
  { id: "assist", icon: "phone", key: "as.nav.assist", label: "Appointment help" }, { id: "camps", icon: "tent", key: "nav.camps", label: "Camps" }, { id: "sync", icon: "refresh", key: "as.nav.sync", label: "Sync" },
];
export const css = `.as-pend{outline:2px dashed var(--marigold);outline-offset:-2px}.as-member{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;font-size:.88rem}.as-late{color:var(--danger);font-weight:700}`;

// Module-level: re-render when connectivity changes (only while an ASHA page is on screen)
let activeCtx = null;
window.addEventListener("netstate", () => { if (activeCtx && document.querySelector(".as-root")) activeCtx.refresh(); });

const state = () => net.offline ? "pending" : "synced";
const mineHh = (u) => db.where("ashaHouseholds", x => x.ashaId === u.id), mineFu = (u) => db.where("followups", x => x.ashaId === u.id);
const mineRef = (u) => db.where("referrals", x => x.fromId === u.id), mineVis = (u) => db.where("ashaVisits", x => x.ashaId === u.id);
const pendingAll = (u) => [...mineHh(u), ...mineFu(u), ...mineRef(u), ...mineVis(u)].filter(x => x.syncState === "pending");
const syncBadge = (r) => r.syncState === "pending" ? badge(t("as.pending", "Pending sync"), "warn", "cloud") : badge(t("as.synced", "Synced"), "ok", "check");
const wrap = (ctx, ...kids) => { activeCtx = ctx; return h("div", { class: "as-root" }, kids); };
const syncChip = (u) => { const n = pendingAll(u).length; return net.offline ? badge(`Offline · ${n} to sync`, "warn", "wifioff") : n ? badge(`${n} waiting to sync`, "warn", "cloud") : badge("All synced", "ok", "check"); };
const offlineNote = () => net.offline ? notice("warn", h("strong", {}, "You are offline. "), "New entries are saved on this device (marked Pending) and sync when you are back online.") : null;

async function home(ctx) {
  const u = ctx.user, today = isoDay(), fu = mineFu(u).filter(f => !f.done).sort((a, b) => a.due.localeCompare(b.due));
  const overdue = fu.filter(f => f.due < today), dueNow = fu.filter(f => f.due === today), soon = fu.filter(f => f.due > today).slice(0, 5);
  const needVisit = mineHh(u).filter(x => (Date.now() - new Date(x.lastVisit || 0)) / 864e5 > 30);
  const hh = (id) => db.get("ashaHouseholds", id);
  const fuRow = (f) => h("div", { class: "row" + (f.syncState === "pending" ? " as-pend" : "") }, h("div", { class: "grow" }, h("div", { class: "title" }, `${f.who} — ${f.reason}`), h("small", { class: f.due < today ? "as-late" : "muted" }, `${f.due < today ? "Overdue · " : ""}Due ${fmtDate(f.due)}${hh(f.householdId) ? " · " + hh(f.householdId).head : ""}`)), syncBadge(f), btn(t("as.done", "Done"), () => completeFu(ctx, f), "sm"));
  return wrap(ctx, pageHead(t("as.title.home", "Today"), `${u.name} · ${u.village || ""} ${u.mandal || ""}`, syncChip(u), btn(t("as.addHh", "Add household"), () => ctx.go("households"), "primary", "plus")), offlineNote(),
    grid(4, stat("Due today", dueNow.length, "", dueNow.length ? "warn" : ""), stat("Overdue", overdue.length, "", overdue.length ? "danger" : "ok"), stat("Households", mineHh(u).length, `${needVisit.length} not visited in 30+ days`), stat("Referrals open", mineRef(u).filter(r => !["completed", "declined"].includes(r.status)).length)),
    h("div", { class: "split", style: { marginTop: "1rem" } },
      card({ title: "Follow-ups" }, fu.length ? h("div", { class: "list" }, [...overdue, ...dueNow, ...soon].map(fuRow)) : empty("No follow-ups waiting. Add one from a household visit.")),
      card({ title: "Households needing a visit", sub: "Not visited in over 30 days" }, needVisit.length ? h("div", { class: "list" }, needVisit.map(x => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, x.head), h("small", { class: "muted" }, `Last visit ${x.lastVisit ? ago(x.lastVisit) : "never"}`)), btn(t("as.visit", "Record visit"), () => visitForm(ctx, x), "sm")))) : empty("Every household was visited recently."))));
}
function completeFu(ctx, f) { db.update("followups", f.id, { done: true, doneAt: new Date().toISOString(), syncState: state() }); audit("asha.followup.done", f.who, f.reason); toast("Marked done" + (net.offline ? " (saved offline)" : "")); ctx.refresh(); }

// ---- households -----------------------------------------------------------------------------
function parseMembers(text) {
  const out = [], bad = [];
  text.split("\n").map(s => s.trim()).filter(Boolean).forEach((ln, i) => {
    const [name, age, sex, flags] = ln.split("|").map(s => s.trim());
    if (!name || !/^\d{1,3}$/.test(age || "") || !/^[MFOmfo]$/.test(sex || "")) return bad.push(i + 1);
    out.push({ id: "m" + Date.now().toString(36) + i, name, age: +age, sex: sex.toUpperCase(), flags: flags ? flags.split(";").map(s => s.trim()).filter(Boolean) : [] });
  });
  if (bad.length) throw new Error(`Check member line ${bad.join(", ")}. Use: Name | age | M/F/O | flag; flag`);
  return out;
}
async function households(ctx) {
  const list = mineHh(ctx.user);
  return wrap(ctx, pageHead(t("as.title.households", "Households"), "Only households you registered are shown.", syncChip(ctx.user), btn(t("as.addHh", "Add household"), () => addHh(ctx), "primary", "plus")), offlineNote(),
    list.length ? h("div", { class: "grid g-auto" }, list.map(x => card({ cls: x.syncState === "pending" ? "as-pend" : "" },
      h("div", { class: "spread" }, h("h3", {}, x.head), syncBadge(x)), h("p", { class: "small muted" }, `${x.address || ""} · ${x.village}`),
      h("div", { class: "stack", style: { marginTop: ".5rem" } }, x.members.map(m => h("div", { class: "as-member" }, h("strong", {}, m.name), `${m.age} y · ${m.sex}`, ...m.flags.map(f => badge(f, "warn"))))),
      h("p", { class: "small muted" }, `Last visit: ${x.lastVisit ? ago(x.lastVisit) : "never"}`),
      h("div", { class: "cluster" }, btn(t("as.visit", "Record visit"), () => visitForm(ctx, x), "sm primary"), btn(t("as.newFu", "Follow-up"), () => fuForm(ctx, x), "sm"))))) : empty("No households yet.", btn(t("as.addHh", "Add household"), () => addHh(ctx), "primary")));
}
function addHh(ctx) {
  modal(t("as.addHh", "Add household"), (close) => form([
    { name: "head", label: "Head of household", required: true }, { name: "village", label: "Village", required: true, value: ctx.user.village },
    { name: "address", label: "House / landmark", wide: true }, { name: "members", label: "Members (one per line)", type: "textarea", rows: 4, required: true, wide: true, hint: "Name | age | M/F/O | flag; flag   e.g. Gowri | 54 | F | Hypertension (known)" },
    { name: "consent", label: "The household has agreed to be registered for community health follow-up.", type: "checkbox" },
  ], { submitLabel: t("common.save", "Save"), onCancel: close, onSubmit: (v) => {
    if (!v.consent) throw new Error("Confirm the household agreed to registration.");
    const members = parseMembers(v.members); if (!members.length) throw new Error("Add at least one member.");
    const r = db.insert("ashaHouseholds", { ashaId: ctx.user.id, head: v.head.trim(), village: v.village.trim(), address: v.address, members, lastVisit: null, syncState: state(), demo: !!ctx.user.demo });
    audit("asha.household.added", r.head, net.offline ? "saved offline" : ""); toast(net.offline ? "Saved on this device — will sync later" : "Household added"); close(); ctx.refresh();
  } }));
}
function visitForm(ctx, hhRow) {
  modal(`Visit: ${hhRow.head}`, (close) => form([
    { name: "notes", label: "Visit notes", type: "textarea", required: true, wide: true, hint: "Keep to what you observed and advised. No diagnoses." },
    { name: "fu", label: "Add a follow-up?", type: "checkbox" }, { name: "who", label: "Follow-up for", type: "select", options: hhRow.members.map(m => m.name), show: v => v.fu, required: false },
    { name: "reason", label: "Follow-up reason", show: v => v.fu }, { name: "due", label: "Due date", type: "date", min: isoDay(), show: v => v.fu },
  ], { submitLabel: t("as.visit", "Record visit"), onCancel: close, onSubmit: (v) => {
    if (v.fu && (!v.who || !v.reason?.trim() || !v.due)) throw new Error("Fill in who, why and the due date for the follow-up.");
    db.insert("ashaVisits", { ashaId: ctx.user.id, householdId: hhRow.id, at: new Date().toISOString(), notes: v.notes.trim(), syncState: state() });
    db.update("ashaHouseholds", hhRow.id, { lastVisit: new Date().toISOString(), syncState: net.offline ? "pending" : hhRow.syncState });
    if (v.fu) db.insert("followups", { ashaId: ctx.user.id, householdId: hhRow.id, who: v.who, reason: v.reason.trim(), due: v.due, done: false, syncState: state() });
    audit("asha.visit", hhRow.head, net.offline ? "saved offline" : ""); toast(net.offline ? "Visit saved offline" : "Visit recorded"); close(); ctx.refresh();
  } }));
}
function fuForm(ctx, hhRow) {
  const hs = mineHh(ctx.user);
  modal(t("as.newFu", "New follow-up"), (close) => form([
    ...(hhRow ? [] : [{ name: "householdId", label: "Household", type: "select", required: true, options: hs.map(x => ({ value: x.id, label: x.head })) }]),
    { name: "who", label: "Person", required: true, ...(hhRow ? { type: "select", options: hhRow.members.map(m => m.name) } : {}) }, { name: "reason", label: "Reason", required: true }, { name: "due", label: "Due date", type: "date", required: true, min: isoDay() },
  ], { submitLabel: t("common.save", "Save"), onCancel: close, onSubmit: (v) => {
    db.insert("followups", { ashaId: ctx.user.id, householdId: hhRow?.id || v.householdId, who: v.who.trim(), reason: v.reason.trim(), due: v.due, done: false, syncState: state() });
    audit("asha.followup.added", v.who, v.reason); toast("Follow-up added"); close(); ctx.refresh();
  } }));
}
async function followups(ctx) {
  const list = mineFu(ctx.user).sort((a, b) => (a.done - b.done) || a.due.localeCompare(b.due)), today = isoDay();
  return wrap(ctx, pageHead(t("as.title.followups", "Follow-ups"), "", syncChip(ctx.user), btn(t("as.newFu", "New follow-up"), () => fuForm(ctx), "primary", "plus")), offlineNote(),
    card({}, table([{ h: "Person", f: f => f.who }, { h: "Reason", f: f => f.reason }, { h: "Household", f: f => db.get("ashaHouseholds", f.householdId)?.head || "—" },
      { h: "Due", f: f => h("span", { class: !f.done && f.due < today ? "as-late" : "" }, fmtDate(f.due), !f.done && f.due < today ? " · overdue" : "") }, { h: "Status", f: f => f.done ? badge("Done", "ok") : badge("Open", "info") }, { h: "Sync", f: syncBadge },
      { h: "", f: f => f.done ? null : btn(t("as.done", "Done"), () => completeFu(ctx, f), "sm") }], list, { empty: "No follow-ups yet." })));
}

// ---- referrals --------------------------------------------------------------------------------
async function referrals(ctx) {
  const list = mineRef(ctx.user);
  return wrap(ctx, pageHead(t("as.title.referrals", "Referrals"), "Track what happened after you referred someone.", syncChip(ctx.user), btn(t("as.newRef", "New referral"), () => refForm(ctx), "primary", "plus")), offlineNote(),
    card({}, table([{ h: "Person", f: r => r.patientName }, { h: "To", f: r => db.get("orgs", r.toOrgId)?.name || "—" }, { h: "Speciality", f: r => r.toSpecialty }, { h: "Urgency", f: r => r.urgency === "urgent" ? badge("Urgent", "danger") : badge("Routine") },
      { h: "Reason", f: r => r.reason }, { h: "Status", f: r => statusBadge(r.status) }, { h: "Sent", f: r => ago(r.createdAt) }, { h: "Sync", f: syncBadge }], list, { empty: "No referrals yet." })));
}
function refForm(ctx) {
  const d = districtByName(ctx.user.district);
  const orgs = db.where("orgs", o => o.kind === "hospital" && o.verification === "verified").map(o => ({ o, d: d && o.lat ? haversine(d, o) : null })).sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
  const people = mineHh(ctx.user).flatMap(x => x.members.map(m => m.name));
  modal(t("as.newRef", "New referral"), (close) => form([
    { name: "patientName", label: "Person being referred", required: true, wide: true, hint: people.length ? "From your households: " + people.slice(0, 6).join(", ") : undefined },
    { name: "toOrgId", label: "Refer to (nearest first)", type: "select", required: true, wide: true, options: orgs.map(({ o, d: dd }) => ({ value: o.id, label: `${o.name} — ${o.district}${dd != null ? " · " + km(dd) : ""}` })) },
    { name: "toSpecialty", label: "Speciality", type: "select", required: true, options: ["General Medicine", "Obstetrics & Gynaecology", "Paediatrics", "Orthopaedics", "Cardiology", "ENT", "Ophthalmology", "Emergency & Trauma"] },
    { name: "urgency", label: "Urgency", type: "select", required: true, options: [{ value: "routine", label: "Routine" }, { value: "urgent", label: "Urgent" }], value: "routine" }, { name: "reason", label: "Reason for referral", type: "textarea", required: true, wide: true },
  ], { submitLabel: "Send referral", onCancel: close, onSubmit: (v) => {
    const r = db.insert("referrals", { fromId: ctx.user.id, fromName: ctx.user.name, fromRole: "asha", patientName: v.patientName.trim(), toOrgId: v.toOrgId, toSpecialty: v.toSpecialty, reason: v.reason.trim(), urgency: v.urgency, status: "sent", syncState: state(), demo: !!ctx.user.demo });
    audit("asha.referral", r.patientName, db.get("orgs", v.toOrgId)?.name); toast(net.offline ? "Referral saved offline — it is sent when you sync" : "Referral sent"); close(); ctx.refresh();
  } }));
}

// ---- appointment assistance (records a follow-up; does NOT book on the citizen's behalf) -------
async function assist(ctx) {
  const members = mineHh(ctx.user).flatMap(x => x.members.map(m => ({ value: x.id + "|" + m.name, label: `${m.name} (${x.head}'s household)` })));
  const facs = db.where("orgs", o => o.kind === "hospital" && o.verification === "verified").sort((a, b) => (a.district === ctx.user.district ? 0 : 1) - (b.district === ctx.user.district ? 0 : 1));
  const camps = db.where("camps", c => c.status === "published" && c.district === ctx.user.district && c.date >= isoDay());
  return wrap(ctx, pageHead(t("as.title.assist", "Appointment assistance"), "Help someone get an appointment. The person (or their family) books or confirms it themselves — you remember to follow up."), offlineNote(),
    notice("info", "This does not book anything. It creates a follow-up reminder so you can check the visit happened."),
    h("div", { class: "split even" }, card({ title: "Record assistance" }, members.length ? form([
      { name: "member", label: "Person", type: "select", required: true, options: members, wide: true }, { name: "orgId", label: "Facility", type: "select", required: true, wide: true, options: facs.map(o => ({ value: o.id, label: `${o.name} — ${o.district}` })) },
      { name: "date", label: "Preferred date", type: "date", required: true, min: isoDay() }, { name: "note", label: "Note", wide: true },
    ], { submitLabel: "Save as follow-up", onSubmit: (v) => {
      const [hid, who] = v.member.split("|"); const o = db.get("orgs", v.orgId);
      db.insert("followups", { ashaId: ctx.user.id, householdId: hid, who, reason: `Appointment assistance at ${o.name}${v.note ? " — " + v.note : ""}`, due: v.date, kind: "assist", done: false, syncState: state() });
      audit("asha.assist", who, o.name); toast("Follow-up saved"); ctx.refresh();
    } }) : empty("Add a household first.", btn(t("as.addHh", "Add household"), () => ctx.go("households"), "primary"))),
      card({ title: t("as.title.camps", "Camps near you"), sub: ctx.user.district }, campList(camps))));
}
const campText = (c) => `${c.title}\n${fmtDate(c.date)} ${c.start}–${c.end}\n${c.venue}, ${c.village}, ${c.mandal}, ${c.district}\nServices: ${c.services.join(", ")}\n(Free — register through Swasthya Connect or walk in.)`;
function campList(camps) {
  return camps.length ? h("div", { class: "list" }, camps.map(c => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, c.title, c.demo ? " " : null, c.demo ? badge("DEMO", "demo") : null), h("small", { class: "muted" }, `${fmtDate(c.date)} · ${c.village}, ${c.mandal}`), h("div", { class: "small" }, c.services.join(" · "))),
    btn("Copy message", async () => { try { await navigator.clipboard.writeText(campText(c)); toast("Message copied — paste it into WhatsApp or SMS"); } catch { toast("Copy is not available on this device.", "danger"); } }, "sm", "link")))) : empty("No published camps coming up in your district.");
}
async function camps(ctx) {
  const all = db.where("camps", c => c.status === "published" && c.date >= isoDay()), mine_ = all.filter(c => c.district === ctx.user.district);
  return wrap(ctx, pageHead(t("as.title.camps", "Camps near you"), "Share these with households in your area."), card({ title: ctx.user.district || "Your district" }, campList(mine_)),
    all.length > mine_.length ? card({ title: "Other districts" }, campList(all.filter(c => c.district !== ctx.user.district))) : null);
}

// ---- sync -------------------------------------------------------------------------------------
async function sync(ctx) {
  const u = ctx.user, q = pendingAll(u);
  const label = (r) => r.head ? `Household: ${r.head}` : r.notes ? `Visit note (${db.get("ashaHouseholds", r.householdId)?.head || ""})` : r.patientName ? `Referral: ${r.patientName}` : `Follow-up: ${r.who} — ${r.reason}`;
  const go = btn(`${t("as.syncNow", "Sync")} ${q.length} pending record${q.length === 1 ? "" : "s"}`, () => {
    if (net.offline) return toast("You are offline. Connect to the internet to sync.", "danger");
    const cols = { ashaHouseholds: mineHh(u), followups: mineFu(u), referrals: mineRef(u), ashaVisits: mineVis(u) };
    for (const [c, rows] of Object.entries(cols)) rows.filter(r => r.syncState === "pending").forEach(r => db.update(c, r.id, { syncState: "synced", syncedAt: new Date().toISOString() }));
    audit("asha.sync", u.email, `${q.length} records`); toast(`${q.length} records synced`); ctx.refresh();
  }, "primary", "refresh"); if (!q.length || net.offline) go.disabled = true;
  return wrap(ctx, pageHead(t("as.title.sync", "Sync queue"), "Records made without internet wait here.", syncChip(u), go),
    net.offline ? notice("warn", "You are offline — syncing is paused.") : q.length ? notice("info", "You are online. Press sync to send pending records.") : notice("ok", "Everything is synced."),
    card({}, table([{ h: "Record", f: label }, { h: "State", f: syncBadge }], q, { empty: "No pending records." })));
}

export const routes = { home, households, followups, referrals, assist, camps, sync };
