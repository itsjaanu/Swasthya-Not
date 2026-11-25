// Shared building blocks for provider workspaces (hospital, diagnostic centre, doctor).
import { h, clear, fmtDate, isoDay, ago } from "../util.js";
import { db, audit } from "../db.js";
import { TEST_CATALOG, DISTRICTS, FACILITY_TYPES, DEPARTMENTS } from "../seed.js";
import { setApptStatus, setBookingStatus, releaseReport, DGN_LABEL } from "../services.js";
import { statusBadge, card, empty, notice, btn, table, form, modal, toast, confirmDialog, fileToData, kv, badge } from "../ui.js";
import { getPosition } from "../map.js";
import { t } from "../i18n.js";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = DAY_NAMES.map(d => d.slice(0, 3));
export const again = (ctx) => () => { ctx._keepScroll = true; ctx.refresh(); };
export const scheduleSummary = (s = []) => s.length ? [...s].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)).map(r => `${DAY_SHORT[r.day]} ${r.start}–${r.end} (${r.slotMins} min)`).join("; ") : "No schedule set";
const hhmm = (s) => { const [a, b] = s.split(":").map(Number); return a * 60 + b; };

// Ask for a free-text note in a modal. Resolves to the note, or null if cancelled.
export function askNote(title, label, { required = true, submitLabel = "Continue", hint = "" } = {}) {
  return new Promise(res => {
    let done = false;
    modal(title, (close) => form([{ name: "note", label, type: "textarea", required, wide: true, hint }], {
      submitLabel,
      onSubmit: (v) => { if (required && !v.note.trim()) throw new Error("Please enter a message."); done = true; close(); res(v.note.trim()); },
      onCancel: () => { done = true; close(); res(null); },
    }), { onClose: () => { if (!done) res(null); } });
  });
}

// Weekly availability editor. get() validates and returns [{day,start,end,slotMins}].
export function scheduleEditor(initial = []) {
  const rows = initial.map(r => ({ ...r }));
  const list = h("div", {});
  const draw = () => {
    clear(list);
    if (!rows.length) list.append(h("p", { class: "muted small" }, "No sessions yet. Add a session to open appointment slots."));
    rows.forEach((r, i) => list.append(h("div", { class: "cluster", style: { marginBottom: ".5rem" } },
      h("select", { "aria-label": "Day", style: { width: "auto" }, onchange: e => { r.day = +e.target.value; } }, DAY_NAMES.map((n, d) => h("option", { value: d, selected: d === r.day }, n))),
      h("input", { type: "time", "aria-label": "Start time", value: r.start, style: { width: "auto" }, onchange: e => { r.start = e.target.value; } }),
      h("span", {}, "to"),
      h("input", { type: "time", "aria-label": "End time", value: r.end, style: { width: "auto" }, onchange: e => { r.end = e.target.value; } }),
      h("select", { "aria-label": "Minutes per appointment", style: { width: "auto" }, onchange: e => { r.slotMins = +e.target.value; } }, [10, 15, 20, 30, 45, 60].map(m => h("option", { value: m, selected: m === r.slotMins }, m + " min"))),
      h("button", { type: "button", class: "btn sm ghost", "aria-label": "Remove session", onclick: () => { rows.splice(i, 1); draw(); } }, "Remove"))));
  };
  draw();
  const el = h("div", {}, list, h("button", { type: "button", class: "btn sm", onclick: () => { rows.push({ day: 1, start: "09:00", end: "13:00", slotMins: 15 }); draw(); } }, "+ Add session"));
  return {
    el,
    get() {
      for (const r of rows) {
        if (!r.start || !r.end) throw new Error("Every session needs a start and end time.");
        if (hhmm(r.end) - hhmm(r.start) < r.slotMins) throw new Error(`${DAY_NAMES[r.day]}: the session must be at least one appointment long.`);
      }
      for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        if (a.day === b.day && hhmm(a.start) < hhmm(b.end) && hhmm(b.start) < hhmm(a.end)) throw new Error(`${DAY_NAMES[a.day]}: two sessions overlap.`);
      }
      return rows.map(r => ({ day: +r.day, start: r.start, end: r.end, slotMins: +r.slotMins }));
    },
  };
}

// Action buttons for an appointment row (hospital desk and doctors use the same rules).
export function apptActions(user, a, refresh) {
  const run = async (status, ask) => {
    let note = "";
    if (ask) { note = await askNote(ask.title, ask.label, { required: ask.required, submitLabel: ask.submit, hint: ask.hint }); if (note === null) return; }
    try { setApptStatus(user, a.id, status, note); toast("Appointment updated."); refresh(); } catch (e) { toast(e.message, "danger"); }
  };
  const c = h("div", { class: "cluster" });
  if (a.status === "requested") c.append(
    btn(t("common.confirm", "Confirm"), () => run("confirmed", { title: "Confirm appointment", label: "Message to patient (optional)", required: false, submit: "Confirm" }), "sm primary"),
    btn(t("common.reject", "Reject"), () => run("rejected", { title: "Reject appointment", label: "Reason (the patient will see this)", required: true, submit: "Reject" }), "sm"));
  if (a.status === "confirmed") c.append(
    btn("Completed", () => run("completed"), "sm primary"),
    btn("Missed", () => run("no_show"), "sm"),
    btn(t("common.cancelAppt", "Cancel"), () => run("cancelled", { title: "Cancel appointment", label: "Reason (the patient will see this)", required: true, submit: "Cancel appointment" }), "sm"));
  return c;
}

export const periodOptions = [["today", "Today"], ["week", "Next 7 days"], ["all", "All dates"]];

// ------------------------------------------------------------------ test catalogue
export function testsManager(user, org, refresh) {
  org.tests ||= [];
  const save = (msg) => { db.update("orgs", org.id, { tests: org.tests, updatedAt: new Date().toISOString() }); audit("tests.updated", org.name, msg, user); refresh(); };
  const have = new Set(org.tests.map(x => x.code));
  const avail = TEST_CATALOG.filter(x => !have.has(x.code));
  const pickSel = h("select", { "aria-label": "Choose a standard test to add" }, h("option", { value: "" }, "Add a standard test…"), avail.map(x => h("option", { value: x.code }, `${x.name} (${x.category})`)));
  const testForm = (init, onSubmit, onCancel, isNew) => form([
    { name: "code", label: "Test code", required: true, value: init.code, hint: isNew ? "Short unique code, e.g. CBC" : "Code cannot be changed", wide: false },
    { name: "name", label: "Test name", required: true },
    { name: "category", label: "Category", type: "select", options: ["Blood", "Imaging", "Other"], required: true },
    { name: "price", label: "Price (₹)", type: "number", min: 0, required: true },
    { name: "tat", label: "Turnaround time", placeholder: "e.g. same day, 2 hours", required: true },
    { name: "fasting", label: "Fasting required", type: "checkbox" },
    { name: "available", label: "Currently available to book", type: "checkbox" },
  ], { initial: init, onSubmit, onCancel, submitLabel: t("common.save", "Save") });
  const edit = (x) => modal("Edit test", (close) => {
    const f = testForm(x, (v) => { if (v.price < 0) throw new Error("Price cannot be negative."); Object.assign(x, { name: v.name.trim(), category: v.category, price: v.price, tat: v.tat.trim(), fasting: v.fasting, available: v.available }); close(); save(`${x.code} edited`); toast("Test saved."); }, close, false);
    f.els.code.readOnly = true; return f;
  });
  const custom = () => modal("Add a custom test", (close) => testForm({ available: true, category: "Blood" }, (v) => {
    const code = v.code.trim().toUpperCase(); if (org.tests.some(x => x.code === code)) throw new Error("A test with this code already exists.");
    if (v.price < 0) throw new Error("Price cannot be negative.");
    org.tests.push({ code, name: v.name.trim(), category: v.category, price: v.price, tat: v.tat.trim(), fasting: v.fasting, available: v.available }); close(); save(`${code} added`); toast("Test added.");
  }, close, true));
  return h("div", {},
    h("div", { class: "cluster", style: { marginBottom: "1rem" } }, pickSel,
      btn("Add", () => { const c = pickSel.value; if (!c) return toast("Choose a test first.", "danger"); const x = TEST_CATALOG.find(y => y.code === c); org.tests.push({ ...x }); save(`${c} added`); toast("Test added."); }, "primary sm"),
      btn("Custom test…", custom, "sm")),
    table([
      { h: "Test", f: x => h("div", {}, h("strong", {}, x.name), h("div", { class: "muted small" }, x.code)) },
      { h: "Category", f: x => x.category },
      { h: "Price", f: x => "₹" + x.price, cls: "nowrap" },
      { h: "Turnaround", f: x => x.tat },
      { h: "Fasting", f: x => x.fasting ? "Yes" : "No" },
      { h: "Bookable", f: x => h("button", { class: "btn sm " + (x.available ? "primary" : ""), "aria-pressed": !!x.available, onclick: () => { x.available = !x.available; save(`${x.code} ${x.available ? "enabled" : "paused"}`); } }, x.available ? "Available" : "Paused") },
      { h: "", f: x => h("div", { class: "cluster" }, btn("Edit", () => edit(x), "sm"), btn("Remove", async () => { if (await confirmDialog(`Remove ${x.name} from your catalogue? Existing bookings are not affected.`, "Remove", true)) { org.tests.splice(org.tests.indexOf(x), 1); save(`${x.code} removed`); } }, "sm")) },
    ], org.tests, { empty: "No tests listed yet. Add standard tests above so patients can find and book them.", label: "Test catalogue" }));
}

// ------------------------------------------------------------------ requests / reports
const BK_TONE = ["requested", "confirmed", "sample_collected", "processing", "report_ready", "rejected", "cancelled"];
export function requestsPanel(user, org, refresh) {
  let filter = "open";
  const box = h("div", {});
  const bookings = () => db.where("diagBookings", b => b.orgId === org.id).sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot) * -1);
  const act = async (b, status, ask) => {
    let note = "";
    if (ask) { note = await askNote(ask.title, ask.label, { required: ask.required, submitLabel: ask.submit, hint: ask.hint }); if (note === null) return; }
    try { setBookingStatus(user, b.id, status, note); toast("Request updated."); refresh(); } catch (e) { toast(e.message, "danger"); }
  };
  const actions = (b) => {
    const c = h("div", { class: "cluster" });
    if (b.status === "requested") c.append(btn(t("common.confirm", "Confirm"), () => act(b, "confirmed", { title: "Confirm test", label: "Instructions for the patient (fasting, what to bring) — optional", required: false, submit: "Confirm" }), "sm primary"), btn("Decline", () => act(b, "rejected", { title: "Decline test request", label: "Reason (the patient will see this)", required: true, submit: "Decline" }), "sm"));
    if (b.status === "confirmed") c.append(btn("Sample collected", () => act(b, "sample_collected"), "sm"), btn("Start processing", () => act(b, "processing"), "sm"));
    if (b.status === "sample_collected") c.append(btn("Start processing", () => act(b, "processing"), "sm"));
    if (["confirmed", "sample_collected", "processing"].includes(b.status)) c.append(btn("Enter report", () => releaseModal(user, b, refresh), "sm primary"));
    if (b.status === "report_ready" && b.reportId) c.append(btn(t("common.view", "View"), () => viewReport(b), "sm"));
    return c;
  };
  const draw = () => {
    clear(box);
    const all = bookings();
    const list = all.filter(b => filter === "all" ? true : filter === "open" ? ["requested", "confirmed", "sample_collected", "processing"].includes(b.status) : b.status === filter);
    box.append(
      h("div", { class: "filters" }, h("div", { class: "field" }, h("label", { for: "rq-f" }, "Show"),
        h("select", { id: "rq-f", onchange: e => { filter = e.target.value; draw(); } }, [["open", "Open requests"], ["all", "All"], ...BK_TONE.map(s => [s, DGN_LABEL[s]])].map(([v, l]) => h("option", { value: v, selected: v === filter }, l))))),
      table([
        { h: "Ref", f: b => h("span", { class: "nowrap" }, b.ref), cls: "nowrap" },
        { h: "Patient", f: b => b.forName },
        { h: "Test", f: b => h("div", {}, b.testName, b.doctorNote ? h("div", { class: "muted small" }, "Note: " + b.doctorNote) : null) },
        { h: "When", f: b => `${fmtDate(b.date)} · ${b.slot}`, cls: "nowrap" },
        { h: "Status", f: b => statusBadge(b.status) },
        { h: "", f: actions },
      ], list, { empty: filter === "open" ? "No open test requests. New requests from patients appear here." : "No requests match this filter.", label: "Test requests" }));
  };
  draw(); return box;
}
function viewReport(b) {
  const r = db.get("records", b.reportId); if (!r) return toast("Report record not found.", "danger");
  modal(r.title, h("div", { class: "stack" }, kv([["Patient", r.subjectName], ["Date", fmtDate(r.date)], ["Booking", b.ref]]), h("pre", { style: { whiteSpace: "pre-wrap", font: "inherit", background: "var(--muted-bg)", padding: ".8rem", borderRadius: "8px", margin: 0 } }, r.content),
    r.attachment ? h("a", { class: "btn sm", href: r.attachment.data, download: r.attachment.name }, "Download " + r.attachment.name) : null), { wide: true });
}
function releaseModal(user, b, refresh) {
  modal(`Report — ${b.testName} · ${b.forName}`, (close) => h("div", {},
    notice("info", "The report is released to the patient's own records. The patient decides which doctors can see it. Release only reports checked by qualified laboratory staff."),
    form([
      { name: "result", label: "Findings / result", type: "textarea", rows: 6, required: true, wide: true, hint: "Include values and reference ranges." },
      { name: "file", label: "Attach report file (optional)", type: "file", accept: ".pdf,image/*", wide: true, hint: "Up to 400 KB in this prototype." },
    ], { submitLabel: "Release report to patient", onCancel: close, onSubmit: async (v) => { const file = await fileToData(v.file); releaseReport(user, b.id, { result: v.result, file }); close(); toast("Report released to the patient."); refresh(); } })), { wide: true });
}
export function reportsPanel(user, org, refresh) {
  const mine = db.where("diagBookings", b => b.orgId === org.id);
  const pending = mine.filter(b => ["confirmed", "sample_collected", "processing"].includes(b.status));
  const done = mine.filter(b => b.status === "report_ready");
  return h("div", { class: "stack" },
    card({ title: "Waiting for a report", sub: "Enter findings once testing is complete." }, table([
      { h: "Ref", f: b => b.ref, cls: "nowrap" }, { h: "Patient", f: b => b.forName }, { h: "Test", f: b => b.testName }, { h: "Status", f: b => statusBadge(b.status) },
      { h: "", f: b => btn("Enter report", () => releaseModal(user, b, refresh), "sm primary") },
    ], pending, { empty: "Nothing is waiting for a report.", label: "Waiting for report" })),
    card({ title: "Released reports" }, table([
      { h: "Ref", f: b => b.ref, cls: "nowrap" }, { h: "Patient", f: b => b.forName }, { h: "Test", f: b => b.testName },
      { h: "Released", f: b => fmtDate(b.history[b.history.length - 1]?.at, true), cls: "nowrap" },
      { h: "", f: b => btn(t("common.view", "View"), () => viewReport(b), "sm") },
    ], done, { empty: "No reports have been released yet.", label: "Released reports" })));
}

// ------------------------------------------------------------------ facility profile
const SERVICE_OPTS = ["xray", "ct", "mri", "ultrasound", "lab", "pharmacy", "blood bank", "dialysis", "cath lab", "ambulance"];
export function facilityProfile(user, org, refresh, kind) {
  const hosp = kind === "hospital";
  const fields = [
    { name: "name", label: "Facility name", required: true, wide: true },
    ...(hosp ? [{ name: "type", label: "Facility type", type: "select", required: true, options: ["govt_hospital", "private_hospital", "chc", "phc", "other"].map(v => ({ value: v, label: FACILITY_TYPES[v] })) }] : []),
    { name: "district", label: t("common.district", "District"), type: "select", required: true, options: DISTRICTS.map(d => d.name) },
    { name: "mandal", label: "Mandal" }, { name: "address", label: "Address", wide: true, required: true }, { name: "pin", label: "PIN code", pattern: "[0-9]{6}", inputmode: "numeric", hint: "6 digits" },
    { name: "phone", label: "Phone", type: "tel" }, ...(hosp ? [{ name: "emergencyPhone", label: "Emergency phone", type: "tel" }] : [{ name: "licenceNo", label: "Licence / registration no." }]),
    { name: "hours", label: "Operating hours", placeholder: "Mon–Sat 9:00–17:00", wide: true },
    ...(hosp ? [
      { name: "emergency24x7", label: "24×7 emergency service is available", type: "checkbox" },
      { name: "depts", label: "Departments", type: "multiselect", options: DEPARTMENTS, wide: true },
      { name: "services", label: "Facilities & services", type: "multiselect", options: [...new Set([...SERVICE_OPTS, ...(org.services || [])])].map(v => ({ value: v, label: v })), wide: true }] : []),
    { name: "lat", label: "Latitude", type: "number", step: "any", min: 8, max: 22 }, { name: "lng", label: "Longitude", type: "number", step: "any", min: 74, max: 88 },
  ];
  const f = form(fields, {
    initial: { ...org }, submitLabel: "Save profile",
    onSubmit: (v) => {
      if (!v.name.trim()) throw new Error("Enter the facility name.");
      if (v.pin && !/^\d{6}$/.test(v.pin)) throw new Error("PIN code must be 6 digits.");
      const patch = { ...v, name: v.name.trim(), lat: v.lat === "" ? null : v.lat, lng: v.lng === "" ? null : v.lng, updatedAt: new Date().toISOString() };
      if (hosp) { patch.depts = v.depts || []; patch.services = v.services || []; }
      db.update("orgs", org.id, patch); audit("org.updated", org.name, Object.keys(v).join(", "), user); toast("Profile saved."); refresh();
    },
  });
  const locBtn = btn("Use my current location", async () => { try { const p = await getPosition(); f.els.lat.value = p.lat.toFixed(5); f.els.lng.value = p.lng.toFixed(5); toast("Location filled in. Save the profile to keep it."); } catch (e) { toast(e.message, "danger"); } }, "sm", "pin");
  return card({ title: "Facility profile", sub: "Patients see this information in the public directory once your facility is verified.", actions: [locBtn] }, f);
}

export const verificationNotice = (org) => org.verification === "verified" ? null
  : notice(org.verification === "rejected" ? "danger" : "warn", h("strong", {}, org.verification === "rejected" ? "Facility verification was not approved. " : "Facility verification is pending. "), "Until the platform administrator verifies your facility it is hidden from the public directory, and patients cannot book or send requests to it.");
export { badge, ago };
