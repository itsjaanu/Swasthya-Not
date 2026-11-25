// Medical camp organizer workspace.
import { h, icon, ago, fmtDate, isoDay, groupBy, sum } from "../util.js";
import { db, audit, notify, notifyRole } from "../db.js";
import { DISTRICTS } from "../seed.js";
import {
  card, stat, grid, table, form, modal, toast, badge, statusBadge,
  pageHead, empty, notice, btn, meter, barChart, kv, confirmDialog
} from "../ui.js";
import { getPosition } from "../map.js";
import { t } from "../i18n.js";

const mk = rows =>
  Object.fromEntries(rows.map(([k, te, hi, ta]) => [k, { te, hi, ta }]));

export const strings = mk([
  ["og.nav.camps", "నా శిబిరాలు", "मेरे शिविर", "என் முகாம்கள்"],
  ["og.title.overview", "శిబిరాల సారాంశం", "शिविर अवलोकन", "முகாம் கண்ணோட்டம்"],
  ["og.title.camps", "వైద్య శిబిరాలు", "चिकित्सा शिविर", "மருத்துவ முகாம்கள்"],
  ["og.new", "కొత్త శిబిరం", "नया शिविर", "புதிய முகாம்"],
  ["og.regs", "నమోదులు", "पंजीकरण", "பதிவுகள்"],
  ["og.report", "నివేదిక", "रिपोर्ट", "அறிக்கை"],
  ["og.edit", "సవరించండి", "संपादित करें", "திருத்து"],
  ["og.title.regs", "నమోదులు & హాజరు", "पंजीकरण व उपस्थिति", "பதிவுகள் & வருகை"],
  ["og.title.report", "శిబిరం నివేదిక", "शिविर रिपोर्ट", "முகாம் அறிக்கை"],
  ["og.attended", "హాజరయ్యారు", "उपस्थित", "வந்தவர்"],
  ["og.noshow", "రాలేదు", "अनुपस्थित", "வரவில்லை"],
  ["og.walkin", "వాక్-ఇన్ జోడించండి", "वॉक-इन जोड़ें", "நேரடி பதிவு சேர்"],
  ["og.csv", "CSV ఎగుమతి", "CSV निर्यात", "CSV ஏற்றுமதி"],
  ["og.myloc", "నా స్థానం ఉపయోగించండి", "मेरी लोकेशन उपयोग करें", "என் இருப்பிடத்தைப் பயன்படுத்து"],
  ["og.cancelCamp", "శిబిరం రద్దు", "शिविर रद्द करें", "முகாமை ரத்து செய்"]
]);

export const nav = [
  { id: "overview", icon: "home", key: "nav.overview", label: "Overview" },
  { id: "camps", icon: "tent", key: "og.nav.camps", label: "My camps" }
];

export const css = `
.og-camp{display:grid;gap:.5rem}
.og-meta{display:flex;gap:.9rem;flex-wrap:wrap;font-size:.86rem;color:var(--ink-2)}
.og-meta span{display:inline-flex;gap:.3rem;align-items:center}
`;

const SERVICES = [
  "BP & sugar",
  "Anaemia screening",
  "Eye check",
  "Dental check",
  "Women's health",
  "Gynaecology screening",
  "Child health & vaccination",
  "Nutrition counselling",
  "Diet education",
  "TB / respiratory screening",
  "Mental health counselling",
  "Referral desk"
];

const mine = user => db.where("camps", camp => camp.organizerId === user.id);
const regsOf = id => db.where("campRegs", reg => reg.campId === id);
const activeRegs = id => regsOf(id).filter(reg => reg.status !== "cancelled");

function csv(name, rows) {
  const content = rows
    .map(row =>
      row.map(value =>
        `"${String(value ?? "").replace(/"/g, '""')}"`
      ).join(",")
    )
    .join("\n");

  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" })
  );
  const anchor = h("a", { href: url, download: name });

  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const campStatusNote = {
  pending_approval: "Waiting for administrator approval — not visible to citizens yet.",
  published: "Visible to citizens.",
  rejected: "Not approved.",
  draft: "Draft.",
  completed: "Completed.",
  cancelled: "Cancelled."
};

async function overview(ctx) {
  const camps = mine(ctx.user);
  const registrations = camps.flatMap(camp => activeRegs(camp.id));
  const attended = registrations.filter(reg => reg.status === "attended");

  const upcoming = camps
    .filter(camp => camp.status === "published" && camp.date >= isoDay())
    .sort((a, b) => a.date.localeCompare(b.date));

  const byDistrict = Object.entries(
    groupBy(
      camps.filter(camp => !["cancelled", "rejected"].includes(camp.status)),
      camp => camp.district
    )
  ).map(([district, districtCamps]) => ({
    label: district,
    value: sum(
      districtCamps,
      camp => activeRegs(camp.id).length
    ),
    display:
      `${sum(districtCamps, camp => activeRegs(camp.id).length)} reg · ` +
      `${districtCamps.length} camp${districtCamps.length > 1 ? "s" : ""}`
  }));

  return h(
    "div",
    {},
    pageHead(
      t("og.title.overview", "Camp overview"),
      ctx.user.name,
      btn(
        t("og.new", "New camp"),
        () => ctx.go("camps/new"),
        "primary",
        "plus"
      )
    ),
    camps.some(camp => camp.status === "pending_approval")
      ? notice(
          "warn",
          "Some camps are waiting for administrator approval. Citizens only see published camps."
        )
      : null,
    grid(
      4,
      stat("Camps", camps.length, `${upcoming.length} upcoming`),
      stat("Registrations", registrations.length, "excluding cancelled"),
      stat(
        "Attended",
        attended.length,
        registrations.length
          ? `${Math.round(attended.length / registrations.length * 100)}% of registered`
          : ""
      ),
      stat(
        "Awaiting approval",
        camps.filter(camp => camp.status === "pending_approval").length,
        "",
        camps.some(camp => camp.status === "pending_approval") ? "warn" : ""
      )
    ),
    h(
      "div",
      { class: "split", style: { marginTop: "1rem" } },
      card(
        { title: "Upcoming camps" },
        upcoming.length
          ? h(
              "div",
              { class: "list" },
              upcoming.map(camp =>
                h(
                  "div",
                  { class: "row" },
                  h(
                    "div",
                    { class: "grow" },
                    h("div", { class: "title" }, camp.title),
                    h(
                      "small",
                      { class: "muted" },
                      `${fmtDate(camp.date)} · ${camp.village}, ${camp.district}`
                    )
                  ),
                  h(
                    "div",
                    { style: { width: "120px" } },
                    meter(
                      activeRegs(camp.id).length,
                      camp.capacity,
                      "Registrations"
                    ),
                    h(
                      "small",
                      { class: "muted" },
                      `${activeRegs(camp.id).length}/${camp.capacity}`
                    )
                  ),
                  btn(
                    t("og.regs", "Registrations"),
                    () => ctx.go(`camps/${camp.id}/regs`),
                    "sm"
                  )
                )
              )
            )
          : empty(
              "No upcoming published camps.",
              btn(
                t("og.new", "New camp"),
                () => ctx.go("camps/new"),
                "primary sm"
              )
            )
      ),
      card(
        { title: "Coverage by district" },
        byDistrict.length
          ? barChart(byDistrict)
          : empty("Coverage appears once you have camps.")
      )
    )
  );
}

async function camps(ctx) {
  const { param, rest } = ctx;

  if (param === "new") return editor(ctx, null);

  if (param) {
    const camp = db.get("camps", param);

    if (!camp || camp.organizerId !== ctx.user.id) {
      return empty("Camp not found.");
    }

    const subroute = rest[0];

    if (subroute === "edit") return editor(ctx, camp);
    if (subroute === "regs") return regsView(ctx, camp);
    if (subroute === "report") return reportView(ctx, camp);
  }

  const list = mine(ctx.user).sort(
    (a, b) => b.date.localeCompare(a.date)
  );

  return h(
    "div",
    {},
    pageHead(
      t("og.title.camps", "Medical camps"),
      "Camps need administrator approval before citizens can see them.",
      btn(
        t("og.new", "New camp"),
        () => ctx.go("camps/new"),
        "primary",
        "plus"
      )
    ),
    list.length
      ? h(
          "div",
          { class: "grid g-auto" },
          list.map(camp => campCard(ctx, camp))
        )
      : empty(
          "You have not created a camp yet.",
          btn(
            t("og.new", "New camp"),
            () => ctx.go("camps/new"),
            "primary"
          )
        )
  );
}

function campCard(ctx, camp) {
  const count = activeRegs(camp.id).length;
  const editable = ["pending_approval", "published", "draft"].includes(camp.status);

  return card(
    {
      cls:
        "og-camp" +
        (camp.status === "pending_approval"
          ? " warnc"
          : camp.status === "published"
            ? " accent"
            : "")
    },
    h(
      "div",
      { class: "spread" },
      h("h3", {}, camp.title),
      statusBadge(camp.status)
    ),
    h(
      "div",
      { class: "og-meta" },
      h(
        "span",
        {},
        icon("calendar", 14),
        `${fmtDate(camp.date)} ${camp.start}–${camp.end}`
      ),
      h(
        "span",
        {},
        icon("pin", 14),
        `${camp.village}, ${camp.mandal}, ${camp.district}`
      )
    ),
    h("p", { class: "small muted" }, campStatusNote[camp.status] || ""),
    camp.rejectReason
      ? notice("danger", "Reason: " + camp.rejectReason)
      : null,
    h(
      "div",
      {},
      meter(count, camp.capacity, "Registrations"),
      h("small", { class: "muted" }, `${count} of ${camp.capacity} registered`)
    ),
    h(
      "div",
      { class: "cluster", style: { marginTop: ".7rem" } },
      btn(
        t("og.regs", "Registrations"),
        () => ctx.go(`camps/${camp.id}/regs`),
        "sm"
      ),
      editable
        ? btn(
            t("og.edit", "Edit"),
            () => ctx.go(`camps/${camp.id}/edit`),
            "sm"
          )
        : null,
      ["published", "completed"].includes(camp.status)
        ? btn(
            t("og.report", "Report"),
            () => ctx.go(`camps/${camp.id}/report`),
            "sm"
          )
        : null,
      editable
        ? btn(
            t("og.cancelCamp", "Cancel camp"),
            async () => {
              const confirmed = await confirmDialog(
                `Cancel “${camp.title}”? ${count} registered people will be notified.`,
                "Cancel camp",
                true
              );

              if (!confirmed) return;

              db.update("camps", camp.id, { status: "cancelled" });
              audit("camp.cancelled", camp.title, "");

              activeRegs(camp.id).forEach(reg => {
                if (!reg.citizenId) return;

                notify(reg.citizenId, {
                  title: "Camp cancelled",
                  body: `${camp.title} on ${fmtDate(camp.date)} has been cancelled.`,
                  link: "#/app/camps",
                  type: "camp",
                  channels: ["inapp", "sms"]
                });
              });

              toast("Camp cancelled");
              ctx.refresh();
            },
            "sm ghost"
          )
        : null
    )
  );
}

function editor(ctx, camp) {
  const user = ctx.user;

  const editorForm = form(
    [
      {
        name: "title",
        label: "Camp title",
        required: true,
        wide: true,
        value: camp?.title
      },
      {
        name: "description",
        label: "What will happen at the camp",
        type: "textarea",
        wide: true,
        value: camp?.description
      },
      {
        name: "district",
        label: "District",
        type: "select",
        required: true,
        options: DISTRICTS.map(district => district.name),
        value: camp?.district || user.district
      },
      {
        name: "mandal",
        label: "Mandal",
        required: true,
        value: camp?.mandal || user.mandal
      },
      {
        name: "village",
        label: "Village / town",
        required: true,
        value: camp?.village
      },
      {
        name: "venue",
        label: "Venue",
        required: true,
        value: camp?.venue
      },
      {
        name: "lat",
        label: "Latitude",
        type: "number",
        step: "any",
        value: camp?.lat,
        hint: "Used for the map. Optional."
      },
      {
        name: "lng",
        label: "Longitude",
        type: "number",
        step: "any",
        value: camp?.lng
      },
      {
        name: "date",
        label: "Date",
        type: "date",
        required: true,
        min: camp ? undefined : isoDay(),
        value: camp?.date
      },
      {
        name: "capacity",
        label: "Capacity (people)",
        type: "number",
        min: 1,
        required: true,
        value: camp?.capacity ?? 100
      },
      {
        name: "start",
        label: "Start time",
        type: "time",
        required: true,
        value: camp?.start || "09:00"
      },
      {
        name: "end",
        label: "End time",
        type: "time",
        required: true,
        value: camp?.end || "14:00"
      },
      {
        name: "services",
        label: "Services offered",
        type: "multiselect",
        options: SERVICES,
        wide: true,
        value: camp?.services || []
      },
      {
        name: "doctors",
        label: "Participating doctors and health staff",
        type: "textarea",
        wide: true,
        hint: "One name per line, with speciality, e.g. Dr. A (General).",
        value: (camp?.doctors || []).join("\n")
      }
    ],
    {
      submitLabel: camp ? "Save changes" : "Submit for approval",
      onCancel: () => ctx.go("camps"),
      onSubmit: values => {
        if (values.end <= values.start) {
          throw new Error("End time must be after the start time.");
        }

        if (!values.services.length) {
          throw new Error("Choose at least one service.");
        }

        if (!Number.isInteger(values.capacity) || values.capacity < 1) {
          throw new Error("Capacity must be a whole number of 1 or more.");
        }

        const hasLatitude = values.lat !== "" && values.lat != null;
        const hasLongitude = values.lng !== "" && values.lng != null;

        if (hasLatitude !== hasLongitude) {
          throw new Error("Enter both latitude and longitude, or leave both blank.");
        }

        if (
          hasLatitude &&
          (
            values.lat < 8 ||
            values.lat > 22 ||
            values.lng < 74 ||
            values.lng > 88
          )
        ) {
          throw new Error("Coordinates are outside Andhra Pradesh. Check latitude and longitude.");
        }

        const body = {
          ...values,
          lat: hasLatitude ? Number(values.lat) : null,
          lng: hasLongitude ? Number(values.lng) : null,
          doctors: values.doctors
            .split("\n")
            .map(name => name.trim())
            .filter(Boolean)
        };

        if (camp) {
          const needsApproval =
            camp.status === "published" || camp.status === "rejected";

          db.update("camps", camp.id, {
            ...body,
            status: needsApproval ? "pending_approval" : camp.status,
            rejectReason: ""
          });

          audit(
            "camp.edited",
            values.title,
            needsApproval ? "re-submitted for approval" : ""
          );

          if (needsApproval) {
            notifyRole("admin", {
              title: "Camp changes need approval",
              body: values.title,
              link: "#/app/approvals",
              type: "approval"
            });
          }

          toast(
            needsApproval
              ? "Saved — sent for approval again"
              : "Saved"
          );
        } else {
          const created = db.insert("camps", {
            organizerId: user.id,
            ...body,
            status: "pending_approval",
            demo: !!user.demo
          });

          audit("camp.created", created.title, created.district);

          notifyRole("admin", {
            title: "New medical camp awaiting approval",
            body: `${created.title} · ${created.district} · ${created.date}`,
            link: "#/app/approvals",
            type: "approval"
          });

          toast("Camp submitted for approval");
        }

        ctx.go("camps");
      }
    }
  );

  const locationButton = btn(
    t("og.myloc", "Use my location"),
    async () => {
      try {
        const position = await getPosition();
        editorForm.els.lat.value = position.lat.toFixed(5);
        editorForm.els.lng.value = position.lng.toFixed(5);
        toast("Location filled in");
      } catch (error) {
        toast(error.message, "danger");
      }
    },
    "sm",
    "navi"
  );

  editorForm.els.lng.closest(".field").after(
    h("div", { class: "field wide" }, locationButton)
  );

  return h(
    "div",
    {},
    pageHead(
      camp ? "Edit camp" : t("og.new", "New camp"),
      camp?.status === "published"
        ? "This camp is live. Saving changes sends it back for approval."
        : "Citizens see your camp after the administrator approves it."
    ),
    card({}, editorForm)
  );
}

async function regsView(ctx, camp) {
  const registrations = regsOf(camp.id).sort(
    (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")
  );
  const active = registrations.filter(reg => reg.status !== "cancelled");

  const walkInForm = form(
    [{ name: "name", label: "Walk-in name", required: true }],
    {
      submitLabel: t("og.walkin", "Add walk-in"),
      onSubmit: values => {
        if (camp.capacity && active.length >= camp.capacity) {
          throw new Error("This camp is full.");
        }

        const name = values.name.trim();

        if (
          active.some(
            reg => (reg.forName || "").toLowerCase() === name.toLowerCase()
          )
        ) {
          throw new Error("This person is already registered.");
        }

        db.insert("campRegs", {
          campId: camp.id,
          citizenId: null,
          forName: name,
          status: "attended",
          walkIn: true
        });

        audit("camp.walkin", camp.title, name);
        toast("Walk-in recorded as attended");
        ctx.refresh();
      }
    }
  );

  const markAttendance = (reg, status) => {
    db.update("campRegs", reg.id, { status });
    audit("camp.attendance", camp.title, `${reg.forName}: ${status}`);
    ctx.refresh();
  };

  return h(
    "div",
    {},
    pageHead(
      t("og.title.regs", "Registrations & attendance"),
      `${camp.title} · ${fmtDate(camp.date)}`,
      btn("Back", () => ctx.go("camps"), "", "x"),
      btn(
        t("og.csv", "Export CSV"),
        () =>
          csv(
            `camp-${camp.id}.csv`,
            [
              ["Name", "Status", "Walk-in", "Registered"],
              ...registrations.map(reg => [
                reg.forName,
                reg.status,
                reg.walkIn ? "yes" : "no",
                reg.createdAt
              ])
            ]
          ),
        "",
        "download"
      )
    ),
    grid(
      4,
      stat("Registered", active.length, `capacity ${camp.capacity}`),
      stat(
        t("og.attended", "Attended"),
        active.filter(reg => reg.status === "attended").length,
        "",
        "ok"
      ),
      stat(
        t("og.noshow", "No-show"),
        registrations.filter(reg => reg.status === "no_show").length
      ),
      stat("Seats left", Math.max(0, camp.capacity - active.length))
    ),
    h(
      "div",
      { style: { margin: "1rem 0" } },
      meter(active.length, camp.capacity, "Capacity used")
    ),
    h(
      "div",
      { class: "split" },
      card(
        {},
        table(
          [
            {
              h: "Name",
              f: reg =>
                h(
                  "span",
                  {},
                  reg.forName,
                  reg.walkIn
                    ? h(
                        "span",
                        { style: { marginLeft: ".4rem" } },
                        badge("Walk-in", "info")
                      )
                    : null
                )
            },
            {
              h: "Status",
              f: reg => statusBadge(reg.status)
            },
            {
              h: "Registered",
              f: reg => ago(reg.createdAt)
            },
            {
              h: "Attendance",
              f: reg =>
                reg.status === "cancelled"
                  ? "—"
                  : h(
                      "div",
                      { class: "cluster" },
                      btn(
                        t("og.attended", "Attended"),
                        () => markAttendance(reg, "attended"),
                        "sm"
                      ),
                      btn(
                        t("og.noshow", "No-show"),
                        () => markAttendance(reg, "no_show"),
                        "sm ghost"
                      )
                    )
            }
          ],
          registrations,
          { empty: "No registrations yet." }
        )
      ),
      card(
        { title: t("og.walkin", "Add walk-in") },
        walkInForm,
        h(
          "p",
          { class: "small muted" },
          "Record only the name — do not enter health details here."
        )
      )
    )
  );
}

async function reportView(ctx, camp) {
  const active = activeRegs(camp.id);
  const attended = active.filter(reg => reg.status === "attended").length;
  const completed = camp.status === "completed";

  return h(
    "div",
    {},
    pageHead(
      t("og.title.report", "Camp report"),
      `${camp.title} · ${fmtDate(camp.date)}`,
      btn("Back", () => ctx.go("camps"), "", "x")
    ),
    completed
      ? notice(
          "ok",
          "Report submitted. You can still update the figures below."
        )
      : null,
    camp.date > isoDay()
      ? notice(
          "warn",
          "This camp has not happened yet. Submit the report after the camp day."
        )
      : null,
    card(
      {},
      form(
        [
          {
            name: "attended",
            label: "People attended",
            type: "number",
            min: 0,
            required: true,
            value: camp.report?.attended ?? attended,
            hint: `Recorded attendance: ${attended}`
          },
          {
            name: "referred",
            label: "People referred to a facility",
            type: "number",
            min: 0,
            required: true,
            value: camp.report?.referred ?? 0
          },
          {
            name: "notes",
            label: "Summary, issues and follow-up needed",
            type: "textarea",
            wide: true,
            required: true,
            value: camp.report?.notes,
            hint: "Do not include names or health details of individuals."
          }
        ],
        {
          submitLabel: completed
            ? "Update report"
            : "Submit report and complete camp",
          onSubmit: values => {
            if (
              !Number.isInteger(values.attended) ||
              !Number.isInteger(values.referred) ||
              values.attended < 0 ||
              values.referred < 0
            ) {
              throw new Error("Counts must be whole numbers, 0 or more.");
            }

            if (values.referred > values.attended) {
              throw new Error("Referred cannot be more than attended.");
            }

            if (camp.date > isoDay()) {
              throw new Error("A report can only be submitted after the camp date.");
            }

            db.update("camps", camp.id, {
              status: "completed",
              report: {
                attended: values.attended,
                referred: values.referred,
                notes: values.notes.trim(),
                submittedAt: new Date().toISOString()
              }
            });

            audit(
              "camp.report",
              camp.title,
              `${values.attended} attended, ${values.referred} referred`
            );

            notifyRole(
              "district",
              {
                title: "Camp report submitted",
                body: `${camp.title} · ${camp.district}`,
                type: "camp"
              },
              districtUser => districtUser.district === camp.district
            );

            toast("Report submitted");
            ctx.go("camps");
          }
        }
      )
    )
  );
}

export const routes = {
  overview,
  camps
};
