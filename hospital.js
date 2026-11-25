// Hospital / facility workspace: beds, admissions, appointments, doctors, emergency, diagnostics, profile.
import { h, fmtDate, ago, isoDay, addDays } from "../util.js";
import { db, audit } from "../db.js";
import { provenance, bedRows, bedTotals, setBeds, ADM_FLOW, ADM_LABEL, setAdmissionStatus, EM_LABEL, emergencyAck, emergencyReady, emergencyEta, emergencyArrived, isStale } from "../services.js";
import { BED_CATS } from "../seed.js";
import { pageHead, grid, stat, card, table, statusBadge, provBadge, empty, notice, btn, form, modal, toast, meter, barChart, donut, timeline, kv, confirmDialog } from "../ui.js";
import { again, askNote, apptActions, periodOptions, scheduleEditor, scheduleSummary, testsManager, facilityProfile, verificationNotice } from "./provider-shared.js";
import { t } from "../i18n.js";

const org = (ctx) => db.get("orgs", ctx.user.orgId);
export const nav = [{ id: "overview", icon: "home", key: "nav.overview", label: "Overview" }, { id: "beds", icon: "bed", key: "nav.beds", label: "Beds" }, { id: "admissions", icon: "folder", key: "nav.admissions", label: "Admission requests" }, { id: "appointments", icon: "calendar", key: "nav.appointments", label: "Appointments" }, { id: "doctors", icon: "stethoscope", key: "nav.doctors", label: "Doctors" }, { id: "emergency", icon: "siren", key: "nav.emergency", label: "Emergency inbound" }, { id: "diagnostics", icon: "flask", label: "Diagnostics" }, { id: "analytics", icon: "chart", key: "nav.analytics", label: "Analytics" }, { id: "profile", icon: "building", label: "Hospital profile" }];
export const strings = { "hs.beds": { te: "పడకల నిర్వహణ", hi: "बिस्तर प्रबंधन", ta: "படுக்கை மேலாண்மை" }, "hs.update": { te: "అప్‌డేట్ చేయండి", hi: "अपडेट करें", ta: "புதுப்பி" } };

export const routes = {
  overview(ctx) {
    const o = org(ctx), bt = bedTotals(o), adm = db.where("admissions", a => a.orgId === o.id), ap = db.where("appointments", a => a.orgId === o.id), em = db.where("emergencies", e => e.hospitalId === o.id && !["closed", "cancelled", "arrived"].includes(e.status));
    return h("div", { class: "stack" }, pageHead(o.name, "Hospital operations", provBadge(provenance(o, bt.updatedAt), bt.updatedAt)), verificationNotice(o),
      isStale(bt.updatedAt) ? notice("warn", h("strong", {}, "Bed data is out of date. "), "Patients and ambulance crews see it flagged as outdated. ", btn("Update beds", () => ctx.go("beds"), "sm primary")) : null,
      em.length ? notice("danger", h("strong", {}, `${em.length} inbound emergency notification(s). `), btn("Open", () => ctx.go("emergency"), "sm primary")) : null,
      grid(4, stat("Beds available", bt.available, `of ${bt.total} total`, "ok"), stat("Admission requests to review", adm.filter(a => ["submitted", "received", "under_review", "info_requested"].includes(a.status)).length, "", "warn"), stat("Appointments to confirm", ap.filter(a => a.status === "requested").length, "", "warn"), stat("Occupied", bt.occupied, `${bt.unavailable} temporarily unavailable`)),
      card({ title: "Capacity by category" }, bedRows(o).map(r => h("div", { class: "row" , style: { display: "grid", gridTemplateColumns: "120px 1fr 150px", gap: ".8rem", alignItems: "center", padding: ".3rem 0" } }, r.label, meter(r.occupied + (r.unavailable || 0), r.total, r.label + " occupancy"), h("span", { class: "small" }, `${r.available} free · ${ago(r.updatedAt)}`)))));
  },
  beds(ctx) {
    const o = org(ctx), rows = bedRows(o); const again_ = again(ctx);
    const addCat = () => modal("Add bed category", (close) => form([{ name: "k", label: "Category", type: "select", required: true, options: BED_CATS.filter(([k]) => !o.beds[k]).map(([value, label]) => ({ value, label })) }, { name: "total", label: "Total beds", type: "number", min: 0, required: true }], { onCancel: close, onSubmit: v => { setBeds(ctx.user, o, v.k, { total: v.total, occupied: 0, unavailable: 0 }); close(); again_(); } }));
    return h("div", {}, pageHead(t("hs.beds", "Bed management"), "Available = total − occupied − temporarily unavailable. Only authorised staff may update this; every change is timestamped and audited.", btn("Add category", addCat, "", "plus")),
      card({}, table([{ h: "Category", f: r => h("strong", {}, r.label) },
        ...["total", "occupied", "unavailable"].map(k => ({ h: k[0].toUpperCase() + k.slice(1), f: r => h("input", { type: "number", min: 0, value: r[k] || 0, "aria-label": `${r.label} ${k}`, style: { width: "90px" }, dataset: { cat: r.key, f: k } }) })),
        { h: "Available", f: r => h("b", {}, r.available) }, { h: "Last updated", f: r => `${ago(r.updatedAt)}${r.by ? " by " + r.by : ""}` },
        { h: "", f: r => btn(t("hs.update", "Update"), (e) => { const g = (k) => e.target.closest("tr").querySelector(`[data-f=${k}]`).value; try { setBeds(ctx.user, o, r.key, { total: g("total"), occupied: g("occupied"), unavailable: g("unavailable") }); toast(`${r.label} beds updated.`); again_(); } catch (ex) { toast(ex.message, "danger"); } }, "sm primary") }], rows, { empty: "No bed categories yet. Add one to publish availability.", label: "Beds" })));
  },
  admissions(ctx) {
    const o = org(ctx); const list = db.where("admissions", a => a.orgId === o.id).sort((a, b) => (a.urgency === "urgent" ? -1 : 0) - (b.urgency === "urgent" ? -1 : 0) || b.createdAt.localeCompare(a.createdAt));
    const open = (a) => modal(`${a.ref} · ${a.forName}`, (close) => {
      const msgBox = h("div", {});
      const move = async (s) => { let msg = ""; if (["rejected", "info_requested", "accepted"].includes(s)) { msg = await askNote(ADM_LABEL[s], s === "accepted" ? "Instructions for the patient (where to report, documents, timing)" : s === "rejected" ? "Reason" : "What information do you need?", { submitLabel: "Send to patient" }); if (msg === null) return; }
        try { const extra = s === "discharged" ? { dischargeSummary: (await askNote("Discharge information", "Discharge summary / instructions", { submitLabel: "Discharge" })) } : {}; if (s === "discharged" && extra.dischargeSummary === null) return; setAdmissionStatus(ctx.user, a.id, s, msg, extra); toast("Updated."); close(); again(ctx)(); } catch (e) { toast(e.message, "danger"); } };
      return h("div", { class: "stack" }, a.urgency === "urgent" ? notice("warn", "Marked urgent by the patient. Emergency patients should never wait for online review — advise them to come to the emergency department.") : null,
        kv([["Department", a.department], ["Category", a.category], ["Urgency", a.urgency], ["Reason", a.reason], ["Documents", (a.docs || []).map(d => d.name).join(", ") || "None"], ["Current capacity", bedRows(o).map(r => `${r.label}: ${r.available}`).join(" · ")]]),
        notice("info", "Accepting is not a bed guarantee unless you allocate one; state clearly in your instructions."),
        h("div", { class: "cluster" }, (ADM_FLOW[a.status] || []).map(s => btn(ADM_LABEL[s], () => move(s), s === "rejected" ? "sm" : "sm primary")), !ADM_FLOW[a.status]?.length ? h("span", { class: "muted small" }, "No further actions.") : null),
        h("h3", {}, "Timeline"), timeline(a.history.map(x => ({ ...x, text: x.text }))), a.messages.length ? [h("h3", {}, "Messages"), a.messages.map(m => h("p", { class: "small" }, h("b", {}, m.from + ": "), m.text))] : null);
    }, { wide: true });
    return h("div", {}, pageHead(t("nav.admissions", "Admission requests"), "Review, respond and track each request. Patients are notified at every step."), card({}, table([{ h: "Ref", f: a => a.ref, cls: "nowrap" }, { h: "Patient", f: a => a.forName }, { h: "Dept", f: a => a.department }, { h: "Urgency", f: a => a.urgency === "urgent" ? h("span", { class: "badge warn" }, "Urgent") : "Routine" }, { h: "Status", f: a => statusBadge(a.status) }, { h: "Received", f: a => ago(a.createdAt) }, { h: "", f: a => btn("Open", () => open(a), "sm primary") }], list, { empty: "No admission requests yet." })));
  },
  appointments(ctx) {
    const o = org(ctx); let per = "week"; const box = h("div", {});
    const draw = () => { box.replaceChildren(); const end = per === "today" ? isoDay() : per === "week" ? isoDay(addDays(new Date(), 7)) : "9999";
      const list = db.where("appointments", a => a.orgId === o.id && a.date <= end && (per === "all" || a.date >= isoDay())).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      box.append(h("div", { class: "filters" }, h("div", { class: "field" }, h("label", {}, "Show"), h("select", { onchange: e => { per = e.target.value; draw(); } }, periodOptions.map(([v, l]) => h("option", { value: v, selected: v === per }, l))))),
        table([{ h: "When", f: a => `${fmtDate(a.date)} ${a.time}`, cls: "nowrap" }, { h: "Patient", f: a => a.forName }, { h: "Doctor", f: a => db.get("doctors", a.doctorId)?.name }, { h: "Reason", f: a => a.reason }, { h: "Status", f: a => statusBadge(a.status) }, { h: "", f: a => apptActions(ctx.user, a, again(ctx)) }], list, { empty: "No appointments in this period." })); };
    draw(); return h("div", {}, pageHead(t("nav.appointments", "Appointments"), "Confirm or decline requests; the patient is notified immediately."), card({}, box));
  },
  doctors(ctx) {
    const o = org(ctx); const docs = db.where("doctors", d => d.orgId === o.id);
    const edit = (d) => modal(d ? "Edit doctor" : "Add doctor", (close) => { let sched; const f = form([{ name: "name", label: "Name", required: true }, { name: "spec", label: "Department", type: "select", required: true, options: o.depts.length ? o.depts : ["General Medicine"] }, { name: "fee", label: "Consultation fee (₹)", type: "number", min: 0 }, { name: "regNo", label: "Registration no." }],
      { initial: d || {}, onCancel: close, onSubmit: v => { const schedule = sched.get(); if (d) db.update("doctors", d.id, { ...v, schedule }); else db.insert("doctors", { ...v, schedule, orgId: o.id, languages: [], verified: false, demo: false }); audit("doctor.saved", v.name, "", ctx.user); close(); again(ctx)(); } });
      sched = scheduleEditor(d?.schedule || []); f.insertBefore(h("div", { class: "field wide" }, h("label", {}, "Weekly schedule"), sched.el), f.querySelector(".form-actions")); return f; }, { wide: true });
    return h("div", {}, pageHead(t("nav.doctors", "Doctors"), "Doctors listed here can be booked by patients.", btn("Add doctor", () => edit(), "primary", "plus")), card({}, table([{ h: "Doctor", f: d => h("div", {}, h("strong", {}, d.name), h("div", { class: "small muted" }, d.spec)) }, { h: "Schedule", f: d => scheduleSummary(d.schedule) }, { h: "Account", f: d => d.userId ? statusBadge("verified") : "No account" }, { h: "", f: d => h("div", { class: "cluster" }, btn("Edit", () => edit(d), "sm"), btn("Remove", async () => { if (await confirmDialog(`Remove ${d.name}?`, "Remove", true)) { db.remove("doctors", d.id); again(ctx)(); } }, "sm")) }], docs, { empty: "No doctors yet." })));
  },
  emergency(ctx) {
    const o = org(ctx); const list = db.where("emergencies", e => e.hospitalId === o.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); const r = again(ctx);
    const wrap = (fn) => async () => { try { await fn(); r(); } catch (e) { toast(e.message, "danger"); } };
    return h("div", { class: "stack" }, pageHead("Inbound emergencies", "Notifications from ambulance operators. Readiness is only shown to the crew when you press “Resources ready”."),
      list.length ? list.map(e => card({ title: `${e.ref} · ${e.patient.triage?.toUpperCase()} · ${e.patient.age || "?"}${e.patient.sex || ""}`, sub: e.patient.complaint, actions: [statusBadge(e.status)], cls: e.status === "notified" ? "dangerc" : "" },
        kv([["ETA", e.etaMin != null ? e.etaMin + " min (crew-reported)" : "—"], ["Needs", (e.needs || []).join(", ") || "—"], ["Dispatch confirmed by operator", e.dispatched ? "Yes" : "Not confirmed"], ["Status", EM_LABEL[e.status]]]),
        h("div", { class: "cluster", style: { margin: ".8rem 0" } }, e.status === "notified" ? btn("Acknowledge", wrap(() => emergencyAck(ctx.user, e.id)), "primary") : null,
          ["acknowledged", "notified"].includes(e.status) ? btn("Resources ready", wrap(async () => { const n = await askNote("Confirm resources ready", "What is ready? (bay, team, equipment)", { submitLabel: "Confirm ready" }); if (n === null) throw new Error("Not confirmed."); emergencyReady(ctx.user, e.id, n); }), "") : null,
          ["acknowledged", "resources_ready", "notified"].includes(e.status) ? btn("Patient arrived", wrap(() => emergencyArrived(ctx.user, e.id)), "") : null), timeline(e.timeline))) : card({}, empty("No emergency notifications. They appear here the moment an ambulance crew selects your hospital.")));
  },
  diagnostics: (ctx) => h("div", {}, pageHead("Diagnostic services", "Tests you list appear on your public profile."), testsManager(ctx.user, org(ctx), again(ctx))),
  analytics(ctx) {
    const o = org(ctx), ap = db.where("appointments", a => a.orgId === o.id), ad = db.where("admissions", a => a.orgId === o.id);
    const by = (arr) => Object.entries(arr.reduce((m, x) => (m[x.status] = (m[x.status] || 0) + 1, m), {})).map(([label, value]) => ({ label: label.replace(/_/g, " "), value }));
    const days = [...Array(7)].map((_, i) => isoDay(addDays(new Date(), i)));
    return h("div", { class: "stack" }, pageHead(t("nav.analytics", "Analytics"), "Computed from your own records."), grid(2, card({ title: "Bed occupancy" }, barChart(bedRows(o).map(r => ({ label: r.label, value: r.occupied + (r.unavailable || 0), display: `${r.occupied + (r.unavailable || 0)}/${r.total}` })), { max: Math.max(1, ...bedRows(o).map(r => r.total)) })), card({ title: "Appointments by status" }, donut(by(ap), { center: ap.length }))), grid(2, card({ title: "Admission requests by status" }, ad.length ? barChart(by(ad)) : empty("No requests yet.")), card({ title: "Next 7 days: appointments" }, barChart(days.map(d => ({ label: fmtDate(d), value: ap.filter(a => a.date === d && a.status !== "cancelled").length }))))));
  },
  profile: (ctx) => h("div", {}, pageHead("Hospital profile"), facilityProfile(ctx.user, org(ctx), again(ctx), "hospital")),
};
