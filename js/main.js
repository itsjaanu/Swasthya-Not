// App entry: router, shell (sidebar / top bar / banners), session handling.
import { h, $, clear, icon, ago } from "./util.js";
import { db, load, auth, onChange, net, audit } from "./db.js";
import { ROLES } from "./seed.js";
import { t, setLang, lang, LANGS } from "./i18n.js";
import { toast } from "./ui.js";
import { unread, runReminders } from "./services.js";
import * as pub from "./views/public.js";
import * as common from "./views/common.js";
import { mountAssistant } from "./assistant.js";

load();
const MODULES = {
  citizen: () => import("./views/citizen.js"), doctor: () => import("./views/doctor.js"), hospital: () => import("./views/hospital.js"),
  diagnostic: () => import("./views/diagnostic.js"), pharmacy: () => import("./views/pharmacy.js"), organizer: () => import("./views/organizer.js"),
  asha: () => import("./views/asha.js"), ambulance: () => import("./views/ambulance.js"), district: () => import("./views/district.js"), admin: () => import("./views/admin.js"),
};
const loaded = {};
const injected = new Set();
const root = document.getElementById("app");
let shell = null, current = null, renderToken = 0;

const parse = () => { const p = (location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean).map(decodeURIComponent); return p; };
export const go = (path) => { location.hash = path.startsWith("#") ? path : "#/app/" + path.replace(/^\//, ""); };
window.swGo = go;

async function loadRole(role) {
  if (loaded[role]) return loaded[role];
  let m;
  try { m = await MODULES[role](); } catch (e) { console.warn("Workspace module missing", role, e); m = { nav: [{ id: "soon", icon: "info", label: "Workspace" }], routes: { soon: () => h("div", { class: "notice info" }, icon("info", 18), h("div", {}, h("strong", {}, "This workspace is not in this build yet. "), "The data model, workflows and permissions for this role exist in js/services.js and js/seed.js; its screens are the next milestone.")) } }; }
  loaded[role] = m;
  if (m.css && !injected.has(role)) { injected.add(role); document.head.append(h("style", { "data-view": role }, m.css)); }
  if (m.strings) (await import("./i18n.js")).registerStrings(m.strings);
  return m;
}

async function route() {
  const token = ++renderToken;
  const parts = parse(); const user = auth.current();
  document.body.classList.toggle("is-public", parts[0] !== "app");
  if (parts[0] === "app") {
    if (!user) { sessionStorage.setItem("swasthya.next", location.hash); return location.hash = "#/login"; }
    return renderApp(user, parts.slice(1), token);
  }
  shell = null;
  const view = parts[0] || "";
  const ctx = { user, parts, go };
  clear(root).append(pub.frame(ctx, view, parts));
}

function navItems(role, mod, user) {
  const base = mod.nav || [];
  const tail = [{ id: "notifications", icon: "bell", key: "nav.notifications", label: "Notifications", badge: unread(user.id) }, { id: "settings", icon: "key", key: "nav.settings", label: "Settings" }];
  return [...base, { grp: "Account" }, ...tail];
}

async function renderApp(user, parts, token) {
  let mod = null;
  const pending = user.status !== "active";
  if (!pending) mod = await loadRole(user.role); else mod = { nav: [], routes: {} };
  if (token !== renderToken) return;
  if (user.mustChange && parts[0] !== "settings") return go("settings");
  const section = parts[0] || mod.nav?.[0]?.id || "settings";
  const param = parts[1], rest = parts.slice(2);
  const ctx = { user, param, rest, go, refresh: () => paint(), section, t };
  current = { user, mod, ctx, section };
  if (!shell || shell.dataset.user !== user.id) { shell = buildShell(user, mod); clear(root).append(shell); mountAssistant(() => auth.current()); }
  paintShell(user, mod, section);
  await paint();
}

async function paint() {
  const { user, mod, ctx, section } = current;
  const main = $("#main"); if (!main) return;
  const y = window.scrollY;
  const common_ = { notifications: common.notifications, settings: common.settings };
  const fn = user.status !== "active" && section !== "settings" && section !== "notifications" ? common.pending : (common_[section] || mod.routes[section]);
  let el;
  try { el = fn ? await fn(ctx) : h("div", { class: "empty" }, "This page does not exist."); }
  catch (e) { console.error(e); el = h("div", { class: "notice danger" }, icon("alert", 18), h("div", {}, h("strong", {}, "Something went wrong. "), e.message)); }
  clear(main).append(el); main.focus({ preventScroll: true });
  paintShell(user, mod, section);
  window.scrollTo(0, ctx._keepScroll ? y : 0);
  document.title = `${(navLabel(mod, section) || "Swasthya Connect")} · Swasthya Connect AI`;
}
const navLabel = (mod, section) => { const n = [...(mod.nav || []), { id: "notifications", label: "Notifications" }, { id: "settings", label: "Settings" }].find(x => x.id === section); return n ? t(n.key, n.label) : ""; };

function buildShell(user, mod) {
  const side = h("aside", { class: "side", id: "side", "aria-label": "Main navigation" });
  const top = h("div", { class: "top" });
  const banners = h("div", { id: "banners" });
  return h("div", { class: "shell", "data-user": user.id },
    side,
    h("div", { class: "main" },
      h("div", { class: "sos", role: "note" }, icon("siren", 16), h("span", {}, t("emerg.banner")), h("a", { href: "tel:108" }, "Call 108"), h("a", { href: "tel:112" }, "112")),
      top, banners, h("main", { id: "main", class: "content", tabindex: "-1" })));
}

function paintShell(user, mod, section) {
  const side = $("#side"), top = $(".top"); if (!side) return;
  clear(side).append(
    h("a", { class: "brand", href: "#/" }, h("span", { class: "mark" }, icon("heart", 20)), "Swasthya Connect"),
    h("nav", { class: "nav" }, navItems(user.role, mod, user).map(n => n.grp ? h("div", { class: "grp" }, n.grp) : h("a", { href: "#/app/" + n.id, "aria-current": n.id === section ? "page" : null, onclick: () => side.classList.remove("open") }, icon(n.icon, 18), h("span", {}, t(n.key, n.label)), n.badge ? h("span", { class: "count-dot", style: { position: "static", marginLeft: "auto" } }, n.badge) : null))),
    h("div", { class: "who" }, h("b", {}, user.name), ROLES[user.role].label, user.status !== "active" ? h("div", {}, h("span", { class: "badge warn" }, user.status)) : null,
      h("div", { style: { marginTop: ".6rem" } }, h("button", { class: "btn sm", onclick: () => { auth.logout(); location.hash = "#/"; } }, icon("logout", 14), t("common.signout", "Sign out")))));
  clear(top).append(
    h("button", { class: "icon-btn menu-btn", "aria-label": "Menu", onclick: () => side.classList.toggle("open") }, icon("menu", 20)),
    h("div", { class: "grow" }),
    h("label", { class: "cluster small", title: "Language" }, icon("globe", 16), h("span", { class: "sr", style: { position: "absolute", left: "-999px" } }, "Language"), (() => { const s = h("select", { onchange: e => { setLang(e.target.value); if (user.id) db.update("users", user.id, { lang: e.target.value }); } }, LANGS.map(l => h("option", { value: l[0], selected: l[0] === lang() }, l[1]))); return s; })()),
    ...a11yControls(),
    h("button", { class: "icon-btn", "aria-label": net.simulated ? "Go back online (simulated offline is on)" : "Simulate offline mode", title: "Simulate offline", "aria-pressed": net.simulated, onclick: () => net.toggleSim() }, icon("wifioff", 18)),
    h("a", { class: "icon-btn", href: "#/app/notifications", "aria-label": "Notifications" }, icon("bell", 18), unread(user.id) ? h("span", { class: "count-dot" }, unread(user.id)) : null));
  paintBanners(user);
}
export function a11yControls() {
  const root_ = document.documentElement;
  const size = (d) => { const v = Math.max(14, Math.min(22, (parseInt(getComputedStyle(root_).fontSize) || 16) + d)); root_.style.setProperty("--fs", v + "px"); try { localStorage.setItem("swasthya.fs", v); } catch { /* ignore */ } };
  return [
    h("button", { class: "icon-btn", "aria-label": "Smaller text", onclick: () => size(-1) }, h("span", { style: { fontWeight: 700, fontSize: ".8rem" } }, "A−")),
    h("button", { class: "icon-btn", "aria-label": "Larger text", onclick: () => size(1) }, h("span", { style: { fontWeight: 700, fontSize: "1rem" } }, "A+")),
    h("button", { class: "icon-btn", "aria-label": "Toggle high contrast", onclick: () => { const on = root_.dataset.contrast === "high"; root_.dataset.contrast = on ? "" : "high"; try { localStorage.setItem("swasthya.contrast", on ? "" : "high"); } catch { /* ignore */ } } }, icon("contrast", 18)),
    h("button", { class: "icon-btn", "aria-label": "Toggle dark mode", onclick: () => { const dk = root_.dataset.theme === "dark"; root_.dataset.theme = dk ? "light" : "dark"; try { localStorage.setItem("swasthya.theme", dk ? "light" : "dark"); } catch { /* ignore */ } } }, icon("sun", 18)),
  ];
}
function paintBanners(user) {
  const b = $("#banners"); if (!b) return; clear(b);
  if (net.offline) b.append(h("div", { class: "banner offline", role: "status" }, icon("wifioff", 16), "You are offline. Showing saved information — it may be out of date. New entries are saved on this device and sync when you reconnect."));
  if (user.demo || db.cfg().demoMode) b.append(h("div", { class: "banner demo" }, icon("info", 16), h("span", {}, h("strong", {}, "DEMO ENVIRONMENT. "), "Sample data only — never enter real patient information. Nothing here is sent to real hospitals, pharmacies or ambulances.")));
  if (user.status === "pending") b.append(h("div", { class: "banner pending" }, icon("clock", 16), "Your account is awaiting verification. You can update your profile; other features unlock once an administrator approves you."));
  if (user.status === "rejected") b.append(h("div", { class: "banner pending" }, icon("alert", 16), "Your registration was not approved. See the message on the Overview page."));
}

// Applied preferences
try { const fs = localStorage.getItem("swasthya.fs"); if (fs) document.documentElement.style.setProperty("--fs", fs + "px"); const th = localStorage.getItem("swasthya.theme"); if (th) document.documentElement.dataset.theme = th; else if (matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme = "dark"; document.documentElement.dataset.contrast = localStorage.getItem("swasthya.contrast") || ""; } catch { /* ignore */ }

window.addEventListener("hashchange", route);
window.addEventListener("langchange", () => { shell = null; route(); });
window.addEventListener("netchange", () => { if (current && $("#banners")) paintBanners(current.user); if (current) { /* views may re-render on reconnect */ } window.dispatchEvent(new Event("netstate")); });
onChange((src) => {
  if (src !== "remote" || !current || !$("#main")) return;
  const a = document.activeElement; if (document.querySelector(".modal-back") || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $("#main").contains(a))) return;
  const u = auth.current(); if (!u) return; current.user = u; current.ctx.user = u; current.ctx._keepScroll = true; paintShell(u, current.mod, current.section); paint();
});
setInterval(() => { if (!document.hidden) { runReminders(); } }, 60000);
runReminders();
route();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(() => { /* offline shell unavailable */ });
