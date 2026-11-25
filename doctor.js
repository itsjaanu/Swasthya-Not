// Doctor workspace: appointments, schedule, consented patient records, consultations, referrals.
import { h, fmtDate, isoDay, addDays, ago } from "../util.js";
import { db, audit, notify } from "../db.js";
import { accessibleRecords, logAccess, emergencyAccess, addRecord, activeConsent, orgName } from "../services.js";
import { DEPARTMENTS } from "../seed.js";
import { pageHead, grid, stat, card, table, statusBadge, empty, notice, btn, form, modal, toast, kv, badge } from "../ui.js";
import { again, apptActions, scheduleEditor, scheduleSummary } from "./provider-shared.js";
import { t } from "../i18n.js";

const me = (ctx) => db.all("doctors").find(d => d.userId === ctx.user.id);
export const nav = [{ id: "today", icon: "home", key: "nav.overview", label: "Today" }, { id: "schedule", icon: "calendar", key: "nav.schedule", label: "My schedule" }, { id: "patients", icon: "users", key: "nav.patients", label: "Patients" }, { id: "referrals", icon: "link", key: "nav.referrals", label: "Referrals" }, { id: "profile", icon: "user", label: "Profile" }];
export const strings = { "dr.noaccess": { te: "ఈ రోగి రికార్డులకు మీకు అనుమతి లేదు", hi: "इस मरीज़ के रिकॉर्ड तक आपकी पहुँच नहीं है", ta: "இந்த நோயாளியின் பதிவுகளை அணுக அனுமதி இல்லை" } };

export const routes = {
  today(ctx) {
    const d = me(ctx); if (!d) return empty("No doctor profile is linked to this account.");
    const list = db.where("appointments", a => a.doctorId === d.id && a.date >= isoDay() && !["cancelled", "rejected"].includes(a.status)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return h("div", { class: "stack" }, pageHead(`Good day, ${d.name}`, `${d.spec} · ${orgName(d.orgId)}`),
      grid(3, stat("Requests to confirm", list.filter(a => a.status === "requested").length, "", "warn"), stat("Confirmed upcoming", list.filter(a => a.status === "confirmed").length), stat("Patients who shared records", new Set(db.where("consents", c => c.doctorUserId === ctx.user.id && activeConsent(c)).map(c => c.patientId)).size)),
      card({ title: "Upcoming appointments" }, table([{ h: "When", f: a => `${fmtDate(a.date)} ${a.time}`, cls: "nowrap" }, { h: "Patient", f: a => h("a", { href: "#/app/patient/" + a.patientId }, a.forName) }, { h: "Reason", f: a => a.reason }, { h: "Status", f: a => statusBadge(a.status) }, { h: "", f: a => apptActions(ctx.user, a, again(ctx)) }], list, { empty: "No upcoming appointments." })));
  },
  schedule(ctx) {
    const d = me(ctx); const s = scheduleEditor(d.schedule || []);
    return h("div", { class: "stack" }, pageHead(t("nav.schedule", "My schedule"), "Patients can book free slots inside these sessions."), card({}, s.el, h("div", { class: "form-actions" }, btn("Save schedule", () => { try { db.update("doctors", d.id, { schedule: s.get() }); audit("schedule.updated", d.name, scheduleSummary(s.get()), ctx.user); toast("Schedule saved."); again(ctx)(); } catch (e) { toast(e.message, "danger"); } }, "primary"))));
  },
  patients(ctx) {
    const ids = new Set([...db.where("consents", c => c.doctorUserId === ctx.user.id).map(c => c.patientId), ...db.where("appointments", a => me(ctx) && a.doctorId === me(ctx).id).map(a => a.patientId)]);
    const rows = [...ids].map(id => db.get("users", id)).filter(Boolean).map(u => ({ u, cons: db.where("consents", c => c.patientId === u.id && c.doctorUserId === ctx.user.id && activeConsent(c)) }));
    return h("div", { class: "stack" }, pageHead(t("nav.patients", "Patients"), "You see a patient's records only while they have an active consent for you."), notice("info", "No consent, no records. Patients can share, limit and revoke at any time; every view is logged."),
      card({}, table([{ h: "Patient", f: r => r.u.name }, { h: "Access", f: r => r.cons.length ? badge(`${r.cons.reduce((n, c) => n + (c.recordIds === "all" ? 99 : c.recordIds.length), 0)} records shared`, "ok") : badge("No active consent", "muted") }, { h: "Expires", f: r => r.cons[0] ? fmtDate(r.cons[0].expiresAt) : "—" }, { h: "", f: r => btn("Open", () => ctx.go("patient/" + r.u.id), "sm primary") }], rows, { empty: "No patients yet." })));
  },
  patient(ctx) {
    const pid = ctx.param, p = db.get("users", pid); if (!p) return empty("Patient not found.");
    const { consents, records } = accessibleRecords(ctx.user, pid);
    const openRec = (r) => { logAccess(ctx.user, r, consents.find(c => c.recordIds === "all" || c.recordIds.includes(r.id))); modal(r.title, h("div", { class: "stack" }, kv([["Patient", r.subjectName], ["Date", fmtDate(r.date)], ["Type", r.type]]), h("pre", { style: { whiteSpace: "pre-wrap", font: "inherit", background: "var(--muted-bg)", padding: ".8rem", borderRadius: "8px", margin: 0 } }, r.content), r.attachment ? h("a", { class: "btn sm", href: r.attachment.data, download: r.attachment.name }, "Download " + r.attachment.name) : null), { wide: true }); };
    const emergency = () => modal("Emergency access (break-glass)", (close) => h("div", {}, notice("danger", "Use only when the patient cannot consent and delay risks harm. Access lasts " + db.cfg().emergencyAccessHours + " hours, is shown to the patient and is reviewed by an administrator."), form([{ name: "reason", label: "Describe the emergency", type: "textarea", required: true, wide: true }], { submitLabel: "Open records under emergency policy", onCancel: close, onSubmit: v => { emergencyAccess(ctx.user, pid, v.reason); close(); toast("Emergency access granted and logged.", "danger"); again(ctx)(); } })));
    const consult = () => modal("Consultation note", (close) => form([{ name: "complaint", label: "Presenting complaint", required: true, wide: true }, { name: "diagnosis", label: "Diagnosis", required: true, wide: true }, { name: "notes", label: "Notes & advice", type: "textarea", wide: true }, { name: "rx", label: "Prescription (one per line: medicine — dose — days)", type: "textarea", wide: true }, { name: "follow", label: "Follow-up date", type: "date" }], { onCancel: close, submitLabel: "Save to patient's records", onSubmit: v => {
      const dr = me(ctx), base = { subjectId: pid, subjectName: p.name, date: isoDay(), orgId: dr?.orgId, source: "consult", createdBy: ctx.user.id };
      addRecord(p, { ...base, type: "consult", title: `Consultation — ${dr?.name}`, content: `Complaint: ${v.complaint}\nDiagnosis: ${v.diagnosis}\n${v.notes || ""}${v.follow ? "\nFollow-up: " + v.follow : ""}` });
      const items = (v.rx || "").split("\n").map(l => l.trim()).filter(Boolean).map(l => { const [name, dose, days] = l.split("—").map(x => x.trim()); return { name, dose: dose || "", days: +days || 0 }; });
      if (items.length) addRecord(p, { ...base, type: "prescription", title: `Prescription — ${dr?.name}`, content: items.map(i => `${i.name} — ${i.dose} × ${i.days || "?"} days`).join("\n"), rx: { items } });
      audit("consultation.saved", p.email, v.diagnosis, ctx.user); notify(pid, { title: "New note from your doctor", body: dr?.name, link: "#/app/records", type: "record" }); close(); toast("Saved to the patient's records."); again(ctx)(); } }));
    const refer = () => modal("Refer patient", (close) => form([{ name: "toOrgId", label: "Refer to hospital", type: "select", required: true, options: db.where("orgs", o => o.kind === "hospital" && o.verification === "verified").map(o => ({ value: o.id, label: `${o.name} — ${o.district}` })) }, { name: "toSpecialty", label: "Specialty", type: "select", options: DEPARTMENTS, required: true }, { name: "urgency", label: "Urgency", type: "select", options: ["routine", "urgent"], required: true }, { name: "reason", label: "Reason", type: "textarea", required: true, wide: true }], { onCancel: close, onSubmit: v => { db.insert("referrals", { ...v, fromId: ctx.user.id, fromName: ctx.user.name, fromRole: "doctor", patientId: pid, patientName: p.name, status: "sent" }); audit("referral.created", p.email, v.toSpecialty, ctx.user); notify(pid, { title: "Referral created", body: v.toSpecialty, type: "referral" }); close(); toast("Referral sent."); } }));
    return h("div", { class: "stack" }, pageHead(p.name, "Shared records", btn("Write consultation", consult, "primary", "edit"), btn("Refer", refer, "", "link")),
      consents.length ? consents.map(c => notice(c.via === "emergency" ? "danger" : "ok", h("strong", {}, c.via === "emergency" ? "Emergency access. " : "Patient consent. "), `Purpose: ${c.purpose} · expires ${fmtDate(c.expiresAt, true)}`)) : notice("warn", h("strong", {}, t("dr.noaccess", "You do not have access to this patient's records. ")), "Ask the patient to share records with you.", " ", btn("Request access", () => { notify(pid, { title: "A doctor requested access to your records", body: ctx.user.name, link: "#/app/records", type: "consent" }); toast("Request sent."); }, "sm"), " ", btn("Emergency access…", emergency, "sm danger")),
      card({ title: "Records you can view" }, table([{ h: "Record", f: r => r.title }, { h: "Type", f: r => r.type }, { h: "Date", f: r => fmtDate(r.date) }, { h: "", f: r => btn("Open", () => openRec(r), "sm primary") }], records, { empty: "No records shared." })));
  },
  referrals(ctx) {
    const d = me(ctx); const list = db.where("referrals", r => r.fromId === ctx.user.id || (d && r.toOrgId === d.orgId));
    return h("div", {}, pageHead(t("nav.referrals", "Referrals")), card({}, table([{ h: "Patient", f: r => r.patientName }, { h: "From", f: r => r.fromName }, { h: "To", f: r => `${orgName(r.toOrgId)} · ${r.toSpecialty}` }, { h: "Reason", f: r => r.reason }, { h: "Status", f: r => statusBadge(r.status) }, { h: "", f: r => r.toOrgId === d?.orgId && r.status === "sent" ? btn("Accept", () => { db.update("referrals", r.id, { status: "accepted" }); again(ctx)(); }, "sm primary") : null }], list, { empty: "No referrals." })));
  },
  profile(ctx) {
    const d = me(ctx); return h("div", {}, pageHead("Profile"), card({}, form([{ name: "name", label: "Name", required: true }, { name: "spec", label: "Specialization", type: "select", options: DEPARTMENTS }, { name: "orgId", label: "Hospital affiliation", type: "select", options: db.where("orgs", o => o.kind === "hospital" && o.verification === "verified").map(o => ({ value: o.id, label: o.name + " — " + o.district })) }, { name: "regNo", label: "Registration no." }], { initial: d, onSubmit: v => { db.update("doctors", d.id, v); toast("Saved."); } })));
  },
};
