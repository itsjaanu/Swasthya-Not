// Shared building blocks for provider workspaces (hospital, diagnostic centre, doctor).
import { h, clear, fmtDate, isoDay, ago } from "../util.js";
import { db, audit } from "../db.js";
import {
  TEST_CATALOG,
  DISTRICTS,
  FACILITY_TYPES,
  DEPARTMENTS
} from "../seed.js";
import {
  setApptStatus,
  setBookingStatus,
  releaseReport,
  DGN_LABEL
} from "../services.js";
import {
  statusBadge,
  card,
  empty,
  notice,
  btn,
  table,
  form,
  modal,
  toast,
  confirmDialog,
  fileToData,
  kv,
  badge
} from "../ui.js";
import { getPosition } from "../map.js";
import { t } from "../i18n.js";

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

export const DAY_SHORT = DAY_NAMES.map(day => day.slice(0, 3));

export const again = ctx => () => {
  ctx._keepScroll = true;
  ctx.refresh();
};

export const scheduleSummary = (schedule = []) =>
  schedule.length
    ? [...schedule]
        .sort(
          (a, b) =>
            a.day - b.day ||
            a.start.localeCompare(b.start)
        )
        .map(
          row =>
            `${DAY_SHORT[row.day]} ${row.start}–${row.end} (${row.slotMins} min)`
        )
        .join("; ")
    : "No schedule set";

const hhmm = value => {
  if (!/^\d{2}:\d{2}$/.test(value || "")) return NaN;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) return NaN;
  return hours * 60 + minutes;
};

// Ask for a free-text note in a modal.
// Resolves to the note, or null if cancelled.
export function askNote(
  title,
  label,
  {
    required = true,
    submitLabel = "Continue",
    hint = ""
  } = {}
) {
  return new Promise(resolve => {
    let done = false;

    modal(
      title,
      close =>
        form(
          [
            {
              name: "note",
              label,
              type: "textarea",
              required,
              wide: true,
              hint
            }
          ],
          {
            submitLabel,
            onSubmit: values => {
              const note = (values.note || "").trim();

              if (required && !note) {
                throw new Error("Please enter a message.");
              }

              done = true;
              close();
              resolve(note);
            },
            onCancel: () => {
              done = true;
              close();
              resolve(null);
            }
          }
        ),
      {
        onClose: () => {
          if (!done) resolve(null);
        }
      }
    );
  });
}

// Weekly availability editor.
// get() validates and returns [{day,start,end,slotMins}].
export function scheduleEditor(initial = []) {
  const rows = initial.map(row => ({ ...row }));
  const list = h("div", {});

  const draw = () => {
    clear(list);

    if (!rows.length) {
      list.append(
        h(
          "p",
          { class: "muted small" },
          "No sessions yet. Add a session to open appointment slots."
        )
      );
    }

    rows.forEach((row, index) => {
      list.append(
        h(
          "div",
          {
            class: "cluster",
            style: { marginBottom: ".5rem" }
          },
          h(
            "select",
            {
              "aria-label": "Day",
              style: { width: "auto" },
              onchange: event => {
                row.day = Number(event.target.value);
              }
            },
            DAY_NAMES.map((name, day) =>
              h(
                "option",
                {
                  value: day,
                  selected: day === row.day
                },
                name
              )
            )
          ),
          h("input", {
            type: "time",
            "aria-label": "Start time",
            value: row.start,
            style: { width: "auto" },
            onchange: event => {
              row.start = event.target.value;
            }
          }),
          h("span", {}, "to"),
          h("input", {
            type: "time",
            "aria-label": "End time",
            value: row.end,
            style: { width: "auto" },
            onchange: event => {
              row.end = event.target.value;
            }
          }),
          h(
            "select",
            {
              "aria-label": "Minutes per appointment",
              style: { width: "auto" },
              onchange: event => {
                row.slotMins = Number(event.target.value);
              }
            },
            [10, 15, 20, 30, 45, 60].map(minutes =>
              h(
                "option",
                {
                  value: minutes,
                  selected: minutes === row.slotMins
                },
                `${minutes} min`
              )
            )
          ),
          h(
            "button",
            {
              type: "button",
              class: "btn sm ghost",
              "aria-label": "Remove session",
              onclick: () => {
                rows.splice(index, 1);
                draw();
              }
            },
            "Remove"
          )
        )
      );
    });
  };

  draw();

  const el = h(
    "div",
    {},
    list,
    h(
      "button",
      {
        type: "button",
        class: "btn sm",
        onclick: () => {
          rows.push({
            day: 1,
            start: "09:00",
            end: "13:00",
            slotMins: 15
          });
          draw();
        }
      },
      "+ Add session"
    )
  );

  return {
    el,

    get() {
      for (const row of rows) {
        if (
          !Number.isInteger(Number(row.day)) ||
          Number(row.day) < 0 ||
          Number(row.day) > 6
        ) {
          throw new Error("Choose a valid day for every session.");
        }

        const start = hhmm(row.start);
        const end = hhmm(row.end);
        const slotMins = Number(row.slotMins);

        if (!Number.isFinite(start) || !Number.isFinite(end)) {
          throw new Error("Enter valid start and end times for every session.");
        }

        if (
          !Number.isInteger(slotMins) ||
          ![10, 15, 20, 30, 45, 60].includes(slotMins)
        ) {
          throw new Error("Choose a valid appointment duration.");
        }

        if (end <= start) {
          throw new Error(
            `${DAY_NAMES[row.day]}: end time must be after start time.`
          );
        }

        if (end - start < slotMins) {
          throw new Error(
            `${DAY_NAMES[row.day]}: the session must be at least one appointment long.`
          );
        }
      }

      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          const first = rows[i];
          const second = rows[j];

          if (
            first.day === second.day &&
            hhmm(first.start) < hhmm(second.end) &&
            hhmm(second.start) < hhmm(first.end)
          ) {
            throw new Error(
              `${DAY_NAMES[first.day]}: two sessions overlap.`
            );
          }
        }
      }

      return rows.map(row => ({
        day: Number(row.day),
        start: row.start,
        end: row.end,
        slotMins: Number(row.slotMins)
      }));
    }
  };
}

// Action buttons for an appointment row.
export function apptActions(user, appointment, refresh) {
  const run = async (status, ask) => {
    let note = "";

    if (ask) {
      note = await askNote(
        ask.title,
        ask.label,
        {
          required: ask.required,
          submitLabel: ask.submit,
          hint: ask.hint
        }
      );

      if (note === null) return;
    }

    try {
      setApptStatus(user, appointment.id, status, note);
      toast("Appointment updated.");
      refresh();
    } catch (error) {
      toast(error.message, "danger");
    }
  };

  const actions = h("div", { class: "cluster" });

  if (appointment.status === "requested") {
    actions.append(
      btn(
        t("common.confirm", "Confirm"),
        () =>
          run("confirmed", {
            title: "Confirm appointment",
            label: "Message to patient (optional)",
            required: false,
            submit: "Confirm"
          }),
        "sm primary"
      ),
      btn(
        t("common.reject", "Reject"),
        () =>
          run("rejected", {
            title: "Reject appointment",
            label: "Reason (the patient will see this)",
            required: true,
            submit: "Reject"
          }),
        "sm"
      )
    );
  }

  if (appointment.status === "confirmed") {
    actions.append(
      btn(
        "Completed",
        () => run("completed"),
        "sm primary"
      ),
      btn(
        "Missed",
        () => run("no_show"),
        "sm"
      ),
      btn(
        t("common.cancelAppt", "Cancel"),
        () =>
          run("cancelled", {
            title: "Cancel appointment",
            label: "Reason (the patient will see this)",
            required: true,
            submit: "Cancel appointment"
          }),
        "sm"
      )
    );
  }

  return actions;
}

export const periodOptions = [
  ["today", "Today"],
  ["week", "Next 7 days"],
  ["all", "All dates"]
];

// -----------------------------------------------------------------------------
// Diagnostic test catalogue

export function testsManager(user, org, refresh) {
  org.tests ||= [];

  const save = message => {
    db.update("orgs", org.id, {
      tests: org.tests,
      updatedAt: new Date().toISOString()
    });

    audit("tests.updated", org.name, message, user);
    refresh();
  };

  const have = new Set(org.tests.map(test => test.code));
  const available = TEST_CATALOG.filter(
    test => !have.has(test.code)
  );

  const pickSelect = h(
    "select",
    { "aria-label": "Choose a standard test to add" },
    h("option", { value: "" }, "Add a standard test…"),
    available.map(test =>
      h(
        "option",
        { value: test.code },
        `${test.name} (${test.category})`
      )
    )
  );

  const testForm = (initial, onSubmit, onCancel, isNew) =>
    form(
      [
        {
          name: "code",
          label: "Test code",
          required: true,
          value: initial.code,
          hint: isNew
            ? "Short unique code, e.g. CBC"
            : "Code cannot be changed",
          wide: false
        },
        {
          name: "name",
          label: "Test name",
          required: true
        },
        {
          name: "category",
          label: "Category",
          type: "select",
          options: ["Blood", "Imaging", "Other"],
          required: true
        },
        {
          name: "price",
          label: "Price (₹)",
          type: "number",
          min: 0,
          required: true
        },
        {
          name: "tat",
          label: "Turnaround time",
          placeholder: "e.g. same day, 2 hours",
          required: true
        },
        {
          name: "fasting",
          label: "Fasting required",
          type: "checkbox"
        },
        {
          name: "available",
          label: "Currently available to book",
          type: "checkbox"
        }
      ],
      {
        initial,
        onSubmit,
        onCancel,
        submitLabel: t("common.save", "Save")
      }
    );

  const edit = test =>
    modal(
      "Edit test",
      close => {
        const editor = testForm(
          test,
          values => {
            if (!Number.isFinite(values.price) || values.price < 0) {
              throw new Error("Price cannot be negative.");
            }

            Object.assign(test, {
              name: values.name.trim(),
              category: values.category,
              price: values.price,
              tat: values.tat.trim(),
              fasting: values.fasting,
              available: values.available
            });

            close();
            save(`${test.code} edited`);
            toast("Test saved.");
          },
          close,
          false
        );

        editor.els.code.readOnly = true;
        return editor;
      }
    );

  const custom = () =>
    modal(
      "Add a custom test",
      close =>
        testForm(
          {
            available: true,
            category: "Blood"
          },
          values => {
            const code = values.code.trim().toUpperCase();

            if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
              throw new Error(
                "Use a short test code with letters, numbers, hyphens or underscores."
              );
            }

            if (org.tests.some(test => test.code === code)) {
              throw new Error("A test with this code already exists.");
            }

            if (!Number.isFinite(values.price) || values.price < 0) {
              throw new Error("Price cannot be negative.");
            }

            if (!values.name.trim() || !values.tat.trim()) {
              throw new Error("Enter a test name and turnaround time.");
            }

            org.tests.push({
              code,
              name: values.name.trim(),
              category: values.category,
              price: values.price,
              tat: values.tat.trim(),
              fasting: values.fasting,
              available: values.available
            });

            close();
            save(`${code} added`);
            toast("Test added.");
          },
          close,
          true
        )
    );

  return h(
    "div",
    {},
    h(
      "div",
      {
        class: "cluster",
        style: { marginBottom: "1rem" }
      },
      pickSelect,
      btn(
        "Add",
        () => {
          const code = pickSelect.value;

          if (!code) {
            return toast("Choose a test first.", "danger");
          }

          const test = TEST_CATALOG.find(
            item => item.code === code
          );

          if (!test) {
            return toast("That catalogue item could not be found.", "danger");
          }

          org.tests.push({ ...test });
          save(`${code} added`);
          toast("Test added.");
        },
        "primary sm"
      ),
      btn("Custom test…", custom, "sm")
    ),
    table(
      [
        {
          h: "Test",
          f: test =>
            h(
              "div",
              {},
              h("strong", {}, test.name),
              h(
                "div",
                { class: "muted small" },
                test.code
              )
            )
        },
        {
          h: "Category",
          f: test => test.category
        },
        {
          h: "Price",
          f: test => "₹" + test.price,
          cls: "nowrap"
        },
        {
          h: "Turnaround",
          f: test => test.tat
        },
        {
          h: "Fasting",
          f: test => test.fasting ? "Yes" : "No"
        },
        {
          h: "Bookable",
          f: test =>
            h(
              "button",
              {
                class: "btn sm " + (test.available ? "primary" : ""),
                "aria-pressed": !!test.available,
                onclick: () => {
                  test.available = !test.available;
                  save(
                    `${test.code} ${test.available ? "enabled" : "paused"}`
                  );
                }
              },
              test.available ? "Available" : "Paused"
            )
        },
        {
          h: "",
          f: test =>
            h(
              "div",
              { class: "cluster" },
              btn("Edit", () => edit(test), "sm"),
              btn(
                "Remove",
                async () => {
                  const confirmed = await confirmDialog(
                    `Remove ${test.name} from your catalogue? Existing bookings are not affected.`,
                    "Remove",
                    true
                  );

                  if (!confirmed) return;

                  org.tests.splice(org.tests.indexOf(test), 1);
                  save(`${test.code} removed`);
                },
                "sm"
              )
            )
        }
      ],
      org.tests,
      {
        empty:
          "No tests listed yet. Add standard tests above so patients can find and book them.",
        label: "Test catalogue"
      }
    )
  );
}

// -----------------------------------------------------------------------------
// Diagnostic requests and reports

const BOOKING_STATUSES = [
  "requested",
  "confirmed",
  "sample_collected",
  "processing",
  "report_ready",
  "rejected",
  "cancelled"
];

export function requestsPanel(user, org, refresh) {
  let filter = "open";
  const box = h("div", {});

  const bookings = () =>
    db
      .where(
        "diagBookings",
        booking => booking.orgId === org.id
      )
      .sort((a, b) =>
        (a.date + a.slot).localeCompare(b.date + b.slot) * -1
      );

  const act = async (booking, status, ask) => {
    let note = "";

    if (ask) {
      note = await askNote(
        ask.title,
        ask.label,
        {
          required: ask.required,
          submitLabel: ask.submit,
          hint: ask.hint
        }
      );

      if (note === null) return;
    }

    try {
      setBookingStatus(user, booking.id, status, note);
      toast("Request updated.");
      refresh();
    } catch (error) {
      toast(error.message, "danger");
    }
  };

  const actions = booking => {
    const controls = h("div", { class: "cluster" });

    if (booking.status === "requested") {
      controls.append(
        btn(
          t("common.confirm", "Confirm"),
          () =>
            act(booking, "confirmed", {
              title: "Confirm test",
              label:
                "Instructions for the patient (fasting, what to bring) — optional",
              required: false,
              submit: "Confirm"
            }),
          "sm primary"
        ),
        btn(
          "Decline",
          () =>
            act(booking, "rejected", {
              title: "Decline test request",
              label: "Reason (the patient will see this)",
              required: true,
              submit: "Decline"
            }),
          "sm"
        )
      );
    }

    if (booking.status === "confirmed") {
      controls.append(
        btn(
          "Sample collected",
          () => act(booking, "sample_collected"),
          "sm"
        ),
        btn(
          "Start processing",
          () => act(booking, "processing"),
          "sm"
        )
      );
    }

    if (booking.status === "sample_collected") {
      controls.append(
        btn(
          "Start processing",
          () => act(booking, "processing"),
          "sm"
        )
      );
    }

    if (
      ["confirmed", "sample_collected", "processing"].includes(
        booking.status
      )
    ) {
      controls.append(
        btn(
          "Enter report",
          () => releaseModal(user, booking, refresh),
          "sm primary"
        )
      );
    }

    if (booking.status === "report_ready" && booking.reportId) {
      controls.append(
        btn(
          t("common.view", "View"),
          () => viewReport(booking),
          "sm"
        )
      );
    }

    return controls;
  };

  const draw = () => {
    clear(box);

    const all = bookings();

    const list = all.filter(booking =>
      filter === "all"
        ? true
        : filter === "open"
          ? [
              "requested",
              "confirmed",
              "sample_collected",
              "processing"
            ].includes(booking.status)
          : booking.status === filter
    );

    box.append(
      h(
        "div",
        { class: "filters" },
        h(
          "div",
          { class: "field" },
          h("label", { for: "rq-f" }, "Show"),
          h(
            "select",
            {
              id: "rq-f",
              onchange: event => {
                filter = event.target.value;
                draw();
              }
            },
            [
              ["open", "Open requests"],
              ["all", "All"],
              ...BOOKING_STATUSES.map(status => [
                status,
                DGN_LABEL[status] || status
              ])
            ].map(([value, label]) =>
              h(
                "option",
                {
                  value,
                  selected: value === filter
                },
                label
              )
            )
          )
        )
      ),
      table(
        [
          {
            h: "Ref",
            f: booking =>
              h("span", { class: "nowrap" }, booking.ref),
            cls: "nowrap"
          },
          {
            h: "Patient",
            f: booking => booking.forName
          },
          {
            h: "Test",
            f: booking =>
              h(
                "div",
                {},
                booking.testName,
                booking.doctorNote
                  ? h(
                      "div",
                      { class: "muted small" },
                      "Note: " + booking.doctorNote
                    )
                  : null
              )
          },
          {
            h: "When",
            f: booking =>
              `${fmtDate(booking.date)} · ${booking.slot}`,
            cls: "nowrap"
          },
          {
            h: "Status",
            f: booking => statusBadge(booking.status)
          },
          {
            h: "",
            f: actions
          }
        ],
        list,
        {
          empty:
            filter === "open"
              ? "No open test requests. New requests from patients appear here."
              : "No requests match this filter.",
          label: "Test requests"
        }
      )
    );
  };

  draw();
  return box;
}

function viewReport(booking) {
  const record = db.get("records", booking.reportId);

  if (!record) {
    return toast("Report record not found.", "danger");
  }

  modal(
    record.title,
    h(
      "div",
      { class: "stack" },
      kv([
        ["Patient", record.subjectName],
        ["Date", fmtDate(record.date)],
        ["Booking", booking.ref]
      ]),
      h(
        "pre",
        {
          style: {
            whiteSpace: "pre-wrap",
            font: "inherit",
            background: "var(--muted-bg)",
            padding: ".8rem",
            borderRadius: "8px",
            margin: 0
          }
        },
        record.content
      ),
      record.attachment
        ? h(
            "a",
            {
              class: "btn sm",
              href: record.attachment.data,
              download: record.attachment.name
            },
            "Download " + record.attachment.name
          )
        : null
    ),
    { wide: true }
  );
}

function releaseModal(user, booking, refresh) {
  modal(
    `Report — ${booking.testName} · ${booking.forName}`,
    close =>
      h(
        "div",
        {},
        notice(
          "info",
          "The report is released to the patient's own records. The patient decides which doctors can see it. Release only reports checked by qualified laboratory staff."
        ),
        form(
          [
            {
              name: "result",
              label: "Findings / result",
              type: "textarea",
              rows: 6,
              required: true,
              wide: true,
              hint: "Include values and reference ranges."
            },
            {
              name: "file",
              label: "Attach report file (optional)",
              type: "file",
              accept: ".pdf,image/*",
              wide: true,
              hint: "Up to 400 KB in this prototype."
            }
          ],
          {
            submitLabel: "Release report to patient",
            onCancel: close,
            onSubmit: async values => {
              const result = (values.result || "").trim();

              if (!result) {
                throw new Error("Enter the report findings before release.");
              }

              const file = await fileToData(values.file);

              if (file?.size > 400 * 1024) {
                throw new Error("The attachment must be 400 KB or smaller.");
              }

              try {
                releaseReport(user, booking.id, {
                  result,
                  file
                });

                close();
                toast("Report released to the patient.");
                refresh();
              } catch (error) {
                toast(error.message, "danger");
              }
            }
          }
        )
      ),
    { wide: true }
  );
}

export function reportsPanel(user, org, refresh) {
  const mine = db.where(
    "diagBookings",
    booking => booking.orgId === org.id
  );

  const pending = mine.filter(booking =>
    ["confirmed", "sample_collected", "processing"].includes(
      booking.status
    )
  );

  const done = mine.filter(
    booking => booking.status === "report_ready"
  );

  return h(
    "div",
    { class: "stack" },
    card(
      {
        title: "Waiting for a report",
        sub: "Enter findings once testing is complete."
      },
      table(
        [
          {
            h: "Ref",
            f: booking => booking.ref,
            cls: "nowrap"
          },
          {
            h: "Patient",
            f: booking => booking.forName
          },
          {
            h: "Test",
            f: booking => booking.testName
          },
          {
            h: "Status",
            f: booking => statusBadge(booking.status)
          },
          {
            h: "",
            f: booking =>
              btn(
                "Enter report",
                () => releaseModal(user, booking, refresh),
                "sm primary"
              )
          }
        ],
        pending,
        {
          empty: "Nothing is waiting for a report.",
          label: "Waiting for report"
        }
      )
    ),
    card(
      { title: "Released reports" },
      table(
        [
          {
            h: "Ref",
            f: booking => booking.ref,
            cls: "nowrap"
          },
          {
            h: "Patient",
            f: booking => booking.forName
          },
          {
            h: "Test",
            f: booking => booking.testName
          },
          {
            h: "Released",
            f: booking =>
              fmtDate(
                booking.history?.[booking.history.length - 1]?.at,
                true
              ),
            cls: "nowrap"
          },
          {
            h: "",
            f: booking =>
              btn(
                t("common.view", "View"),
                () => viewReport(booking),
                "sm"
              )
          }
        ],
        done,
        {
          empty: "No reports have been released yet.",
          label: "Released reports"
        }
      )
    )
  );
}

// -----------------------------------------------------------------------------
// Facility profile

const SERVICE_OPTS = [
  "xray",
  "ct",
  "mri",
  "ultrasound",
  "lab",
  "pharmacy",
  "blood bank",
  "dialysis",
  "cath lab",
  "ambulance"
];

export function facilityProfile(user, org, refresh, kind) {
  const isHospital = kind === "hospital";

  const fields = [
    {
      name: "name",
      label: "Facility name",
      required: true,
      wide: true
    },
    ...(isHospital
      ? [
          {
            name: "type",
            label: "Facility type",
            type: "select",
            required: true,
            options: [
              "govt_hospital",
              "private_hospital",
              "chc",
              "phc",
              "other"
            ].map(value => ({
              value,
              label: FACILITY_TYPES[value] || value
            }))
          }
        ]
      : []),
    {
      name: "district",
      label: t("common.district", "District"),
      type: "select",
      required: true,
      options: DISTRICTS.map(district => district.name)
    },
    {
      name: "mandal",
      label: "Mandal"
    },
    {
      name: "address",
      label: "Address",
      wide: true,
      required: true
    },
    {
      name: "pin",
      label: "PIN code",
      pattern: "[0-9]{6}",
      inputmode: "numeric",
      hint: "6 digits"
    },
    {
      name: "phone",
      label: "Phone",
      type: "tel"
    },
    ...(isHospital
      ? [
          {
            name: "emergencyPhone",
            label: "Emergency phone",
            type: "tel"
          }
        ]
      : [
          {
            name: "licenceNo",
            label: "Licence / registration no."
          }
        ]),
    {
      name: "hours",
      label: "Operating hours",
      placeholder: "Mon–Sat 9:00–17:00",
      wide: true
    },
    ...(isHospital
      ? [
          {
            name: "emergency24x7",
            label: "24×7 emergency service is available",
            type: "checkbox"
          },
          {
            name: "depts",
            label: "Departments",
            type: "multiselect",
            options: DEPARTMENTS,
            wide: true
          },
          {
            name: "services",
            label: "Facilities & services",
            type: "multiselect",
            options: [
              ...new Set([
                ...SERVICE_OPTS,
                ...(org.services || [])
              ])
            ].map(value => ({
              value,
              label: value
            })),
            wide: true
          }
        ]
      : []),
    {
      name: "lat",
      label: "Latitude",
      type: "number",
      step: "any",
      min: 8,
      max: 22
    },
    {
      name: "lng",
      label: "Longitude",
      type: "number",
      step: "any",
      min: 74,
      max: 88
    }
  ];

  const editor = form(
    fields,
    {
      initial: { ...org },
      submitLabel: "Save profile",
      onSubmit: values => {
        if (!values.name.trim()) {
          throw new Error("Enter the facility name.");
        }

        if (values.pin && !/^\d{6}$/.test(values.pin)) {
          throw new Error("PIN code must be 6 digits.");
        }

        const hasLat =
          values.lat !== "" &&
          values.lat !== null &&
          values.lat !== undefined;

        const hasLng =
          values.lng !== "" &&
          values.lng !== null &&
          values.lng !== undefined;

        if (hasLat !== hasLng) {
          throw new Error(
            "Enter both latitude and longitude, or leave both blank."
          );
        }

        const lat = hasLat ? Number(values.lat) : null;
        const lng = hasLng ? Number(values.lng) : null;

        if (
          hasLat &&
          (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < 8 ||
            lat > 22 ||
            lng < 74 ||
            lng > 88
          )
        ) {
          throw new Error(
            "Enter valid Andhra Pradesh coordinates."
          );
        }

        const patch = {
          ...values,
          name: values.name.trim(),
          lat,
          lng,
          updatedAt: new Date().toISOString()
        };

        if (isHospital) {
          patch.depts = values.depts || [];
          patch.services = values.services || [];
        }

        db.update("orgs", org.id, patch);

        audit(
          "org.updated",
          org.name,
          Object.keys(values).join(", "),
          user
        );

        toast("Profile saved.");
        refresh();
      }
    }
  );

  const locationButton = btn(
    "Use my current location",
    async () => {
      try {
        const position = await getPosition();

        editor.els.lat.value = position.lat.toFixed(5);
        editor.els.lng.value = position.lng.toFixed(5);

        toast(
          "Location filled in. Save the profile to keep it."
        );
      } catch (error) {
        toast(error.message, "danger");
      }
    },
    "sm",
    "pin"
  );

  return card(
    {
      title: "Facility profile",
      sub:
        "Patients see this information in the public directory once your facility is verified.",
      actions: [locationButton]
    },
    editor
  );
}

export const verificationNotice = org =>
  org.verification === "verified"
    ? null
    : notice(
        org.verification === "rejected" ? "danger" : "warn",
        h(
          "strong",
          {},
          org.verification === "rejected"
            ? "Facility verification was not approved. "
            : "Facility verification is pending. "
        ),
        "Until the platform administrator verifies your facility it is hidden from the public directory, and patients cannot book or send requests to it."
      );

export { badge, ago };
