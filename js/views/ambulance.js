// Ambulance operator console: register emergency → rank hospitals → notify → track.
// Dispatch confirmation is available only after hospital acknowledgement.
// Never claims hospital readiness unless the hospital confirms it.

import { h, km, ago } from "../util.js";
import { db } from "../db.js";
import { DISTRICTS, districtByName } from "../seed.js";
import {
  rankHospitals,
  createEmergency,
  confirmDispatch,
  notifyHospital,
  emergencyEta,
  emergencyClose,
  NEEDS,
  EM_LABEL,
  provenance,
  bedTotals
} from "../services.js";
import {
  pageHead,
  card,
  table,
  statusBadge,
  provBadge,
  notice,
  btn,
  form,
  toast,
  timeline,
  kv
} from "../ui.js";
import { getPosition } from "../map.js";
import { again } from "./provider-shared.js";

const org = (ctx) => db.get("orgs", ctx.user.orgId);

export const nav = [
  { id: "console", icon: "siren", key: "nav.emergency", label: "Emergency console" },
  { id: "history", icon: "log", label: "History" },
  { id: "fleet", icon: "truck", label: "Fleet" }
];

export const strings = {};

export const routes = {
  console(ctx) {
    const o = org(ctx);
    const r = again(ctx);

    let gpsPosition = null;

    const active = db.where(
      "emergencies",
      e => e.orgId === o.id &&
        !["closed", "cancelled"].includes(e.status)
    );

    const newForm = form([
      {
        name: "vehicleId",
        label: "Vehicle",
        type: "select",
        required: true,
        options: (o.vehicles || []).map(v => ({
          value: v.id,
          label: `${v.plate} (${v.type})`
        }))
      },
      {
        name: "age",
        label: "Patient age",
        type: "number",
        min: 0,
        max: 120
      },
      {
        name: "sex",
        label: "Sex",
        type: "select",
        options: ["M", "F", "O"]
      },
      {
        name: "triage",
        label: "Triage level (crew assessment)",
        type: "select",
        required: true,
        options: ["critical", "serious", "stable"]
      },
      {
        name: "complaint",
        label: "Main problem",
        required: true,
        wide: true
      },
      {
        name: "needs",
        label: "Resources likely needed",
        type: "multiselect",
        options: NEEDS.map(([value, label]) => ({
          value,
          label
        })),
        wide: true
      },
      {
        name: "district",
        label: "Pickup district",
        type: "select",
        required: true,
        options: DISTRICTS.map(d => d.name),
        value: o.district
      },
      {
        name: "place",
        label: "Pickup place",
        required: true
      },
      {
        name: "consent",
        label: "Patient / caregiver informed that details are shared with the receiving hospital (or patient unable to respond — emergency data rule).",
        type: "checkbox",
        required: true,
        wide: true
      }
    ], {
      submitLabel: "Register emergency",

      onSubmit: async v => {
        const district = districtByName(v.district);

        const location = gpsPosition
          ? {
              lat: gpsPosition.lat,
              lng: gpsPosition.lng,
              label: `${v.place}, ${v.district}`
            }
          : {
              lat: district.lat,
              lng: district.lng,
              label: `${v.place}, ${v.district}`
            };

        createEmergency(ctx.user, {
          vehicleId: v.vehicleId,
          patient: {
            age: v.age,
            sex: v.sex,
            triage: v.triage,
            complaint: v.complaint
          },
          location,
          needs: v.needs || []
        });

        toast(
          gpsPosition
            ? "Emergency registered with device GPS coordinates."
            : "Emergency registered using the district-centre location estimate."
        );

        r();
      }
    });

    const gps = btn(
      "Use device GPS for pickup",
      async () => {
        try {
          const position = await getPosition();
          gpsPosition = position;

          toast(
            `Pickup GPS captured: ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`
          );
        } catch (e) {
          toast(e.message, "danger");
        }
      },
      "sm",
      "pin"
    );

    return h(
      "div",
      { class: "stack" },

      pageHead("Emergency console", o.name),

      notice(
        "warn",
        "This tool coordinates with hospitals. It does not replace the 108 control room. Hospital acknowledgement and resource readiness must be confirmed by hospital staff. This prototype does not contact real emergency services."
      ),

      active.length
        ? active.map(e => caseCard(ctx, e, r))
        : null,

      card(
        {
          title: "Register a new emergency",
          actions: [gps]
        },
        newForm
      )
    );
  },

  history(ctx) {
    const cases = db.where(
      "emergencies",
      e =>
        e.orgId === ctx.user.orgId &&
        ["closed", "cancelled"].includes(e.status)
    );

    return h(
      "div",
      { class: "stack" },

      pageHead("History"),

      card(
        {},
        table(
          [
            {
              h: "Ref",
              f: e => e.ref
            },
            {
              h: "Problem",
              f: e => e.patient.complaint
            },
            {
              h: "Hospital",
              f: e =>
                db.get("orgs", e.hospitalId)?.name || "—"
            },
            {
              h: "Status",
              f: e => statusBadge(e.status)
            },
            {
              h: "Opened",
              f: e => ago(e.createdAt)
            }
          ],
          cases,
          {
            empty: "No closed cases."
          }
        )
      )
    );
  },

  fleet(ctx) {
    const o = org(ctx);
    const r = again(ctx);

    return h(
      "div",
      { class: "stack" },

      pageHead("Fleet"),

      card(
        {},
        table(
          [
            {
              h: "Plate",
              f: v => v.plate
            },
            {
              h: "Type",
              f: v => v.type
            },
            {
              h: "Status",
              f: v =>
                h(
                  "select",
                  {
                    onchange: e => {
                      v.status = e.target.value;

                      db.update("orgs", o.id, {
                        vehicles: o.vehicles
                      });
                    }
                  },

                  ["available", "on_call", "out_of_service"].map(
                    status =>
                      h(
                        "option",
                        {
                          value: status,
                          selected: status === v.status
                        },
                        status.replace("_", " ")
                      )
                  )
                )
            }
          ],
          o.vehicles || [],
          {
            empty: "No vehicles."
          }
        )
      ),

      card(
        {
          title: "Add vehicle"
        },

        form(
          [
            {
              name: "plate",
              label: "Registration plate",
              required: true
            },
            {
              name: "type",
              label: "Type",
              type: "select",
              options: ["BLS", "ALS"],
              required: true
            }
          ],
          {
            onSubmit: v => {
              const vehicles = [
                ...(o.vehicles || []),
                {
                  id: "veh_" + Date.now(),
                  plate: v.plate.toUpperCase(),
                  type: v.type,
                  status: "available"
                }
              ];

              db.update("orgs", o.id, {
                vehicles
              });

              r();
            }
          }
        )
      )
    );
  }
};

function caseCard(ctx, e, r) {
  const hospital =
    e.hospitalId && db.get("orgs", e.hospitalId);

  const wrap = fn => () => {
    try {
      fn();
      r();
    } catch (error) {
      toast(error.message, "danger");
    }
  };

  let body;

  if (!hospital) {
    const ranked = rankHospitals(e.location, e.needs);

    body = h(
      "div",
      { class: "stack" },

      h("h3", {}, "Suggested hospitals — you choose"),

      h(
        "p",
        { class: "small muted" },
        "Suggestions are ranked using distance estimates, listed emergency services, matching departments and reported bed information. Bed information may be outdated or unverified. Always contact the hospital directly."
      ),

      ranked.map(candidate => {
        const totals = bedTotals(candidate.org);

        return h(
          "div",
          { class: "fac" },

          h(
            "div",
            { class: "spread" },

            h("h3", {}, candidate.org.name),

            provBadge(
              provenance(candidate.org, totals.updatedAt),
              totals.updatedAt
            )
          ),

          h(
            "div",
            { class: "small" },
            `${km(candidate.distKm)} · estimated ${candidate.etaMin} min · ${candidate.org.district}`
          ),

          candidate.reasons.length
            ? h(
                "div",
                {
                  class: "small",
                  style: { color: "var(--ok)" }
                },
                "✓ " + candidate.reasons.join(" · ")
              )
            : null,

          candidate.warns.length
            ? h(
                "div",
                {
                  class: "small",
                  style: { color: "var(--warn)" }
                },
                "⚠ " + candidate.warns.join(" · ")
              )
            : null,

          h(
            "div",
            { class: "cluster" },

            btn(
              "Notify this hospital",
              wrap(() =>
                notifyHospital(
                  ctx.user,
                  e.id,
                  candidate.org.id,
                  candidate.etaMin
                )
              ),
              "sm primary"
            ),

            candidate.org.emergencyPhone
              ? h(
                  "a",
                  {
                    class: "btn sm",
                    href:
                      "tel:" +
                      candidate.org.emergencyPhone.replace(
                        /[^+\d]/g,
                        ""
                      )
                  },
                  "Call emergency department"
                )
              : null
          )
        );
      })
    );
  } else {
    const hospitalAcknowledged = [
      "acknowledged",
      "resources_ready",
      "arrived"
    ].includes(e.status);

    body = h(
      "div",
      { class: "stack" },

      kv([
        ["Receiving hospital", hospital.name],
        ["Hospital status", EM_LABEL[e.status] || e.status],
        ["ETA (crew estimate)", e.etaMin + " min"],
        [
          "Hospital acknowledgement",
          hospitalAcknowledged ? "Acknowledged" : "Awaiting acknowledgement"
        ],
        [
          "Dispatch",
          e.dispatched
            ? "Confirmed by ambulance operator"
            : "Not yet confirmed"
        ],
        [
          "Hospital says resources ready",
          e.status === "resources_ready"
            ? "Confirmed by hospital" +
              (e.readyNote ? ": " + e.readyNote : "")
            : "Not confirmed"
        ]
      ]),

      !hospitalAcknowledged
        ? notice(
            "warn",
            "Wait for the receiving hospital to acknowledge this emergency before confirming dispatch in this prototype."
          )
        : null,

      h(
        "div",
        { class: "cluster" },

        !e.dispatched && hospitalAcknowledged
          ? btn(
              "Confirm ambulance dispatched",
              wrap(() => confirmDispatch(ctx.user, e.id)),
              "primary"
            )
          : null,

        btn(
          "ETA −5 min (simulated)",
          wrap(() =>
            emergencyEta(
              ctx.user,
              e.id,
              Math.max(1, e.etaMin - 5)
            )
          ),
          "sm"
        ),

        e.status === "arrived"
          ? btn(
              "Close case",
              wrap(() => emergencyClose(ctx.user, e.id)),
              "sm primary"
            )
          : null
      )
    );
  }

  return card(
    {
      title: `${e.ref} · ${e.patient.triage}`,
      sub: `${e.patient.complaint} · ${e.location.label}`,
      actions: [statusBadge(e.status)],
      cls: "dangerc"
    },

    body,

    h(
      "h3",
      {
        style: {
          marginTop: "1rem"
        }
      },
      "Timeline"
    ),

    timeline(e.timeline)
  );
}
