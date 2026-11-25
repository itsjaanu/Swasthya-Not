// Hospital / facility workspace: beds, admissions, appointments, doctors, emergency, diagnostics, profile.
import { h, fmtDate, ago, isoDay, addDays } from "../util.js";
import { db, audit } from "../db.js";
import {
  provenance, bedRows, bedTotals, setBeds, ADM_FLOW, ADM_LABEL,
  setAdmissionStatus, EM_LABEL, emergencyAck, emergencyReady,
  emergencyArrived, isStale
} from "../services.js";
import { BED_CATS } from "../seed.js";
import {
  pageHead, grid, stat, card, table, statusBadge, provBadge,
  empty, notice, btn, form, modal, toast, meter, barChart,
  donut, timeline, kv, confirmDialog
} from "../ui.js";
import {
  again, askNote, apptActions, periodOptions, scheduleEditor,
  scheduleSummary, testsManager, facilityProfile, verificationNotice
} from "./provider-shared.js";
import { t } from "../i18n.js";

const org = (ctx) => db.get("orgs", ctx.user.orgId);

const safeOrg = (ctx) => {
  const facility = org(ctx);
  if (!facility) {
    return notice(
      "danger",
      h("strong", {}, "Facility profile unavailable. "),
      "This account is not linked to a facility. Contact an administrator."
    );
  }
  return null;
};

export const nav = [
  { id: "overview", icon: "home", key: "nav.overview", label: "Overview" },
  { id: "beds", icon: "bed", key: "nav.beds", label: "Beds" },
  { id: "admissions", icon: "folder", key: "nav.admissions", label: "Admission requests" },
  { id: "appointments", icon: "calendar", key: "nav.appointments", label: "Appointments" },
  { id: "doctors", icon: "stethoscope", key: "nav.doctors", label: "Doctors" },
  { id: "emergency", icon: "siren", key: "nav.emergency", label: "Emergency inbound" },
  { id: "diagnostics", icon: "flask", label: "Diagnostics" },
  { id: "analytics", icon: "chart", key: "nav.analytics", label: "Analytics" },
  { id: "profile", icon: "building", label: "Hospital profile" }
];

export const strings = {
  "hs.beds": {
    te: "పడకల నిర్వహణ",
    hi: "बिस्तर प्रबंधन",
    ta: "படுக்கை மேலாண்மை"
  },
  "hs.update": {
    te: "అప్‌డేట్ చేయండి",
    hi: "अपडेट करें",
    ta: "புதுப்பி"
  }
};

export const routes = {
  overview(ctx) {
    const missing = safeOrg(ctx);
    if (missing) return h("div", { class: "stack" }, pageHead("Hospital overview"), missing);

    const o = org(ctx);
    const bt = bedTotals(o);
    const adm = db.where("admissions", a => a.orgId === o.id);
    const ap = db.where("appointments", a => a.orgId === o.id);
    const em = db.where(
      "emergencies",
      e => e.hospitalId === o.id &&
        !["closed", "cancelled", "arrived"].includes(e.status)
    );

    return h(
      "div",
      { class: "stack" },
      pageHead(
        o.name,
        "Hospital operations",
        provBadge(provenance(o, bt.updatedAt), bt.updatedAt)
      ),
      verificationNotice(o),
      isStale(bt.updatedAt)
        ? notice(
            "warn",
            h("strong", {}, "Bed data is out of date. "),
            "Patients and ambulance crews see it flagged as outdated. ",
            btn("Update beds", () => ctx.go("beds"), "sm primary")
          )
        : null,
      em.length
        ? notice(
            "danger",
            h("strong", {}, `${em.length} inbound emergency notification(s). `),
            btn("Open", () => ctx.go("emergency"), "sm primary")
          )
        : null,
      grid(
        4,
        stat("Beds available", bt.available, `of ${bt.total} total`, "ok"),
        stat(
          "Admission requests to review",
          adm.filter(a =>
            ["submitted", "received", "under_review", "info_requested"].includes(a.status)
          ).length,
          "",
          "warn"
        ),
        stat(
          "Appointments to confirm",
          ap.filter(a => a.status === "requested").length,
          "",
          "warn"
        ),
        stat("Occupied", bt.occupied, `${bt.unavailable} temporarily unavailable`)
      ),
      card(
        { title: "Capacity by category" },
        bedRows(o).length
          ? bedRows(o).map(r =>
              h(
                "div",
                {
                  class: "row",
                  style: {
                    display: "grid",
                    gridTemplateColumns: "120px 1fr 150px",
                    gap: ".8rem",
                    alignItems: "center",
                    padding: ".3rem 0"
                  }
                },
                r.label,
                meter(
                  r.occupied + (r.unavailable || 0),
                  r.total,
                  r.label + " occupancy"
                ),
                h("span", { class: "small" }, `${r.available} free · ${ago(r.updatedAt)}`)
              )
            )
          : empty("No bed categories have been configured yet.")
      )
    );
  },

  beds(ctx) {
    const missing = safeOrg(ctx);
    if (missing) return h("div", { class: "stack" }, pageHead("Bed management"), missing);

    const o = org(ctx);
    const rows = bedRows(o);
    const refresh = again(ctx);

    const addCat = () => {
      const options = BED_CATS
        .filter(([key]) => !o.beds?.[key])
        .map(([value, label]) => ({ value, label }));

      if (!options.length) {
        toast("All available bed categories have been added.");
        return;
      }

      modal("Add bed category", close =>
        form(
          [
            {
              name: "k",
              label: "Category",
              type: "select",
              required: true,
              options
            },
            {
              name: "total",
              label: "Total beds",
              type: "number",
              min: 0,
              step: 1,
              required: true
            }
          ],
          {
            onCancel: close,
            onSubmit: v => {
              try {
                const total = Number(v.total);
                if (!Number.isInteger(total) || total < 0) {
                  throw new Error("Enter a whole number of beds.");
                }
                setBeds(ctx.user, o, v.k, {
                  total,
                  occupied: 0,
                  unavailable: 0
                });
                close();
                refresh();
              } catch (e) {
                toast(e.message, "danger");
              }
            }
          }
        )
      );
    };

    return h(
      "div",
      { class: "stack" },
      pageHead(
        t("hs.beds", "Bed management"),
        "Available = total − occupied − temporarily unavailable. Every change is timestamped and audited.",
        btn("Add category", addCat, "", "plus")
      ),
      notice(
        "info",
        "Enter current figures only. This prototype stores updates on this device; it does not publish live hospital capacity to a central service."
      ),
      card(
        {},
        table(
          [
            {
              h: "Category",
              f: r => h("strong", {}, r.label)
            },
            ...["total", "occupied", "unavailable"].map(k => ({
              h: k[0].toUpperCase() + k.slice(1),
              f: r =>
                h("input", {
                  type: "number",
                  min: 0,
                  step: 1,
                  value: r[k] || 0,
                  "aria-label": `${r.label} ${k}`,
                  style: { width: "90px" },
                  dataset: { cat: r.key, f: k }
                })
            })),
            {
              h: "Available",
              f: r => h("b", {}, r.available)
            },
            {
              h: "Last updated",
              f: r => `${ago(r.updatedAt)}${r.by ? " by " + r.by : ""}`
            },
            {
              h: "",
              f: r =>
                btn(
                  t("hs.update", "Update"),
                  e => {
                    const row = e.target.closest("tr");
                    const get = key => row.querySelector(`[data-f=${key}]`)?.value;
                    try {
                      const values = {
                        total: Number(get("total")),
                        occupied: Number(get("occupied")),
                        unavailable: Number(get("unavailable"))
                      };

                      if (Object.values(values).some(n => !Number.isInteger(n) || n < 0)) {
                        throw new Error("Enter whole numbers (0 or more).");
                      }

                      setBeds(ctx.user, o, r.key, values);
                      toast(`${r.label} beds updated.`);
                      refresh();
                    } catch (ex) {
                      toast(ex.message, "danger");
                    }
                  },
                  "sm primary"
                )
            }
          ],
          rows,
          {
            empty: "No bed categories yet. Add one to record capacity.",
            label: "Beds"
          }
        )
      )
    );
  },

  admissions(ctx) {
    const missing = safeOrg(ctx);
    if (missing) return h("div", { class: "stack" }, pageHead("Admission requests"), missing);

    const o = org(ctx);
    const list = db
      .where("admissions", a => a.orgId === o.id)
      .sort(
        (a, b) =>
          (a.urgency === "urgent" ? -1 : 0) -
            (b.urgency === "urgent" ? -1 : 0) ||
          (b.createdAt || "").localeCompare(a.createdAt || "")
      );

    const open = a =>
      modal(`${a.ref} · ${a.forName}`, close => {
        const move = async status => {
          let message = "";

          if (["rejected", "info_requested", "accepted"].includes(status)) {
            message = await askNote(
              ADM_LABEL[status],
              status === "accepted"
                ? "Instructions for the patient (where to report, documents, timing)"
                : status === "rejected"
                  ? "Reason"
                  : "What information do you need?",
              { submitLabel: "Send to patient" }
            );

            if (message === null) return;
          }

          let extra = {};
          if (status === "discharged") {
            const summary = await askNote(
              "Discharge information",
              "Discharge summary / instructions",
              { submitLabel: "Discharge" }
            );
            if (summary === null) return;
            extra = { dischargeSummary: summary };
          }

          try {
            setAdmissionStatus(ctx.user, a.id, status, message, extra);
            toast("Admission request updated.");
            close();
            again(ctx)();
          } catch (e) {
            toast(e.message, "danger");
          }
        };

        return h(
          "div",
          { class: "stack" },
          a.urgency === "urgent"
            ? notice(
                "warn",
                "Marked urgent by the patient. Online requests are not emergency care. Patients with urgent symptoms should seek immediate in-person help."
              )
            : null,
          kv([
            ["Department", a.department],
            ["Category", a.category],
            ["Urgency", a.urgency],
            ["Reason", a.reason],
            ["Documents", (a.docs || []).map(d => d.name).join(", ") || "None"],
            [
              "Current capacity",
              bedRows(o).map(r => `${r.label}: ${r.available}`).join(" · ") || "Not recorded"
            ]
          ]),
          notice(
            "info",
            "Accepting an admission request is not a bed guarantee unless a bed is separately allocated. State the arrangements clearly in your instructions."
          ),
          h(
            "div",
            { class: "cluster" },
            (ADM_FLOW[a.status] || []).map(status =>
              btn(
                ADM_LABEL[status],
                () => move(status),
                status === "rejected" ? "sm" : "sm primary"
              )
            ),
            !(ADM_FLOW[a.status] || []).length
              ? h("span", { class: "muted small" }, "No further actions.")
              : null
          ),
          h("h3", {}, "Timeline"),
          timeline((a.history || []).map(x => ({ ...x, text: x.text }))),
          (a.messages || []).length
            ? [
                h("h3", {}, "Messages"),
                a.messages.map(m =>
                  h(
                    "p",
                    { class: "small" },
                    h("b", {}, m.from + ": "),
                    m.text
                  )
                )
              ]
            : null
        );
      }, { wide: true });

    return h(
      "div",
      { class: "stack" },
      pageHead(
        t("nav.admissions", "Admission requests"),
        "Review, respond and track each request. Patients are notified when a status changes."
      ),
      card(
        {},
        table(
          [
            { h: "Ref", f: a => a.ref, cls: "nowrap" },
            { h: "Patient", f: a => a.forName },
            { h: "Dept", f: a => a.department },
            {
              h: "Urgency",
              f: a =>
                a.urgency === "urgent"
                  ? h("span", { class: "badge warn" }, "Urgent")
                  : "Routine"
            },
            { h: "Status", f: a => statusBadge(a.status) },
            { h: "Received", f: a => ago(a.createdAt) },
            {
              h: "",
              f: a => btn("Open", () => open(a), "sm primary")
            }
          ],
          list,
          { empty: "No admission requests yet." }
        )
      )
    );
  },

  appointments(ctx) {
    const missing = safeOrg(ctx);
    if (missing) return h("div", { class: "stack" }, pageHead("Appointments"), missing);

    const o = org(ctx);
    let period = "week";
    const box = h("div", {});

    const draw = () => {
      box.replaceChildren();

      const end =
        period === "today"
          ? isoDay()
          : period === "week"
            ? isoDay(addDays(new Date(), 7))
            : "9999-12-31";

      const list = db
        .where(
          "appointments",
          a =>
            a.orgId === o.id &&
            a.date <= end &&
            (period === "all" || a.date >= isoDay())
        )
        .sort((a, b) =>
          (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))
        );

      box.append(
        h(
          "div",
          { class: "filters" },
          h(
            "div",
            { class: "field" },
            h("label", {}, "Show"),
            h(
              "select",
              {
                onchange: e => {
                  period = e.target.value;
                  draw();
                }
              },
              periodOptions.map(([value, label]) =>
                h("option", { value, selected: value === period }, label)
              )
            )
          )
        ),
        table(
          [
            {
              h: "When",
              f: a => `${fmtDate(a.date)} ${a.time || ""}`,
              cls: "nowrap"
            },
            { h: "Patient", f: a => a.forName },
            {
              h: "Doctor",
              f: a => db.get("doctors", a.doctorId)?.name || "Not assigned"
            },
            { h: "Reason", f: a => a.reason || "—" },
            { h: "Status", f: a => statusBadge(a.status) },
            {
              h: "",
              f: a => apptActions(ctx.user, a, again(ctx))
            }
          ],
          list,
          { empty: "No appointments in this period." }
        )
      );
    };

    draw();

    return h(
      "div",
      { class: "stack" },
      pageHead(
        t("nav.appointments", "Appointments"),
        "Confirm or decline appointment requests. Patients are notified of changes."
      ),
      card({}, box)
    );
  },

  doctors(ctx) {
    const missing = safeOrg(ctx);
    if (missing) return h("div", { class: "stack" }, pageHead("Doctors"), missing);

    const o = org(ctx);
    const docs = db.where("doctors", d => d.orgId === o.id);

    const edit = doctor =>
      modal(doctor ? "Edit doctor" : "Add doctor", close => {
        let schedule;

        const editor = form(
          [
            { name: "name", label: "Name", required: true },
            {
              name: "spec",
              label: "Department",
              type: "select",
              required: true,
              options: o.depts?.length ? o.depts : ["General Medicine"]
            },
            {
              name: "fee",
              label: "Consultation fee (₹)",
              type: "number",
              min: 0
            },
            { name: "regNo", label: "Registration no." }
          ],
          {
            initial: doctor || {},
            onCancel: close,
            onSubmit: values => {
              const name = values.name.trim();
              if (!name) throw new Error("Enter the doctor's name.");

              const scheduleData = schedule.get();

              if (doctor) {
                db.update("doctors", doctor.id, {
                  ...values,
                  name,
                  schedule: scheduleData
                });
              } else {
                db.insert("doctors", {
                  ...values,
                  name,
                  schedule: scheduleData,
                  orgId: o.id,
                  languages: [],
                  verified: false,
                  demo: !!ctx.user.demo
                });
              }

              audit("doctor.saved", name, "", ctx.user);
              toast("Doctor details saved.");
              close();
              again(ctx)();
            }
          }
        );

        schedule = scheduleEditor(doctor?.schedule || []);
        editor.insertBefore(
          h(
            "div",
            { class: "field wide" },
            h("label", {}, "Weekly schedule"),
            schedule.el
          ),
          editor.querySelector(".form-actions")
        );

        return editor;
      }, { wide: true });

    return h(
      "div",
      { class: "stack" },
      pageHead(
        t("nav.doctors", "Doctors"),
        "Doctors listed here may appear on the facility profile.",
        btn("Add doctor", () => edit(), "primary", "plus")
      ),
      card(
        {},
        table(
          [
            {
              h: "Doctor",
              f: d =>
                h(
                  "div",
                  {},
                  h("strong", {}, d.name),
                  h("div", { class: "small muted" }, d.spec)
                )
            },
            {
              h: "Schedule",
              f: d => scheduleSummary(d.schedule)
            },
            {
              h: "Account",
              f: d => d.userId ? statusBadge("verified") : "No account"
            },
            {
              h: "",
              f: d =>
                h(
                  "div",
                  { class: "cluster" },
                  btn("Edit", () => edit(d), "sm"),
                  btn(
                    "Remove",
                    async () => {
                      if (
                        await confirmDialog(
                          `Remove ${d.name} from this facility?`,
                          "Remove",
                          true
                        )
                      ) {
                        db.remove("doctors", d.id);
                        audit("doctor.removed", d.name, "", ctx.user);
                        again(ctx)();
                      }
                    },
                    "sm"
                  )
                )
            }
          ],
          docs,
          { empty: "No doctors have been added yet." }
        )
      )
    );
  },

  emergency(ctx) {
    const missing = safeOrg(ctx);
    if (missing) return h("div", { class: "stack" }, pageHead("Inbound emergencies"), missing);

    const o = org(ctx);
    const list = db
      .where("emergencies", e => e.hospitalId === o.id)
      .sort((a, b) =>
        (b.createdAt || "").localeCompare(a.createdAt || "")
      );

    const refresh = again(ctx);

    const wrap = fn => async () => {
      try {
        await fn();
        refresh();
      } catch (e) {
        toast(e.message, "danger");
      }
    };

    return h(
      "div",
      { class: "stack" },
      pageHead(
        "Inbound emergencies",
        "Notifications from ambulance operators. Readiness is shown to the crew only after the hospital confirms resources are ready."
      ),
      notice(
        "warn",
        "This prototype does not contact emergency services or dispatch an ambulance. For an actual emergency, use local emergency numbers."
      ),
      list.length
        ? list.map(e =>
            card(
              {
                title: `${e.ref} · ${e.patient?.triage?.toUpperCase() || "TRIAGE NOT SET"} · ${e.patient?.age ?? "?"}${e.patient?.sex || ""}`,
                sub: e.patient?.complaint || "No complaint supplied",
                actions: [statusBadge(e.status)],
                cls: e.status === "notified" ? "dangerc" : ""
              },
              kv([
                [
                  "ETA",
                  e.etaMin != null
                    ? `${e.etaMin} min (crew-reported)`
                    : "Not provided"
                ],
                ["Needs", (e.needs || []).join(", ") || "—"],
                [
                  "Dispatch confirmed by operator",
                  e.dispatched ? "Yes" : "Not confirmed"
                ],
                ["Status", EM_LABEL[e.status] || e.status || "Unknown"]
              ]),
              h(
                "div",
                { class: "cluster", style: { margin: ".8rem 0" } },
                e.status === "notified"
                  ? btn(
                      "Acknowledge",
                      wrap(() => emergencyAck(ctx.user, e.id)),
                      "primary"
                    )
                  : null,
                ["acknowledged", "resources_ready", "notified"].includes(e.status)
                  ? btn(
                      "Resources ready",
                      wrap(async () => {
                        if (e.status === "resources_ready") {
                          toast("Resources have already been marked ready.");
                          return;
                        }

                        const note = await askNote(
                          "Confirm resources ready",
                          "What is ready? (for example, bay or team)",
                          { submitLabel: "Confirm ready" }
                        );

                        if (note === null) return;
                        emergencyReady(ctx.user, e.id, note);
                      }),
                      ""
                    )
                  : null,
                ["acknowledged", "resources_ready"].includes(e.status)
                  ? btn(
                      "Patient arrived",
                      wrap(() => emergencyArrived(ctx.user, e.id)),
                      ""
                    )
                  : null
              ),
              timeline(e.timeline || [])
            )
          )
        : card(
            {},
            empty("No emergency notifications. They appear here when an ambulance operator selects this hospital.")
          )
    );
  },

  diagnostics(ctx) {
    const missing = safeOrg(ctx);
    if (missing) return h("div", { class: "stack" }, pageHead("Diagnostic services"), missing);

    return h(
      "div",
      { class: "stack" },
      pageHead(
        "Diagnostic services",
        "Manage the tests and services listed on your facility profile."
      ),
      testsManager(ctx.user, org(ctx), again(ctx))
    );
  },

  analytics(ctx) {
    const missing = safeOrg(ctx);
    if (missing) return h("div", { class: "stack" }, pageHead("Analytics"), missing);

    const o = org(ctx);
    const appointments = db.where("appointments", a => a.orgId === o.id);
    const admissions = db.where("admissions", a => a.orgId === o.id);

    const byStatus = records =>
      Object.entries(
        records.reduce((counts, item) => {
          const key = item.status || "unknown";
          counts[key] = (counts[key] || 0) + 1;
          return counts;
        }, {})
      ).map(([label, value]) => ({
        label: label.replace(/_/g, " "),
        value
      }));

    const days = [...Array(7)].map((_, index) =>
      isoDay(addDays(new Date(), index))
    );

    const beds = bedRows(o);

    return h(
      "div",
      { class: "stack" },
      pageHead(
        t("nav.analytics", "Analytics"),
        "These summaries are computed from records stored in this prototype."
      ),
      grid(
        2,
        card(
          { title: "Bed occupancy" },
          beds.length
            ? barChart(
                beds.map(r => ({
                  label: r.label,
                  value: r.occupied + (r.unavailable || 0),
                  display: `${r.occupied + (r.unavailable || 0)}/${r.total}`
                })),
                { max: Math.max(1, ...beds.map(r => r.total)) }
              )
            : empty("No bed capacity data recorded.")
        ),
        card(
          { title: "Appointments by status" },
          donut(byStatus(appointments), { center: appointments.length })
        )
      ),
      grid(
        2,
        card(
          { title: "Admission requests by status" },
          admissions.length
            ? barChart(byStatus(admissions))
            : empty("No admission requests yet.")
        ),
        card(
          { title: "Next 7 days: appointments" },
          barChart(
            days.map(day => ({
              label: fmtDate(day),
              value: appointments.filter(
                a => a.date === day && a.status !== "cancelled"
              ).length
            }))
          )
        )
      )
    );
  },

  profile(ctx) {
    const missing = safeOrg(ctx);
    if (missing) return h("div", { class: "stack" }, pageHead("Hospital profile"), missing);

    return h(
      "div",
      { class: "stack" },
      pageHead(
        "Hospital profile",
        "Keep your facility information accurate. Verification is required before public listing."
      ),
      verificationNotice(org(ctx)),
      facilityProfile(ctx.user, org(ctx), again(ctx), "hospital")
    );
  }
};
