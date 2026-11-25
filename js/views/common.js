// Views shared by every role: notifications, settings, pending-verification screen.
import { h, icon, ago, fmtDate } from "../util.js";
import { db, auth, audit } from "../db.js";
import { ROLES, DISTRICTS } from "../seed.js";
import { t, LANGS, setLang, lang } from "../i18n.js";
import { card, pageHead, empty, form, toast, notice, btn, kv, table } from "../ui.js";

export function notifications(ctx) {
  const mine = db.where("notifications", n => n.userId === ctx.user.id);
  const outbox = db.where("outbox", o => o.to === ctx.user.email || o.to === ctx.user.phone);
  const anns = db.all("announcements").slice(0, 3);
  return h("div", {}, pageHead(t("nav.notifications", "Notifications"), "Appointment, admission, report, camp and emergency updates.", btn("Mark all read", () => { mine.forEach(n => n.read = true); db.save(); ctx.refresh(); }, "", "check")),
    anns.map(a => notice(a.level === "warn" ? "warn" : "info", h("strong", {}, a.title + ". "), a.body)),
    card({}, mine.length ? h("div", { class: "list" }, mine.map(n => h("div", { class: "row", style: { opacity: n.read ? .65 : 1 } }, h("div", { class: "grow" }, h("div", { class: "title" }, n.title), n.body ? h("div", { class: "small muted" }, n.body) : null, h("div", { class: "small muted" }, ago(n.at))), n.link ? h("a", { class: "btn sm", href: n.link, onclick: () => { n.read = true; db.save(); } }, t("common.view", "View")) : null))) : empty("No notifications yet.")),
    outbox.length ? card({ title: "Simulated SMS / email", sub: "A static prototype cannot send real messages. This shows what would have been sent." }, table([{ h: "Channel", f: r => r.channel.toUpperCase() }, { h: "Message", f: r => r.text }, { h: "When", f: r => ago(r.at) }], outbox.slice(0, 15))) : null);
}

export function settings(ctx) {
  const u = ctx.user;
  return h("div", { class: "stack" }, pageHead(t("nav.settings", "Settings"), `${ROLES[u.role].label} · ${u.email}`),
    u.mustChange ? notice("warn", "Please set a new password before continuing.") : null,
    card({ title: "Profile" }, form([{ name: "name", label: "Name", required: true }, { name: "phone", label: "Mobile", type: "tel" }, { name: "district", label: "District", type: "select", options: DISTRICTS.map(d => d.name) }, { name: "lang", label: "Language", type: "select", options: LANGS.map(l => ({ value: l[0], label: l[1] })) }],
      { initial: { name: u.name, phone: u.phone, district: u.district, lang: u.lang || lang() }, onSubmit: v => { db.update("users", u.id, v); setLang(v.lang); audit("profile.updated", u.email, "", u); toast("Profile saved"); ctx.refresh(); } })),
    card({ title: "Change password" }, form([{ name: "old", label: "Current password", type: "password", required: true }, { name: "pw", label: "New password", type: "password", required: true, hint: "8+ characters with letters and numbers." }], { submitLabel: "Change password", onSubmit: async v => { await auth.changePassword(u, v.old, v.pw); db.update("users", u.id, { mustChange: false }); toast("Password changed"); } })),
    card({ title: "Your data" }, h("p", { class: "small" }, "Account created ", fmtDate(u.createdAt), u.demo ? " (DEMO account)" : "", ". Record-sharing permissions are managed by patients in their own workspace; every access is logged.")));
}

export function pending(ctx) {
  const u = ctx.user;
  return h("div", { class: "stack" }, pageHead("Verification in progress", ROLES[u.role].label),
    u.status === "rejected" ? notice("danger", h("strong", {}, "Registration not approved. "), u.rejectReason || "Contact the administrator.") : notice("warn", "An administrator is reviewing your details. You will be notified when your workspace is unlocked."),
    card({ title: "What you submitted" }, kv([["Name", u.name], ["Email", u.email], ["District", u.district], ["Registration / licence", u.regNo || u.licenceNo || u.ashaId || "—"], ["Submitted", fmtDate(u.createdAt, true)]])));
}
