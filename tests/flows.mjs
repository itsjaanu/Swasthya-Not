import { createRequire } from "module"; const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const base = process.argv[2] || "http://localhost:8801/";
const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
p.on("pageerror", e => errs.push(e.message)); await p.goto(base + "#/login"); await p.waitForSelector(".demo-accts");
const r = await p.evaluate(async () => {
  const db = (await import("/js/db.js")), S = await import("/js/services.js"); const { db: D } = db; const out = {};
  const cit = D.get("users", "u_citizen"), hosp = D.get("users", "u_hospital"), doc = D.get("users", "u_doctor"), amb = D.get("users", "u_ambulance");
  // appointment
  const d = D.get("doctors", "doc_001"); let date = null, time = null;
  for (let i = 1; i < 10 && !time; i++) { const dt = new Date(Date.now() + i * 864e5).toISOString().slice(0, 10); const f = S.slotsFor(d, dt).find(s => s.free); if (f) { date = dt; time = f.time; } }
  const a = S.requestAppointment(cit, { doctorId: d.id, date, time, forId: cit.id, forName: cit.name, reason: "Test" });
  try { S.requestAppointment(cit, { doctorId: d.id, date, time, forId: cit.id, forName: cit.name, reason: "Double" }); out.doubleBook = "ALLOWED (bad)"; } catch { out.doubleBook = "blocked"; }
  S.setApptStatus(hosp, a.id, "confirmed"); out.apptStatus = D.get("appointments", a.id).status; out.patientNotified = D.where("notifications", n => n.userId === cit.id && /confirmed/.test(n.title)).length > 0;
  // admission
  const adm = S.submitAdmission(cit, { orgId: hosp.orgId, department: "General Medicine", category: "Planned", reason: "Test", forName: cit.name });
  try { S.setAdmissionStatus(hosp, adm.id, "admitted"); out.admSkip = "ALLOWED (bad)"; } catch { out.admSkip = "blocked"; }
  S.setAdmissionStatus(hosp, adm.id, "received"); S.setAdmissionStatus(hosp, adm.id, "under_review"); S.setAdmissionStatus(hosp, adm.id, "accepted", "Come to ward 3"); out.adm = D.get("admissions", adm.id).status;
  // consent
  const rec = D.get("records", "rec_2"); out.docSeesBefore = S.accessibleRecords(doc, "u_citizen").records.map(r => r.id).includes("rec_2");
  const c = S.grantConsent(cit, { doctorUserId: doc.id, recordIds: ["rec_2"], purpose: "t", days: 1 }); out.docSeesAfter = S.accessibleRecords(doc, "u_citizen").records.map(r => r.id).includes("rec_2");
  S.revokeConsent(cit, c.id); out.docSeesRevoked = S.accessibleRecords(doc, "u_citizen").records.map(r => r.id).includes("rec_2");
  // emergency
  const e = S.createEmergency(amb, { vehicleId: "veh_01", patient: { age: 50, sex: "M", triage: "critical", complaint: "Chest pain" }, location: { lat: 16.3, lng: 80.44, label: "x" }, needs: ["cardiac", "icu"] });
  const rank = S.rankHospitals(e.location, e.needs); out.top = rank[0].org.name; S.notifyHospital(amb, e.id, rank[0].org.id, rank[0].etaMin);
  out.dispatchedBeforeConfirm = D.get("emergencies", e.id).dispatched; S.emergencyAck(hosp, e.id); out.readyBeforePress = D.get("emergencies", e.id).status === "resources_ready"; 
  // audit chain
  out.chain = db.verifyAuditChain(); const au = D.all("audit"); au[Math.floor(au.length / 2)].detail = "tampered"; out.tamper = db.verifyAuditChain().ok ? "NOT DETECTED (bad)" : "detected";
  // registration rules
  try { await db.auth.register({ role: "admin", name: "x", email: "x@x.com", password: "abcd1234" }); out.adminReg = "ALLOWED (bad)"; } catch { out.adminReg = "blocked"; }
  const nd = await db.auth.register({ role: "doctor", name: "New Doc", email: "nd@x.com", password: "abcd1234", regNo: "R1", specialization: "ENT" }); out.newDocStatus = nd.status;
  return out;
});
console.log(JSON.stringify(r, null, 1)); console.log(errs.length ? errs : "no page errors"); await b.close();
