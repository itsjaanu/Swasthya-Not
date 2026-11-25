// Geography + DEMO seed data. Everything created here is flagged demo:true and shown with a DEMO badge.
// District coordinates are approximate headquarters/centroids used only for map focus and distance sorting.
import { sha256, isoDay, addDays } from "./util.js";

export const DISTRICTS = [
  ["Alluri Sitharama Raju", 18.08, 82.67], ["Anakapalli", 17.69, 83.0], ["Ananthapuramu", 14.68, 77.6], ["Annamayya", 14.05, 78.75],
  ["Bapatla", 15.9, 80.47], ["Chittoor", 13.22, 79.1], ["Dr. B.R. Ambedkar Konaseema", 16.58, 82.0], ["East Godavari", 17.0, 81.78],
  ["Eluru", 16.71, 81.1], ["Guntur", 16.31, 80.44], ["Kakinada", 16.99, 82.25], ["Krishna", 16.18, 81.14], ["Kurnool", 15.83, 78.04],
  ["Markapuram", 15.73, 79.27], ["Nandyal", 15.48, 78.48], ["NTR", 16.51, 80.65], ["Palnadu", 16.24, 80.05],
  ["Parvathipuram Manyam", 18.78, 83.43], ["Polavaram", 17.25, 81.64], ["Prakasam", 15.5, 80.05], ["Sri Potti Sriramulu Nellore", 14.44, 79.99],
  ["Sri Sathya Sai", 14.17, 77.81], ["Srikakulam", 18.3, 83.9], ["Tirupati", 13.63, 79.42], ["Visakhapatnam", 17.69, 83.22],
  ["Vizianagaram", 18.11, 83.4], ["West Godavari", 16.54, 81.52], ["Y.S.R. Kadapa", 14.47, 78.82],
].map(([name, lat, lng]) => ({ name, lat, lng }));
export const districtByName = (n) => DISTRICTS.find(d => d.name === n);

export const ROLES = {
  citizen:   { label: "Citizen / Patient",        self: true,  verify: false, icon: "user" },
  doctor:    { label: "Doctor",                   self: true,  verify: true,  icon: "stethoscope" },
  hospital:  { label: "Hospital / Facility",      self: true,  verify: true,  icon: "building" },
  pharmacy:  { label: "Pharmacy",                 self: true,  verify: true,  icon: "pill" },
  organizer: { label: "Medical Camp Organizer",   self: true,  verify: true,  icon: "tent" },
  asha:      { label: "ASHA / Community Health Worker", self: true, verify: true, icon: "heart" },
  district:  { label: "District Health Officer",  self: false, verify: true,  icon: "chart" },
  admin:     { label: "Super Administrator",      self: false, verify: true,  icon: "shield" },
  // Service-provider accounts the specification requires (diagnostic centres, ambulance operators).
  diagnostic:{ label: "Diagnostic Centre",        self: true,  verify: true,  icon: "flask", extra: true },
  ambulance: { label: "Ambulance Operator",       self: true,  verify: true,  icon: "siren", extra: true },
};

export const DEPARTMENTS = ["General Medicine", "Paediatrics", "Obstetrics & Gynaecology", "Orthopaedics", "Cardiology", "Neurology", "General Surgery", "ENT", "Ophthalmology", "Dermatology", "Emergency & Trauma", "Psychiatry", "Pulmonology", "Nephrology", "Oncology"];
export const BED_CATS = [["general", "General"], ["private", "Private"], ["emergency", "Emergency"], ["icu", "ICU"], ["maternity", "Maternity"], ["nicu", "NICU / SNCU"]];
export const FACILITY_TYPES = { govt_hospital: "Government hospital", private_hospital: "Private hospital", chc: "Community Health Centre", phc: "Primary Health Centre", diagnostic: "Diagnostic centre", pharmacy: "Pharmacy", ambulance: "Ambulance service", other: "Other facility" };

export const TEST_CATALOG = [
  ["CBC", "Complete Blood Count (CBC)", "Blood", 250, "same day", true], ["GLU-F", "Blood glucose (fasting)", "Blood", 80, "same day", true], ["HBA1C", "HbA1c", "Blood", 450, "1 day", false],
  ["TSH", "Thyroid profile (TSH)", "Blood", 350, "1 day", false], ["LIPID", "Lipid profile", "Blood", 500, "same day", true], ["LFT", "Liver function test", "Blood", 600, "1 day", true], ["KFT", "Kidney function test", "Blood", 550, "1 day", false],
  ["XR-CHEST", "X-ray chest", "Imaging", 300, "2 hours", false], ["USG-ABD", "Ultrasound abdomen", "Imaging", 800, "same day", true], ["CT-HEAD", "CT scan head", "Imaging", 3000, "same day", false], ["MRI-BRAIN", "MRI brain", "Imaging", 7000, "2 days", false],
  ["URINE", "Urine routine", "Other", 100, "same day", false], ["ECG", "ECG", "Other", 200, "30 min", false], ["PATH-BX", "Biopsy / pathology", "Other", 1200, "4 days", false],
].map(([code, name, category, price, tat, fasting]) => ({ code, name, category, price, tat, fasting, available: true }));

export const MEDICINES = [
  ["Paracetamol 500 mg", "Paracetamol", "Tablet", "OTC", 12], ["Amoxicillin 500 mg", "Amoxicillin", "Capsule", "H", 85], ["Metformin 500 mg", "Metformin", "Tablet", "H", 30],
  ["Amlodipine 5 mg", "Amlodipine", "Tablet", "H", 40], ["ORS sachet", "Oral rehydration salts", "Sachet", "OTC", 22], ["Iron + Folic acid", "Ferrous fumarate + folic acid", "Tablet", "OTC", 35],
  ["Cetirizine 10 mg", "Cetirizine", "Tablet", "OTC", 18], ["Atorvastatin 10 mg", "Atorvastatin", "Tablet", "H", 65], ["Salbutamol inhaler", "Salbutamol", "Inhaler", "H", 140], ["Pantoprazole 40 mg", "Pantoprazole", "Tablet", "H", 55],
  ["Azithromycin 500 mg", "Azithromycin", "Tablet", "H", 110], ["Tramadol 50 mg", "Tramadol", "Capsule", "H1", 95],
].map(([name, generic, form, schedule, price]) => ({ name, generic, form, schedule, price }));

const now = () => new Date().toISOString();
const hoursAgo = (n) => new Date(Date.now() - n * 3600e3).toISOString();

function bed(total, occupied, unavailable = 0, age = 2) { return { total, occupied, unavailable, updatedAt: hoursAgo(age) }; }

export function buildSeed() {
  const D = (n) => districtByName(n);
  const jit = (v, i, s = 0.03) => +(v + Math.sin(i * 12.9898) * s).toFixed(4);
  const orgs = [], users = [], doctors = [];
  let n = 0;
  const addOrg = (o) => { const id = `org_${String(++n).padStart(3, "0")}`; orgs.push({ id, demo: true, verification: "verified", createdAt: hoursAgo(900), emergency24x7: false, services: [], depts: [], beds: {}, tests: [], hours: "Mon–Sat 9:00–17:00", ...o }); return id; };

  // Hospitals ---------------------------------------------------------------------------------------
  const hosp = [
    ["Demo Government General Hospital", "Guntur", "govt_hospital", ["General Medicine", "Paediatrics", "Obstetrics & Gynaecology", "Orthopaedics", "General Surgery", "Emergency & Trauma", "Cardiology"], { general: bed(300, 241, 12, 1), emergency: bed(30, 18, 2, 1), icu: bed(24, 21, 1, 1), maternity: bed(40, 29, 0, 3), nicu: bed(12, 10, 0, 4) }, true, ["xray", "ct", "ultrasound", "lab", "pharmacy", "blood bank"]],
    ["Demo Sri Sai Multispecialty Hospital", "Guntur", "private_hospital", ["General Medicine", "Cardiology", "Neurology", "Nephrology", "Emergency & Trauma"], { private: bed(40, 26, 2, 0.5), icu: bed(16, 12, 0, 0.5), emergency: bed(8, 3, 0, 0.5) }, true, ["mri", "ct", "lab", "pharmacy", "dialysis"]],
    ["Demo Area Hospital", "Visakhapatnam", "govt_hospital", ["General Medicine", "Paediatrics", "Obstetrics & Gynaecology", "Emergency & Trauma", "ENT", "Ophthalmology"], { general: bed(180, 140, 8, 2), emergency: bed(20, 9, 1, 2), icu: bed(12, 9, 0, 2), maternity: bed(30, 17, 0, 2) }, true, ["xray", "ultrasound", "lab", "pharmacy"]],
    ["Demo Harbour City Heart & Trauma Centre", "Visakhapatnam", "private_hospital", ["Cardiology", "Emergency & Trauma", "Neurology", "General Surgery"], { private: bed(60, 41, 3, 5), icu: bed(30, 24, 0, 5), emergency: bed(10, 4, 0, 5) }, true, ["ct", "mri", "cath lab", "lab", "pharmacy"]],
    ["Demo District Hospital", "NTR", "govt_hospital", ["General Medicine", "Paediatrics", "Obstetrics & Gynaecology", "Orthopaedics", "Emergency & Trauma", "Psychiatry"], { general: bed(250, 205, 5, 1.5), emergency: bed(25, 20, 0, 1.5), icu: bed(20, 17, 1, 1.5), maternity: bed(35, 22, 0, 1.5) }, true, ["xray", "ct", "ultrasound", "lab", "pharmacy", "blood bank"]],
    ["Demo Lotus Mother & Child Hospital", "NTR", "private_hospital", ["Obstetrics & Gynaecology", "Paediatrics"], { private: bed(30, 14, 0, 30), maternity: bed(20, 11, 0, 30), nicu: bed(8, 5, 0, 30) }, false, ["ultrasound", "lab", "pharmacy"]],
    ["Demo Government General Hospital", "Kurnool", "govt_hospital", ["General Medicine", "Orthopaedics", "General Surgery", "Emergency & Trauma", "Pulmonology"], { general: bed(220, 160, 10, 3), emergency: bed(22, 11, 0, 3), icu: bed(14, 8, 0, 3) }, true, ["xray", "ct", "lab", "pharmacy"]],
    ["Demo Area Hospital", "Tirupati", "govt_hospital", ["General Medicine", "Paediatrics", "Cardiology", "Neurology", "Emergency & Trauma", "Oncology"], { general: bed(320, 270, 9, 1), emergency: bed(30, 22, 1, 1), icu: bed(26, 22, 0, 1) }, true, ["ct", "mri", "ultrasound", "lab", "pharmacy", "blood bank"]],
    ["Demo Government General Hospital", "Kakinada", "govt_hospital", ["General Medicine", "Orthopaedics", "Obstetrics & Gynaecology", "Emergency & Trauma", "Paediatrics"], { general: bed(260, 190, 6, 2), emergency: bed(24, 10, 0, 2), icu: bed(18, 12, 0, 2), maternity: bed(36, 21, 0, 2) }, true, ["xray", "ct", "ultrasound", "lab", "pharmacy"]],
    ["Demo Community Health Centre", "Srikakulam", "chc", ["General Medicine", "Paediatrics", "Obstetrics & Gynaecology"], { general: bed(30, 17, 0, 6), maternity: bed(8, 3, 0, 6) }, false, ["xray", "lab", "pharmacy"]],
    ["Demo Primary Health Centre", "Alluri Sitharama Raju", "phc", ["General Medicine", "Obstetrics & Gynaecology"], { general: bed(6, 2, 0, 20) }, false, ["lab", "pharmacy"]],
    ["Demo Community Health Centre", "Ananthapuramu", "chc", ["General Medicine", "Paediatrics", "General Surgery"], { general: bed(30, 12, 0, 9), emergency: bed(4, 1, 0, 9) }, true, ["xray", "lab", "pharmacy"]],
    ["Demo Area Hospital", "Nellore".replace("Nellore", "Sri Potti Sriramulu Nellore"), "govt_hospital", ["General Medicine", "Paediatrics", "Emergency & Trauma", "Obstetrics & Gynaecology"], { general: bed(150, 98, 4, 2), emergency: bed(14, 6, 0, 2), icu: bed(8, 5, 0, 2) }, true, ["xray", "ultrasound", "lab", "pharmacy"]],
    ["Demo Government General Hospital", "Y.S.R. Kadapa", "govt_hospital", ["General Medicine", "Neurology", "Orthopaedics", "Emergency & Trauma"], { general: bed(200, 130, 3, 2), emergency: bed(20, 7, 0, 2), icu: bed(12, 6, 0, 2) }, true, ["ct", "xray", "lab", "pharmacy"]],
    ["Demo Community Health Centre", "Vizianagaram", "chc", ["General Medicine", "Paediatrics"], { general: bed(30, 21, 0, 40) }, false, ["xray", "lab"]],
    ["Demo Area Hospital", "West Godavari", "govt_hospital", ["General Medicine", "Orthopaedics", "Emergency & Trauma", "Paediatrics"], { general: bed(120, 80, 2, 3), emergency: bed(12, 5, 0, 3) }, true, ["xray", "ultrasound", "lab", "pharmacy"]],
  ];
  const hospIds = hosp.map(([name, district, type, depts, beds, er, services], i) => {
    const d = D(district);
    return addOrg({ kind: "hospital", name, district, type, depts, beds, emergency24x7: er, services, lat: jit(d.lat, i + 1), lng: jit(d.lng, i + 7), mandal: `${district.split(" ")[0]} Urban`, address: `Demo address ${i + 1}, ${district} (not a real location)`, pin: "5" + String(10000 + i * 137).slice(0, 5), phone: `+91 00000 ${String(10000 + i)}`, emergencyPhone: `+91 00000 ${String(20000 + i)}`, tests: TEST_CATALOG.filter(t => (services.includes("lab") && t.category !== "Imaging") || (t.code === "XR-CHEST" && services.includes("xray")) || (t.code === "USG-ABD" && services.includes("ultrasound")) || (t.code === "CT-HEAD" && services.includes("ct")) || (t.code === "MRI-BRAIN" && services.includes("mri"))), bedsSource: "demo" });
  });

  // Diagnostic centres / pharmacies / ambulance ------------------------------------------------------
  const diagIds = [["Demo Apex Diagnostics", "Guntur"], ["Demo Lifeline Imaging & Labs", "Visakhapatnam"], ["Demo Rural Path Lab", "Srikakulam"], ["Demo CityScan Centre", "NTR"]].map(([name, district], i) => {
    const d = D(district);
    return addOrg({ kind: "diagnostic", name, district, type: "diagnostic", lat: jit(d.lat, i + 21, 0.05), lng: jit(d.lng, i + 25, 0.05), address: `Demo address, ${district}`, pin: "5" + (20000 + i * 77), phone: `+91 00000 3${i}000`, hours: "Mon–Sun 7:00–19:00", tests: TEST_CATALOG.filter(t => i % 2 ? true : t.category !== "Imaging" || t.code === "USG-ABD") });
  });
  const pharIds = [["Demo Arogya Medicals", "Guntur"], ["Demo Jan Aushadhi Kendra", "Kurnool"], ["Demo Sanjeevani Pharmacy", "Visakhapatnam"], ["Demo Village Medical Store", "Srikakulam"], ["Demo City Care Pharmacy", "NTR"]].map(([name, district], i) => {
    const d = D(district);
    return addOrg({ kind: "pharmacy", name, district, type: "pharmacy", lat: jit(d.lat, i + 31, 0.04), lng: jit(d.lng, i + 35, 0.04), address: `Demo address, ${district}`, pin: "5" + (30000 + i * 91), phone: `+91 00000 4${i}000`, hours: "Daily 8:00–21:30", licenceNo: `DEMO-DL-${1000 + i}` });
  });
  const ambIds = [["Demo 108-style Emergency Fleet — Krishna/Guntur", "Guntur"], ["Demo Coastal Ambulance Network", "Visakhapatnam"], ["Demo Rayalaseema Ambulance Trust", "Kurnool"]].map(([name, district], i) => {
    const d = D(district);
    return addOrg({ kind: "ambulance", name, district, type: "ambulance", lat: jit(d.lat, i + 41, 0.04), lng: jit(d.lng, i + 45, 0.04), address: `Demo base, ${district}`, phone: `+91 00000 5${i}000`, hours: "24×7", vehicles: [{ id: `veh_${i}1`, plate: `DEMO-AP-0${i}A-1001`, type: "ALS", status: "available" }, { id: `veh_${i}2`, plate: `DEMO-AP-0${i}A-1002`, type: "BLS", status: "available" }] });
  });

  // Stock for pharmacies ----------------------------------------------------------------------------
  const stock = [];
  pharIds.forEach((orgId, pi) => MEDICINES.forEach((m, mi) => {
    if ((mi + pi) % 5 === 4) return;
    stock.push({ id: `stk_${orgId}_${mi}`, orgId, ...m, qty: ((mi * 37 + pi * 53) % 160) + (mi % 4 === 0 ? 3 : 20), reorder: 25, updatedAt: hoursAgo(1 + ((mi + pi) % 30)), demo: true });
  }));

  // Doctors ------------------------------------------------------------------------------------------
  const specs = ["General Medicine", "Paediatrics", "Obstetrics & Gynaecology", "Orthopaedics", "Cardiology", "Neurology", "General Surgery", "ENT", "Ophthalmology", "Dermatology"];
  const names = ["Lakshmi Prasanna", "Ravi Teja", "Sunitha Reddy", "Venkata Rao", "Anitha Kumari", "Srinivas Murthy", "Padmavathi", "Kiran Kumar", "Harika Devi", "Naga Raju", "Swarna Latha", "Prakash Babu", "Mounika", "Suresh Varma", "Bhavani", "Chandra Sekhar"];
  hospIds.forEach((orgId, oi) => {
    const o = orgs.find(x => x.id === orgId);
    o.depts.filter(dp => dp !== "Emergency & Trauma").slice(0, 4).forEach((dp, k) => {
      const idx = oi * 4 + k;
      const day = (a) => a.map(d => ({ day: d, start: "09:00", end: "13:00", slotMins: 15 }));
      const sched = (idx % 3 === 0) ? [...day([1, 2, 3, 4, 5]), { day: 1, start: "15:00", end: "17:00", slotMins: 20 }] : (idx % 3 === 1 ? day([1, 3, 5, 6]) : day([2, 4, 6]));
      doctors.push({ id: `doc_${String(idx + 1).padStart(3, "0")}`, name: `Dr. ${names[idx % names.length]}`, spec: dp, orgId, schedule: sched, fee: o.type === "private_hospital" ? 600 : 0, languages: ["Telugu", "English", idx % 2 ? "Hindi" : "Tamil"].slice(0, 3), verified: true, demo: true, regNo: `DEMO-APMC-${20000 + idx}` });
    });
  });

  // Users (all demo; password for every demo account is shown on the login screen) ---------------------
  const pw = (p, salt) => sha256(salt + p); // placeholder until first real login re-hashes with PBKDF2 (see db.js)
  const U = (id, role, name, email, extra = {}) => users.push({ id, role, name, email, phone: "+91 00000 0" + id.slice(-4).replace(/\D/g, "0").padEnd(4, "0"), status: "active", demo: true, salt: "demo", passHash: pw("demo1234", "demo"), passAlgo: "sha256", lang: "en", createdAt: hoursAgo(1000), ...extra });
  U("u_citizen", "citizen", "Ravi Kumar (Demo)", "citizen@demo.swasthya.test", { district: "Guntur", dob: "1988-04-12", sex: "M", abha: "DEMO-ABHA-0001" });
  U("u_citizen2", "citizen", "Padma Devi (Demo)", "citizen2@demo.swasthya.test", { district: "Srikakulam", dob: "1964-09-03", sex: "F" });
  U("u_doctor", "doctor", "Dr. Lakshmi Prasanna (Demo)", "doctor@demo.swasthya.test", { district: "Guntur", doctorId: "doc_001", regNo: "DEMO-APMC-20000", verification: "verified" });
  U("u_hospital", "hospital", "Hospital desk — Guntur GGH (Demo)", "hospital@demo.swasthya.test", { orgId: hospIds[0], district: "Guntur" });
  U("u_hospital2", "hospital", "Hospital desk — Sri Sai (Demo)", "hospital2@demo.swasthya.test", { orgId: hospIds[1], district: "Guntur" });
  U("u_diag", "diagnostic", "Apex Diagnostics desk (Demo)", "diagnostic@demo.swasthya.test", { orgId: diagIds[0], district: "Guntur" });
  U("u_pharmacy", "pharmacy", "Arogya Medicals — pharmacist (Demo)", "pharmacy@demo.swasthya.test", { orgId: pharIds[0], district: "Guntur" });
  U("u_organizer", "organizer", "Rural Outreach Trust (Demo)", "organizer@demo.swasthya.test", { district: "Srikakulam" });
  U("u_asha", "asha", "Lakshmamma, ASHA (Demo)", "asha@demo.swasthya.test", { district: "Srikakulam", mandal: "Srikakulam Rural", village: "Demo village (sample)", ashaId: "ASHA-DEMO-0042" });
  U("u_district", "district", "District Health Officer — Guntur (Demo)", "district@demo.swasthya.test", { district: "Guntur" });
  U("u_ambulance", "ambulance", "Ambulance dispatcher (Demo)", "ambulance@demo.swasthya.test", { orgId: ambIds[0], district: "Guntur" });
  U("u_admin", "admin", "Platform Super Administrator (Demo)", "admin@demo.swasthya.test", { district: "Andhra Pradesh" });
  const doc1 = doctors.find(d => d.id === "doc_001"); doc1.userId = "u_doctor";
  // a few extra doctors in the same hospital for the demo doctor's colleagues
  orgs.forEach(o => { if (o.kind === "hospital") o.ownerUserId = users.find(u => u.orgId === o.id)?.id; });
  orgs.forEach(o => { if (o.kind !== "hospital") o.ownerUserId = users.find(u => u.orgId === o.id)?.id; });

  // Family, records, appointments, admissions -------------------------------------------------------------
  const family = [
    { id: "fam_1", ownerId: "u_citizen", name: "Sita Kumar (Demo)", relation: "Spouse", dob: "1991-01-20", sex: "F", consent: true, demo: true },
    { id: "fam_2", ownerId: "u_citizen", name: "Arjun Kumar (Demo)", relation: "Child", dob: "2016-07-08", sex: "M", consent: true, demo: true },
    { id: "fam_3", ownerId: "u_citizen", name: "Subbarao (Demo)", relation: "Father", dob: "1952-11-02", sex: "M", consent: true, demo: true },
  ];
  const records = [
    { id: "rec_1", ownerId: "u_citizen", subjectId: "u_citizen", subjectName: "Ravi Kumar (Demo)", type: "lab", title: "Lipid profile — DEMO report", date: isoDay(addDays(new Date(), -40)), orgId: diagIds[0], source: "diagnostic", content: "Total cholesterol 214 mg/dL · LDL 138 mg/dL · HDL 41 mg/dL · Triglycerides 176 mg/dL\n(DEMO values for illustration only — not a real report.)", demo: true, createdAt: hoursAgo(960) },
    { id: "rec_2", ownerId: "u_citizen", subjectId: "u_citizen", subjectName: "Ravi Kumar (Demo)", type: "imaging", title: "Chest X-ray — DEMO report", date: isoDay(addDays(new Date(), -120)), orgId: hospIds[0], source: "diagnostic", content: "Lungs clear. Heart size normal. No pleural effusion.\n(DEMO text — not a real radiology report.)", demo: true, createdAt: hoursAgo(2900) },
    { id: "rec_3", ownerId: "u_citizen", subjectId: "u_citizen", subjectName: "Ravi Kumar (Demo)", type: "prescription", title: "Prescription — Metformin (DEMO)", date: isoDay(addDays(new Date(), -20)), orgId: hospIds[0], source: "consult", content: "Metformin 500 mg — 1 tablet twice daily after food × 30 days\nReview with fasting glucose in 4 weeks.\n(DEMO prescription.)", demo: true, createdAt: hoursAgo(480), rx: { items: [{ name: "Metformin 500 mg", dose: "1 tab BD after food", days: 30 }] } },
    { id: "rec_4", ownerId: "u_citizen", subjectId: "fam_2", subjectName: "Arjun Kumar (Demo)", type: "consult", title: "Paediatric check-up — DEMO note", date: isoDay(addDays(new Date(), -60)), orgId: hospIds[0], source: "consult", content: "Routine growth review. Vaccination schedule up to date. (DEMO note.)", demo: true, createdAt: hoursAgo(1440) },
  ];
  const consents = [
    { id: "con_1", patientId: "u_citizen", doctorUserId: "u_doctor", doctorName: "Dr. Lakshmi Prasanna (Demo)", recordIds: ["rec_1", "rec_3"], purpose: "Diabetes follow-up consultation", grantedAt: hoursAgo(24), expiresAt: new Date(Date.now() + 6 * 864e5).toISOString(), revokedAt: null, via: "patient", demo: true },
  ];
  const accessLog = [
    { id: "acc_1", at: hoursAgo(3), recordId: "rec_1", patientId: "u_citizen", accessorId: "u_doctor", accessorName: "Dr. Lakshmi Prasanna (Demo)", role: "doctor", via: "consent", consentId: "con_1" },
  ];
  const d0 = isoDay(addDays(new Date(), 1)), d1 = isoDay(addDays(new Date(), 2));
  const appointments = [
    { id: "apt_1", ref: "APT-DEMO-100001", patientId: "u_citizen", forId: "u_citizen", forName: "Ravi Kumar (Demo)", doctorId: "doc_001", orgId: hospIds[0], date: d0, time: "09:30", reason: "Diabetes review", status: "confirmed", history: [{ at: hoursAgo(20), by: "System", text: "Requested" }, { at: hoursAgo(18), by: "Hospital desk", text: "Confirmed" }], createdAt: hoursAgo(20), demo: true },
    { id: "apt_2", ref: "APT-DEMO-100002", patientId: "u_citizen2", forId: "u_citizen2", forName: "Padma Devi (Demo)", doctorId: "doc_001", orgId: hospIds[0], date: d0, time: "10:00", reason: "Knee pain follow-up", status: "requested", history: [{ at: hoursAgo(5), by: "System", text: "Requested" }], createdAt: hoursAgo(5), demo: true },
    { id: "apt_3", ref: "APT-DEMO-100003", patientId: "u_citizen", forId: "fam_2", forName: "Arjun Kumar (Demo)", doctorId: "doc_002", orgId: hospIds[0], date: d1, time: "11:15", reason: "Cough for 5 days", status: "requested", history: [{ at: hoursAgo(2), by: "System", text: "Requested" }], createdAt: hoursAgo(2), demo: true },
  ];
  const admissions = [
    { id: "adm_1", ref: "ADM-DEMO-200001", patientId: "u_citizen2", forName: "Padma Devi (Demo)", orgId: hospIds[0], department: "Orthopaedics", category: "Planned (surgery / procedure)", urgency: "routine", reason: "Doctor advised knee replacement evaluation (DEMO)", docs: [{ name: "referral-letter-demo.pdf" }], status: "under_review", messages: [{ at: hoursAgo(10), from: "Hospital desk", text: "Request received. Pre-admission assessment team is reviewing." }], history: [{ at: hoursAgo(12), by: "Patient", text: "Submitted" }, { at: hoursAgo(10), by: "Hospital desk", text: "Received" }, { at: hoursAgo(8), by: "Hospital desk", text: "Under review" }], createdAt: hoursAgo(12), demo: true },
  ];
  const diagBookings = [
    { id: "dgb_1", ref: "DGN-DEMO-300001", patientId: "u_citizen", forId: "u_citizen", forName: "Ravi Kumar (Demo)", orgId: diagIds[0], testCode: "HBA1C", testName: "HbA1c", date: d0, slot: "08:00", status: "confirmed", history: [{ at: hoursAgo(6), by: "System", text: "Requested" }, { at: hoursAgo(4), by: "Diagnostic desk", text: "Confirmed — fasting not required" }], createdAt: hoursAgo(6), demo: true },
  ];

  // Camps --------------------------------------------------------------------------------------------------
  const camps = [
    { id: "camp_1", organizerId: "u_organizer", title: "Community Wellness & Screening Camp", description: "General screening: BP, blood sugar, anaemia, eye check.", district: "Srikakulam", mandal: "Srikakulam Rural", village: "Demo village (sample)", venue: "Demo Zilla Parishad School", lat: 18.3, lng: 83.9, date: isoDay(addDays(new Date(), 9)), start: "09:00", end: "15:00", services: ["BP & sugar", "Anaemia screening", "Eye check", "Women's health"], doctors: ["Dr. Demo A (General)", "Dr. Demo B (Ophthalmology)"], capacity: 200, status: "published", approvedBy: "u_admin", demo: true, createdAt: hoursAgo(300) },
    { id: "camp_2", organizerId: "u_organizer", title: "Women's Health Awareness Camp", description: "Gynaecology screening and nutrition counselling.", district: "Guntur", mandal: "Tadikonda", village: "Demo village (sample)", venue: "Demo Community Hall", lat: 16.34, lng: 80.42, date: isoDay(addDays(new Date(), 13)), start: "10:00", end: "14:00", services: ["Gynaecology screening", "Nutrition counselling", "Anaemia screening"], doctors: ["Dr. Demo C (Gynaecology)"], capacity: 120, status: "published", approvedBy: "u_admin", demo: true, createdAt: hoursAgo(200) },
    { id: "camp_3", organizerId: "u_organizer", title: "Diabetes Awareness & Lifestyle Education", description: "Blood sugar checks and diet education.", district: "Visakhapatnam", mandal: "Bheemunipatnam", village: "Demo village (sample)", venue: "Demo Panchayat Office", lat: 17.89, lng: 83.45, date: isoDay(addDays(new Date(), 19)), start: "09:30", end: "13:30", services: ["Blood sugar", "Diet education"], doctors: ["Dr. Demo D (General)"], capacity: 150, status: "pending_approval", demo: true, createdAt: hoursAgo(30) },
    { id: "camp_4", organizerId: "u_organizer", title: "Eye Screening Camp (completed)", description: "Cataract screening.", district: "Srikakulam", mandal: "Palasa", village: "Demo village (sample)", venue: "Demo school", lat: 18.77, lng: 84.41, date: isoDay(addDays(new Date(), -25)), start: "09:00", end: "14:00", services: ["Eye check"], doctors: ["Dr. Demo B (Ophthalmology)"], capacity: 150, status: "completed", demo: true, createdAt: hoursAgo(900), report: { attended: 118, referred: 14, notes: "14 referred for cataract surgery (DEMO report)." } },
  ];
  const campRegs = [{ id: "cr_1", campId: "camp_1", citizenId: "u_citizen2", forName: "Padma Devi (Demo)", status: "registered", createdAt: hoursAgo(50), demo: true }];

  // ASHA ---------------------------------------------------------------------------------------------------
  const ashaHouseholds = [
    { id: "hh_1", ashaId: "u_asha", head: "Appalaswamy (Demo)", village: "Demo village (sample)", address: "Demo house 12", members: [{ id: "m1", name: "Appalaswamy", age: 58, sex: "M", flags: ["Hypertension (known)"] }, { id: "m2", name: "Gowri", age: 54, sex: "F", flags: [] }, { id: "m3", name: "Tejaswi", age: 6, sex: "F", flags: ["Vaccination due"] }], lastVisit: hoursAgo(24 * 12), syncState: "synced", demo: true },
    { id: "hh_2", ashaId: "u_asha", head: "Satyavathi (Demo)", village: "Demo village (sample)", address: "Demo house 31", members: [{ id: "m4", name: "Satyavathi", age: 27, sex: "F", flags: ["Pregnant — ANC due"] }, { id: "m5", name: "Ramu", age: 30, sex: "M", flags: [] }], lastVisit: hoursAgo(24 * 20), syncState: "synced", demo: true },
    { id: "hh_3", ashaId: "u_asha", head: "Narayana (Demo)", village: "Demo village (sample)", address: "Demo house 47", members: [{ id: "m6", name: "Narayana", age: 71, sex: "M", flags: ["Diabetes (known)", "Mobility limited"] }], lastVisit: hoursAgo(24 * 33), syncState: "synced", demo: true },
  ];
  const followups = [
    { id: "fu_1", ashaId: "u_asha", householdId: "hh_2", who: "Satyavathi", reason: "Antenatal check-up due", due: isoDay(addDays(new Date(), 2)), done: false, syncState: "synced", demo: true },
    { id: "fu_2", ashaId: "u_asha", householdId: "hh_1", who: "Tejaswi", reason: "Vaccination follow-up", due: isoDay(addDays(new Date(), -1)), done: false, syncState: "synced", demo: true },
    { id: "fu_3", ashaId: "u_asha", householdId: "hh_3", who: "Narayana", reason: "Blood sugar re-check", due: isoDay(addDays(new Date(), 5)), done: false, syncState: "synced", demo: true },
  ];
  const referrals = [
    { id: "ref_1", fromId: "u_asha", fromName: "Lakshmamma, ASHA (Demo)", fromRole: "asha", patientName: "Satyavathi", toOrgId: hospIds[9], toSpecialty: "Obstetrics & Gynaecology", reason: "Antenatal care — high-risk screening", urgency: "routine", status: "sent", createdAt: hoursAgo(40), syncState: "synced", demo: true },
  ];
  const stockRequests = []; // placeholders for collections used by views
  return {
    users, orgs, doctors, stock, family, records, consents, accessLog, appointments, admissions, diagBookings, camps, campRegs,
    ashaHouseholds, followups, referrals, rxRequests: [], enquiries: [
      { id: "enq_1", patientId: "u_citizen", orgId: pharIds[0], medicine: "Metformin 500 mg", qty: 60, status: "open", note: "", createdAt: hoursAgo(3), demo: true },
    ],
    emergencies: [], notifications: [], outbox: [], audit: [], loginAttempts: [], announcements: [
      { id: "ann_1", title: "Demo environment", body: "All records marked DEMO are sample data created for testing. Do not enter real patient information.", at: now(), by: "System", level: "info" },
    ],
    consultations: [], cacheMeta: {}, stockRequests,
    config: { staleHours: 24, emergencyAccessHours: 2, sessionIdleMinutes: 30, aiMode: "local", aiEndpoint: "", smsSimulated: true, kAnonymity: 5, demoMode: true },
    meta: { version: 3, seededAt: now() },
  };
}
