// Medical camp organizer workspace.
import { h, icon, ago, fmtDate, isoDay, groupBy, sum } from "../util.js";
import { db, audit, notify, notifyRole } from "../db.js";
import { DISTRICTS } from "../seed.js";
import { card, stat, grid, table, form, modal, toast, badge, statusBadge, pageHead, empty, notice, btn, meter, barChart, kv, confirmDialog } from "../ui.js";
import { getPosition } from "../map.js";
import { t } from "../i18n.js";

const mk = (rows) => Object.fromEntries(rows.map(([k, te, hi, ta]) => [k, { te, hi, ta }]));
export const strings = mk([
  ["og.nav.camps", "నా శిబిరాలు", "मेरे शिविर", "என் முகாம்கள்"], ["og.title.overview", "శిబిరాల సారాంశం", "शिविर अवलोकन", "முகாம் கண்ணோட்டம்"], ["og.title.camps", "వైద్య శిబిరాలు", "चिकित्सा शिविर", "மருத்துவ முகாம்கள்"],
  ["og.new", "కొత్త శిబిరం", "नया शिविर", "புதிய முகாம்"], ["og.regs", "నమోదులు", "पंजीकरण", "பதிவுகள்"], ["og.report", "నివేదిక", "रिपोर्ट", "அறிக்கை"], ["og.edit", "సవరించండి", "संपादित करें", "திருத்து"],
  ["og.title.regs", "నమోదులు & హాజరు", "पंजीकरण व उपस्थिति", "பதிவுகள் & வருகை"], ["og.title.report", "శిబిరం నివేదిక", "शिविर रिपोर्ट", "முகாம் அறிக்கை"], ["og.attended", "హాజరయ్యారు", "उपस्थित", "வந்தவர்"],
  ["og.noshow", "రాలేదు", "अनुपस्थित", "வரவில்லை"], ["og.walkin", "వాక్-ఇన్ జోడించండి", "वॉक-इन जोड़ें", "நேரடி பதிவு சேர்"], ["og.csv", "CSV ఎగుమతి", "CSV निर्यात", "CSV ஏற்றுமதி"],
  ["og.myloc", "నా స్థానం ఉపయోగించండి", "मेरी लोकेशन उपयोग करें", "என் இருப்பிடத்தைப் பயன்படுத்து"], ["og.cancelCamp", "శిబిరం రద్దు", "शिविर रद्द करें", "முகாமை ரத்து செய்"],
]);
export const nav = [
  { id: "overview", icon: "home", key: "nav.overview", label: "Overview" }, { id: "camps", icon: "tent", key: "og.nav.camps", label: "My camps" },
];
export const css = `.og-camp{display:grid;gap:.5rem}.og-meta{display:flex;gap:.9rem;flex-wrap:wrap;font-size:.86rem;color:var(--ink-2)}.og-meta span{display:inline-flex;gap:.3rem;align-items:center}`;

const SERVICES = ["BP & sugar", "Anaemia screening", "Eye check", "Dental check", "Women's health", "Gynaecology screening", "Child health & vaccination", "Nutrition counselling", "Diet education", "TB / respiratory screening", "Mental health counselling", "Referral desk"];
const mine = (u) => db.where("camps", c => c.organizerId === u.id);
const regsOf = (id) => db.where("campRegs", r => r.campId === id);
const activeRegs = (id) => regsOf(id).filter(r => r.status !== "cancelled");
function csv(name, rows) { const c = rows.map(r => r.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"); const a = h("a", { href: URL.createObjectURL(new Blob([c], { type: "text/csv" })), download: name }); document.body.append(a); a.click(); a.remove(); }
const campStatusNote = { pending_approval: "Waiting for administrator approval — not visible to citizens yet.", published: "Visible to citizens.", rejected: "Not approved.", draft: "Draft.", completed: "Completed.", cancelled: "Cancelled." };

async function overview(ctx) {
  const cs = mine(ctx.user), regs = cs.flatMap(c => activeRegs(c.id)), att = regs.filter(r => r.status === "attended");
  const upcoming = cs.filter(c => c.status === "published" && c.date >= isoDay()).sort((a, b) => a.date.localeCompare(b.date));
  const byDist = Object.entries(groupBy(cs.filter(c => !["cancelled", "rejected"].includes(c.status)), c => c.district)).map(([d, a]) => ({ label: d, value: sum(a, c => activeRegs(c.id).length), display: `${sum(a, c => activeRegs(c.id).length)} reg · ${a.length} camp${a.length > 1 ? "s" : ""}` }));
  return h("div", {}, pageHead(t("og.title.overview", "Camp overview"), ctx.user.name, btn(t("og.new", "New camp"), () => ctx.go("camps/new"), "primary", "plus")),
    cs.some(c => c.status === "pending_approval") ? notice("warn", "Some camps are waiting for administrator approval. Citizens only see published camps.") : null,
    grid(4, stat("Camps", cs.length, `${upcoming.length} upcoming`), stat("Registrations", regs.length, "excluding cancelled"), stat("Attended", att.length, regs.length ? Math.round(att.length / regs.length * 100) + "% of registered" : ""), stat("Awaiting approval", cs.filter(c => c.status === "pending_approval").length, "", cs.some(c => c.status === "pending_approval") ? "warn" : "")),
    h("div", { class: "split", style: { marginTop: "1rem" } },
      card({ title: "Upcoming camps" }, upcoming.length ? h("div", { class: "list" }, upcoming.map(c => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, c.title), h("small", { class: "muted" }, `${fmtDate(c.date)} · ${c.village}, ${c.district}`)), h("div", { style: { width: "120px" } }, meter(activeRegs(c.id).length, c.capacity, "Registrations"), h("small", { class: "muted" }, `${activeRegs(c.id).length}/${c.capacity}`)), btn(t("og.regs", "Registrations"), () => ctx.go("camps/" + c.id + "/regs"), "sm")))) : empty("No upcoming published camps.", btn(t("og.new", "New camp"), () => ctx.go("camps/new"), "primary sm"))),
      card({ title: "Coverage by district" }, byDist.length ? barChart(byDist) : empty("Coverage appears once you have camps."))));
}

// ---- camps list / editor / detail routes (camps, camps/new, camps/<id>/edit|regs|report) -------------
async function camps(ctx) {
  const { param, rest } = ctx;
  if (param === "new") return editor(ctx, null);
  if (param) {
    const c = db.get("camps", param); if (!c || c.organizerId !== ctx.user.id) return empty("Camp not found.");
    const sub = rest[0]; if (sub === "edit") return editor(ctx, c); if (sub === "regs") return regsView(ctx, c); if (sub === "report") return reportView(ctx, c);
  }
  const cs = mine(ctx.user).sort((a, b) => b.date.localeCompare(a.date));
  return h("div", {}, pageHead(t("og.title.camps", "Medical camps"), "Camps need administrator approval before citizens can see them.", btn(t("og.new", "New camp"), () => ctx.go("camps/new"), "primary", "plus")),
    cs.length ? h("div", { class: "grid g-auto" }, cs.map(c => campCard(ctx, c))) : empty("You have not created a camp yet.", btn(t("og.new", "New camp"), () => ctx.go("camps/new"), "primary")));
}
function campCard(ctx, c) {
  const n = activeRegs(c.id).length, open = ["pending_approval", "published", "draft"].includes(c.status);
  return card({ cls: "og-camp" + (c.status === "pending_approval" ? " warnc" : c.status === "published" ? " accent" : "") },
    h("div", { class: "spread" }, h("h3", {}, c.title), statusBadge(c.status)),
    h("div", { class: "og-meta" }, h("span", {}, icon("calendar", 14), `${fmtDate(c.date)} ${c.start}–${c.end}`), h("span", {}, icon("pin", 14), `${c.village}, ${c.mandal}, ${c.district}`)),
    h("p", { class: "small muted" }, campStatusNote[c.status] || ""), c.rejectReason ? notice("danger", "Reason: " + c.rejectReason) : null,
    h("div", {}, meter(n, c.capacity, "Registrations"), h("small", { class: "muted" }, `${n} of ${c.capacity} registered`)),
    h("div", { class: "cluster", style: { marginTop: ".7rem" } },
      btn(t("og.regs", "Registrations"), () => ctx.go(`camps/${c.id}/regs`), "sm"), open ? btn(t("og.edit", "Edit"), () => ctx.go(`camps/${c.id}/edit`), "sm") : null,
      ["published", "completed"].includes(c.status) ? btn(t("og.report", "Report"), () => ctx.go(`camps/${c.id}/report`), "sm") : null,
      open ? btn(t("og.cancelCamp", "Cancel camp"), async () => {
        if (!(await confirmDialog(`Cancel “${c.title}”? ${n} registered people will be notified.`, "Cancel camp", true))) return;
        db.update("camps", c.id, { status: "cancelled" }); audit("camp.cancelled", c.title, ""); activeRegs(c.id).forEach(r => { if (r.citizenId) notify(r.citizenId, { title: "Camp cancelled", body: `${c.title} on ${fmtDate(c.date)} has been cancelled.`, link: "#/app/camps", type: "camp", channels: ["inapp", "sms"] }); });
        toast("Camp cancelled"); ctx.refresh();
      }, "sm ghost") : null));
}

function editor(ctx, c) {
  const u = ctx.user;
  const f = form([
    { name: "title", label: "Camp title", required: true, wide: true, value: c?.title }, { name: "description", label: "What will happen at the camp", type: "textarea", wide: true, value: c?.description },
    { name: "district", label: "District", type: "select", required: true, options: DISTRICTS.map(d => d.name), value: c?.district || u.district }, { name: "mandal", label: "Mandal", required: true, value: c?.mandal || u.mandal },
    { name: "village", label: "Village / town", required: true, value: c?.village }, { name: "venue", label: "Venue", required: true, value: c?.venue },
    { name: "lat", label: "Latitude", type: "number", step: "any", value: c?.lat, hint: "Used for the map. Optional." }, { name: "lng", label: "Longitude", type: "number", step: "any", value: c?.lng },
    { name: "date", label: "Date", type: "date", required: true, min: c ? undefined : isoDay(), value: c?.date }, { name: "capacity", label: "Capacity (people)", type: "number", min: 1, required: true, value: c?.capacity ?? 100 },
    { name: "start", label: "Start time", type: "time", required: true, value: c?.start || "09:00" }, { name: "end", label: "End time", type: "time", required: true, value: c?.end || "14:00" },
    { name: "services", label: "Services offered", type: "multiselect", options: SERVICES, wide: true, value: c?.services || [] },
    { name: "doctors", label: "Participating doctors and health staff", type: "textarea", wide: true, hint: "One name per line, with speciality, e.g. Dr. A (General).", value: (c?.doctors || []).join("\n") },
  ], { submitLabel: c ? "Save changes" : "Submit for approval", onCancel: () => ctx.go("camps"), onSubmit: (v) => {
    if (v.end <= v.start) throw new Error("End time must be after the start time.");
    if (!v.services.length) throw new Error("Choose at least one service.");
    if (!Number.isInteger(v.capacity) || v.capacity < 1) throw new Error("Capacity must be a whole number of 1 or more.");
    if (v.lat !== "" && (v.lat < 8 || v.lat > 22 || v.lng < 74 || v.lng > 88)) throw new Error("Coordinates are outside Andhra Pradesh. Check latitude and longitude.");
    const body = { ...v, lat: v.lat === "" ? null : v.lat, lng: v.lng === "" ? null : v.lng, doctors: v.doctors.split("\n").map(s => s.trim()).filter(Boolean) };
    if (c) {
      const reapprove = c.status === "published"; db.update("camps", c.id, { ...body, status: reapprove || c.status === "rejected" ? "pending_approval" : c.status, rejectReason: "" });
      audit("camp.edited", v.title, reapprove ? "re-submitted for approval" : ""); if (reapprove || c.status === "rejected") notifyRole("admin", { title: "Camp changes need approval", body: v.title, link: "#/app/approvals", type: "approval" });
      toast(reapprove ? "Saved — sent for approval again" : "Saved");
    } else {
      const n = db.insert("camps", { organizerId: u.id, ...body, status: "pending_approval", demo: !!u.demo });
      audit("camp.created", n.title, n.district); notifyRole("admin", { title: "New medical camp awaiting approval", body: `${n.title} · ${n.district} · ${n.date}`, link: "#/app/approvals", type: "approval" });
      toast("Camp submitted for approval");
    }
    ctx.go("camps");
  } });
  const loc = btn(t("og.myloc", "Use my location"), async () => { try { const p = await getPosition(); f.els.lat.value = p.lat.toFixed(5); f.els.lng.value = p.lng.toFixed(5); toast("Location filled in"); } catch (e) { toast(e.message, "danger"); } }, "sm", "navi");
  f.els.lng.closest(".field").after(h("div", { class: "field wide" }, loc));
  return h("div", {}, pageHead(c ? "Edit camp" : t("og.new", "New camp"), c?.status === "published" ? "This camp is live. Saving changes sends it back for approval." : "Citizens see your camp after the administrator approves it."), card({}, f));
}

async function regsView(ctx, c) {
  const regs = regsOf(c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), act = regs.filter(r => r.status !== "cancelled");
  const walk = form([{ name: "name", label: "Walk-in name", required: true }], { submitLabel: t("og.walkin", "Add walk-in"), onSubmit: (v) => {
    if (c.capacity && act.length >= c.capacity) throw new Error("This camp is full.");
    if (act.some(r => r.forName.toLowerCase() === v.name.trim().toLowerCase())) throw new Error("This person is already registered.");
    db.insert("campRegs", { campId: c.id, citizenId: null, forName: v.name.trim(), status: "attended", walkIn: true }); audit("camp.walkin", c.title, v.name); toast("Walk-in recorded as attended"); ctx.refresh();
  } });
  const mark = (r, st) => { db.update("campRegs", r.id, { status: st }); audit("camp.attendance", c.title, `${r.forName}: ${st}`); ctx.refresh(); };
  return h("div", {}, pageHead(t("og.title.regs", "Registrations & attendance"), `${c.title} · ${fmtDate(c.date)}`, btn("Back", () => ctx.go("camps"), "", "x"), btn(t("og.csv", "Export CSV"), () => csv(`camp-${c.id}.csv`, [["Name", "Status", "Walk-in", "Registered"], ...regs.map(r => [r.forName, r.status, r.walkIn ? "yes" : "no", r.createdAt])]), "", "download")),
    grid(4, stat("Registered", act.length, `capacity ${c.capacity}`), stat(t("og.attended", "Attended"), act.filter(r => r.status === "attended").length, "", "ok"), stat(t("og.noshow", "No-show"), regs.filter(r => r.status === "no_show").length), stat("Seats left", Math.max(0, c.capacity - act.length))),
    h("div", { style: { margin: "1rem 0" } }, meter(act.length, c.capacity, "Capacity used")),
    h("div", { class: "split" }, card({}, table([
      { h: "Name", f: r => h("span", {}, r.forName, r.walkIn ? h("span", { style: { marginLeft: ".4rem" } }, badge("Walk-in", "info")) : null) }, { h: "Status", f: r => statusBadge(r.status) }, { h: "Registered", f: r => ago(r.createdAt) },
      { h: "Attendance", f: r => r.status === "cancelled" ? "—" : h("div", { class: "cluster" }, btn(t("og.attended", "Attended"), () => mark(r, "attended"), "sm"), btn(t("og.noshow", "No-show"), () => mark(r, "no_show"), "sm ghost")) },
    ], regs, { empty: "No registrations yet." })), card({ title: t("og.walkin", "Add walk-in") }, walk, h("p", { class: "small muted" }, "Record only the name — do not enter health details here."))));
}

async function reportView(ctx, c) {
  const act = activeRegs(c.id), att = act.filter(r => r.status === "attended").length, done = c.status === "completed";
  return h("div", {}, pageHead(t("og.title.report", "Camp report"), `${c.title} · ${fmtDate(c.date)}`, btn("Back", () => ctx.go("camps"), "", "x")),
    done ? notice("ok", "Report submitted. You can still update the figures below.") : null,
    c.date > isoDay() ? notice("warn", "This camp has not happened yet. Submit the report after the camp day.") : null,
    card({}, form([
      { name: "attended", label: "People attended", type: "number", min: 0, required: true, value: c.report?.attended ?? att, hint: `Recorded attendance: ${att}` }, { name: "referred", label: "People referred to a facility", type: "number", min: 0, required: true, value: c.report?.referred ?? 0 },
      { name: "notes", label: "Summary, issues and follow-up needed", type: "textarea", wide: true, required: true, value: c.report?.notes, hint: "Do not include names or health details of individuals." },
    ], { submitLabel: done ? "Update report" : "Submit report and complete camp", onSubmit: (v) => {
      if (!Number.isInteger(v.attended) || !Number.isInteger(v.referred) || v.attended < 0 || v.referred < 0) throw new Error("Counts must be whole numbers, 0 or more.");
      if (v.referred > v.attended) throw new Error("Referred cannot be more than attended.");
      db.update("camps", c.id, { status: "completed", report: { attended: v.attended, referred: v.referred, notes: v.notes.trim(), submittedAt: new Date().toISOString() } });
      audit("camp.report", c.title, `${v.attended} attended, ${v.referred} referred`); notifyRole("district", { title: "Camp report submitted", body: `${c.title} · ${c.district}`, type: "camp" }, (d) => d.district === c.district);
      toast("Report submitted"); ctx.go("camps");
    } })));
}

export const routes = { overview, camps };
