// Cross-role workflows. Views call these so every role sees the same rules.
import { db, audit, notify, notifyOrg, notifyRole } from "./db.js";
import { haversine, isoDay, addDays, refNo, uid, sum } from "./util.js";
import { BED_CATS } from "./seed.js";

// ---------- data provenance & freshness ----------------------------------------------------------------
export const PROV = {
  verified:   { label: "Verified live",       cls: "ok",     help: "Confirmed through an authorised system integration." },
  provider:   { label: "Provider-reported",   cls: "info",   help: "Entered by the facility's authorised staff; timestamp shown." },
  public:     { label: "Public directory",    cls: "muted",  help: "From a public government dataset. Not live — confirm with the facility." },
  demo:       { label: "DEMO DATA",           cls: "demo",   help: "Sample record created for testing. Not real." },
  unverified: { label: "Unverified",          cls: "warn",   help: "Submitted but not yet verified." },
  outdated:   { label: "Outdated",            cls: "danger", help: "Not updated recently. Do not rely on it; call the facility." },
};
export function provenance(org, updatedAt) {
  if (!org) return "unverified";
  if (org.demo) return "demo";
  if (org.kind === "public") return "public";
  if (org.verification !== "verified") return "unverified";
  const hrs = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) / 36e5 : Infinity;
  if (hrs > db.cfg().staleHours) return "outdated";
  return org.integration ? "verified" : "provider";
}
export const isStale = (ts) => !ts || (Date.now() - new Date(ts).getTime()) / 36e5 > db.cfg().staleHours;

// ---------- beds ---------------------------------------------------------------------------------------
export function bedRows(org) {
  return BED_CATS.filter(([k]) => org.beds?.[k]).map(([k, label]) => {
    const b = org.beds[k]; const available = Math.max(0, b.total - b.occupied - (b.unavailable || 0));
    return { key: k, label, ...b, available };
  });
}
export const bedTotals = (org) => { const r = bedRows(org); return { total: sum(r, x => x.total), occupied: sum(r, x => x.occupied), unavailable: sum(r, x => x.unavailable), available: sum(r, x => x.available), updatedAt: r.map(x => x.updatedAt).sort().pop() || null }; };
export function setBeds(user, org, key, { total, occupied, unavailable }) {
  total = +total; occupied = +occupied; unavailable = +unavailable || 0;
  if ([total, occupied, unavailable].some(n => !Number.isFinite(n) || n < 0)) throw new Error("Enter whole numbers (0 or more).");
  if (occupied + unavailable > total) throw new Error("Occupied + unavailable cannot exceed total capacity.");
  org.beds[key] = { total, occupied, unavailable, updatedAt: new Date().toISOString(), by: user.name };
  db.update("orgs", org.id, { beds: org.beds });
  audit("beds.updated", org.name, `${key}: ${occupied}/${total} occupied, ${unavailable} unavailable`, user);
}

// ---------- appointments -------------------------------------------------------------------------------
export const ACTIVE_APPT = ["requested", "confirmed"];
export function slotsFor(doctor, dateStr) {
  const dow = new Date(dateStr + "T00:00").getDay(); // 0 Sun
  const out = [];
  for (const s of doctor.schedule || []) {
    if (s.day !== dow) continue;
    let [h, m] = s.start.split(":").map(Number); const [eh, em] = s.end.split(":").map(Number);
    while (h * 60 + m + s.slotMins <= eh * 60 + em) { out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`); m += s.slotMins; h += Math.floor(m / 60); m %= 60; }
  }
  const taken = new Set(db.where("appointments", a => a.doctorId === doctor.id && a.date === dateStr && ACTIVE_APPT.includes(a.status)).map(a => a.time));
  const isToday = dateStr === isoDay(), nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  return out.filter(t => !isToday || +t.slice(0, 2) * 60 + +t.slice(3) > nowMin).map(t => ({ time: t, free: !taken.has(t) }));
}
export function requestAppointment(user, { doctorId, date, time, forId, forName, reason }) {
  const doc = db.get("doctors", doctorId); if (!doc) throw new Error("Doctor not found.");
  const slot = slotsFor(doc, date).find(s => s.time === time);
  if (!slot?.free) throw new Error("That slot is no longer available. Pick another time.");
  if (!reason?.trim()) throw new Error("Add a short reason for the visit.");
  const a = db.insert("appointments", { ref: refNo("APT"), patientId: user.id, forId, forName, doctorId, orgId: doc.orgId, date, time, reason: reason.trim(), status: "requested", history: [{ at: new Date().toISOString(), by: user.name, text: "Requested" }], demo: !!user.demo });
  audit("appointment.requested", a.ref, `${doc.name} ${date} ${time}`, user);
  notifyOrg(doc.orgId, { title: "New appointment request", body: `${forName} · ${doc.name} · ${date} ${time}`, link: "#/app/appointments", type: "appointment" });
  if (doc.userId) notify(doc.userId, { title: "New appointment request", body: `${forName} · ${date} ${time}`, link: "#/app/schedule", type: "appointment" });
  notify(user.id, { title: "Appointment requested", body: `Ref ${a.ref}. You will be notified when ${doc.name}'s hospital responds.`, link: "#/app/appointments", type: "appointment", channels: ["inapp", "sms"] });
  return a;
}
export function setApptStatus(actor, id, status, note = "") {
  const a = db.get("appointments", id); if (!a) return;
  if (status === "confirmed" || status === "rescheduled") {
    const clash = db.where("appointments", x => x.id !== id && x.doctorId === a.doctorId && x.date === a.date && x.time === a.time && ACTIVE_APPT.includes(x.status));
    if (clash.length) throw new Error("Another appointment already holds this slot.");
  }
  a.history.push({ at: new Date().toISOString(), by: actor.name, text: `${status.replace("_", " ")}${note ? " — " + note : ""}` });
  db.update("appointments", id, { status, history: a.history });
  audit("appointment." + status, a.ref, note, actor);
  const labels = { confirmed: "confirmed", rejected: "could not be accepted", cancelled: "cancelled", completed: "marked completed", no_show: "marked as missed" };
  notify(a.patientId, { title: `Appointment ${labels[status] || status}`, body: `${a.forName} · ${a.date} ${a.time}${note ? " · " + note : ""}`, link: "#/app/appointments", type: "appointment", channels: ["inapp", "sms"] });
}
export function rescheduleAppointment(actor, id, date, time) {
  const a = db.get("appointments", id); const doc = db.get("doctors", a.doctorId);
  const slot = slotsFor(doc, date).find(s => s.time === time); if (!slot?.free) throw new Error("That slot is not free.");
  a.history.push({ at: new Date().toISOString(), by: actor.name, text: `Rescheduled from ${a.date} ${a.time} to ${date} ${time}` });
  db.update("appointments", id, { date, time, status: "requested", history: a.history });
  audit("appointment.rescheduled", a.ref, `${date} ${time}`, actor);
  notifyOrg(a.orgId, { title: "Appointment rescheduled — please confirm", body: `${a.forName} · ${date} ${time}`, link: "#/app/appointments", type: "appointment" });
}
// Reminders: generates in-app notices for confirmed appointments in the next 24h (called on app start).
export function runReminders() {
  const soon = Date.now() + 24 * 36e5;
  db.where("appointments", a => a.status === "confirmed" && !a.reminded && new Date(`${a.date}T${a.time}`).getTime() < soon && new Date(`${a.date}T${a.time}`).getTime() > Date.now()).forEach(a => {
    notify(a.patientId, { title: "Appointment reminder", body: `${a.forName} · ${db.get("doctors", a.doctorId)?.name} · ${a.date} ${a.time}`, link: "#/app/appointments", type: "reminder", channels: ["inapp", "sms"] });
    db.update("appointments", a.id, { reminded: true });
  });
}

// ---------- admissions ---------------------------------------------------------------------------------
export const ADM_FLOW = {
  submitted: ["received", "rejected"], received: ["under_review", "info_requested", "rejected"], under_review: ["accepted", "info_requested", "rejected"],
  info_requested: ["under_review", "rejected"], accepted: ["arrived", "rejected"], arrived: ["admitted"], admitted: ["discharged"], rejected: [], discharged: [], cancelled: [],
};
export const ADM_LABEL = { submitted: "Submitted", received: "Received by hospital", under_review: "Under review", info_requested: "More information requested", accepted: "Accepted — follow hospital instructions", rejected: "Not accepted", arrived: "Patient arrived", admitted: "Admitted", discharged: "Discharged", cancelled: "Cancelled" };
export function submitAdmission(user, f) {
  if (!f.orgId || !f.department || !f.reason?.trim()) throw new Error("Choose a hospital, a department and describe the reason.");
  const a = db.insert("admissions", { ref: refNo("ADM"), patientId: user.id, forName: f.forName, orgId: f.orgId, department: f.department, category: f.category, urgency: f.urgency || "routine", reason: f.reason.trim(), docs: f.docs || [], status: "submitted", messages: [], history: [{ at: new Date().toISOString(), by: user.name, text: "Submitted" }], demo: !!user.demo });
  audit("admission.submitted", a.ref, db.get("orgs", f.orgId)?.name, user);
  notifyOrg(f.orgId, { title: "New admission request", body: `${a.ref} · ${f.forName} · ${f.department}`, link: "#/app/admissions", type: "admission" });
  notify(user.id, { title: "Admission request submitted", body: `Reference ${a.ref}. This is a request, not a confirmed bed.`, link: "#/app/admissions", type: "admission", channels: ["inapp", "sms"] });
  return a;
}
export function setAdmissionStatus(actor, id, status, message = "", extra = {}) {
  const a = db.get("admissions", id); if (!a) return;
  if (!ADM_FLOW[a.status]?.includes(status) && !(status === "cancelled" && ["submitted", "received", "under_review", "info_requested"].includes(a.status))) throw new Error(`Cannot move from "${ADM_LABEL[a.status]}" to "${ADM_LABEL[status]}".`);
  if (["rejected", "info_requested", "accepted"].includes(status) && !message.trim()) throw new Error("Add a message for the patient (reason or instructions).");
  a.history.push({ at: new Date().toISOString(), by: actor.name, text: ADM_LABEL[status] });
  if (message.trim()) a.messages.push({ at: new Date().toISOString(), from: actor.role === "citizen" ? "Patient" : actor.name, text: message.trim() });
  db.update("admissions", id, { status, history: a.history, messages: a.messages, ...extra });
  audit("admission." + status, a.ref, message, actor);
  notify(a.patientId, { title: `Admission ${a.ref}: ${ADM_LABEL[status]}`, body: message, link: "#/app/admissions", type: "admission", channels: ["inapp", "sms"] });
}

// ---------- records & consent --------------------------------------------------------------------------
export const activeConsent = (c) => !c.revokedAt && new Date(c.expiresAt).getTime() > Date.now();
export function grantConsent(patient, { doctorUserId, recordIds, purpose, days }) {
  const d = db.get("users", doctorUserId); if (!d || d.role !== "doctor") throw new Error("Choose a doctor.");
  if (d.status !== "active") throw new Error("This doctor is not verified yet.");
  if (!recordIds.length) throw new Error("Select at least one record to share.");
  if (!purpose?.trim()) throw new Error("State the purpose of sharing.");
  const c = db.insert("consents", { patientId: patient.id, doctorUserId, doctorName: d.name, recordIds, purpose: purpose.trim(), grantedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + days * 864e5).toISOString(), revokedAt: null, via: "patient" });
  audit("consent.granted", d.name, `${recordIds.length} records · ${days} days · ${purpose}`, patient);
  notify(d.id, { title: "A patient shared records with you", body: `${patient.name} · ${recordIds.length} record(s) · ${purpose}`, link: "#/app/patients", type: "consent" });
  return c;
}
export function revokeConsent(patient, id) {
  const c = db.get("consents", id); db.update("consents", id, { revokedAt: new Date().toISOString() });
  audit("consent.revoked", c.doctorName, "", patient);
  notify(c.doctorUserId, { title: "Record access revoked", body: `${patient.name} withdrew access.`, type: "consent" });
}
export function accessibleRecords(doctor, patientId) {
  const cons = db.where("consents", c => c.patientId === patientId && c.doctorUserId === doctor.id && activeConsent(c));
  const ids = new Set(cons.flatMap(c => c.recordIds === "all" ? db.where("records", r => r.ownerId === patientId).map(r => r.id) : c.recordIds));
  return { consents: cons, records: db.where("records", r => ids.has(r.id)) };
}
export function logAccess(user, record, consent) {
  db.insert("accessLog", { at: new Date().toISOString(), recordId: record.id, recordTitle: record.title, patientId: record.ownerId, accessorId: user.id, accessorName: user.name, role: user.role, via: consent?.via === "emergency" ? "emergency" : "consent", consentId: consent?.id });
  audit("record.viewed", record.title, consent?.via === "emergency" ? "EMERGENCY ACCESS" : "consented", user);
}
// Break-glass emergency access: mandatory reason, short expiry, patient notified, flagged for admin review.
export function emergencyAccess(doctor, patientId, reason) {
  if (!reason || reason.trim().length < 15) throw new Error("Describe the emergency in at least a sentence — this is reviewed by an administrator.");
  const p = db.get("users", patientId); if (!p) throw new Error("Patient not found.");
  const hrs = db.cfg().emergencyAccessHours;
  const c = db.insert("consents", { patientId, doctorUserId: doctor.id, doctorName: doctor.name, recordIds: "all", purpose: "EMERGENCY ACCESS: " + reason.trim(), grantedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + hrs * 36e5).toISOString(), revokedAt: null, via: "emergency", flagged: true });
  audit("record.emergency_access", p.email, reason, doctor);
  notify(patientId, { title: "Emergency access to your records", body: `${doctor.name} opened your records under emergency policy: ${reason}`, type: "security", channels: ["inapp", "sms"] });
  notifyRole("admin", { title: "Emergency record access needs review", body: `${doctor.name} → ${p.name}`, link: "#/app/audit", type: "security" });
  return c;
}
export function addRecord(owner, rec) { return db.insert("records", { ownerId: owner.id, ...rec }); }

// ---------- diagnostics --------------------------------------------------------------------------------
export const DGN_LABEL = { requested: "Requested", confirmed: "Confirmed", rejected: "Not accepted", sample_collected: "Sample collected", processing: "Processing", report_ready: "Report ready", cancelled: "Cancelled" };
export function bookTest(user, f) {
  const org = db.get("orgs", f.orgId), t = org?.tests.find(x => x.code === f.testCode);
  if (!t || !t.available) throw new Error("This test is not currently offered.");
  if (!f.date || !f.slot) throw new Error("Choose a date and time.");
  const b = db.insert("diagBookings", { ref: refNo("DGN"), patientId: user.id, forId: f.forId, forName: f.forName, orgId: org.id, testCode: t.code, testName: t.name, date: f.date, slot: f.slot, doctorNote: f.doctorNote || "", status: "requested", history: [{ at: new Date().toISOString(), by: user.name, text: "Requested" }], demo: !!user.demo });
  audit("diagnostic.requested", b.ref, `${t.name} @ ${org.name}`, user);
  notifyOrg(org.id, { title: "New test request", body: `${b.ref} · ${t.name} · ${f.date} ${f.slot}`, link: "#/app/requests", type: "diagnostic" });
  notify(user.id, { title: "Test requested", body: `Ref ${b.ref}. ${org.name} will confirm.`, link: "#/app/diagnostics", type: "diagnostic", channels: ["inapp", "sms"] });
  return b;
}
export function setBookingStatus(actor, id, status, note = "") {
  const b = db.get("diagBookings", id); b.history.push({ at: new Date().toISOString(), by: actor.name, text: DGN_LABEL[status] + (note ? " — " + note : "") });
  db.update("diagBookings", id, { status, history: b.history }); audit("diagnostic." + status, b.ref, note, actor);
  notify(b.patientId, { title: `Test ${b.ref}: ${DGN_LABEL[status]}`, body: `${b.testName}${note ? " · " + note : ""}`, link: "#/app/diagnostics", type: "diagnostic", channels: ["inapp", "sms"] });
}
export function releaseReport(actor, bookingId, { result, file }) {
  const b = db.get("diagBookings", bookingId), org = db.get("orgs", b.orgId);
  if (!result?.trim()) throw new Error("Enter the report findings.");
  const subj = b.forId || b.patientId;
  const rec = db.insert("records", { ownerId: b.patientId, subjectId: subj, subjectName: b.forName, type: /X-ray|CT|MRI|Ultra/i.test(b.testName) ? "imaging" : "lab", title: `${b.testName} — ${org.name}`, date: isoDay(), orgId: org.id, source: "diagnostic", content: result.trim() + (org.demo ? "\n(DEMO report.)" : ""), attachment: file || null, demo: !!org.demo, bookingId });
  db.update("diagBookings", bookingId, { reportId: rec.id }); setBookingStatus(actor, bookingId, "report_ready", "Report released to patient");
  audit("report.released", b.ref, rec.title, actor);
  return rec;
}

// ---------- ambulance → hospital coordination ----------------------------------------------------------
export const EM_LABEL = { registered: "Registered", hospital_proposed: "Hospital proposed", notified: "Hospital notified — awaiting acknowledgement", acknowledged: "Hospital acknowledged", resources_ready: "Hospital confirmed resources ready", arrived: "Arrived at hospital", closed: "Closed", cancelled: "Cancelled" };
export const NEEDS = [["icu", "ICU"], ["trauma", "Trauma / emergency"], ["cardiac", "Cardiac care"], ["neuro", "Neurology / stroke"], ["obstetric", "Obstetric emergency"], ["paediatric", "Paediatric"], ["surgery", "Surgery"]];
const needDept = { trauma: ["Emergency & Trauma", "Orthopaedics"], cardiac: ["Cardiology"], neuro: ["Neurology"], obstetric: ["Obstetrics & Gynaecology"], paediatric: ["Paediatrics"], surgery: ["General Surgery"], icu: [] };
export function rankHospitals(loc, needs = []) {
  const cands = db.where("orgs", o => o.kind === "hospital" && o.verification === "verified" && o.lat);
  return cands.map(o => {
    const dist = haversine(loc, o) * 1.3, eta = Math.round(dist / 45 * 60 + 2); // 1.3 road factor, ~45 km/h
    const reasons = [], warns = []; let score = 100 - dist * 1.2;
    if (!o.emergency24x7) { score -= 60; warns.push("No 24×7 emergency service listed"); } else reasons.push("24×7 emergency");
    for (const n of needs) {
      if (n === "icu") { const r = o.beds?.icu; const av = r ? r.total - r.occupied - (r.unavailable || 0) : 0; if (av > 0) { reasons.push(`${av} ICU bed(s) reported`); score += 15; } else { warns.push("No ICU bed reported"); score -= 30; } }
      else { const ok = needDept[n]?.some(d => o.depts.includes(d)); if (ok) { reasons.push(NEEDS.find(x => x[0] === n)[1] + " department"); score += 12; } else { warns.push(`No ${NEEDS.find(x => x[0] === n)[1]} department listed`); score -= 25; } }
    }
    const er = o.beds?.emergency; const erAvail = er ? er.total - er.occupied - (er.unavailable || 0) : 0;
    if (erAvail > 0) { reasons.push(`${erAvail} emergency bed(s) reported`); score += 8; } else warns.push("No emergency bed reported");
    const stale = isStale(er?.updatedAt || o.beds && Object.values(o.beds)[0]?.updatedAt);
    if (stale) { warns.push("Bed data is outdated — phone ahead"); score -= 10; }
    return { org: o, distKm: dist, etaMin: eta, score: Math.round(score), reasons, warns, stale };
  }).sort((a, b) => b.score - a.score).slice(0, 6);
}
const evt = (e, by, text, kind = "info") => (e.timeline.push({ at: new Date().toISOString(), by, text, kind }), e);
export function createEmergency(user, f) {
  const e = db.insert("emergencies", { ref: refNo("EMG"), orgId: user.orgId, createdBy: user.id, vehicleId: f.vehicleId, patient: f.patient, location: f.location, needs: f.needs, status: "registered", dispatched: false, hospitalId: null, etaMin: null, timeline: [], demo: !!user.demo });
  evt(e, user.name, "Emergency request registered by ambulance operator"); db.save(); audit("emergency.registered", e.ref, f.patient.complaint, user); return e;
}
export function confirmDispatch(user, id) { const e = db.get("emergencies", id); evt(e, user.name, "Operator confirmed the ambulance has been dispatched", "ok"); db.update("emergencies", id, { dispatched: true, timeline: e.timeline }); audit("emergency.dispatched", e.ref, "", user); }
export function notifyHospital(user, id, hospitalId, etaMin) {
  const e = db.get("emergencies", id), h = db.get("orgs", hospitalId);
  evt(e, user.name, `Hospital selected: ${h.name} (ETA ${etaMin} min). Notification sent.`);
  db.update("emergencies", id, { hospitalId, etaMin, status: "notified", timeline: e.timeline }); audit("emergency.notified", e.ref, h.name, user);
  notifyOrg(hospitalId, { title: `🚑 Incoming emergency ${e.ref}`, body: `${e.patient.triage?.toUpperCase()} · ${e.patient.age || "?"}${e.patient.sex || ""} · ${e.patient.complaint} · ETA ${etaMin} min`, link: "#/app/emergency", type: "emergency", channels: ["inapp", "sms"] });
}
export function emergencyAck(user, id) { const e = db.get("emergencies", id); evt(e, user.name, "Hospital acknowledged the notification", "ok"); db.update("emergencies", id, { status: "acknowledged", timeline: e.timeline }); audit("emergency.acknowledged", e.ref, "", user); notifyOrg(e.orgId, { title: `${e.ref}: hospital acknowledged`, link: "#/app/console", type: "emergency" }); }
export function emergencyReady(user, id, note) { const e = db.get("emergencies", id); evt(e, user.name, `Hospital confirmed resources ready${note ? ": " + note : ""}`, "ok"); db.update("emergencies", id, { status: "resources_ready", timeline: e.timeline, readyNote: note }); audit("emergency.ready", e.ref, note, user); notifyOrg(e.orgId, { title: `${e.ref}: resources ready`, body: note, link: "#/app/console", type: "emergency" }); }
export function emergencyEta(user, id, etaMin) { const e = db.get("emergencies", id); evt(e, user.name, `Updated ETA: ${etaMin} min`); db.update("emergencies", id, { etaMin, timeline: e.timeline }); if (e.hospitalId) notifyOrg(e.hospitalId, { title: `${e.ref}: ETA ${etaMin} min`, link: "#/app/emergency", type: "emergency" }); }
export function emergencyArrived(user, id) { const e = db.get("emergencies", id); evt(e, user.name, "Hospital confirmed patient arrival", "ok"); db.update("emergencies", id, { status: "arrived", timeline: e.timeline }); audit("emergency.arrived", e.ref, "", user); notifyOrg(e.orgId, { title: `${e.ref}: patient arrived`, link: "#/app/console", type: "emergency" }); }
export function emergencyClose(user, id) { const e = db.get("emergencies", id); evt(e, user.name, "Case closed"); db.update("emergencies", id, { status: "closed", timeline: e.timeline }); audit("emergency.closed", e.ref, "", user); }

// ---------- camps --------------------------------------------------------------------------------------
export function registerForCamp(user, camp, forName) {
  if (db.where("campRegs", r => r.campId === camp.id && r.citizenId === user.id && r.forName === forName && r.status !== "cancelled").length) throw new Error(`${forName} is already registered.`);
  const regs = db.where("campRegs", r => r.campId === camp.id && r.status !== "cancelled").length;
  if (camp.capacity && regs >= camp.capacity) throw new Error("This camp is full.");
  const r = db.insert("campRegs", { campId: camp.id, citizenId: user.id, forName, status: "registered", demo: !!user.demo });
  audit("camp.registered", camp.title, forName, user); notify(user.id, { title: "Camp registration confirmed", body: `${camp.title} · ${camp.date} ${camp.start}`, link: "#/app/camps", type: "camp", channels: ["inapp", "sms"] });
  return r;
}

// ---------- pharmacy -----------------------------------------------------------------------------------
export function pharmacyStockFor(name) {
  const key = name.trim().toLowerCase();
  return db.where("stock", s => s.qty > 0 && (s.name.toLowerCase().includes(key) || s.generic.toLowerCase().includes(key))).map(s => ({ stock: s, org: db.get("orgs", s.orgId) })).filter(x => x.org?.verification === "verified");
}

// ---------- shared lookups -----------------------------------------------------------------------------
export const orgName = (id) => db.get("orgs", id)?.name || "—";
export const userName = (id) => db.get("users", id)?.name || "—";
export function profilesFor(user) { return [{ id: user.id, name: user.name, relation: "Self" }, ...db.where("family", f => f.ownerId === user.id).map(f => ({ id: f.id, name: f.name, relation: f.relation }))]; }
export const unread = (uid_) => db.where("notifications", n => n.userId === uid_ && !n.read).length;
export { uid };
