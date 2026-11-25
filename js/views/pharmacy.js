// Pharmacy workspace: stock, patient enquiries, patient-sent prescriptions, reports.
import { h, icon, ago, fmtDate, sum } from "../util.js";
import { db, audit, notify } from "../db.js";
import { MEDICINES } from "../seed.js";
import { provenance } from "../services.js";
import { card, stat, grid, table, form, modal, toast, badge, provBadge, statusBadge, pageHead, empty, notice, btn, barChart, kv } from "../ui.js";
import { t } from "../i18n.js";

const mk = (rows) => Object.fromEntries(rows.map(([k, te, hi, ta]) => [k, { te, hi, ta }]));
export const strings = mk([
  ["ph.nav.enquiries", "మందుల విచారణలు", "दवा पूछताछ", "மருந்து விசாரணைகள்"], ["ph.nav.rx", "ప్రిస్క్రిప్షన్లు", "प्रिस्क्रिप्शन", "மருந்துச் சீட்டுகள்"],
  ["ph.nav.reports", "నివేదికలు", "रिपोर्ट", "அறிக்கைகள்"], ["ph.nav.profile", "ప్రొఫైల్", "प्रोफ़ाइल", "சுயவிவரம்"],
  ["ph.title.overview", "ఫార్మసీ సారాంశం", "फ़ार्मेसी अवलोकन", "மருந்தக கண்ணோட்டம்"], ["ph.title.stock", "మందుల స్టాక్", "दवा स्टॉक", "மருந்து இருப்பு"],
  ["ph.title.enquiries", "రోగుల విచారణలు", "मरीज़ों की पूछताछ", "நோயாளி விசாரணைகள்"], ["ph.title.rx", "రోగులు పంపిన ప్రిస్క్రిప్షన్లు", "मरीज़ द्वारा भेजे प्रिस्क्रिप्शन", "நோயாளி அனுப்பிய மருந்துச் சீட்டுகள்"],
  ["ph.title.reports", "స్టాక్ నివేదిక", "स्टॉक रिपोर्ट", "இருப்பு அறிக்கை"], ["ph.title.profile", "ఫార్మసీ ప్రొఫైల్", "फ़ार्मेसी प्रोफ़ाइल", "மருந்தக சுயவிவரம்"],
  ["ph.addMed", "మందును జోడించండి", "दवा जोड़ें", "மருந்தைச் சேர்"], ["ph.update", "నవీకరించండి", "अपडेट", "புதுப்பி"], ["ph.respond", "స్పందించండి", "जवाब दें", "பதிலளி"],
  ["ph.review", "సమీక్షించండి", "समीक्षा करें", "மதிப்பாய்வு"], ["ph.csv", "CSV ఎగుమతి", "CSV निर्यात", "CSV ஏற்றுமதி"], ["ph.lowStock", "తక్కువ స్టాక్", "कम स्टॉक", "குறைந்த இருப்பு"],
  ["ph.rxRequired", "ప్రిస్క్రిప్షన్ అవసరం", "प्रिस्क्रिप्शन आवश्यक", "மருந்துச் சீட்டு தேவை"], ["ph.search", "మందు పేరుతో వెతకండి", "दवा के नाम से खोजें", "மருந்து பெயரால் தேடு"],
]);
export const nav = [
  { id: "overview", icon: "home", key: "nav.overview", label: "Overview" }, { id: "stock", icon: "pill", key: "nav.stock", label: "Stock" },
  { id: "enquiries", icon: "chat", key: "ph.nav.enquiries", label: "Enquiries" }, { id: "prescriptions", icon: "file", key: "ph.nav.rx", label: "Prescriptions" },
  { id: "reports", icon: "chart", key: "ph.nav.reports", label: "Reports" }, { id: "profile", icon: "building", key: "ph.nav.profile", label: "Profile" },
];
export const css = `.ph-low{background:var(--warn-bg)}.ph-qty{width:84px;min-height:34px;padding:.25rem .4rem}.ph-rx{white-space:pre-wrap;background:var(--muted-bg);border-radius:8px;padding:.6rem .8rem;font-size:.9rem}`;

const org = (u) => db.get("orgs", u.orgId);
const stockOf = (o) => db.where("stock", s => s.orgId === o.id);
const isLow = (s) => s.qty <= (s.reorder ?? 0);
const SCH = { OTC: ["OTC", "muted"], H: ["Schedule H · prescription required", "warn"], H1: ["Schedule H1 · prescription required", "danger"] };
const schBadge = (s) => badge(SCH[s]?.[0] || s, SCH[s]?.[1] || "muted");
const findStock = (o, name) => { const k = (name || "").toLowerCase(); return stockOf(o).find(s => s.name.toLowerCase() === k) || stockOf(o).find(s => k.includes(s.generic.toLowerCase()) || s.name.toLowerCase().includes(k.split(" ")[0])); };
function download(name, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: name }); document.body.append(a); a.click(); a.remove();
}
function guard(o) { return !o ? notice("danger", "No pharmacy is linked to this account. Contact the administrator.") : null; }
const verifyNote = (o) => o.verification !== "verified" ? notice("warn", h("strong", {}, "Pharmacy not verified yet. "), "You can prepare your catalogue, but patients cannot see this pharmacy until the administrator verifies your licence.") : null;

// ------------------------------------------------------------------------------------------------
async function overview(ctx) {
  const o = org(ctx.user); if (guard(o)) return guard(o);
  const st = stockOf(o), low = st.filter(isLow), enq = db.where("enquiries", e => e.orgId === o.id && e.status === "open"), rx = db.where("rxRequests", r => r.orgId === o.id && ["requested", "verified"].includes(r.status));
  const last = st.map(s => s.updatedAt).sort().pop();
  return h("div", {}, pageHead(t("ph.title.overview", "Pharmacy overview"), o.name, provBadge(provenance(o, last), last), statusBadge(o.verification)), verifyNote(o),
    grid(4, stat("Medicines listed", st.length, `${st.filter(s => s.qty > 0).length} in stock`), stat(t("ph.lowStock", "Low stock"), low.length, "at or below reorder level", low.length ? "warn" : "ok"), stat("Open enquiries", enq.length, "waiting for a reply", enq.length ? "warn" : ""), stat("Prescriptions to handle", rx.length, "sent by patients", rx.length ? "warn" : "")),
    h("div", { class: "split", style: { marginTop: "1rem" } },
      card({ title: t("ph.lowStock", "Low stock"), sub: "Reorder soon", actions: btn("Open stock", () => ctx.go("stock"), "sm") }, low.length ? h("div", { class: "list" }, low.slice(0, 8).map(s => h("div", { class: "row ph-low" }, h("div", { class: "grow" }, h("div", { class: "title" }, s.name), h("small", { class: "muted" }, `${s.qty} left · reorder at ${s.reorder} · updated ${ago(s.updatedAt)}`)), schBadge(s.schedule)))) : empty("No low-stock medicines.")),
      card({ title: "Waiting for you" }, h("div", { class: "list" },
        h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, `${enq.length} patient enquiries`), h("small", { class: "muted" }, "Availability questions")), btn("Reply", () => ctx.go("enquiries"), "sm")),
        h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, `${rx.length} prescriptions`), h("small", { class: "muted" }, "Only prescriptions patients sent to this pharmacy appear")), btn(t("ph.review", "Review"), () => ctx.go("prescriptions"), "sm"))))));
}

// ------------------------------------------------------------------------------------------------
async function stockView(ctx) {
  const o = org(ctx.user); if (guard(o)) return guard(o);
  const q = h("input", { type: "search", placeholder: t("ph.search", "Search by medicine name"), "aria-label": "Search medicines" });
  const box = h("div", {});
  const draw = () => {
    const k = q.value.trim().toLowerCase();
    const rows = stockOf(o).filter(s => !k || s.name.toLowerCase().includes(k) || s.generic.toLowerCase().includes(k)).sort((a, b) => a.name.localeCompare(b.name));
    box.replaceChildren(table([
      { h: "Medicine", f: s => h("div", {}, h("strong", {}, s.name), h("div", { class: "small muted" }, `${s.generic} · ${s.form}`)) },
      { h: "Schedule", f: s => schBadge(s.schedule) },
      { h: "Quantity", f: s => { const inp = h("input", { class: "ph-qty", type: "number", min: 0, value: s.qty, "aria-label": `Quantity of ${s.name}` }); const b = btn(t("ph.update", "Update"), () => { const v = +inp.value; if (!Number.isInteger(v) || v < 0) return toast("Enter a whole number, 0 or more.", "danger"); db.update("stock", s.id, { qty: v, updatedAt: new Date().toISOString() }); audit("stock.updated", s.name, `qty ${v}`); toast("Stock updated"); ctx.refresh(); }, "sm"); return h("div", { class: "cluster" }, inp, b); } },
      { h: "Reorder at", f: s => h("span", {}, s.reorder, isLow(s) ? h("span", { style: { marginLeft: ".4rem" } }, badge("Low", "warn")) : null) },
      { h: "Price (₹)", f: s => s.price }, { h: "Updated", f: s => ago(s.updatedAt) },
      { h: "", f: s => btn("Edit", () => editMed(ctx, o, s), "sm ghost") },
    ], rows, { empty: "No medicines match. Add one to start your catalogue.", label: "Medicine stock" }));
  };
  q.addEventListener("input", draw); draw();
  return h("div", {}, pageHead(t("ph.title.stock", "Medicine stock"), "Keep quantities current — patients see the last-updated time.", btn(t("ph.csv", "Export CSV"), () => exportStock(o), "", "download"), btn(t("ph.addMed", "Add medicine"), () => editMed(ctx, o), "primary", "plus")), verifyNote(o),
    notice("info", "Schedule H and H1 medicines are shown as ", h("strong", {}, "prescription required"), ". This platform never dispenses them without a prescription the patient has sent you."),
    h("div", { class: "filters" }, h("div", { class: "field" }, q)), box);
}
function exportStock(o) { download(`stock-${o.name.replace(/\W+/g, "-")}.csv`, [["Medicine", "Generic", "Form", "Schedule", "Quantity", "Reorder level", "Price", "Updated"], ...stockOf(o).map(s => [s.name, s.generic, s.form, s.schedule, s.qty, s.reorder, s.price, s.updatedAt])]); }
function editMed(ctx, o, s) {
  const presets = [{ value: "", label: "Custom medicine" }, ...MEDICINES.map(m => ({ value: m.name, label: m.name }))];
  modal(s ? "Edit " + s.name : t("ph.addMed", "Add medicine"), (close) => form([
    ...(s ? [] : [{ name: "preset", label: "Choose from catalogue", type: "select", options: presets, placeholder: "Custom medicine", wide: true }]),
    { name: "name", label: "Medicine name & strength", required: true, value: s?.name }, { name: "generic", label: "Generic name", required: true, value: s?.generic },
    { name: "form", label: "Form", type: "select", options: ["Tablet", "Capsule", "Syrup", "Injection", "Inhaler", "Sachet", "Ointment", "Drops", "Other"], required: true, value: s?.form || "Tablet" },
    { name: "schedule", label: "Schedule", type: "select", options: [{ value: "OTC", label: "OTC (no prescription)" }, { value: "H", label: "Schedule H" }, { value: "H1", label: "Schedule H1" }], required: true, value: s?.schedule || "OTC" },
    { name: "qty", label: "Quantity in stock", type: "number", min: 0, required: true, value: s?.qty ?? 0 }, { name: "reorder", label: "Reorder level", type: "number", min: 0, required: true, value: s?.reorder ?? 25 },
    { name: "price", label: "Price per unit (₹)", type: "number", min: 0, step: "0.01", required: true, value: s?.price ?? 0 },
  ], {
    submitLabel: t("common.save", "Save"), onCancel: close,
    onInput: (v, els) => { if (!s && v.preset && els.name.dataset.last !== v.preset) { const m = MEDICINES.find(x => x.name === v.preset); els.name.dataset.last = v.preset; els.name.value = m.name; els.generic.value = m.generic; els.form.value = m.form; els.schedule.value = m.schedule; els.price.value = m.price; } },
    onSubmit: (v) => {
      if (!v.name.trim()) throw new Error("Enter the medicine name.");
      if (!Number.isInteger(v.qty) || v.qty < 0 || !Number.isInteger(v.reorder) || v.reorder < 0) throw new Error("Quantity and reorder level must be whole numbers, 0 or more.");
      const row = { name: v.name.trim(), generic: v.generic.trim(), form: v.form, schedule: v.schedule, qty: v.qty, reorder: v.reorder, price: v.price, updatedAt: new Date().toISOString() };
      if (s) db.update("stock", s.id, row); else { if (stockOf(o).some(x => x.name.toLowerCase() === row.name.toLowerCase())) throw new Error("This medicine is already in your stock list. Edit it instead."); db.insert("stock", { orgId: o.id, demo: !!o.demo, ...row }); }
      audit(s ? "stock.edited" : "stock.added", row.name, `qty ${row.qty}`); toast("Saved"); close(); ctx.refresh();
    },
  }));
}

// ------------------------------------------------------------------------------------------------
async function enquiries(ctx) {
  const o = org(ctx.user); if (guard(o)) return guard(o);
  const list = db.where("enquiries", e => e.orgId === o.id);
  return h("div", {}, pageHead(t("ph.title.enquiries", "Patient enquiries"), "Tell patients whether a medicine is available. Do not promise stock you do not have."),
    card({}, table([
      { h: "Patient", f: e => db.get("users", e.patientId)?.name || "Patient" }, { h: "Medicine", f: e => h("div", {}, h("strong", {}, e.medicine), h("div", { class: "small muted" }, `Qty ${e.qty || "—"}`)) },
      { h: "In your stock", f: e => { const s = findStock(o, e.medicine); return s ? h("span", {}, `${s.qty} · `, provBadge(provenance(o, s.updatedAt), s.updatedAt)) : badge("Not listed", "muted"); } },
      { h: "Status", f: e => statusBadge(e.status === "open" ? "requested" : e.status === "available" ? "confirmed" : e.status === "unavailable" ? "rejected" : e.status === "reserved" ? "accepted" : "completed") }, { h: "Note", f: e => e.note || "—" }, { h: "Asked", f: e => ago(e.createdAt) },
      { h: "", f: e => btn(t("ph.respond", "Respond"), () => respond(ctx, o, e), "sm primary") },
    ], list, { empty: "No enquiries yet. Patients can ask about medicines from your listing." })));
}
function respond(ctx, o, e) {
  modal("Reply about " + e.medicine, (close) => form([
    { name: "status", label: "Availability", type: "select", required: true, value: e.status === "open" ? "available" : e.status, options: [{ value: "available", label: "Available — patient can collect" }, { value: "reserved", label: "Reserved for the patient" }, { value: "unavailable", label: "Not available" }, { value: "fulfilled", label: "Fulfilled / collected" }] },
    { name: "note", label: "Note to the patient", type: "textarea", wide: true, hint: "For example: collect before 9 pm; prescription needed (Schedule H).", value: e.note },
  ], { submitLabel: "Send reply", onCancel: close, onSubmit: (v) => {
    const s = findStock(o, e.medicine);
    if (["available", "reserved"].includes(v.status) && (!s || s.qty <= 0)) throw new Error("This medicine shows no stock in your list. Update stock first or choose “Not available”.");
    db.update("enquiries", e.id, { status: v.status, note: v.note.trim(), respondedAt: new Date().toISOString() }); audit("enquiry.responded", e.medicine, v.status);
    notify(e.patientId, { title: `${o.name}: ${e.medicine}`, body: `${v.status === "unavailable" ? "Not available" : v.status === "fulfilled" ? "Fulfilled" : v.status === "reserved" ? "Reserved for you" : "Available"}${v.note ? " — " + v.note : ""}`, link: "#/app/medicines", type: "pharmacy", channels: ["inapp", "sms"] });
    toast("Reply sent"); close(); ctx.refresh();
  } }));
}

// ------------------------------------------------------------------------------------------------
const rxItems = (r) => r.items?.length ? r.items : db.get("records", r.rxId)?.rx?.items || [];
async function prescriptions(ctx) {
  const o = org(ctx.user); if (guard(o)) return guard(o);
  const list = db.where("rxRequests", r => r.orgId === o.id); // strictly this pharmacy's own requests
  return h("div", {}, pageHead(t("ph.title.rx", "Prescriptions sent to you"), "You can only see prescriptions a patient chose to send to this pharmacy."),
    notice("warn", "Check the prescriber, patient and dates before dispensing. Schedule H1 items need an explicit verification tick."),
    card({}, table([
      { h: "Patient", f: r => db.get("users", r.patientId)?.name || "Patient" }, { h: "Items", f: r => rxItems(r).map(i => i.name).join(", ") || "—" },
      { h: "Sent", f: r => ago(r.createdAt) }, { h: "Status", f: r => statusBadge(r.status === "ready" ? "confirmed" : r.status === "dispensed" ? "completed" : r.status === "verified" ? "accepted" : r.status) },
      { h: "", f: r => btn(t("ph.review", "Review"), () => reviewRx(ctx, o, r), "sm primary") },
    ], list, { empty: "No prescriptions yet." })));
}
function reviewRx(ctx, o, r) {
  const rec = db.get("records", r.rxId), items = rxItems(r), done = ["dispensed", "rejected"].includes(r.status);
  const matches = items.map(i => ({ i, s: findStock(o, i.name) }));
  const needsH1 = matches.some(m => m.s?.schedule === "H1");
  modal("Prescription review", (close) => h("div", {},
    kv([["Patient", db.get("users", r.patientId)?.name], ["Prescription", rec?.title || "Record not available"], ["Date", rec ? fmtDate(rec.date) : "—"], ["Status", statusBadge(r.status)]]),
    rec ? h("div", { class: "ph-rx", style: { margin: ".8rem 0" } }, rec.content) : notice("danger", "The prescription record is no longer available. Do not dispense."),
    h("h3", { style: { margin: ".6rem 0" } }, "Check against your stock"),
    table([{ h: "Item", f: m => h("div", {}, h("strong", {}, m.i.name), h("div", { class: "small muted" }, `${m.i.dose || ""} ${m.i.days ? "× " + m.i.days + " days" : ""}`)) }, { h: "Your stock", f: m => m.s ? h("span", {}, `${m.s.qty} `, schBadge(m.s.schedule)) : badge("Not stocked", "danger") }], matches, { empty: "No items on this prescription." }),
    done ? notice("info", `This request is ${r.status}.${r.pharmacistNote ? " Note: " + r.pharmacistNote : ""}`) : form([
      { name: "status", label: "Update status", type: "select", required: true, options: [{ value: "verified", label: "Verified — prescription looks valid" }, { value: "ready", label: "Ready for collection" }, { value: "dispensed", label: "Dispensed (reduces stock)" }, { value: "rejected", label: "Reject — cannot dispense" }], value: r.status === "requested" ? "verified" : r.status },
      ...matches.filter(m => m.s).map((m, k) => ({ name: "q" + k, label: `Units dispensed: ${m.s.name}`, type: "number", min: 0, value: 1, show: (v) => v.status === "dispensed" })),
      ...(needsH1 ? [{ name: "h1", label: "I have verified this is a valid prescription for Schedule H1 medicine(s)", type: "checkbox", show: (v) => v.status !== "rejected" }] : []),
      { name: "note", label: "Note for the patient", type: "textarea", wide: true },
    ], { submitLabel: "Save status", onCancel: close, onSubmit: (v) => {
      if (!rec && v.status !== "rejected") throw new Error("The prescription record is missing, so you can only reject this request.");
      if (needsH1 && v.status !== "rejected" && !v.h1) throw new Error("Tick the Schedule H1 verification before continuing.");
      if (v.status === "rejected" && !v.note.trim()) throw new Error("Give the patient a reason for rejecting.");
      if (v.status === "dispensed") {
        matches.filter(m => m.s).forEach((m, k) => { const n = v["q" + k] ?? 0; if (!Number.isInteger(n) || n < 0) throw new Error("Units must be whole numbers."); if (n > m.s.qty) throw new Error(`Only ${m.s.qty} of ${m.s.name} in stock.`); });
        matches.filter(m => m.s).forEach((m, k) => { const n = v["q" + k] || 0; if (n) db.update("stock", m.s.id, { qty: m.s.qty - n, updatedAt: new Date().toISOString() }); });
      }
      db.update("rxRequests", r.id, { status: v.status, pharmacistNote: v.note.trim(), updatedAt: new Date().toISOString(), items });
      audit("rx." + v.status, rec?.title || r.rxId, `${db.get("users", r.patientId)?.name} @ ${o.name}${v.status === "dispensed" ? " — stock reduced" : ""}`);
      notify(r.patientId, { title: `Prescription ${v.status === "ready" ? "ready for collection" : v.status}`, body: `${o.name}${v.note ? " — " + v.note : ""}`, link: "#/app/medicines", type: "pharmacy", channels: ["inapp", "sms"] });
      toast("Status saved"); close(); ctx.refresh();
    } })), { wide: true });
}

// ------------------------------------------------------------------------------------------------
async function reports(ctx) {
  const o = org(ctx.user); if (guard(o)) return guard(o);
  const st = stockOf(o), out = st.filter(s => s.qty === 0), low = st.filter(s => s.qty > 0 && isLow(s)), ok = st.filter(s => s.qty > s.reorder);
  const rx = db.where("rxRequests", r => r.orgId === o.id), value = sum(st, s => s.qty * s.price);
  const near = st.filter(isLow).sort((a, b) => a.qty - b.qty);
  return h("div", {}, pageHead(t("ph.title.reports", "Stock report"), `As of ${fmtDate(new Date(), true)}`, btn(t("ph.csv", "Export CSV"), () => exportStock(o), "primary", "download")),
    grid(4, stat("Medicines", st.length), stat("In stock", ok.length, "above reorder level", "ok"), stat(t("ph.lowStock", "Low stock"), low.length, "", low.length ? "warn" : ""), stat("Out of stock", out.length, "", out.length ? "danger" : "")),
    h("div", { class: "split even", style: { marginTop: "1rem" } },
      card({ title: "Stock by status" }, barChart([{ label: "In stock", value: ok.length, tone: "ok" }, { label: "Low", value: low.length, tone: "warn" }, { label: "Out of stock", value: out.length, tone: "danger" }], { max: Math.max(1, st.length) })),
      card({ title: "Value and activity" }, kv([["Estimated stock value", "₹" + Math.round(value).toLocaleString("en-IN")], ["Prescriptions received", rx.length], ["Dispensed", rx.filter(r => r.status === "dispensed").length], ["Rejected", rx.filter(r => r.status === "rejected").length], ["Enquiries answered", db.where("enquiries", e => e.orgId === o.id && e.status !== "open").length]]))),
    card({ title: "Near stock-out", sub: "Lowest first" }, table([{ h: "Medicine", f: s => s.name }, { h: "Left", f: s => s.qty }, { h: "Reorder at", f: s => s.reorder }, { h: "Updated", f: s => ago(s.updatedAt) }], near, { empty: "Nothing is near stock-out." })));
}

async function profile(ctx) {
  const o = org(ctx.user); if (guard(o)) return guard(o);
  return h("div", {}, pageHead(t("ph.title.profile", "Pharmacy profile"), o.name, statusBadge(o.verification), o.demo ? provBadge("demo") : null),
    h("div", { class: "split even" }, card({ title: "Details" }, kv([["Name", o.name], ["District", o.district], ["Address", o.address], ["PIN", o.pin], ["Licence no.", o.licenceNo || "—"], ["Phone", o.phone], ["Hours", o.hours || "—"], ["Location", o.lat ? `${o.lat}, ${o.lng}` : "Not set"]])),
      card({ title: "Update details" }, form([
        { name: "phone", label: "Phone", value: o.phone }, { name: "hours", label: "Opening hours", value: o.hours }, { name: "address", label: "Address", value: o.address, wide: true },
        { name: "pin", label: "PIN code", value: o.pin, pattern: "[0-9]{6}", hint: "6 digits" }, { name: "licenceNo", label: "Drug licence number", value: o.licenceNo },
      ], { onSubmit: (v) => { if (v.pin && !/^\d{6}$/.test(v.pin)) throw new Error("PIN code must be 6 digits."); db.update("orgs", o.id, v); audit("pharmacy.profile", o.name, ""); toast("Profile saved"); ctx.refresh(); } }))));
}

export const routes = { overview, stock: stockView, enquiries, prescriptions, reports, profile };
