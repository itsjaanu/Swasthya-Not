// Citizen / Patient workspace.
import { h, icon, fmtDate, isoDay, addDays, ago, km, haversine, clear } from "../util.js";
import { db, audit, notify } from "../db.js";
import { t } from "../i18n.js";
import { DEPARTMENTS, districtByName, DISTRICTS } from "../seed.js";
import { badge, provBadge, statusBadge, pageHead, card, stat, grid, empty, notice, demoNote, btn, link, table, form, modal, confirmDialog, toast, tabs, timeline, kv, fileToData } from "../ui.js";
import { provenance, bedTotals, slotsFor, requestAppointment, setApptStatus, rescheduleAppointment, ADM_FLOW, ADM_LABEL, submitAdmission, setAdmissionStatus, grantConsent, revokeConsent, activeConsent, addRecord, bookTest, DGN_LABEL, registerForCamp, pharmacyStockFor, rankHospitals, profilesFor, orgName } from "../services.js";
import { getPosition, directionsUrl } from "../map.js";
import { explorer, profile } from "./find.js";

// ---- strings: [English, Telugu, Hindi, Tamil] -------------------------------------------------------
const TR = {
  home: ["My health", "నా ఆరోగ్యం", "मेरा स्वास्थ्य", "என் உடல்நலம்"], welcome: ["Welcome", "స్వాగతం", "स्वागत है", "வரவேற்கிறோம்"],
  upcoming: ["Upcoming appointments", "రాబోయే అపాయింట్‌మెంట్లు", "आने वाले अपॉइंटमेंट", "வரவிருக்கும் சந்திப்புகள்"], admReq: ["Admission requests", "అడ్మిషన్ అభ్యర్థనలు", "भर्ती अनुरोध", "அனுமதி கோரிக்கைகள்"],
  tests: ["Test bookings", "పరీక్షల బుకింగ్‌లు", "जाँच बुकिंग", "பரிசோதனை முன்பதிவுகள்"], quick: ["Quick actions", "త్వరిత చర్యలు", "त्वरित कार्य", "விரைவு செயல்கள்"],
  emCard: ["Emergency? Call now", "అత్యవసరమా? ఇప్పుడే కాల్ చేయండి", "आपात स्थिति? अभी कॉल करें", "அவசரமா? இப்போதே அழைக்கவும்"], bookAppt: ["Book an appointment", "అపాయింట్‌మెంట్ బుక్ చేయండి", "अपॉइंटमेंट बुक करें", "சந்திப்பை பதிவு செய்"],
  reqAdmission: ["Request admission", "అడ్మిషన్ కోరండి", "भर्ती का अनुरोध करें", "அனுமதி கோருங்கள்"], bookTest: ["Book a test", "పరీక్ష బుక్ చేయండి", "जाँच बुक करें", "பரிசோதனை பதிவு செய்"],
  reschedule: ["Reschedule", "తేదీ మార్చండి", "समय बदलें", "மாற்றியமை"], cancelAppt: ["Cancel appointment", "అపాయింట్‌మెంట్ రద్దు", "अपॉइंटमेंट रद्द करें", "சந்திப்பை ரத்து செய்"],
  hospital: ["Hospital", "ఆసుపత్రి", "अस्पताल", "மருத்துவமனை"], department: ["Department", "విభాగం", "विभाग", "துறை"], doctor: ["Doctor", "వైద్యుడు", "डॉक्टर", "மருத்துவர்"], date: ["Date", "తేదీ", "तारीख", "தேதி"], time: ["Time slot", "సమయం", "समय", "நேரம்"],
  forWhom: ["Who is this for?", "ఎవరి కోసం?", "यह किसके लिए है?", "யாருக்காக?"], reason: ["Reason for visit", "సందర్శన కారణం", "आने का कारण", "வருகைக் காரணம்"], sendReq: ["Send request", "అభ్యర్థన పంపండి", "अनुरोध भेजें", "கோரிக்கை அனுப்பு"],
  myAppts: ["My appointments", "నా అపాయింట్‌మెంట్లు", "मेरे अपॉइंटमेंट", "என் சந்திப்புகள்"], past: ["Past and closed", "గత / ముగిసినవి", "पिछले / बंद", "கடந்த / முடிந்தவை"],
  admitTitle: ["Request hospital admission", "ఆసుపత్రి అడ్మిషన్ కోరండి", "अस्पताल में भर्ती का अनुरोध", "மருத்துவமனை அனுமதி கோரிக்கை"],
  admNotice: ["This is a request only. It is not a confirmed admission or a reserved bed. The hospital will review it and reply.", "ఇది కేవలం అభ్యర్థన. నిర్ధారిత అడ్మిషన్ లేదా పడక కాదు. ఆసుపత్రి పరిశీలించి సమాధానం ఇస్తుంది.", "यह केवल अनुरोध है। यह पुष्ट भर्ती या आरक्षित बिस्तर नहीं है। अस्पताल समीक्षा करके उत्तर देगा।", "இது கோரிக்கை மட்டுமே. உறுதியான அனுமதி அல்லது ஒதுக்கப்பட்ட படுக்கை அல்ல. மருத்துவமனை பரிசீலித்து பதிலளிக்கும்."],
  emNoWait: ["In an emergency do not wait for online approval. Call 108 or go to the nearest emergency department.", "అత్యవసరంలో ఆన్‌లైన్ ఆమోదం కోసం వేచి ఉండకండి. 108 కు కాల్ చేయండి లేదా దగ్గరి అత్యవసర విభాగానికి వెళ్లండి.", "आपात स्थिति में ऑनलाइन मंज़ूरी का इंतज़ार न करें। 108 पर कॉल करें या नज़दीकी आपातकालीन विभाग जाएँ।", "அவசரத்தில் இணைய ஒப்புதலுக்குக் காத்திருக்க வேண்டாம். 108 ஐ அழைக்கவும் அல்லது அருகிலுள்ள அவசரப் பிரிவுக்குச் செல்லவும்."],
  myAdm: ["My admission requests", "నా అడ్మిషన్ అభ్యర్థనలు", "मेरे भर्ती अनुरोध", "என் அனுமதி கோரிக்கைகள்"], diagTitle: ["Tests and scans", "పరీక్షలు & స్కాన్లు", "जाँच और स्कैन", "பரிசோதனைகள் & ஸ்கேன்"],
  findTest: ["Find a test", "పరీక్ష కనుగొనండి", "जाँच खोजें", "பரிசோதனை தேடு"], myBookings: ["My bookings", "నా బుకింగ్‌లు", "मेरी बुकिंग", "என் முன்பதிவுகள்"],
  recordsTitle: ["My health records", "నా ఆరోగ్య రికార్డులు", "मेरे स्वास्थ्य रिकॉर्ड", "என் மருத்துவ பதிவுகள்"], myRecords: ["Records", "రికార్డులు", "रिकॉर्ड", "பதிவுகள்"],
  sharing: ["Sharing and consent", "షేరింగ్ & సమ్మతి", "साझा करना और सहमति", "பகிர்வு & ஒப்புதல்"], accessLog: ["Access log", "యాక్సెస్ లాగ్", "एक्सेस लॉग", "அணுகல் பதிவு"],
  share: ["Share with a doctor", "వైద్యునితో పంచుకోండి", "डॉक्टर के साथ साझा करें", "மருத்துவருடன் பகிர்"], addRecord: ["Add record", "రికార్డు జోడించండి", "रिकॉर्ड जोड़ें", "பதிவைச் சேர்"], revoke: ["Revoke", "ఉపసంహరించండి", "वापस लें", "திரும்பப்பெறு"],
  familyTitle: ["Family profiles", "కుటుంబ ప్రొఫైళ్లు", "परिवार प्रोफ़ाइल", "குடும்ப சுயவிவரங்கள்"], addMember: ["Add family member", "కుటుంబ సభ్యుని జోడించండి", "परिवार का सदस्य जोड़ें", "குடும்ப உறுப்பினரைச் சேர்"],
  medTitle: ["Medicines", "మందులు", "दवाइयाँ", "மருந்துகள்"], findMed: ["Find a medicine", "మందు కనుగొనండి", "दवा खोजें", "மருந்தைத் தேடு"],
  campsTitle: ["Medical camps near you", "మీ దగ్గరి వైద్య శిబిరాలు", "आपके पास चिकित्सा शिविर", "அருகிலுள்ள மருத்துவ முகாம்கள்"], regCamp: ["Register", "నమోదు", "पंजीकरण", "பதிவு"],
  emTitle: ["Emergency help", "అత్యవసర సహాయం", "आपातकालीन सहायता", "அவசர உதவி"], nearestEr: ["Nearest emergency-capable hospitals", "దగ్గరి అత్యవసర సదుపాయ ఆసుపత్రులు", "नज़दीकी आपातकालीन अस्पताल", "அருகிலுள்ள அவசர சிகிச்சை மருத்துவமனைகள்"],
  useLoc: ["Use my location", "నా లొకేషన్ వాడండి", "मेरा स्थान उपयोग करें", "என் இருப்பிடத்தைப் பயன்படுத்து"],
};
const T = (k) => t("citizen." + k, TR[k][0]);
export const strings = Object.fromEntries(Object.entries(TR).map(([k, [, te, hi, ta]]) => ["citizen." + k, { te, hi, ta }]));

export const css = `
.cz-days{display:flex;flex-wrap:wrap;gap:.4rem}.cz-day{font:inherit;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:.4rem .6rem;cursor:pointer;min-width:76px;text-align:center;line-height:1.25}
.cz-day small{display:block;color:var(--ink-3);font-size:.75rem}.cz-day[aria-pressed=true]{border-color:var(--brand);background:var(--brand-wash);font-weight:700}.cz-day[disabled]{opacity:.45;cursor:not-allowed}
.cz-step{border-left:3px solid var(--line);padding-left:1rem;margin:0 0 1.2rem}.cz-step.done{border-color:var(--brand)}.cz-step h3{margin-bottom:.5rem}
.cz-track{display:flex;flex-wrap:wrap;gap:.3rem;margin:.5rem 0;padding:0;list-style:none}.cz-track li{font-size:.78rem;padding:.15rem .6rem;border-radius:99px;background:var(--muted-bg);color:var(--ink-3)}.cz-track li.done{background:var(--ok-bg);color:var(--ok)}.cz-track li.cur{background:var(--brand);color:#fff;font-weight:700}
.cz-msg{padding:.5rem .7rem;border-radius:10px;background:var(--muted-bg);margin:.3rem 0;font-size:.9rem}.cz-msg.me{background:var(--brand-wash)}
.cz-em{background:var(--marigold);color:var(--marigold-ink);border-radius:var(--r);padding:1rem 1.2rem}.cz-em a.btn{background:#fff;color:#14231f;border-color:#fff}.cz-pre{white-space:pre-wrap;background:var(--muted-bg);padding:.8rem;border-radius:8px}
`;

// ---- helpers ---------------------------------------------------------------------------------------
const today = () => isoDay();
const tel = (p) => "tel:" + (p || "").replace(/[^\d+]/g, "");
const profOpts = (user) => profilesFor(user).map(p => ({ value: p.id, label: `${p.name} (${p.relation})` }));
const nameOf = (user, id) => profilesFor(user).find(p => p.id === id)?.name || user.name;
const nextDays = (n = 14) => Array.from({ length: n }, (_, i) => isoDay(addDays(new Date(), i)));
const dayLabel = (d) => new Date(d + "T00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const orgLine = (o) => h("span", {}, o.name, " ", provBadge(provenance(o, bedTotals(o).updatedAt), bedTotals(o).updatedAt));
const verifiedOrgs = (kinds) => db.where("orgs", o => kinds.includes(o.kind) && o.verification === "verified");
const doctorsOf = (orgId) => db.where("doctors", d => d.orgId === orgId && d.verified && (d.schedule || []).length);
const wrap = (ctx, fn, ok) => { try { const r = fn(); if (ok) toast(ok); ctx.refresh(); return r; } catch (e) { toast(e.message, "danger"); } };
const demoBadge = (o) => o?.demo ? badge("DEMO", "demo") : null;

// ---- home ------------------------------------------------------------------------------------------
async function home(ctx) {
  const { user } = ctx;
  const appts = db.where("appointments", a => a.patientId === user.id && ["requested", "confirmed"].includes(a.status) && a.date >= today()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const adms = db.where("admissions", a => a.patientId === user.id && !["rejected", "discharged", "cancelled"].includes(a.status));
  const dg = db.where("diagBookings", b => b.patientId === user.id && !["cancelled", "rejected"].includes(b.status));
  const notes = db.where("notifications", n => n.userId === user.id && !n.read).slice(0, 4);
  const row = (title, sub, right) => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, title), h("div", { class: "muted small" }, sub)), right);
  return h("div", {},
    pageHead(`${T("welcome")}, ${user.name.split(" ")[0]}`, T("home")),
    h("div", { class: "cz-em", style: { marginBottom: "1rem" } }, h("div", { class: "spread" }, h("div", {}, h("h2", {}, T("emCard")), h("p", {}, t("emerg.banner"))), h("div", { class: "cluster" }, h("a", { class: "btn", href: "tel:108" }, icon("phone", 16), "108"), h("a", { class: "btn", href: "tel:112" }, icon("phone", 16), "112"), h("a", { href: "#/app/emergency" }, T("useLoc"))))),
    grid(4, stat(T("upcoming"), appts.length), stat(T("admReq"), adms.length), stat(T("tests"), dg.length), stat("Unread notices", notes.length, null, notes.length ? "warn" : "")),
    h("div", { style: { height: "1rem" } }),
    card(T("quick"), h("div", { class: "cluster" }, link(T("bookAppt"), "#/app/find", "primary", "calendar"), link(T("reqAdmission"), "#/app/find", "", "bed"), link(T("bookTest"), "#/app/diagnostics", "", "flask"), link("Find a medicine", "#/app/medicines", "", "pill"), link("Share records", "#/app/records", "", "folder"), link("Medical camps", "#/app/camps", "", "tent"))),
    h("div", { class: "split even" },
      card({ title: T("upcoming"), actions: link("All", "#/app/appointments", "sm ghost") }, appts.length ? h("div", { class: "list" }, appts.slice(0, 4).map(a => row(`${db.get("doctors", a.doctorId)?.name} · ${fmtDate(a.date)} ${a.time}`, `${a.forName} · ${orgName(a.orgId)}`, statusBadge(a.status)))) : empty("No upcoming appointments.", link(T("bookAppt"), "#/app/find", "sm primary"))),
      card({ title: T("admReq"), actions: link("All", "#/app/admissions", "sm ghost") }, adms.length ? h("div", { class: "list" }, adms.map(a => row(`${a.ref} · ${a.department}`, `${orgName(a.orgId)} · ${a.forName}`, statusBadge(a.status)))) : empty("No active admission requests."))),
    h("div", { class: "split even" },
      card({ title: T("tests"), actions: link("All", "#/app/diagnostics", "sm ghost") }, dg.length ? h("div", { class: "list" }, dg.slice(0, 4).map(b => row(`${b.testName} · ${fmtDate(b.date)} ${b.slot}`, `${b.forName} · ${orgName(b.orgId)}`, statusBadge(b.status)))) : empty("No test bookings.")),
      card({ title: "Notifications", actions: link("Open", "#/app/notifications", "sm ghost") }, notes.length ? h("div", { class: "list" }, notes.map(n => row(n.title, `${n.body || ""} · ${ago(n.at)}`, null))) : empty("You are all caught up."))),
    demoNote());
}

// ---- booking an appointment -----------------------------------------------------------------------
async function book(ctx) {
  const { user } = ctx;
  const st = { orgId: ctx.param || "", doctorId: ctx.rest[0] || "", dept: "", date: "", time: "" };
  if (st.doctorId) { const d = db.get("doctors", st.doctorId); if (d) { st.orgId = d.orgId; st.dept = d.spec; } }
  const box = h("div");
  const hospitals = verifiedOrgs(["hospital"]).filter(o => doctorsOf(o.id).length);
  const step = (n, title, done, ...body) => h("div", { class: "cz-step " + (done ? "done" : "") }, h("h3", {}, `${n}. ${title}`), body);
  const render = () => {
    clear(box);
    const org = db.get("orgs", st.orgId), docs = org ? doctorsOf(org.id) : [], depts = [...new Set(docs.map(d => d.spec))];
    const doc = db.get("doctors", st.doctorId);
    box.append(step(1, T("hospital"), !!org, (() => { const s = h("select", { "aria-label": T("hospital"), onchange: e => { st.orgId = e.target.value; st.dept = st.doctorId = st.date = st.time = ""; render(); } }, h("option", { value: "" }, "Select a hospital…"), hospitals.map(o => h("option", { value: o.id, selected: o.id === st.orgId }, `${o.name} — ${o.district}${o.demo ? " [DEMO]" : ""}`))); return s; })(), org ? h("p", { class: "small muted" }, orgLine(org)) : null));
    if (org) box.append(step(2, T("department"), !!st.dept, h("div", { class: "chips" }, depts.map(dp => h("button", { class: "btn sm " + (st.dept === dp ? "primary" : ""), type: "button", "aria-pressed": st.dept === dp, onclick: () => { st.dept = dp; st.doctorId = st.date = st.time = ""; render(); } }, dp)))));
    if (st.dept) box.append(step(3, T("doctor"), !!doc, h("div", { class: "chips" }, docs.filter(d => d.spec === st.dept).map(d => h("button", { class: "btn sm " + (st.doctorId === d.id ? "primary" : ""), type: "button", "aria-pressed": st.doctorId === d.id, onclick: () => { st.doctorId = d.id; st.date = st.time = ""; render(); } }, d.name, d.fee ? ` · ₹${d.fee}` : " · Free")))));
    if (doc) box.append(step(4, T("date"), !!st.date, h("div", { class: "cz-days" }, nextDays().map(d => { const free = slotsFor(doc, d).filter(s => s.free).length; return h("button", { class: "cz-day", type: "button", disabled: !free, "aria-pressed": st.date === d, onclick: () => { st.date = d; st.time = ""; render(); } }, dayLabel(d), h("small", {}, free ? `${free} slots` : "No slots")); })), h("p", { class: "small muted" }, "Only days when this doctor has free slots can be chosen.")));
    if (st.date && doc) box.append(step(5, T("time"), !!st.time, h("div", { class: "cz-days" }, slotsFor(doc, st.date).map(s => h("button", { class: "cz-day", type: "button", disabled: !s.free, "aria-pressed": st.time === s.time, style: { minWidth: "64px" }, onclick: () => { st.time = s.time; render(); } }, s.time, s.free ? null : h("small", {}, "Taken"))))));
    if (st.time) box.append(step(6, `${T("forWhom")} / ${T("reason")}`, false, form([
      { name: "forId", label: T("forWhom"), type: "select", options: profOpts(user), value: user.id, required: true },
      { name: "reason", label: T("reason"), type: "textarea", required: true, wide: true, placeholder: "e.g. fever for 3 days, follow-up of blood pressure" },
    ], { submitLabel: T("sendReq"), onSubmit: (v) => { const a = requestAppointment(user, { doctorId: doc.id, date: st.date, time: st.time, forId: v.forId, forName: nameOf(user, v.forId), reason: v.reason }); done(a); } })));
  };
  const done = (a) => { clear(box).append(card({ cls: "accent", title: "Request sent" }, notice("ok", h("div", {}, h("strong", {}, "Reference " + a.ref), h("p", {}, "This is a request. The hospital will confirm or reject it and you will be notified. It is not confirmed until the status says Confirmed."))), kv([["Doctor", db.get("doctors", a.doctorId).name], ["Hospital", orgName(a.orgId)], ["When", `${fmtDate(a.date)} ${a.time}`], ["For", a.forName], ["Status", statusBadge(a.status)]]), h("div", { class: "form-actions" }, link("Track in My appointments", "#/app/appointments", "primary")))); };
  render();
  return h("div", {}, pageHead(T("bookAppt"), "Choose a hospital, doctor and a free time slot."), notice("info", t("emerg.banner")), card({}, box));
}

// ---- appointments ----------------------------------------------------------------------------------
async function appointments(ctx) {
  const { user } = ctx;
  const all = db.where("appointments", a => a.patientId === user.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const isUp = (a) => ["requested", "confirmed"].includes(a.status) && a.date >= today();
  const item = (a) => { const d = db.get("doctors", a.doctorId), o = db.get("orgs", a.orgId); return h("div", { class: "row", style: { alignItems: "flex-start" } },
    h("div", { class: "grow" }, h("div", { class: "title" }, `${d?.name || "Doctor"} · ${d?.spec || ""}`), h("div", { class: "small" }, `${fmtDate(a.date)} at ${a.time} · ${a.forName}`), h("div", { class: "muted small" }, `${o?.name} · Ref ${a.ref} · ${a.reason}`),
      h("details", { class: "small" }, h("summary", {}, "Status history"), timeline(a.history.map(x => ({ at: x.at, by: x.by, text: x.text }))))),
    h("div", { class: "cluster" }, statusBadge(a.status), demoBadge(a),
      isUp(a) ? [btn(T("reschedule"), () => reschedule(ctx, a), "sm"), btn(T("cancelAppt"), async () => { if (await confirmDialog("Cancel this appointment?", "Cancel appointment", true)) wrap(ctx, () => setApptStatus(user, a.id, "cancelled", "Cancelled by patient"), "Appointment cancelled"); }, "sm")] : null,
      o?.lat ? h("a", { class: "btn sm", href: directionsUrl(o), target: "_blank", rel: "noopener" }, icon("navi", 14), t("common.directions", "Directions")) : null)); };
  const up = all.filter(isUp), past = all.filter(a => !isUp(a));
  return h("div", {}, pageHead(T("myAppts"), "Track requests, reschedule or cancel.", link(T("bookAppt"), "#/app/find", "primary", "plus")),
    card(T("upcoming"), up.length ? h("div", { class: "list" }, up.map(item)) : empty("No upcoming appointments.")), card(T("past"), past.length ? h("div", { class: "list" }, past.map(item)) : empty("Nothing here yet.")));
}
function reschedule(ctx, a) {
  const doc = db.get("doctors", a.doctorId); const days = nextDays().filter(d => slotsFor(doc, d).some(s => s.free && !(d === a.date && s.time === a.time)));
  if (!days.length) return toast("No free slots in the next 14 days.", "danger");
  const opts = (d) => slotsFor(doc, d).filter(s => s.free).map(s => ({ value: s.time, label: s.time }));
  const m = modal(T("reschedule"), (close) => form([
    { name: "date", label: T("date"), type: "select", required: true, options: days.map(d => ({ value: d, label: dayLabel(d) })), value: days[0] },
    { name: "time", label: T("time"), type: "select", required: true, options: opts(days[0]) },
  ], { submitLabel: T("reschedule"), onCancel: close, onInput: (v, els) => { if (els.time.dataset.d !== v.date) { els.time.dataset.d = v.date; const cur = els.time.value; clear(els.time).append(h("option", { value: "" }, "Select…"), opts(v.date).map(o => h("option", { value: o.value }, o.label))); els.time.value = cur && opts(v.date).some(o => o.value === cur) ? cur : ""; } }, onSubmit: (v) => { rescheduleAppointment(ctx.user, a.id, v.date, v.time); toast("Reschedule requested — the hospital will confirm."); close(); ctx.refresh(); } }));
}

// ---- admission request -----------------------------------------------------------------------------
async function admit(ctx) {
  const { user } = ctx; const org = db.get("orgs", ctx.param);
  if (!org || org.kind !== "hospital") return empty("Hospital not found.", link("Find hospitals", "#/app/find", "primary"));
  const emBox = h("div", { hidden: true }, notice("danger", h("div", {}, h("strong", {}, "This looks like an emergency. "), t("citizen.emNoWait", TR.emNoWait[0]), h("div", { class: "cluster", style: { marginTop: ".5rem" } }, h("a", { class: "btn danger", href: "tel:108" }, "Call 108"), link("Nearest emergency hospitals", "#/app/emergency", "")))));
  const f = form([
    { name: "forId", label: T("forWhom"), type: "select", options: profOpts(user), value: user.id, required: true },
    { name: "caregiver", label: "I am filling this in as a caregiver / family member for the patient", type: "checkbox" },
    { name: "caregiverNote", label: "Your name and relationship to the patient", show: v => v.caregiver, required: true },
    { name: "department", label: T("department"), type: "select", options: org.depts.filter(d => d !== "Emergency & Trauma"), required: true },
    { name: "category", label: "Admission category", type: "select", required: true, options: ["Planned (surgery / procedure)", "Medical (non-emergency)", "Maternity / delivery", "Paediatric", "Transfer from another hospital", "Other"] },
    { name: "urgency", label: "How urgent is this?", type: "select", required: true, value: "routine", options: [{ value: "routine", label: "Routine / planned" }, { value: "urgent", label: "Urgent — within 1–2 days" }, { value: "emergency", label: "Emergency — life threatening, right now" }] },
    { name: "reason", label: "Reason for admission and relevant history", type: "textarea", required: true, wide: true, rows: 4 },
    { name: "docs", label: "Documents (referral letter, reports) — optional", type: "file", wide: true, hint: "Only file names are sent in this prototype." },
  ], { submitLabel: T("sendReq"), onInput: (v) => { emBox.hidden = v.urgency !== "emergency"; }, onSubmit: (v, fm) => {
    if (v.urgency === "emergency") { emBox.hidden = false; throw new Error("Emergencies cannot be sent as online requests. Call 108 or go to the nearest emergency department now."); }
    const docs = [...(fm.els.docs.files || [])].map(x => ({ name: x.name }));
    const a = submitAdmission(user, { orgId: org.id, department: v.department, category: v.category, urgency: v.urgency, forName: nameOf(user, v.forId) + (v.caregiver ? ` (requested by ${v.caregiverNote})` : ""), reason: v.reason, docs });
    toast("Admission request " + a.ref + " submitted"); ctx.go("admissions"); } });
  f.els.docs.multiple = true;
  return h("div", {}, pageHead(T("admitTitle"), org.name), notice("warn", h("strong", {}, T("admNotice"))), notice("danger", t("citizen.emNoWait", TR.emNoWait[0])), card({ title: org.name, sub: `${org.district} · ${org.type.replace("_", " ")}` }, emBox, f));
}

// ---- admissions list -------------------------------------------------------------------------------
const PATH = ["submitted", "received", "under_review", "accepted", "arrived", "admitted", "discharged"];
async function admissions(ctx) {
  const { user } = ctx;
  const list = db.where("admissions", a => a.patientId === user.id);
  const item = (a) => { const idx = PATH.indexOf(a.status), end = ["rejected", "cancelled"].includes(a.status);
    return card({ title: `${a.ref} — ${orgName(a.orgId)}`, sub: `${a.department} · ${a.forName} · ${fmtDate(a.createdAt, true)}`, actions: [statusBadge(a.status), demoBadge(a)] },
      end ? notice(a.status === "rejected" ? "danger" : "info", ADM_LABEL[a.status] + (a.status === "rejected" ? " — see the hospital's message below. You may contact the hospital or choose another." : "")) : h("ol", { class: "cz-track" }, PATH.map((s, i) => h("li", { class: i < idx ? "done" : i === idx ? "cur" : "" }, ADM_LABEL[s].split(" — ")[0]))),
      a.status === "info_requested" ? notice("warn", "The hospital needs more information. Reply below.") : null,
      a.status === "accepted" ? notice("ok", "Accepted by the hospital. Follow their instructions below. Bed allocation is confirmed by the hospital on arrival.") : null,
      kv([["Category", a.category], ["Urgency", a.urgency], ["Reason", a.reason], ["Documents", (a.docs || []).map(d => d.name).join(", ") || "—"]]),
      h("h3", { style: { marginTop: "1rem" } }, "Messages"), a.messages.length ? a.messages.map(m => h("div", { class: "cz-msg " + (m.from === "Patient" ? "me" : "") }, h("strong", {}, m.from), " · ", h("span", { class: "muted small" }, ago(m.at)), h("div", {}, m.text))) : h("p", { class: "muted small" }, "No messages yet."),
      h("details", { class: "small" }, h("summary", {}, "Status history"), timeline(a.history)),
      h("div", { class: "cluster", style: { marginTop: ".6rem" } },
        !end && !["discharged", "admitted"].includes(a.status) ? btn(a.status === "info_requested" ? "Send information" : "Send message", () => replyAdm(ctx, a), a.status === "info_requested" ? "primary sm" : "sm", "chat") : null,
        ["submitted", "received", "under_review", "info_requested"].includes(a.status) ? btn("Cancel request", async () => { if (await confirmDialog("Cancel this admission request?", "Cancel request", true)) wrap(ctx, () => setAdmissionStatus(user, a.id, "cancelled", "Cancelled by patient"), "Request cancelled"); }, "sm") : null)); };
  return h("div", {}, pageHead(T("myAdm"), "Requests are reviewed by the hospital. A request is not a confirmed bed.", link(T("reqAdmission"), "#/app/find", "primary", "plus")), notice("danger", t("citizen.emNoWait", TR.emNoWait[0])), list.length ? list.map(item) : card({}, empty("You have not made any admission requests.", link("Find a hospital", "#/app/find", "primary"))));
}
function replyAdm(ctx, a) {
  modal("Message to hospital", (close) => form([{ name: "text", label: "Your message or requested information", type: "textarea", required: true, wide: true }], { submitLabel: "Send", onCancel: close, onSubmit: (v) => {
    if (a.status === "info_requested") setAdmissionStatus(ctx.user, a.id, "under_review", v.text);
    else { a.messages.push({ at: new Date().toISOString(), from: "Patient", text: v.text }); db.update("admissions", a.id, { messages: a.messages }); audit("admission.message", a.ref, v.text, ctx.user); }
    close(); toast("Message sent"); ctx.refresh(); } }));
}

// ---- diagnostics ------------------------------------------------------------------------------------
async function diagnostics(ctx) {
  const { user } = ctx; const orgs = verifiedOrgs(["hospital", "diagnostic"]);
  const results = h("div"); let draw = () => {};
  const f = form([
    { name: "q", label: "Test name", placeholder: "e.g. CBC, MRI, glucose" }, { name: "cat", label: "Category", type: "select", options: ["Blood", "Imaging", "Other"] }, { name: "district", label: t("common.district", "District"), type: "select", options: DISTRICTS.map(d => d.name), value: user.district },
  ], { submitLabel: t("common.search", "Search"), onSubmit: () => draw(), onInput: () => draw() });
  f.querySelector(".form-actions")?.remove();
  draw = () => {
    const v = f.read(); const rows = [];
    orgs.forEach(o => { if (v.district && o.district !== v.district) return; (o.tests || []).forEach(x => { if (!x.available) return; if (v.cat && x.category !== v.cat) return; if (v.q && !(x.name + x.code).toLowerCase().includes(v.q.toLowerCase())) return; rows.push({ o, x }); }); });
    clear(results).append(table([{ h: "Test", f: r => h("span", {}, r.x.name, " ", badge(r.x.category)) }, { h: "Centre", f: r => h("span", {}, r.o.name, " ", demoBadge(r.o)) }, { h: "Price", f: r => "₹" + r.x.price }, { h: "Report", f: r => r.x.tat }, { h: "Fasting", f: r => r.x.fasting ? "Yes" : "No" }, { h: "", f: r => btn(T("bookTest"), () => ctx.go(`booktest/${r.o.id}/${r.x.code}`), "sm primary") }], rows.slice(0, 60), { empty: "No centres in this district offer a matching test. Try another district.", label: "Tests" }));
  }; draw();
  const mine = db.where("diagBookings", b => b.patientId === user.id);
  const bookings = () => mine.length ? h("div", { class: "list" }, mine.map(b => h("div", { class: "row", style: { alignItems: "flex-start" } }, h("div", { class: "grow" }, h("div", { class: "title" }, `${b.testName} — ${b.forName}`), h("div", { class: "small muted" }, `${orgName(b.orgId)} · ${fmtDate(b.date)} ${b.slot} · Ref ${b.ref}`), h("details", { class: "small" }, h("summary", {}, "Status history"), timeline(b.history))),
    h("div", { class: "cluster" }, statusBadge(b.status), demoBadge(b), b.reportId ? btn("View report", () => ctx.go("records"), "sm primary", "file") : null, ["requested", "confirmed"].includes(b.status) ? btn("Cancel", async () => { if (await confirmDialog("Cancel this test booking?", "Cancel booking", true)) wrap(ctx, () => { b.history.push({ at: new Date().toISOString(), by: user.name, text: "Cancelled by patient" }); db.update("diagBookings", b.id, { status: "cancelled", history: b.history }); audit("diagnostic.cancelled", b.ref, "", user); }, "Booking cancelled"); }, "sm") : null)))) : empty("No test bookings yet.");
  return h("div", {}, pageHead(T("diagTitle"), "Blood tests, scans and other investigations."), tabs([{ id: "find", label: T("findTest"), render: () => h("div", {}, f, results) }, { id: "mine", label: T("myBookings"), count: mine.length, render: bookings }]));
}
async function booktest(ctx) {
  const { user } = ctx; const org = db.get("orgs", ctx.param), test = org?.tests.find(x => x.code === ctx.rest[0]);
  if (!test) return empty("Test not found.", link("Find tests", "#/app/diagnostics", "primary"));
  const slots = []; for (let m = 8 * 60; m < 17 * 60; m += 30) slots.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return h("div", {}, pageHead(T("bookTest"), `${test.name} at ${org.name}`), card({ title: test.name, sub: `₹${test.price} · Report: ${test.tat} · ${test.fasting ? "Fasting needed (8–10 h)" : "No fasting needed"}`, actions: [demoBadge(org), badge(test.category)] }, notice("info", "This is a booking request. The centre confirms the time. Reports appear in My health records when released."), form([
    { name: "forId", label: T("forWhom"), type: "select", options: profOpts(user), value: user.id, required: true },
    { name: "date", label: T("date"), type: "select", required: true, options: nextDays().map(d => ({ value: d, label: dayLabel(d) })) },
    { name: "slot", label: T("time"), type: "select", required: true, options: slots },
    { name: "doctorNote", label: "Doctor's advice / notes (optional)", type: "textarea", wide: true },
  ], { submitLabel: T("sendReq"), onCancel: () => ctx.go("diagnostics"), onSubmit: (v) => { const b = bookTest(user, { orgId: org.id, testCode: test.code, date: v.date, slot: v.slot, forId: v.forId, forName: nameOf(user, v.forId), doctorNote: v.doctorNote }); toast("Test requested: " + b.ref); ctx.go("diagnostics"); } })));
}

// ---- records, consent, access log ------------------------------------------------------------------
const REC_TYPES = [["lab", "Lab report"], ["imaging", "Imaging / scan"], ["prescription", "Prescription"], ["consult", "Consultation note"], ["discharge", "Discharge summary"], ["other", "Other"]];
function grantForm(ctx, pre = [], onDone) {
  const docs = db.where("users", u => u.role === "doctor" && u.status === "active"), recs = db.where("records", r => r.ownerId === ctx.user.id);
  return form([
    { name: "doctorUserId", label: T("doctor"), type: "select", required: true, options: docs.map(d => ({ value: d.id, label: `${d.name}${db.get("doctors", d.doctorId)?.spec ? " — " + db.get("doctors", d.doctorId).spec : ""}` })) },
    { name: "recordIds", label: "Records to share", type: "multiselect", wide: true, options: recs.map(r => ({ value: r.id, label: `${r.subjectName.replace(" (Demo)", "")}: ${r.title}` })) },
    { name: "purpose", label: "Purpose", required: true, wide: true, placeholder: "e.g. diabetes follow-up consultation" },
    { name: "days", label: "Access lasts for", type: "select", required: true, value: "7", options: [{ value: "1", label: "1 day" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }] },
  ], { initial: { recordIds: pre }, submitLabel: "Share records", onSubmit: (v) => { grantConsent(ctx.user, { doctorUserId: v.doctorUserId, recordIds: v.recordIds, purpose: v.purpose, days: +v.days }); toast("Records shared. You can revoke access at any time."); onDone(); } });
}
async function records(ctx) {
  const { user } = ctx; const recs = db.where("records", r => r.ownerId === user.id).sort((a, b) => b.date.localeCompare(a.date));
  const fl = { who: "", type: "" }; const list = h("div");
  const draw = () => { const rows = recs.filter(r => (!fl.who || r.subjectId === fl.who) && (!fl.type || r.type === fl.type));
    clear(list).append(rows.length ? h("div", { class: "list" }, rows.map(r => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, r.title), h("div", { class: "small muted" }, `${r.subjectName} · ${fmtDate(r.date)} · ${orgName(r.orgId)}`)),
      h("div", { class: "cluster" }, badge(REC_TYPES.find(x => x[0] === r.type)?.[1] || r.type), demoBadge(r), r.source === "diagnostic" ? badge("From diagnostic centre", "info") : null, btn(t("common.view", "View"), () => viewRec(r), "sm", "eye"), btn(T("share"), () => modal(T("share"), (close) => grantForm(ctx, [r.id], () => { close(); ctx.refresh(); })), "sm", "users"))))) : empty("No records match."));
  };
  const myTab = () => { const fw = h("div", { class: "filters" }, h("div", { class: "field" }, h("label", {}, "Person"), h("select", { onchange: e => { fl.who = e.target.value; draw(); } }, h("option", { value: "" }, "Everyone"), profOpts(user).map(o => h("option", { value: o.value }, o.label)))), h("div", { class: "field" }, h("label", {}, "Type"), h("select", { onchange: e => { fl.type = e.target.value; draw(); } }, h("option", { value: "" }, "All types"), REC_TYPES.map(o => h("option", { value: o[0] }, o[1])))), btn(T("addRecord"), () => addRec(ctx), "primary", "plus")); draw(); return h("div", {}, fw, list); };
  const cons = db.where("consents", c => c.patientId === user.id).sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
  const consTab = () => h("div", {}, notice("info", "Doctors can only see records you share. You choose which records, for what purpose and for how long. You can revoke at any time."),
    notice("warn", h("div", {}, h("strong", {}, "Emergency access. "), "If you are unconscious and a verified doctor must treat you, they can open your records for a short period by giving a written reason. This is logged, you are notified, and an administrator reviews it.")),
    card(T("share"), grantForm(ctx, [], () => ctx.refresh())),
    card("Who has access", cons.length ? h("div", { class: "list" }, cons.map(c => { const st = c.revokedAt ? "revoked" : activeConsent(c) ? "active" : "expired"; return h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, c.doctorName, c.via === "emergency" ? [" ", badge("Emergency access", "danger")] : null), h("div", { class: "small muted" }, `${c.purpose} · ${c.recordIds === "all" ? "all records" : c.recordIds.length + " record(s)"} · from ${fmtDate(c.grantedAt, true)} to ${fmtDate(c.expiresAt, true)}${c.revokedAt ? " · revoked " + ago(c.revokedAt) : ""}`)), h("div", { class: "cluster" }, badge(st, st === "active" ? "ok" : "muted"), st === "active" ? btn(T("revoke"), async () => { if (await confirmDialog(`Stop ${c.doctorName} from seeing your records?`, "Revoke access", true)) wrap(ctx, () => revokeConsent(user, c.id), "Access revoked"); }, "sm danger") : null)); })) : empty("You have not shared records with anyone.")));
  const logs = db.where("accessLog", a => a.patientId === user.id).sort((a, b) => b.at.localeCompare(a.at));
  const logTab = () => card({ title: "Who opened your records", sub: "Every access by a doctor is listed here." }, table([{ h: "When", f: a => fmtDate(a.at, true) }, { h: "Who", f: a => a.accessorName }, { h: "Record", f: a => a.recordTitle || db.get("records", a.recordId)?.title || "—" }, { h: "How", f: a => a.via === "emergency" ? badge("Emergency access", "danger") : badge("With your consent", "ok") }], logs, { empty: "No one has opened your records yet." }));
  return h("div", {}, pageHead(T("recordsTitle"), "Your reports, prescriptions and notes — private unless you share them."), tabs([{ id: "recs", label: T("myRecords"), count: recs.length, render: myTab }, { id: "consent", label: T("sharing"), count: cons.filter(activeConsent).length, render: consTab }, { id: "log", label: T("accessLog"), count: logs.length, render: logTab }], ctx.rest[0] || (ctx.param === "sharing" ? "consent" : "recs")));
}
function viewRec(r) {
  modal(r.title, () => h("div", {}, kv([["Person", r.subjectName], ["Date", fmtDate(r.date)], ["From", orgName(r.orgId)]]), h("div", { class: "cz-pre", style: { marginTop: ".8rem" } }, r.content || "—"), r.attachment ? h("p", {}, h("a", { class: "btn sm", href: r.attachment.data, download: r.attachment.name }, icon("download", 14), r.attachment.name)) : null, r.demo ? demoNote() : null), { wide: false });
}
function addRec(ctx) {
  modal(T("addRecord"), (close) => form([
    { name: "subjectId", label: "Person", type: "select", required: true, options: profOpts(ctx.user), value: ctx.user.id }, { name: "type", label: "Type", type: "select", required: true, options: REC_TYPES.map(x => ({ value: x[0], label: x[1] })) },
    { name: "title", label: "Title", required: true, wide: true }, { name: "date", label: "Date", type: "date", required: true, value: today(), max: today() },
    { name: "content", label: "Details / findings (type or paste)", type: "textarea", wide: true, rows: 4 }, { name: "file", label: "Attach a file (≤ 400 KB)", type: "file", wide: true, accept: "image/*,.pdf" },
  ], { submitLabel: "Save record", onCancel: close, onSubmit: async (v) => { if (!v.content?.trim() && !v.file) throw new Error("Add details or attach a file."); const attachment = await fileToData(v.file); addRecord(ctx.user, { subjectId: v.subjectId, subjectName: nameOf(ctx.user, v.subjectId), type: v.type, title: v.title, date: v.date, content: v.content, attachment, source: "uploaded", orgId: null, demo: !!ctx.user.demo }); audit("record.added", v.title, "", ctx.user); close(); toast("Record added"); ctx.refresh(); } }));
}

// ---- family ----------------------------------------------------------------------------------------
async function family(ctx) {
  const { user } = ctx; const fam = db.where("family", f => f.ownerId === user.id);
  const edit = (m) => modal(m ? "Edit family member" : T("addMember"), (close) => form([
    { name: "name", label: "Full name", required: true }, { name: "relation", label: "Relationship", type: "select", required: true, options: ["Spouse", "Child", "Father", "Mother", "Sibling", "Grandparent", "Other dependant"] },
    { name: "dob", label: "Date of birth", type: "date", required: true, max: today() }, { name: "sex", label: "Sex", type: "select", options: [{ value: "F", label: "Female" }, { value: "M", label: "Male" }, { value: "O", label: "Other" }] },
    { name: "consent", label: "I confirm this person, or their legal guardian where applicable, has explicitly agreed to this profile being managed. This does not automatically authorize sharing records with doctors or pharmacies.", type: "checkbox" },
  ], { initial: m, submitLabel: t("common.save", "Save"), onCancel: close, onSubmit: (v) => { if (!v.consent) throw new Error("Consent is required to add a family member."); if (m) db.update("family", m.id, v); else db.insert("family", { ...v, ownerId: user.id, demo: !!user.demo }); audit(m ? "family.updated" : "family.added", v.name, "", user); close(); toast("Saved"); ctx.refresh(); } }));
  const age = (d) => Math.floor((Date.now() - new Date(d)) / 31557600000);
  return h("div", {}, pageHead(T("familyTitle"), "Manage appointments and records for people you care for.", btn(T("addMember"), () => edit(null), "primary", "plus")),
    card({}, h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, user.name), h("div", { class: "small muted" }, "Self")), badge("You", "info")), fam.length ? h("div", { class: "list" }, fam.map(m => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, m.name, " ", demoBadge(m)), h("div", { class: "small muted" }, `${m.relation} · ${m.dob ? age(m.dob) + " years" : ""} · ${m.sex || ""}`)), h("div", { class: "cluster" }, btn("Edit", () => edit(m), "sm"), btn("Remove", async () => { if (await confirmDialog(`Remove ${m.name}? Their records stay in your records list.`, "Remove", true)) wrap(ctx, () => { db.remove("family", m.id); audit("family.removed", m.name, "", user); }, "Removed"); }, "sm danger"))))) : empty("No family members added yet.")));
}

// ---- medicines -------------------------------------------------------------------------------------
async function medicines(ctx) {
  const { user } = ctx; const home = districtByName(user.district); const out = h("div");
  const search = form([{ name: "q", label: "Medicine name", placeholder: "e.g. Metformin, paracetamol", required: true }], { submitLabel: t("common.search", "Search"), onSubmit: (v) => {
    const res = pharmacyStockFor(v.q).map(r => ({ ...r, d: home ? haversine(home, r.org) : null })).sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
    clear(out).append(notice("info", "Stock is reported by the pharmacy and may change. Reserving only sends a request; the pharmacy confirms. Prescription-only medicines need a valid prescription."), res.length ? table([{ h: "Medicine", f: r => h("span", {}, r.stock.name, " ", r.stock.schedule !== "OTC" ? badge("Prescription (Sch. " + r.stock.schedule + ")", "warn") : null) }, { h: "Pharmacy", f: r => h("span", {}, r.org.name, " ", demoBadge(r.org), h("div", { class: "small muted" }, `${r.org.district}${r.d != null ? " · ~" + km(r.d) : ""}`)) }, { h: "In stock", f: r => h("span", {}, r.stock.qty > 30 ? "Available" : "Low stock", h("div", { class: "small muted" }, "updated " + ago(r.stock.updatedAt))) }, { h: "₹", f: r => r.stock.price }, { h: "", f: r => btn("Ask pharmacy to reserve", () => enquire(r), "sm primary") }], res, { label: "Pharmacies" }) : empty("No verified pharmacy reports this medicine in stock. Try the generic name."));
  } });
  const enquire = (r) => modal("Reserve " + r.stock.name, (close) => form([{ name: "qty", label: "Quantity", type: "number", required: true, value: 10, min: 1 }, { name: "note", label: "Note for the pharmacist (optional)", type: "textarea", wide: true }], { submitLabel: "Send enquiry", onCancel: close, onSubmit: (v) => { db.insert("enquiries", { patientId: user.id, orgId: r.org.id, medicine: r.stock.name, qty: v.qty, status: "open", note: v.note, demo: !!user.demo }); audit("enquiry.created", r.stock.name, r.org.name, user); close(); toast("Enquiry sent to " + r.org.name); ctx.refresh(); } }));
  const enqs = db.where("enquiries", e => e.patientId === user.id);
  const rx = db.where("records", r => r.ownerId === user.id && r.subjectId === user.id && r.type === "prescription"), rxr = db.where("rxRequests", r => r.patientId === user.id);
  const sendRx = (r) => modal("Send prescription to a pharmacy", (close) => h("div", {}, notice("warn", "You are choosing to share this prescription with the selected pharmacy. In this prototype the request is saved locally in this browser; no pharmacy receives it. Only share a prescription belonging to you, and use a real verified channel for actual dispensing."), kv([["Prescription", r.title], ["Patient", r.subjectName], ["Items", (r.rx?.items || []).map(i => `${i.name} (${i.dose})`).join("; ") || r.content]]), form([{ name: "orgId", label: "Pharmacy", type: "select", required: true, options: verifiedOrgs(["pharmacy"]).map(o => ({ value: o.id, label: `${o.name} — ${o.district}` })) }], { submitLabel: "Send prescription", onCancel: close, onSubmit: (v) => { db.insert("rxRequests", { rxId: r.id, patientId: user.id, patientName: r.subjectName, orgId: v.orgId, items: r.rx?.items || [], text: r.content, title: r.title, status: "requested", demo: !!user.demo }); audit("rx.sent", r.title, orgName(v.orgId), user); close(); toast("Prescription request saved locally"); ctx.refresh(); } })));
  return h("div", {}, pageHead(T("medTitle"), "Check which nearby pharmacies report your medicine in stock."), notice("warn", "Prototype mode: requests and prescription shares are stored in this browser only. They are not delivered to a real pharmacy. Do not enter sensitive prescription details here."), tabs([
    { id: "find", label: T("findMed"), render: () => h("div", {}, search, out) },
    { id: "enq", label: "My enquiries", count: enqs.length, render: () => enqs.length ? h("div", { class: "list" }, enqs.map(e => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, `${e.medicine} × ${e.qty}`), h("div", { class: "small muted" }, `${orgName(e.orgId)} · ${ago(e.createdAt)}${e.note ? " · " + e.note : ""}`), e.reply ? h("div", { class: "small" }, "Pharmacy: " + e.reply) : null), statusBadge(e.status)))) : empty("No enquiries yet.") },
    { id: "rx", label: "Prescriptions", count: rx.length, render: () => h("div", {}, rx.length ? h("div", { class: "list" }, rx.map(r => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, r.title), h("div", { class: "small muted" }, `${r.subjectName} · ${fmtDate(r.date)}`)), btn("Send to pharmacy", () => sendRx(r), "sm primary", "pill")))) : empty("No prescriptions in your records."), rxr.length ? card("Sent to pharmacies", h("div", { class: "list" }, rxr.map(r => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, r.title), h("div", { class: "small muted" }, orgName(r.orgId))), statusBadge(r.status))))) : null) },
  ]));
}

// ---- camps -----------------------------------------------------------------------------------------
async function camps(ctx) {
  const { user } = ctx; const dflt = user.district && DISTRICTS.some(d => d.name === user.district) ? user.district : ""; const list = h("div"); let dist = "";
  const regs = db.where("campRegs", r => r.citizenId === user.id && r.status !== "cancelled");
  const draw = () => { const cs = db.where("camps", c => c.status === "published" && c.date >= today() && (!dist || c.district === dist)).sort((a, b) => a.date.localeCompare(b.date));
    clear(list).append(cs.length ? h("div", { class: "grid g-auto" }, cs.map(c => { const n = db.where("campRegs", r => r.campId === c.id && r.status !== "cancelled").length; return card({ title: c.title, sub: `${c.district} · ${c.mandal}`, actions: demoBadge(c) }, h("p", { class: "small" }, c.description), kv([["Date", `${fmtDate(c.date)}, ${c.start}–${c.end}`], ["Venue", `${c.venue}, ${c.village}`], ["Services", c.services.join(", ")], ["Doctors", c.doctors.join(", ")], ["Registered", `${n}${c.capacity ? " of " + c.capacity : ""}`]]), h("div", { class: "form-actions" }, btn(T("regCamp"), () => regModal(c), "primary sm", "tent"))); })) : empty("No upcoming published camps in this district. Try another district."));
  };
  const regModal = (c) => modal(`${T("regCamp")}: ${c.title}`, (close) => form([{ name: "forId", label: T("forWhom"), type: "select", options: profOpts(user), required: true, value: user.id }], { submitLabel: "Confirm registration", onCancel: close, onSubmit: (v) => {
    const personName = nameOf(user, v.forId);
    const existing = db.where("campRegs", r => r.campId === c.id && r.citizenId === user.id && r.forName === personName && r.status !== "cancelled");
    if (existing.length) throw new Error(`${personName} is already registered for this camp.`);
    registerForCamp(user, c, personName); close(); toast("Registered for " + c.title); ctx.refresh();
  } }));
  dist = dflt; draw();
  return h("div", {}, pageHead(T("campsTitle"), "Free community health camps published by approved organizers."),
    h("div", { class: "filters" }, h("div", { class: "field" }, h("label", {}, t("common.district", "District")), h("select", { onchange: e => { dist = e.target.value; draw(); } }, h("option", { value: "" }, t("common.all", "All")), DISTRICTS.map(d => h("option", { value: d.name, selected: d.name === dflt }, d.name))))),
    list, card("My camp registrations", regs.length ? h("div", { class: "list" }, regs.map(r => { const c = db.get("camps", r.campId); return h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, c?.title), h("div", { class: "small muted" }, `${r.forName} · ${c ? fmtDate(c.date) + " " + c.start : ""} · ${c?.venue || ""}`)), h("div", { class: "cluster" }, statusBadge(r.status), r.status === "registered" ? btn("Cancel", async () => { if (await confirmDialog("Cancel this registration?", "Cancel registration", true)) wrap(ctx, () => { db.update("campRegs", r.id, { status: "cancelled" }); audit("camp.cancelled", c?.title, r.forName, user); }, "Registration cancelled"); }, "sm") : null)); })) : empty("You have not registered for any camp.")));
}

// ---- emergency -------------------------------------------------------------------------------------
async function emergency(ctx) {
  const { user } = ctx; const out = h("div"); let loc = districtByName(user.district) ? { lat: districtByName(user.district).lat, lng: districtByName(user.district).lng, label: user.district } : null, exact = false;
  const draw = () => { if (!loc) return clear(out).append(empty("Choose a district or use your location to see nearby hospitals."));
    const ranked = rankHospitals(loc, ["trauma"]).filter(r => r.org.emergency24x7).slice(0, 5);
    clear(out).append(h("p", { class: "small muted" }, `Distances are rough road estimates from ${exact ? "your location" : loc.label + " (district centre)"}.`), ranked.length ? h("div", { class: "list" }, ranked.map(r => { const o = r.org, er = o.beds?.emergency, ts = er?.updatedAt; return h("div", { class: "row", style: { alignItems: "flex-start" } }, h("div", { class: "grow" }, h("div", { class: "title" }, o.name, " ", demoBadge(o)), h("div", { class: "small muted" }, `${o.district} · ~${km(r.distKm)} · ~${r.etaMin} min`), h("div", { class: "small", style: { marginTop: ".3rem" } }, er ? `Last reported emergency-bed count: ${Math.max(0, er.total - er.occupied - (er.unavailable || 0))} (not a reservation or confirmation) ` : "No emergency bed data ", provBadge(provenance(o, ts), ts)), r.warns.length ? h("div", { class: "small muted" }, "⚠ " + r.warns.join(" · ")) : null),
      h("div", { class: "cluster" }, h("a", { class: "btn sm primary", href: tel(o.emergencyPhone || o.phone) }, icon("phone", 14), t("common.call", "Call")), h("a", { class: "btn sm", href: directionsUrl(o, exact ? loc : null), target: "_blank", rel: "noopener" }, icon("navi", 14), t("common.directions", "Directions")))); })) : empty("No 24×7 emergency hospitals found near this location. Call 108."), notice("warn", "Bed figures are provider-reported snapshots, not live confirmation or a reservation. Demo figures are illustrative only. Always call the hospital or 108 for current guidance."));
  };
  draw();
  return h("div", {}, pageHead(T("emTitle")), h("div", { class: "cz-em", style: { marginBottom: "1rem" } }, h("h2", {}, "Call 108 (ambulance) or 112 (all emergencies)"), h("p", {}, t("citizen.emNoWait", TR.emNoWait[0])), h("div", { class: "cluster" }, h("a", { class: "btn", href: "tel:108" }, icon("phone", 16), "Call 108"), h("a", { class: "btn", href: "tel:112" }, icon("phone", 16), "Call 112"))),
    card("What to tell the operator", h("ul", {}, h("li", {}, "Where you are — village / mandal / landmark or the address."), h("li", {}, "What happened and how many people need help."), h("li", {}, "Whether the person is awake, breathing and bleeding."), h("li", {}, "Your phone number. Stay on the line until they say you can hang up."))),
    card({ title: T("nearestEr"), actions: [h("select", { "aria-label": t("common.district", "District"), onchange: e => { const d = districtByName(e.target.value); if (d) { loc = { lat: d.lat, lng: d.lng, label: d.name }; exact = false; draw(); } } }, h("option", { value: "" }, t("common.district", "District")), DISTRICTS.map(d => h("option", { value: d.name, selected: d.name === user.district }, d.name))), btn(T("useLoc"), async () => { try { const p = await getPosition(); loc = { ...p, label: "your location" }; exact = true; draw(); } catch (e) { toast(e.message, "danger"); } }, "sm", "pin")] }, out),
    notice("info", "Swasthya Connect cannot dispatch an ambulance. Online requests are never an emergency channel."));
}

export const nav = [
  { id: "home", icon: "home", key: "nav.home", label: "Home" }, { id: "find", icon: "map", key: "nav.find", label: "Find care" }, { id: "appointments", icon: "calendar", key: "nav.appointments", label: "Appointments" },
  { id: "admissions", icon: "bed", key: "nav.admissions", label: "Admission requests" }, { id: "diagnostics", icon: "flask", key: "nav.diagnostics", label: "Tests & scans" }, { id: "records", icon: "folder", key: "nav.records", label: "Health records" },
  { id: "family", icon: "users", key: "nav.family", label: "Family" }, { id: "medicines", icon: "pill", key: "nav.medicines", label: "Medicines" }, { id: "camps", icon: "tent", key: "nav.camps", label: "Medical camps" }, { id: "emergency", icon: "siren", key: "nav.emergency", label: "Emergency" },
];
export const routes = {
  home, find: (ctx) => explorer(ctx), hospital: (ctx) => profile(ctx, ctx.param), book, appointments, admit, admissions, diagnostics, booktest, records, family, medicines, camps, emergency,
};
