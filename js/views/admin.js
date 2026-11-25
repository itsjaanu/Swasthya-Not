// Super Administrator workspace. Every state-changing action is written to the hash-chained audit log.
import { h, icon, ago, fmtDate, sum } from "../util.js";
import { db, audit, verifyAuditChain, notify, auth, onChange } from "../db.js";
import { DISTRICTS, ROLES, FACILITY_TYPES } from "../seed.js";
import { provenance, bedTotals, isStale } from "../services.js";
import { card, stat, grid, table, barChart, donut, pageHead, notice, demoNote, provBadge, statusBadge, badge, btn, empty, form, modal, confirmDialog, toast, kv, meter } from "../ui.js";
import { t } from "../i18n.js";

export const nav = [
  { id: "dashboard", icon: "chart", key: "ad.dashboard", label: "Dashboard" },
  { id: "approvals", icon: "check", key: "ad.approvals", label: "Approvals" },
  { id: "users", icon: "users", key: "nav.users", label: "Users" },
  { id: "orgs", icon: "building", key: "ad.orgs", label: "Facilities" },
  { id: "roles", icon: "lock", key: "ad.roles", label: "Roles & permissions" },
  { id: "audit", icon: "log", key: "nav.audit", label: "Audit log" },
  { id: "security", icon: "shield", key: "ad.security", label: "Security" },
  { id: "integrations", icon: "link", key: "ad.integrations", label: "Integrations" },
  { id: "dataquality", icon: "scan", key: "ad.dataquality", label: "Data quality" },
  { id: "config", icon: "edit", key: "ad.config", label: "Platform settings" },
  { id: "outbox", icon: "chat", key: "ad.outbox", label: "Message outbox" },
];

export const strings = {
  "ad.dashboard": { te: "డాష్‌బోర్డ్", hi: "डैशबोर्ड", ta: "முகப்புப் பலகை" }, "ad.approvals": { te: "ఆమోదాలు", hi: "स्वीकृतियाँ", ta: "ஒப்புதல்கள்" },
  "ad.orgs": { te: "సదుపాయాలు", hi: "सुविधाएँ", ta: "மையங்கள்" }, "ad.roles": { te: "పాత్రలు & అనుమతులు", hi: "भूमिकाएँ व अनुमतियाँ", ta: "பங்குகள் & அனுமதிகள்" },
  "ad.security": { te: "భద్రత", hi: "सुरक्षा", ta: "பாதுகாப்பு" }, "ad.integrations": { te: "ఇంటిగ్రేషన్లు", hi: "एकीकरण", ta: "ஒருங்கிணைப்புகள்" },
  "ad.dataquality": { te: "డేటా నాణ్యత", hi: "डेटा गुणवत्ता", ta: "தரவுத் தரம்" }, "ad.config": { te: "ప్లాట్‌ఫారమ్ సెట్టింగ్‌లు", hi: "प्लेटफ़ॉर्म सेटिंग्स", ta: "தளம் அமைப்புகள்" },
  "ad.outbox": { te: "సందేశాల అవుట్‌బాక్స్", hi: "संदेश आउटबॉक्स", ta: "செய்தி வெளிப்பெட்டி" },
  "ad.approve": { te: "ఆమోదించండి", hi: "स्वीकृत करें", ta: "அங்கீகரி" }, "ad.reject": { te: "తిరస్కరించండి", hi: "अस्वीकार करें", ta: "நிராகரி" },
  "ad.suspend": { te: "నిలిపివేయండి", hi: "निलंबित करें", ta: "இடைநிறுத்து" }, "ad.reactivate": { te: "తిరిగి ప్రారంభించండి", hi: "पुनः सक्रिय करें", ta: "மீண்டும் செயல்படுத்து" },
  "ad.verifyChain": { te: "చైన్ సమగ్రతను తనిఖీ చేయండి", hi: "चेन की अखंडता जाँचें", ta: "சங்கிலி ஒருமைப்பாட்டைச் சரிபார்" }, "ad.export": { te: "CSV ఎగుమతి", hi: "CSV निर्यात", ta: "CSV ஏற்றுமதி" },
  "ad.invite": { te: "జిల్లా అధికారిని సృష్టించండి", hi: "ज़िला अधिकारी खाता बनाएँ", ta: "மாவட்ட அலுவலரை உருவாக்கு" },
};

const now = () => new Date().toISOString();
const sLabel = (s) => ({ pending: "Pending", active: "Active", rejected: "Rejected", suspended: "Suspended", verified: "Verified" }[s] || s);
const ago24 = () => Date.now() - 864e5;
function downloadCsv(name, rows) {
  const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const a = h("a", { href: URL.createObjectURL(new Blob(["﻿" + rows.map(r => r.map(cell).join(",")).join("\n")], { type: "text/csv" })), download: name });
  document.body.append(a); a.click(); a.remove();
}
const FIELDS = ["name", "type", "district", "mandal", "address", "pin", "phone", "lat", "lng", "hours"];
const HFIELDS = ["depts", "services", "emergencyPhone"];
function completeness(o) {
  const f = [...FIELDS, ...(o.kind === "hospital" ? HFIELDS : [])];
  const miss = f.filter(k => { const v = o[k]; return v == null || v === "" || (Array.isArray(v) && !v.length); });
  return { score: Math.round((f.length - miss.length) / f.length * 100), miss, fields: f };
}
const orgTs = (o) => bedTotals(o).updatedAt;
function quality() {
  const orgs = db.all("orgs"); const hosp = orgs.filter(o => o.kind === "hospital" && o.verification === "verified" && Object.keys(o.beds || {}).length);
  const avg = orgs.length ? sum(orgs, o => completeness(o).score) / orgs.length : 0;
  const fresh = hosp.length ? hosp.filter(o => !isStale(orgTs(o))).length / hosp.length : 0;
  return { score: Math.round(avg * 0.6 + fresh * 100 * 0.4), avg: Math.round(avg), fresh: Math.round(fresh * 100), hospN: hosp.length };
}
const unreviewedEmergency = () => db.where("consents", c => c.via === "emergency" && !c.reviewed);
const row = (children) => h("div", { class: "row" }, children);

// ---------- helpers for approval actions ------------------------------------------------------------------
function approveUser(admin, u) {
  db.update("users", u.id, { status: "active", verifiedAt: now(), verifiedBy: admin.id, rejectReason: null });
  if (u.orgId) db.update("orgs", u.orgId, { verification: "verified" });
  db.where("doctors", d => d.userId === u.id).forEach(d => db.update("doctors", d.id, { verified: true }));
  audit("account.approved", u.email, u.role, admin);
  notify(u.id, { title: "Your account has been verified", body: "You can now use your workspace.", type: "account", channels: ["inapp", "email"] });
}
function rejectUser(admin, u, reason) {
  db.update("users", u.id, { status: "rejected", rejectReason: reason, verifiedBy: admin.id });
  if (u.orgId) db.update("orgs", u.orgId, { verification: "rejected" });
  audit("account.rejected", u.email, reason, admin);
  notify(u.id, { title: "Registration not approved", body: reason, type: "account", channels: ["inapp", "email"] });
}
const reasonForm = (label, onDone, close) => form([{ name: "reason", label, type: "textarea", required: true, wide: true, hint: "Required. The applicant will see this message." }], {
  submitLabel: "Send decision", onCancel: close,
  onSubmit: (v) => { if (!v.reason || v.reason.trim().length < 10) throw new Error("Write at least a short sentence (10+ characters) explaining the decision."); onDone(v.reason.trim()); close(); },
});

export const routes = {
  // ------------------------------------------------------------------------------------------------ dashboard
  async dashboard(ctx) {
    const users = db.all("users"), orgs = db.all("orgs"), q = quality(), chain = verifyAuditChain();
    const pending = users.filter(u => u.status === "pending").length + db.where("camps", c => c.status === "pending_approval").length;
    const fails = db.where("loginAttempts", a => !a.ok && new Date(a.at).getTime() > ago24()).length;
    const emg = unreviewedEmergency().length;
    let kb = 0; try { kb = Math.round((localStorage.getItem("swasthya.db.v3") || "").length / 1024); } catch { /* ignore */ }
    const byRole = Object.entries(users.reduce((m, u) => (m[u.role] = (m[u.role] || 0) + 1, m), {}));
    return h("div", {},
      pageHead(t("ad.dashboard", "Dashboard"), "Platform health, verification workload and security signals."),
      db.cfg().demoMode ? demoNote() : null,
      emg ? notice("danger", h("strong", {}, `${emg} emergency record access event(s) need review. `), h("a", { href: "#/app/security" }, "Review now")) : null,
      !chain.ok ? notice("danger", h("strong", {}, "Audit chain integrity FAILED "), `at entry #${chain.brokenAt}. The log has been altered — investigate immediately.`) : null,
      grid(4,
        stat("Users", users.length, `${users.filter(u => u.demo).length} demo · ${users.filter(u => !u.demo).length} real`),
        stat("Awaiting verification", pending, "accounts + camps", pending ? "warn" : ""),
        stat("Failed logins (24 h)", fails, "see Security", fails > 10 ? "danger" : ""),
        stat("Data-quality score", q.score + "/100", `completeness ${q.avg}% · fresh beds ${q.fresh}%`, q.score < 60 ? "warn" : "ok")),
      h("div", { style: { height: "1rem" } }),
      h("div", { class: "split even" },
        card({ title: "System health" }, kv([
          ["Audit chain", chain.ok ? h("span", { class: "badge ok" }, `Intact · ${chain.total} entries`) : h("span", { class: "badge danger" }, `Broken at #${chain.brokenAt}`)],
          ["Local storage used", `${kb} KB of ~5,000 KB browser quota`], ["Facilities", `${orgs.length} (${orgs.filter(o => o.verification === "verified").length} verified, ${orgs.filter(o => o.verification === "pending").length} pending)`],
          ["Unreviewed emergency accesses", emg], ["Session idle timeout", db.cfg().sessionIdleMinutes + " min"], ["Backend", "Browser-local prototype store (see supabase/ for production schema)"],
        ]), h("div", { class: "form-actions" }, btn("Verify audit chain", () => ctx.go("audit"), "", "log"))),
        card({ title: "Accounts by role" }, barChart(byRole.map(([r, n]) => ({ label: ROLES[r]?.label || r, value: n })))),
      ),
      card({ title: "Recent activity", actions: h("a", { class: "btn sm", href: "#/app/audit" }, "Open audit log") }, table([
        { h: "When", f: e => ago(e.at) }, { h: "Actor", f: e => e.actorName }, { h: "Action", f: e => h("code", {}, e.action) }, { h: "Target", f: e => e.target },
      ], db.all("audit").slice(0, 8), { empty: "No audit entries yet." })));
  },

  // ------------------------------------------------------------------------------------------------ approvals
  async approvals(ctx) {
    const pend = db.where("users", u => u.status === "pending");
    const orgsPend = db.where("orgs", o => o.verification === "pending" && !pend.some(u => u.orgId === o.id));
    const camps = db.where("camps", c => c.status === "pending_approval");
    const detail = (u) => {
      const o = u.orgId ? db.get("orgs", u.orgId) : null;
      return kv([["Role", ROLES[u.role]?.label], ["Email", u.email], ["Phone", u.phone || null], ["District", u.district || null], u.regNo ? ["Registration no.", u.regNo] : null, u.council ? ["Council", u.council] : null,
        u.specialization ? ["Specialisation", u.specialization] : null, u.affiliation ? ["Affiliation", u.affiliation] : null, u.licenceNo ? ["Licence no.", u.licenceNo] : null, u.ashaId ? ["ASHA ID", u.ashaId] : null, u.docName ? ["Document supplied", u.docName] : null,
        o ? ["Facility", `${o.name} · ${FACILITY_TYPES[o.type] || o.kind}`] : null, o?.address ? ["Address", `${o.address} ${o.pin || ""}`] : null, o?.licenceNo ? ["Facility licence", o.licenceNo] : null, ["Registered", fmtDate(u.createdAt, true)]].filter(x => x && x[1] != null));
    };
    return h("div", {},
      pageHead(t("ad.approvals", "Approvals"), "Verify professionals and facilities before they appear publicly or receive access."),
      notice("info", "Check professional council registration, facility licence or authorisation letters against the issuing authority before approving. Approval is logged under your name."),
      card({ title: `Account verification (${pend.length})` }, pend.length ? h("div", { class: "list" }, pend.map(u => row([
        h("div", { class: "grow" }, h("div", { class: "title" }, u.name, " ", badge(ROLES[u.role]?.label || u.role, "info"), u.demo ? " " : null, u.demo ? badge("DEMO DATA", "demo") : null), detail(u)),
        h("div", { class: "cluster" }, btn(t("ad.approve", "Approve"), () => { approveUser(ctx.user, u); toast(`${u.name} approved`); ctx.refresh(); }, "primary sm", "check"),
          btn(t("ad.reject", "Reject"), () => modal(`Reject ${u.name}`, close => reasonForm("Reason for rejection", r => { rejectUser(ctx.user, u, r); toast("Registration rejected"); ctx.refresh(); }, close)), "danger sm", "x")),
      ]))) : empty("No accounts are waiting for verification.")),
      orgsPend.length ? card({ title: `Facilities awaiting verification (${orgsPend.length})` }, h("div", { class: "list" }, orgsPend.map(o => row([
        h("div", { class: "grow" }, h("div", { class: "title" }, o.name), h("div", { class: "small muted" }, `${FACILITY_TYPES[o.type] || o.kind} · ${o.district}`)),
        btn(t("ad.verify", "Verify"), () => { db.update("orgs", o.id, { verification: "verified" }); audit("org.verified", o.name, "", ctx.user); toast("Facility verified"); ctx.refresh(); }, "primary sm", "check")])))) : null,
      card({ title: `Medical camps awaiting approval (${camps.length})` }, camps.length ? h("div", { class: "list" }, camps.map(c => row([
        h("div", { class: "grow" }, h("div", { class: "title" }, c.title, c.demo ? " " : null, c.demo ? badge("DEMO DATA", "demo") : null), h("div", { class: "small muted" }, `${c.district} · ${c.mandal || ""} · ${fmtDate(c.date)} · ${c.venue || ""}`), h("div", { class: "small" }, "Services: " + (c.services || []).join(", "))),
        h("div", { class: "cluster" }, btn("Publish", () => { db.update("camps", c.id, { status: "published", approvedBy: ctx.user.id }); audit("camp.approved", c.title, c.district, ctx.user); notify(c.organizerId, { title: "Camp approved", body: c.title, link: "#/app/camps", type: "camp" }); toast("Camp published"); ctx.refresh(); }, "primary sm", "check"),
          btn("Reject", () => modal(`Reject ${c.title}`, close => reasonForm("Reason for rejection", r => { db.update("camps", c.id, { status: "rejected", rejectReason: r }); audit("camp.rejected", c.title, r, ctx.user); notify(c.organizerId, { title: "Camp not approved", body: r, type: "camp" }); toast("Camp rejected"); ctx.refresh(); }, close)), "danger sm", "x")),
      ]))) : empty("No camps are waiting for approval.")),
      card({ title: "Recently decided" }, table([
        { h: "Name", f: u => u.name }, { h: "Role", f: u => ROLES[u.role]?.label }, { h: "Status", f: u => statusBadge(u.status) }, { h: "Reason", f: u => u.rejectReason || "—" },
      ], db.where("users", u => u.verifiedBy && !u.demo).slice(0, 10), { empty: "No decisions recorded yet." })));
  },

  // ------------------------------------------------------------------------------------------------ users
  async users(ctx) {
    const st = ctx._f || (ctx._f = { q: "", role: "", status: "" });
    const list = db.all("users").filter(u => (!st.role || u.role === st.role) && (!st.status || u.status === st.status) && (!st.q || (u.name + u.email).toLowerCase().includes(st.q.toLowerCase())));
    const invite = () => modal("Create district health officer", close => form([
      { name: "name", label: "Full name", required: true }, { name: "email", label: "Official email", type: "email", required: true },
      { name: "district", label: "District", type: "select", required: true, options: DISTRICTS.map(d => d.name), wide: true },
    ], { submitLabel: "Create account", onCancel: close, onSubmit: async (v) => {
      const r = await auth.inviteOfficer(ctx.user, v); close();
      modal("District officer created", c2 => h("div", {}, notice("warn", h("strong", {}, "Shown once. "), "In production this temporary password is emailed to the officer. Copy it now; the officer must change it at first sign-in."),
        kv([["Account", r.user.email], ["District", r.user.district], ["Temporary password", h("code", { id: "ad-temp" }, r.temp)]]), h("div", { class: "form-actions" }, btn("Done", () => { c2(); ctx.refresh(); }, "primary"))));
    } }));
    const act = (u, label, cls, fn, msg) => btn(label, async () => { if (await confirmDialog(msg, label, cls === "danger")) { fn(); ctx.refresh(); } }, cls + " sm");
    return h("div", {},
      pageHead(t("nav.users", "Users"), "All accounts on the platform. Roles are fixed at registration; district officers are created only here.", btn(t("ad.invite", "Create district officer"), invite, "primary", "plus")),
      h("div", { class: "filters" },
        h("div", { class: "field" }, h("label", { for: "ad-uq" }, "Search name or email"), h("input", { id: "ad-uq", type: "search", value: st.q, oninput: e => { st.q = e.target.value; clearTimeout(st._t); st._t = setTimeout(() => { ctx.refresh(); setTimeout(() => { const i = document.getElementById("ad-uq"); i?.focus(); i?.setSelectionRange(99, 99); }, 0); }, 300); } })),
        h("div", { class: "field" }, h("label", { for: "ad-ur" }, "Role"), h("select", { id: "ad-ur", onchange: e => { st.role = e.target.value; ctx.refresh(); } }, h("option", { value: "" }, "All roles"), Object.entries(ROLES).map(([k, r]) => h("option", { value: k, selected: st.role === k }, r.label)))),
        h("div", { class: "field" }, h("label", { for: "ad-us" }, "Status"), h("select", { id: "ad-us", onchange: e => { st.status = e.target.value; ctx.refresh(); } }, h("option", { value: "" }, "All"), ["active", "pending", "rejected", "suspended"].map(s => h("option", { value: s, selected: st.status === s }, sLabel(s)))))),
      card({ title: `${list.length} account(s)` }, table([
        { h: "Name", f: u => h("div", {}, h("strong", {}, u.name), u.demo ? h("div", {}, badge("DEMO DATA", "demo")) : null) }, { h: "Email", f: u => u.email }, { h: "Role", f: u => ROLES[u.role]?.label || u.role },
        { h: "District", f: u => u.district || "—" }, { h: "Status", f: u => h("div", {}, statusBadge(u.status), u.mustChange ? h("div", {}, badge("Must change password", "warn")) : null) }, { h: "Last sign-in", f: u => u.lastLogin ? ago(u.lastLogin) : "never" },
        { h: "Actions", f: u => u.id === ctx.user.id || u.role === "admin" ? h("span", { class: "muted small" }, "protected") : h("div", { class: "cluster" },
          u.status === "suspended" ? act(u, t("ad.reactivate", "Reactivate"), "primary", () => { db.update("users", u.id, { status: "active" }); audit("account.reactivated", u.email, "", ctx.user); toast("Account reactivated"); }, `Reactivate ${u.name}?`)
            : u.status === "active" ? act(u, t("ad.suspend", "Suspend"), "danger", () => { db.update("users", u.id, { status: "suspended" }); audit("account.suspended", u.email, "", ctx.user); toast("Account suspended"); }, `Suspend ${u.name}? They will be unable to sign in.`) : null,
          act(u, "Require password change", "", () => { db.update("users", u.id, { mustChange: true }); audit("account.force_password_change", u.email, "", ctx.user); toast("Password change required"); }, `Require ${u.name} to change password at next sign-in?`)) },
      ], list, { empty: "No accounts match these filters.", label: "Users" })));
  },

  // ------------------------------------------------------------------------------------------------ orgs
  async orgs(ctx) {
    const st = ctx._o || (ctx._o = { kind: "", ver: "" });
    const list = db.all("orgs").filter(o => (!st.kind || o.kind === st.kind) && (!st.ver || o.verification === st.ver));
    const edit = (o) => modal(`Verification — ${o.name}`, close => form([{ name: "verification", label: "Verification status", type: "select", required: true, options: [["pending", "Pending"], ["verified", "Verified"], ["rejected", "Rejected"]].map(([value, label]) => ({ value, label })), value: o.verification }, { name: "note", label: "Note (kept in audit log)", type: "textarea", wide: true }],
      { initial: { verification: o.verification }, submitLabel: "Save verification", onCancel: close, onSubmit: (v) => { if (v.verification === "rejected" && !v.note?.trim()) throw new Error("Add a note explaining the rejection."); db.update("orgs", o.id, { verification: v.verification }); audit("org.verification." + v.verification, o.name, v.note || "", ctx.user); if (o.ownerUserId) notify(o.ownerUserId, { title: `Facility verification: ${v.verification}`, body: v.note || o.name, type: "account" }); toast("Verification updated"); close(); ctx.refresh(); } }));
    return h("div", {},
      pageHead(t("ad.orgs", "Facilities"), "Hospitals, diagnostic centres, pharmacies and ambulance operators. Only verified facilities appear in public search."),
      list.some(o => o.demo) ? demoNote() : null,
      h("div", { class: "filters" },
        h("div", { class: "field" }, h("label", { for: "ad-ok" }, "Type"), h("select", { id: "ad-ok", onchange: e => { st.kind = e.target.value; ctx.refresh(); } }, h("option", { value: "" }, "All"), ["hospital", "diagnostic", "pharmacy", "ambulance"].map(k => h("option", { value: k, selected: st.kind === k }, k)))),
        h("div", { class: "field" }, h("label", { for: "ad-ov" }, "Verification"), h("select", { id: "ad-ov", onchange: e => { st.ver = e.target.value; ctx.refresh(); } }, h("option", { value: "" }, "All"), ["verified", "pending", "rejected"].map(k => h("option", { value: k, selected: st.ver === k }, k))))),
      card({ title: `${list.length} facilit${list.length === 1 ? "y" : "ies"}` }, table([
        { h: "Facility", f: o => h("div", {}, h("strong", {}, o.name), h("div", { class: "small muted" }, `${FACILITY_TYPES[o.type] || o.kind} · ${o.district}`)) },
        { h: "Verification", f: o => statusBadge(o.verification) }, { h: "Data basis", f: o => provBadge(provenance(o, orgTs(o) || o.createdAt), orgTs(o)) },
        { h: "Completeness", f: o => { const c = completeness(o); return h("div", { class: "cluster" }, meter(c.score, 100, "Completeness"), h("small", {}, c.score + "%")); } },
        { h: "", f: o => btn("Edit verification", () => edit(o), "sm", "edit") },
      ], list, { empty: "No facilities match.", label: "Facilities" })));
  },

  // ------------------------------------------------------------------------------------------------ roles
  async roles() {
    const M = {
      citizen: ["Own profile, family profiles, appointments, admission requests, test bookings, records, camps", "Can grant/revoke doctor access per record, with purpose and expiry. Sees who accessed their records."],
      doctor: ["Own schedule, assigned patients, consultations, referrals", "Sees a patient's records ONLY under an active patient consent. Emergency (break-glass) access needs a written reason, expires automatically, notifies the patient and is flagged for admin review."],
      hospital: ["Own facility profile, beds, doctors, appointments, admission requests, inbound emergencies", "Cannot read patient records. Bed availability is provider-reported with a timestamp; outdated after the configured window."],
      diagnostic: ["Own tests catalogue, requests, report upload and release", "Released reports go to the patient; sharing with doctors is the patient's choice."],
      pharmacy: ["Own catalogue, stock, enquiries, prescription requests", "Sees a prescription only when the patient sends it; Schedule H/H1 items need pharmacist verification."],
      organizer: ["Own camps, registrations, attendance, reports", "New camps need administrator approval before they are published."],
      asha: ["Own households, follow-ups, referrals, field records (offline-capable)", "Limited to assigned community; offline entries are marked unsynchronised until sync."],
      district: ["Aggregated dashboards for their district", "No identifiable patient data. Small counts are suppressed (k-anonymity). Account created only by a super administrator."],
      admin: ["Users, verification, audit, configuration, integrations", "Cannot read clinical records. Every action is written to the hash-chained audit log. Not available through public registration."],
      ambulance: ["Own vehicles and emergency requests", "Hospital notification only; the platform never claims dispatch or hospital readiness until the operator/hospital confirms."],
    };
    return h("div", {},
      pageHead(t("ad.roles", "Roles & permissions"), "Read-only summary of what each account type can access."),
      notice("info", "Permissions are enforced by route guards in this prototype. In production they must be enforced server-side (see Row Level Security policies in the supabase schema)."),
      card({}, table([
        { h: "Role", f: r => h("div", {}, h("strong", {}, ROLES[r].label), ROLES[r].extra ? h("div", {}, badge("Service-provider account", "muted")) : null) },
        { h: "Registration", f: r => ROLES[r].self ? (ROLES[r].verify ? badge("Self-register + verification", "warn") : badge("Self-register", "ok")) : badge("Administrator-created only", "danger") },
        { h: "Can access", f: r => M[r][0] }, { h: "Rules", f: r => M[r][1] },
        { h: "Accounts", f: r => db.where("users", u => u.role === r).length, cls: "right" },
      ], Object.keys(ROLES), { label: "Role matrix" })));
  },

  // ------------------------------------------------------------------------------------------------ audit
  async audit(ctx) {
    const st = ctx._a || (ctx._a = { actor: "", action: "", q: "", result: null });
    const all = db.all("audit");
    const list = all.filter(e => (!st.actor || e.actorName.toLowerCase().includes(st.actor.toLowerCase())) && (!st.action || e.action.includes(st.action)) && (!st.q || (e.target + e.detail).toLowerCase().includes(st.q.toLowerCase())));
    const hot = (e) => /emergency_access|login\.locked|suspended|force_password|login\.failed|recovery/.test(e.action);
    const actions = [...new Set(all.map(e => e.action.split(".")[0]))].sort();
    const verify = () => { st.result = verifyAuditChain(); audit("audit.verified", "chain", st.result.ok ? "intact" : "broken at " + st.result.brokenAt, ctx.user); ctx.refresh(); };
    return h("div", {},
      pageHead(t("nav.audit", "Audit log"), "Append-only and hash-chained: each entry includes the hash of the one before it, so edits or deletions are detectable.",
        btn(t("ad.verifyChain", "Verify chain integrity"), verify, "primary", "shield"),
        btn(t("ad.export", "Export CSV"), () => { downloadCsv("audit-log.csv", [["Seq", "Time", "Actor", "Role", "Action", "Target", "Detail", "Hash"], ...list.map(e => [e.seq, e.at, e.actorName, e.actorRole, e.action, e.target, e.detail, e.hash])]); audit("audit.exported", "audit-log.csv", `${list.length} rows`, ctx.user); }, "", "download")),
      st.result ? (st.result.ok ? notice("ok", h("strong", {}, "Chain intact. "), `${st.result.total} entries verified; every hash matches.`) : notice("danger", h("strong", {}, `Chain broken at entry #${st.result.brokenAt}. `), `The log was modified after it was written (checked ${st.result.total} entries). Treat as a security incident.`)) : null,
      h("div", { class: "filters" },
        h("div", { class: "field" }, h("label", { for: "ad-aa" }, "Actor"), h("input", { id: "ad-aa", value: st.actor, onchange: e => { st.actor = e.target.value; ctx.refresh(); } })),
        h("div", { class: "field" }, h("label", { for: "ad-ac" }, "Action type"), h("select", { id: "ad-ac", onchange: e => { st.action = e.target.value; ctx.refresh(); } }, h("option", { value: "" }, "All"), actions.map(a => h("option", { value: a, selected: st.action === a }, a)))),
        h("div", { class: "field" }, h("label", { for: "ad-aq" }, "Text in target / detail"), h("input", { id: "ad-aq", value: st.q, onchange: e => { st.q = e.target.value; ctx.refresh(); } }))),
      card({ title: `${list.length} of ${all.length} entries`, sub: "Newest first · showing up to 300" }, table([
        { h: "#", f: e => e.seq, cls: "nowrap" }, { h: "Time", f: e => h("span", { title: e.at }, fmtDate(e.at, true)), cls: "nowrap" },
        { h: "Actor", f: e => h("div", {}, e.actorName, h("div", { class: "small muted" }, e.actorRole)) },
        { h: "Action", f: e => hot(e) ? h("span", { class: "badge danger" }, e.action) : h("code", {}, e.action) }, { h: "Target", f: e => e.target }, { h: "Detail", f: e => e.detail },
        { h: "Hash", f: e => h("code", { class: "small", title: e.hash }, e.hash.slice(0, 10) + "…") },
      ], list.slice(0, 300), { empty: "No audit entries match.", label: "Audit log" })));
  },

  // ------------------------------------------------------------------------------------------------ security
  async security(ctx) {
    const at = db.all("loginAttempts"), recentFail = at.filter(a => !a.ok && Date.now() - new Date(a.at).getTime() < 10 * 60000);
    const lock = Object.entries(recentFail.reduce((m, a) => (m[a.email] = (m[a.email] || 0) + 1, m), {})).filter(([, n]) => n >= 5);
    const emg = db.where("consents", c => c.via === "emergency");
    const susp = db.where("users", u => u.status === "suspended");
    return h("div", {},
      pageHead(t("ad.security", "Security"), "Sign-in activity, lockouts and emergency record-access review."),
      emg.some(c => !c.reviewed) ? notice("danger", h("strong", {}, "Emergency access awaiting review. "), "Check that each was clinically justified.") : null,
      grid(4, stat("Failed sign-ins (24 h)", at.filter(a => !a.ok && new Date(a.at).getTime() > ago24()).length), stat("Currently locked", lock.length, "5 failures in 10 min", lock.length ? "warn" : ""), stat("Suspended accounts", susp.length), stat("Emergency accesses to review", emg.filter(c => !c.reviewed).length, "", emg.some(c => !c.reviewed) ? "danger" : "ok")),
      h("div", { style: { height: "1rem" } }),
      card({ title: "Emergency (break-glass) access", sub: "Doctor opened a patient's records without prior consent" }, emg.length ? table([
        { h: "When", f: c => fmtDate(c.grantedAt, true) }, { h: "Doctor", f: c => c.doctorName }, { h: "Patient", f: c => db.get("users", c.patientId)?.name || c.patientId }, { h: "Reason given", f: c => c.purpose.replace(/^EMERGENCY ACCESS: /, "") },
        { h: "Expires", f: c => fmtDate(c.expiresAt, true) }, { h: "Review", f: c => c.reviewed ? h("span", {}, badge("Reviewed", "ok"), h("div", { class: "small muted" }, "by " + (c.reviewedByName || "admin"))) : btn("Mark reviewed", () => { db.update("consents", c.id, { reviewed: true, reviewedBy: ctx.user.id, reviewedByName: ctx.user.name, reviewedAt: now() }); audit("emergency_access.reviewed", c.doctorName, c.patientId, ctx.user); toast("Marked as reviewed"); ctx.refresh(); }, "sm", "check") },
      ], emg, { label: "Emergency access" }) : empty("No emergency record access has been used.")),
      card({ title: "Locked-out accounts" }, lock.length ? h("ul", {}, lock.map(([e, n]) => h("li", {}, `${e} — ${n} failed attempts`))) : empty("No accounts are locked.")),
      card({ title: "Suspended accounts" }, susp.length ? table([{ h: "Name", f: u => u.name }, { h: "Email", f: u => u.email }, { h: "Role", f: u => ROLES[u.role]?.label }], susp) : empty("No suspended accounts.")),
      card({ title: "Recent sign-in attempts", sub: "Last 50" }, table([
        { h: "When", f: a => ago(a.at) }, { h: "Email", f: a => a.email }, { h: "Result", f: a => a.ok ? badge("Success", "ok") : badge("Failed", "danger") }, { h: "Reason", f: a => a.reason || "—" },
      ], at.slice(0, 50), { empty: "No sign-in attempts recorded." })));
  },

  // ------------------------------------------------------------------------------------------------ integrations
  async integrations(ctx) {
    const cfg = db.cfg();
    const mk = (title, status, tone, desc, extra) => card({ title, actions: badge(status, tone) }, h("p", { class: "small" }, desc), extra || null);
    const out = h("div", { class: "small", role: "status", "aria-live": "polite" });
    const test = async () => {
      out.textContent = "Testing…"; const t0 = performance.now();
      try { const r = await fetch("https://apsdmagis.ap.gov.in/gisserver/rest/services/Hosted/NP_Health/FeatureServer/2?f=json", { signal: AbortSignal.timeout(8000) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); out.textContent = `Reachable (${Math.round(performance.now() - t0)} ms): layer "${j.name || "unknown"}".`; audit("integration.tested", "AP GIS", "ok", ctx.user); }
      catch (e) { out.textContent = `Not reachable from this browser: ${e.message}. Public directory falls back to cached data.`; audit("integration.tested", "AP GIS", "failed: " + e.message, ctx.user); }
    };
    const aiForm = form([
      { name: "aiMode", label: "AI assistant mode", type: "select", required: true, options: [{ value: "local", label: "Local rule-based (no data leaves the browser)" }, { value: "server", label: "Server-side AI service" }] },
      { name: "aiEndpoint", label: "Server endpoint (HTTPS)", type: "url", placeholder: "https://api.example.org/assistant", hint: "Your backend calls the AI provider. API keys must live on that server — never in this app or its settings.", show: v => v.aiMode === "server" },
    ], { initial: { aiMode: cfg.aiMode || "local", aiEndpoint: cfg.aiEndpoint || "" }, submitLabel: "Save AI settings", onSubmit: (v) => {
      if (v.aiMode === "server" && !/^https:\/\/[^\s]+$/.test(v.aiEndpoint || "")) throw new Error("Enter a valid https:// endpoint.");
      if (/key|token|secret/i.test(v.aiEndpoint || "")) throw new Error("The endpoint looks like it contains a secret. Keep credentials on the server.");
      Object.assign(db.cfg(), { aiMode: v.aiMode, aiEndpoint: v.aiMode === "server" ? v.aiEndpoint : "" }); db.save(); audit("config.ai", v.aiMode, v.aiEndpoint || "", ctx.user); toast("AI settings saved");
    } });
    return h("div", {},
      pageHead(t("ad.integrations", "Integrations"), "Status is shown honestly: nothing marked 'Not connected' sends or receives real data."),
      notice("warn", "No real hospital, laboratory, ambulance or registry integration is active in this prototype. Features that depend on them use DEMO data or provider-entered data, clearly labelled."),
      grid(2,
        mk("Andhra Pradesh GIS — public layers", "Public directory", "muted", "Hospitals and primary health centre locations. Reference listings only; not live bed, doctor or stock data.", h("div", {}, btn("Test connection", test, "sm", "refresh"), out)),
        mk("ABDM Health Facility Registry", "Not connected", "danger", "Requires onboarding with ABDM and issued credentials. Needed to reconcile facilities against the national registry."),
        mk("Hospital information systems", "Not connected", "danger", "Live bed occupancy, doctor rosters and appointment slots need an authorised HIS/EMR integration or staff entry via the hospital dashboard."),
        mk("Laboratory / LIS systems", "Not connected", "danger", "Automatic report delivery needs LIS integration; today, diagnostic staff upload results manually."),
        mk("Ambulance / 108 systems", "Not connected", "danger", "Dispatch confirmation must come from the authorised operator. This app records operator-entered events only."),
        mk("SMS gateway", "Simulated", "warn", "Messages are written to the outbox for review; none are sent. Production needs a DLT-registered Indian SMS provider."),
        mk("Email service", "Simulated", "warn", "Same as SMS: logged to the outbox only."),
        mk("AI assistant service", cfg.aiMode === "server" ? "Server endpoint set" : "Local rule-based", cfg.aiMode === "server" ? "info" : "ok", "The default assistant is a local rule-based helper that gives general information, never diagnoses, and labels sources.", aiForm)));
  },

  // ------------------------------------------------------------------------------------------------ data quality
  async dataquality() {
    const orgs = db.all("orgs"), hosp = orgs.filter(o => o.kind === "hospital");
    const B = { "< 6 h": 0, "6–24 h": 0, "1–3 days": 0, "> 3 days": 0, "No bed data": 0 };
    hosp.forEach(o => { const ts = orgTs(o); if (!ts) return B["No bed data"]++; const hrs = (Date.now() - new Date(ts)) / 36e5; B[hrs < 6 ? "< 6 h" : hrs < 24 ? "6–24 h" : hrs < 72 ? "1–3 days" : "> 3 days"]++; });
    const miss = {}; orgs.forEach(o => completeness(o).miss.forEach(f => miss[f] = (miss[f] || 0) + 1));
    const dups = Object.values(orgs.reduce((m, o) => { const k = (o.name + "|" + o.district).toLowerCase(); (m[k] ||= []).push(o); return m; }, {})).filter(a => a.length > 1);
    const q = quality();
    const demoN = (c) => db.all(c).filter(x => x.demo).length;
    const colls = ["users", "orgs", "appointments", "admissions", "records", "diagBookings", "camps"];
    return h("div", {},
      pageHead(t("ad.dataquality", "Data quality"), "Where the platform's information is thin, stale or duplicated."),
      grid(3, stat("Quality score", q.score + "/100", "60% profile completeness + 40% bed-data freshness", q.score < 60 ? "warn" : "ok"), stat("Average profile completeness", q.avg + "%"), stat("Hospitals with fresh bed data", q.fresh + "%", `${q.hospN} reporting`, q.fresh < 50 ? "warn" : "ok")),
      h("div", { style: { height: "1rem" } }),
      h("div", { class: "split even" },
        card({ title: "Bed-data freshness (hospitals)", sub: `Outdated after ${db.cfg().staleHours} h` }, barChart(Object.entries(B).map(([k, n], i) => ({ label: k, value: n, tone: i < 2 ? "ok" : i < 4 ? "warn" : "danger" })), { max: Math.max(1, ...Object.values(B)) })),
        card({ title: "Missing profile fields", sub: "Number of facilities missing each field" }, Object.keys(miss).length ? barChart(Object.entries(miss).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: k, value: n, tone: "warn" }))) : empty("No missing fields detected."))),
      h("div", { class: "split even" },
        card({ title: "Demo vs real records" }, table([{ h: "Collection", f: r => r }, { h: "Demo", f: r => demoN(r), cls: "right" }, { h: "Real", f: r => db.all(r).length - demoN(r), cls: "right" }], colls, { label: "Demo versus real" })),
        card({ title: `Possible duplicates (${dups.length})`, sub: "Same name in the same district" }, dups.length ? h("ul", {}, dups.map(a => h("li", {}, `${a[0].name} — ${a[0].district} (${a.length} records)`))) : empty("No duplicate facility names found."))));
  },

  // ------------------------------------------------------------------------------------------------ config
  async config(ctx) {
    const cfg = db.cfg();
    const cfgForm = form([
      { name: "staleHours", label: "Treat facility data as outdated after (hours)", type: "number", required: true, min: 1, max: 168 },
      { name: "emergencyAccessHours", label: "Emergency record access lasts (hours)", type: "number", required: true, min: 1, max: 24 },
      { name: "sessionIdleMinutes", label: "Sign out after inactivity (minutes)", type: "number", required: true, min: 5, max: 240 },
      { name: "kAnonymity", label: "Small-count suppression threshold (k)", type: "number", required: true, min: 2, max: 50, hint: "District dashboards show '<k' for patient counts below this." },
      { name: "demoMode", label: "Show the DEMO environment banner", type: "checkbox" },
    ], { initial: { ...cfg }, submitLabel: "Save settings", onSubmit: (v) => {
      const chk = (n, lo, hi, l) => { if (!Number.isFinite(v[n]) || v[n] < lo || v[n] > hi) throw new Error(`${l} must be between ${lo} and ${hi}.`); };
      chk("staleHours", 1, 168, "Outdated window"); chk("emergencyAccessHours", 1, 24, "Emergency access duration"); chk("sessionIdleMinutes", 5, 240, "Idle timeout"); chk("kAnonymity", 2, 50, "Suppression threshold");
      const before = JSON.stringify(pickCfg(cfg)); Object.assign(cfg, { staleHours: v.staleHours, emergencyAccessHours: v.emergencyAccessHours, sessionIdleMinutes: v.sessionIdleMinutes, kAnonymity: v.kAnonymity, demoMode: v.demoMode }); db.save();
      audit("config.updated", "platform", `${before} → ${JSON.stringify(pickCfg(cfg))}`, ctx.user); toast("Settings saved");
    } });
    const ann = form([{ name: "title", label: "Title", required: true }, { name: "level", label: "Level", type: "select", required: true, options: ["info", "warn"] }, { name: "body", label: "Message", type: "textarea", required: true, wide: true }],
      { submitLabel: "Publish announcement", initial: { level: "info" }, onSubmit: (v) => { if (v.title.trim().length < 3) throw new Error("Give the announcement a title."); const a = db.insert("announcements", { title: v.title.trim(), body: v.body.trim(), level: v.level, at: now(), by: ctx.user.name }); audit("announcement.created", a.title, v.level, ctx.user); db.where("users", u => u.status === "active").forEach(u => notify(u.id, { title: a.title, body: a.body, type: "announcement" })); toast("Announcement published"); ctx.refresh(); } });
    return h("div", {},
      pageHead(t("ad.config", "Platform settings")),
      card({ title: "Policies" }, cfgForm),
      card({ title: "Announcements", sub: "Delivered as a notification to every active user" }, ann,
        h("div", { class: "list", style: { marginTop: "1rem" } }, db.all("announcements").length ? db.all("announcements").map(a => row([h("div", { class: "grow" }, h("div", { class: "title" }, a.title, " ", badge(a.level, a.level === "warn" ? "warn" : "info")), h("div", { class: "small" }, a.body), h("div", { class: "small muted" }, `${a.by} · ${fmtDate(a.at, true)}`)),
          btn("Delete", async () => { if (await confirmDialog("Delete this announcement?", "Delete", true)) { db.remove("announcements", a.id); audit("announcement.deleted", a.title, "", ctx.user); ctx.refresh(); } }, "sm danger", "trash")])) : [empty("No announcements.")])),
      card({ title: "Demo data", cls: "dangerc" }, h("p", {}, "Reset restores the original DEMO dataset and removes everything entered in this browser, including registrations, records and the audit log. You will be signed out."),
        btn("Reset demo data", async () => { if (await confirmDialog("Erase ALL data in this browser and restore the demo dataset? This cannot be undone.", "Erase and reset", true)) { db.reset(); location.hash = "#/login"; } }, "danger", "trash")));
  },

  // ------------------------------------------------------------------------------------------------ outbox
  async outbox() {
    const list = db.all("outbox");
    return h("div", {},
      pageHead(t("ad.outbox", "Message outbox"), "Every SMS and email the platform would send."),
      notice("warn", h("strong", {}, "SIMULATED. "), "No message below was actually delivered. A static prototype cannot send SMS or email."),
      card({ title: `${list.length} message(s)` }, table([
        { h: "When", f: m => ago(m.at) }, { h: "Channel", f: m => badge(m.channel.toUpperCase(), m.channel === "sms" ? "info" : "muted") }, { h: "To", f: m => m.to || "—" }, { h: "Message", f: m => m.text }, { h: "State", f: () => badge("Simulated — not sent", "warn") },
      ], list.slice(0, 200), { empty: "The outbox is empty.", label: "Outbox" })));
  },
};
const pickCfg = (c) => ({ staleHours: c.staleHours, emergencyAccessHours: c.emergencyAccessHours, sessionIdleMinutes: c.sessionIdleMinutes, kAnonymity: c.kAnonymity, demoMode: c.demoMode });
