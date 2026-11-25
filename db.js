// Browser-local data store + authentication + audit chain + notifications.
//
// PROTOTYPE NOTE: this module stands in for a secure backend (see supabase/ for the production schema).
// All data lives in this browser's localStorage. Sessions are per-tab (sessionStorage), so you can sign in as a
// patient in one tab and a hospital in another and watch the workflow cross between them in real time.
import { sha256, uid, isoDay } from "./util.js";
import { buildSeed, ROLES } from "./seed.js";

const KEY = "swasthya.db.v3";
const SESSION = "swasthya.session";
let data = null;
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (src = "local") => listeners.forEach(f => { try { f(src); } catch (e) { console.error(e); } });

export function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { data = JSON.parse(raw); if (data.meta?.version === 3) return data; } } catch { /* fall through */ }
  data = buildSeed(); persist(); return data;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.warn("Storage full or blocked", e); } }
window.addEventListener("storage", (e) => { if (e.key === KEY && e.newValue) { try { data = JSON.parse(e.newValue); emit("remote"); } catch { /* ignore */ } } });

export const db = {
  get data() { return data || load(); },
  all: (c) => db.data[c] || (db.data[c] = []),
  get: (c, id) => db.all(c).find(x => x.id === id),
  where: (c, fn) => db.all(c).filter(fn),
  insert(c, obj) { const o = { id: uid(c.slice(0, 3)), createdAt: new Date().toISOString(), ...obj }; db.all(c).unshift(o); persist(); emit(); return o; },
  update(c, id, patch) { const o = db.get(c, id); if (!o) return null; Object.assign(o, typeof patch === "function" ? patch(o) : patch); persist(); emit(); return o; },
  remove(c, id) { const a = db.all(c); const i = a.findIndex(x => x.id === id); if (i >= 0) a.splice(i, 1); persist(); emit(); },
  save() { persist(); emit(); },
  reset() { data = buildSeed(); persist(); sessionStorage.removeItem(SESSION); emit(); },
  cfg: () => db.data.config,
};

// ---------------------------------------------------------------------------------------------------
// Audit log: append-only, hash-chained. Editing or deleting any entry breaks every later hash.
// ---------------------------------------------------------------------------------------------------
export function audit(action, target = "", detail = "", actor = auth.current()) {
  const log = db.all("audit");
  const prev = log.length ? log[0].hash : "GENESIS";
  const entry = { seq: (log[0]?.seq || 0) + 1, at: new Date().toISOString(), actorId: actor?.id || "anonymous", actorRole: actor?.role || "-", actorName: actor?.name || "Anonymous", action, target, detail, prev };
  entry.hash = sha256(JSON.stringify([entry.seq, entry.at, entry.actorId, entry.action, entry.target, entry.detail, prev]));
  log.unshift(entry); if (log.length > 2000) log.length = 2000;
  persist(); emit();
  return entry;
}
export function verifyAuditChain() {
  const log = [...db.all("audit")].reverse(); // oldest first
  for (let i = 0; i < log.length; i++) {
    const e = log[i], prev = i === 0 ? (e.prev) : log[i - 1].hash;
    const h = sha256(JSON.stringify([e.seq, e.at, e.actorId, e.action, e.target, e.detail, e.prev]));
    if (h !== e.hash || (i > 0 && e.prev !== prev)) return { ok: false, brokenAt: e.seq, total: log.length };
  }
  return { ok: true, total: log.length };
}

// ---------------------------------------------------------------------------------------------------
// Notifications (+ simulated SMS / email outbox — nothing is actually sent from a static prototype)
// ---------------------------------------------------------------------------------------------------
export function notify(userId, { title, body = "", link = "", type = "info", channels = ["inapp"] }) {
  if (!userId) return;
  db.insert("notifications", { userId, title, body, link, type, at: new Date().toISOString(), read: false });
  const u = db.get("users", userId);
  if (u) channels.filter(c => c !== "inapp").forEach(ch => db.insert("outbox", { channel: ch, to: ch === "sms" ? u.phone : u.email, text: `${title}${body ? " — " + body : ""}`, simulated: true, at: new Date().toISOString() }));
}
export const notifyOrg = (orgId, payload) => db.where("users", u => u.orgId === orgId).forEach(u => notify(u.id, payload));
export const notifyRole = (role, payload, filter = () => true) => db.where("users", u => u.role === role && filter(u)).forEach(u => notify(u.id, payload));

// ---------------------------------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------------------------------
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
async function pbkdf2(pw, salt) {
  if (!crypto?.subtle) return "sha256:" + sha256(salt + pw);
  const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 150000 }, k, 256);
  return "pbkdf2:" + hex(bits);
}
export const passwordProblem = (pw) => pw.length < 8 ? "Use at least 8 characters." : !/[A-Za-z]/.test(pw) || !/\d/.test(pw) ? "Include both letters and numbers." : "";

const MAX_FAILS = 5, LOCK_MIN = 10;
function recentFails(email) { const since = Date.now() - LOCK_MIN * 60000; return db.all("loginAttempts").filter(a => a.email === email && !a.ok && new Date(a.at).getTime() > since).length; }
const logAttempt = (email, ok, reason = "") => { db.all("loginAttempts").unshift({ email, ok, reason, at: new Date().toISOString() }); if (db.all("loginAttempts").length > 300) db.all("loginAttempts").length = 300; db.save(); };

export const auth = {
  current() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION) || "null"); if (!s) return null;
      const idle = (db.cfg().sessionIdleMinutes || 30) * 60000;
      if (Date.now() - s.touched > idle) { sessionStorage.removeItem(SESSION); return null; }
      return db.get("users", s.userId) || null;
    } catch { return null; }
  },
  touch() { try { const s = JSON.parse(sessionStorage.getItem(SESSION) || "null"); if (s) { s.touched = Date.now(); sessionStorage.setItem(SESSION, JSON.stringify(s)); } } catch { /* ignore */ } },
  async login(email, password) {
    email = (email || "").trim().toLowerCase();
    if (recentFails(email) >= MAX_FAILS) { audit("login.locked", email, "Too many failed attempts", null); throw new Error(`Too many failed attempts. Try again in ${LOCK_MIN} minutes.`); }
    const u = db.all("users").find(x => x.email.toLowerCase() === email);
    let ok = false;
    if (u) {
      if (u.passAlgo === "sha256") { ok = sha256(u.salt + password) === u.passHash; if (ok && crypto?.subtle) { u.passHash = await pbkdf2(password, u.salt); u.passAlgo = "pbkdf2"; } }
      else ok = (await pbkdf2(password, u.salt)) === u.passHash;
    } else await pbkdf2(password, "x"); // keep timing similar for unknown accounts
    if (!ok) { logAttempt(email, false, u ? "bad password" : "unknown account"); audit("login.failed", email, "", null); throw new Error("Email or password is incorrect."); }
    if (u.status === "suspended") { logAttempt(email, false, "suspended"); throw new Error("This account is suspended. Contact the platform administrator."); }
    logAttempt(email, true);
    sessionStorage.setItem(SESSION, JSON.stringify({ userId: u.id, at: Date.now(), touched: Date.now() }));
    u.lastLogin = new Date().toISOString(); db.save();
    audit("login.success", u.email, u.role, u);
    return u;
  },
  logout() { const u = auth.current(); if (u) audit("logout", u.email, "", u); sessionStorage.removeItem(SESSION); emit(); },
  async register(f) {
    const role = f.role;
    if (!ROLES[role]?.self) throw new Error("This account type cannot be created through public registration.");
    const email = (f.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
    if (db.all("users").some(u => u.email.toLowerCase() === email)) throw new Error("An account with this email already exists.");
    const prob = passwordProblem(f.password || ""); if (prob) throw new Error(prob);
    if (!f.name?.trim()) throw new Error("Enter your name.");
    const salt = uid("s");
    const needsVerify = ROLES[role].verify;
    let orgId;
    if (["hospital", "pharmacy", "diagnostic", "ambulance"].includes(role)) {
      const typeMap = { hospital: f.facilityType || "private_hospital", pharmacy: "pharmacy", diagnostic: "diagnostic", ambulance: "ambulance" };
      const org = db.insert("orgs", { kind: role, name: f.orgName || f.name, type: typeMap[role], district: f.district, mandal: f.mandal || "", address: f.address || "", pin: f.pin || "", phone: f.phone || "", lat: +f.lat || null, lng: +f.lng || null, verification: "pending", demo: false, depts: [], beds: {}, tests: [], services: [], vehicles: role === "ambulance" ? [] : undefined, hours: "", licenceNo: f.licenceNo || "", regNo: f.regNo || "", emergency24x7: false });
      orgId = org.id;
    }
    const user = db.insert("users", {
      id: uid("u"), role, name: f.name.trim(), email, phone: f.phone || "", district: f.district || "", mandal: f.mandal || "", salt, passHash: await pbkdf2(f.password, salt), passAlgo: "pbkdf2",
      status: needsVerify ? "pending" : "active", lang: f.lang || "en", orgId, regNo: f.regNo || "", council: f.council || "", specialization: f.specialization || "", affiliation: f.affiliation || "",
      ashaId: f.ashaId || "", licenceNo: f.licenceNo || "", docName: f.docName || "", dob: f.dob || "", sex: f.sex || "", demo: false,
    });
    if (orgId) db.update("orgs", orgId, { ownerUserId: user.id });
    if (role === "doctor") db.insert("doctors", { name: user.name.startsWith("Dr") ? user.name : "Dr. " + user.name, spec: f.specialization || "General Medicine", orgId: f.affiliationOrgId || null, userId: user.id, schedule: [], fee: 0, languages: [], verified: false, demo: false, regNo: f.regNo });
    if (db.get("users", user.id)?.doctorId == null && role === "doctor") { const d = db.all("doctors").find(x => x.userId === user.id); if (d) db.update("users", user.id, { doctorId: d.id }); }
    audit("account.registered", user.email, `${role}${needsVerify ? " (pending verification)" : ""}`, user);
    notify(user.id, { title: needsVerify ? "Registration received" : "Welcome to Swasthya Connect", body: needsVerify ? "Your account is waiting for verification by the platform administrator." : "Your account is ready.", channels: ["inapp", "email"], type: "account" });
    if (needsVerify) notifyRole("admin", { title: `New ${ROLES[role].label} awaiting verification`, body: user.name, link: "#/app/approvals", type: "approval" });
    return user;
  },
  async startRecovery(email) {
    email = (email || "").trim().toLowerCase();
    const u = db.all("users").find(x => x.email.toLowerCase() === email);
    audit("recovery.requested", email, u ? "" : "unknown account", null);
    if (!u) return null; // do not reveal whether the account exists
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.update("users", u.id, { recovery: { code: sha256(code + u.salt), exp: Date.now() + 15 * 60000 } });
    db.insert("outbox", { channel: "email", to: u.email, text: `Your Swasthya Connect password reset code is ${code} (valid 15 minutes).`, simulated: true, at: new Date().toISOString() });
    return code; // PROTOTYPE ONLY: returned so it can be displayed on screen, because no email is really sent.
  },
  async finishRecovery(email, code, newPw) {
    const u = db.all("users").find(x => x.email.toLowerCase() === (email || "").trim().toLowerCase());
    if (!u?.recovery || Date.now() > u.recovery.exp || sha256(code.trim() + u.salt) !== u.recovery.code) throw new Error("That code is invalid or has expired.");
    const prob = passwordProblem(newPw); if (prob) throw new Error(prob);
    db.update("users", u.id, { passHash: await pbkdf2(newPw, u.salt), passAlgo: "pbkdf2", recovery: null });
    audit("recovery.completed", u.email, "", u);
  },
  async changePassword(user, oldPw, newPw) {
    const ok = user.passAlgo === "sha256" ? sha256(user.salt + oldPw) === user.passHash : (await pbkdf2(oldPw, user.salt)) === user.passHash;
    if (!ok) throw new Error("Current password is incorrect.");
    const prob = passwordProblem(newPw); if (prob) throw new Error(prob);
    db.update("users", user.id, { passHash: await pbkdf2(newPw, user.salt), passAlgo: "pbkdf2" });
    audit("password.changed", user.email, "", user);
  },
  // Admin-only: create district officer accounts through authorised approval (no public registration)
  async inviteOfficer(admin, { name, email, district }) {
    if (admin.role !== "admin") throw new Error("Only a super administrator can create district officer accounts.");
    if (db.all("users").some(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error("An account with this email already exists.");
    const temp = "Dist-" + Math.random().toString(36).slice(2, 8) + "9";
    const salt = uid("s");
    const u = db.insert("users", { id: uid("u"), role: "district", name, email: email.toLowerCase(), district, salt, passHash: await pbkdf2(temp, salt), passAlgo: "pbkdf2", status: "active", lang: "en", demo: false, mustChange: true });
    audit("officer.created", email, district, admin);
    db.insert("outbox", { channel: "email", to: email, text: `Your district health officer account has been created. Temporary password: ${temp}`, simulated: true, at: new Date().toISOString() });
    return { user: u, temp };
  },
};

// Passive session keep-alive
["click", "keydown"].forEach(ev => window.addEventListener(ev, () => auth.touch(), { passive: true }));

// ---------------------------------------------------------------------------------------------------
// Network state (real + simulated) — drives offline banners and the ASHA sync queue
// ---------------------------------------------------------------------------------------------------
export const net = {
  simulated: false,
  get offline() { return this.simulated || !navigator.onLine; },
  toggleSim() { this.simulated = !this.simulated; window.dispatchEvent(new Event("netchange")); },
};
window.addEventListener("online", () => window.dispatchEvent(new Event("netchange")));
window.addEventListener("offline", () => window.dispatchEvent(new Event("netchange")));
export const today = () => isoDay();
