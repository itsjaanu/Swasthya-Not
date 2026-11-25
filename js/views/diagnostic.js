// Diagnostic centre workspace.
import { h } from "../util.js";
import { db } from "../db.js";
import { provenance, bedTotals } from "../services.js";
import { pageHead, grid, stat, card, donut, provBadge } from "../ui.js";
import { again, testsManager, requestsPanel, reportsPanel, facilityProfile, verificationNotice } from "./provider-shared.js";
import { t } from "../i18n.js";

const org = (ctx) => db.get("orgs", ctx.user.orgId);
export const nav = [{ id: "overview", icon: "home", key: "nav.overview", label: "Overview" }, { id: "requests", icon: "calendar", label: "Test requests" }, { id: "reports", icon: "file", label: "Reports" }, { id: "tests", icon: "flask", label: "Test catalogue" }, { id: "profile", icon: "building", label: "Centre profile" }];
export const strings = { "dg.title": { te: "డయాగ్నస్టిక్ కేంద్రం", hi: "जाँच केंद्र", ta: "பரிசோதனை மையம்" } };
export const routes = {
  overview(ctx) {
    const o = org(ctx), b = db.where("diagBookings", x => x.orgId === o.id); const c = (s) => b.filter(x => x.status === s).length;
    return h("div", {}, pageHead(o.name, "Diagnostic centre", provBadge(provenance(o, o.updatedAt))), verificationNotice(o),
      grid(4, stat("New requests", c("requested"), "need confirmation", c("requested") ? "warn" : ""), stat("Confirmed", c("confirmed")), stat("In progress", c("sample_collected") + c("processing")), stat("Reports released", c("report_ready"))),
      card({ title: "Requests by status" }, donut(["requested", "confirmed", "sample_collected", "processing", "report_ready", "rejected"].map((s, i) => ({ label: s.replace("_", " "), value: c(s), tone: ["warn", "info", "muted", "info", "ok", "danger"][i] })), { center: b.length })));
  },
  requests: (ctx) => h("div", {}, pageHead("Test requests"), requestsPanel(ctx.user, org(ctx), again(ctx))),
  reports: (ctx) => h("div", {}, pageHead("Reports"), reportsPanel(ctx.user, org(ctx), again(ctx))),
  tests: (ctx) => h("div", {}, pageHead("Test catalogue", "Patients can only book tests you list here."), testsManager(ctx.user, org(ctx), again(ctx))),
  profile: (ctx) => h("div", {}, pageHead("Centre profile"), facilityProfile(ctx.user, org(ctx), again(ctx), "diagnostic")),
};
