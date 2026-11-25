// Diagnostic centre workspace.
import { h } from "../util.js";
import { db } from "../db.js";
import { provenance } from "../services.js";
import {
  pageHead,
  grid,
  stat,
  card,
  donut,
  provBadge,
  table,
  statusBadge,
  empty,
} from "../ui.js";
import {
  again,
  testsManager,
  requestsPanel,
  reportsPanel,
  facilityProfile,
  verificationNotice,
} from "./provider-shared.js";

const org = (ctx) => ctx.user.orgId ? db.get("orgs", ctx.user.orgId) : null;

export const nav = [
  { id: "overview", icon: "home", key: "nav.overview", label: "Overview" },
  { id: "requests", icon: "calendar", label: "Test requests" },
  { id: "reports", icon: "file", label: "Reports" },
  { id: "tests", icon: "flask", label: "Test catalogue" },
  { id: "profile", icon: "building", label: "Centre profile" },
];

export const strings = {
  "dg.title": {
    te: "డయాగ్నస్టిక్ కేంద్రం",
    hi: "जाँच केंद्र",
    ta: "பரிசோதனை மையம்",
  },
};

function missingOrganisation() {
  return h(
    "div",
    {},
    pageHead("Diagnostic centre"),
    empty(
      "No diagnostic centre is linked to this account. Contact the platform administrator to link your organisation."
    )
  );
}

function getBookings(o) {
  if (!o) return [];
  return db
    .where("diagBookings", (booking) => booking.orgId === o.id)
    .sort((a, b) =>
      `${b.date || ""}${b.slot || ""}`.localeCompare(
        `${a.date || ""}${a.slot || ""}`
      )
    );
}

export const routes = {
  overview(ctx) {
    const o = org(ctx);
    if (!o) return missingOrganisation();

    const bookings = getBookings(o);
    const count = (status) =>
      bookings.filter((booking) => booking.status === status).length;

    const requested = count("requested");
    const confirmed = count("confirmed");
    const sampleCollected = count("sample_collected");
    const processing = count("processing");
    const reportReady = count("report_ready");
    const rejected = count("rejected");
    const cancelled = count("cancelled");

    const active =
      requested + confirmed + sampleCollected + processing;

    const recent = bookings.slice(0, 6);

    return h(
      "div",
      { class: "stack" },
      pageHead(
        o.name || "Diagnostic centre",
        "Diagnostic centre workspace",
        provBadge(provenance(o, o.updatedAt))
      ),
      verificationNotice(o),

      grid(
        4,
        stat(
          "New requests",
          requested,
          "Awaiting your confirmation",
          requested ? "warn" : ""
        ),
        stat("Confirmed", confirmed, "Appointments confirmed"),
        stat(
          "In progress",
          sampleCollected + processing,
          "Samples collected or processing"
        ),
        stat("Reports released", reportReady, "Available to patients", "ok")
      ),

      grid(
        2,
        card(
          { title: "Requests by status" },
          donut(
            [
              { label: "Requested", value: requested, tone: "warn" },
              { label: "Confirmed", value: confirmed, tone: "info" },
              {
                label: "Sample collected",
                value: sampleCollected,
                tone: "muted",
              },
              { label: "Processing", value: processing, tone: "info" },
              { label: "Report ready", value: reportReady, tone: "ok" },
              { label: "Rejected", value: rejected, tone: "danger" },
              { label: "Cancelled", value: cancelled, tone: "muted" },
            ],
            { center: bookings.length }
          )
        ),
        card(
          { title: "Work summary" },
          h(
            "div",
            { class: "stack" },
            h(
              "div",
              { class: "cluster" },
              h("strong", {}, "Open requests"),
              h("span", { class: "grow" }),
              h("strong", {}, String(active))
            ),
            h(
              "div",
              { class: "cluster" },
              h("span", {}, "Awaiting confirmation"),
              h("span", { class: "grow" }),
              h("strong", {}, String(requested))
            ),
            h(
              "div",
              { class: "cluster" },
              h("span", {}, "Awaiting report"),
              h("span", { class: "grow" }),
              h("strong", {}, String(confirmed + sampleCollected + processing))
            ),
            h(
              "div",
              { class: "cluster" },
              h("span", {}, "Reports released"),
              h("span", { class: "grow" }),
              h("strong", {}, String(reportReady))
            )
          )
        )
      ),

      card(
        {
          title: "Recent test requests",
          sub: "Latest requests received by this diagnostic centre.",
        },
        table(
          [
            {
              h: "Reference",
              f: (booking) => booking.ref || "—",
              cls: "nowrap",
            },
            {
              h: "Patient",
              f: (booking) => booking.forName || "—",
            },
            {
              h: "Test",
              f: (booking) => booking.testName || "—",
            },
            {
              h: "Date",
              f: (booking) =>
                booking.date
                  ? new Date(`${booking.date}T00:00:00`).toLocaleDateString()
                  : "—",
              cls: "nowrap",
            },
            {
              h: "Status",
              f: (booking) => statusBadge(booking.status),
            },
          ],
          recent,
          {
            empty:
              "No test requests have been received by this centre yet.",
            label: "Recent diagnostic test requests",
          }
        )
      ),

      h(
        "p",
        { class: "muted small" },
        "Request and report figures reflect records currently stored in this prototype. They are not independently verified operational statistics."
      )
    );
  },

  requests(ctx) {
    const o = org(ctx);
    if (!o) return missingOrganisation();

    return h(
      "div",
      {},
      pageHead("Test requests", "Review and manage patient test requests."),
      verificationNotice(o),
      requestsPanel(ctx.user, o, again(ctx))
    );
  },

  reports(ctx) {
    const o = org(ctx);
    if (!o) return missingOrganisation();

    return h(
      "div",
      {},
      pageHead("Reports", "Prepare and release diagnostic reports."),
      verificationNotice(o),
      reportsPanel(ctx.user, o, again(ctx))
    );
  },

  tests(ctx) {
    const o = org(ctx);
    if (!o) return missingOrganisation();

    return h(
      "div",
      {},
      pageHead(
        "Test catalogue",
        "Manage the tests and services patients can find and request."
      ),
      verificationNotice(o),
      testsManager(ctx.user, o, again(ctx))
    );
  },

  profile(ctx) {
    const o = org(ctx);
    if (!o) return missingOrganisation();

    return h(
      "div",
      {},
      pageHead("Centre profile", "Manage your diagnostic centre information."),
      verificationNotice(o),
      facilityProfile(ctx.user, o, again(ctx), "diagnostic")
    );
  },
};
