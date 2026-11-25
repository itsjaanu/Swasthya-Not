// Ambulance operator console: register emergency → rank hospitals → notify → track. Never claims dispatch/readiness unless confirmed.
import { h, km, ago } from "../util.js";
import { db } from "../db.js";
import { DISTRICTS, districtByName } from "../seed.js";
import { rankHospitals, createEmergency, confirmDispatch, notifyHospital, emergencyEta, emergencyClose, NEEDS, EM_LABEL, provenance, bedTotals } from "../services.js";
import { pageHead, grid, stat, card, table, statusBadge, provBadge, empty, notice, btn, form, toast, timeline, kv } from "../ui.js";
import { getPosition } from "../map.js";
import { again } from "./provider-shared.js";

const org = (ctx) => db.get("orgs", ctx.user.orgId);
export const nav = [{ id: "console", icon: "siren", key: "nav.emergency", label: "Emergency console" }, { id: "history", icon: "log", label: "History" }, { id: "fleet", icon: "truck", label: "Fleet" }];
export const strings = {};
let draft = null;

export const routes = {
  console(ctx) {
    const o = org(ctx), r = again(ctx), active = db.where("emergencies", e => e.orgId === o.id && !["closed", "cancelled"].includes(e.status));
    const newForm = form([
      { name: "vehicleId", label: "Vehicle", type: "select", required: true, options: (o.vehicles || []).map(v => ({ value: v.id, label: `${v.plate} (${v.type})` })) },
      { name: "age", label: "Patient age", type: "number", min: 0, max: 120 }, { name: "sex", label: "Sex", type: "select", options: ["M", "F", "O"] },
      { name: "triage", label: "Triage level (crew assessment)", type: "select", required: true, options: ["critical", "serious", "stable"] }, { name: "complaint", label: "Main problem", required: true, wide: true },
      { name: "needs", label: "Resources likely needed", type: "multiselect", options: NEEDS.map(([value, label]) => ({ value, label })), wide: true },
      { name: "district", label: "Pickup district", type: "select", required: true, options: DISTRICTS.map(d => d.name), value: o.district }, { name: "place", label: "Pickup place", required: true },
      { name: "consent", label: "Patient / caregiver informed that details are shared with the receiving hospital (or patient unable to respond — emergency data rule).", type: "checkbox", required: true, wide: true }],
      { submitLabel: "Register emergency", onSubmit: async v => { const d = districtByName(v.district); let loc = { lat: d.lat, lng: d.lng }; createEmergency(ctx.user, { vehicleId: v.vehicleId, patient: { age: v.age, sex: v.sex, triage: v.triage, complaint: v.complaint }, location: { ...loc, label: `${v.place}, ${v.district}` }, needs: v.needs || [] }); toast("Emergency registered. Choose a hospital next."); r(); } });
    const gps = btn("Use device GPS for pickup", async () => { try { const p = await getPosition(); toast(`GPS: ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)} (demo uses district centre)`); } catch (e) { toast(e.message, "danger"); } }, "sm", "pin");
    return h("div", { class: "stack" }, pageHead("Emergency console", o.name), notice("warn", "This tool coordinates with hospitals. It does not replace the 108 control room. Status wording is strict: “dispatched” and “resources ready” appear only after a person confirms them."),
      active.length ? active.map(e => caseCard(ctx, e, r)) : null, card({ title: "Register a new emergency", actions: [gps] }, newForm));
  },
  history(ctx) {
    const l = db.where("emergencies", e => e.orgId === ctx.user.orgId && ["closed", "cancelled"].includes(e.status));
    return h("div", {}, pageHead("History"), card({}, table([{ h: "Ref", f: e => e.ref }, { h: "Problem", f: e => e.patient.complaint }, { h: "Hospital", f: e => db.get("orgs", e.hospitalId)?.name || "—" }, { h: "Status", f: e => statusBadge(e.status) }, { h: "Opened", f: e => ago(e.createdAt) }], l, { empty: "No closed cases." })));
  },
  fleet(ctx) {
    const o = org(ctx); const r = again(ctx);
    return h("div", { class: "stack" }, pageHead("Fleet"), card({}, table([{ h: "Plate", f: v => v.plate }, { h: "Type", f: v => v.type }, { h: "Status", f: v => h("select", { onchange: e => { v.status = e.target.value; db.update("orgs", o.id, { vehicles: o.vehicles }); } }, ["available", "on_call", "out_of_service"].map(s => h("option", { value: s, selected: s === v.status }, s.replace("_", " ")))) }], o.vehicles || [], { empty: "No vehicles." })),
      card({ title: "Add vehicle" }, form([{ name: "plate", label: "Registration plate", required: true }, { name: "type", label: "Type", type: "select", options: ["BLS", "ALS"], required: true }], { onSubmit: v => { o.vehicles.push({ id: "veh_" + Date.now(), plate: v.plate.toUpperCase(), type: v.type, status: "available" }); db.update("orgs", o.id, { vehicles: o.vehicles }); r(); } })));
  },
};

function caseCard(ctx, e, r) {
  const hosp = e.hospitalId && db.get("orgs", e.hospitalId);
  const wrap = (fn) => () => { try { fn(); r(); } catch (x) { toast(x.message, "danger"); } };
  let body;
  if (!hosp) { const ranked = rankHospitals(e.location, e.needs); body = h("div", { class: "stack" }, h("h3", {}, "Suggested hospitals — you choose"), h("p", { class: "small muted" }, "Ranked by distance, 24×7 emergency, matching departments/ICU and how fresh bed data is. Always phone ahead when data is outdated."),
    ranked.map(c => h("div", { class: "fac" }, h("div", { class: "spread" }, h("h3", {}, c.org.name), provBadge(provenance(c.org, bedTotals(c.org).updatedAt), bedTotals(c.org).updatedAt)), h("div", { class: "small" }, `${km(c.distKm)} · est. ${c.etaMin} min · ${c.org.district} · score ${c.score}`), c.reasons.length ? h("div", { class: "small", style: { color: "var(--ok)" } }, "✓ " + c.reasons.join(" · ")) : null, c.warns.length ? h("div", { class: "small", style: { color: "var(--warn)" } }, "⚠ " + c.warns.join(" · ")) : null, h("div", { class: "cluster" }, btn("Notify this hospital", wrap(() => notifyHospital(ctx.user, e.id, c.org.id, c.etaMin)), "sm primary"), c.org.emergencyPhone ? h("a", { class: "btn sm", href: "tel:" + c.org.emergencyPhone.replace(/[^+\d]/g, "") }, "Call ED") : null)))); }
  else body = h("div", { class: "stack" }, kv([["Receiving hospital", hosp.name], ["Hospital status", EM_LABEL[e.status]], ["ETA (crew)", e.etaMin + " min"], ["Dispatch", e.dispatched ? "Confirmed by operator" : "Not yet confirmed"], ["Hospital says resources ready", e.status === "resources_ready" ? "Yes — " + (e.readyNote || "") : "Not confirmed"]]),
    h("div", { class: "cluster" }, !e.dispatched ? btn("Confirm ambulance dispatched", wrap(() => confirmDispatch(ctx.user, e.id)), "primary") : null, btn("ETA −5 min (simulated)", wrap(() => emergencyEta(ctx.user, e.id, Math.max(1, e.etaMin - 5))), "sm"), e.status === "arrived" ? btn("Close case", wrap(() => emergencyClose(ctx.user, e.id)), "sm primary") : null));
  return card({ title: `${e.ref} · ${e.patient.triage}`, sub: `${e.patient.complaint} · ${e.location.label}`, actions: [statusBadge(e.status)], cls: "dangerc" }, body, h("h3", { style: { marginTop: "1rem" } }, "Timeline"), timeline(e.timeline));
}
