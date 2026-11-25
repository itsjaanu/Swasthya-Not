// ASHA / community health worker workspace.
// Offline-first: records remain pending until a real backend acknowledges synchronization.

import { h, icon, ago, fmtDate, isoDay, haversine, km } from "../util.js";
import { db, audit, net } from "../db.js";
import { districtByName } from "../seed.js";
import {
  card, stat, grid, table, form, modal, toast, badge,
  statusBadge, pageHead, empty, notice, btn
} from "../ui.js";
import { t } from "../i18n.js";

const mk = rows => Object.fromEntries(
  rows.map(([k, te, hi, ta]) => [k, { te, hi, ta }])
);

export const strings = mk([
  ["as.nav.assist", "అపాయింట్‌మెంట్ సహాయం", "अपॉइंटमेंट सहायता", "சந்திப்பு உதவி"],
  ["as.nav.sync", "సింక్", "सिंक", "ஒத்திசை"],
  ["as.title.home", "ఈ రోజు పనులు", "आज के कार्य", "இன்றைய பணிகள்"],
  ["as.title.households", "కుటుంబాల జాబితా", "परिवारों की सूची", "குடும்பங்கள் பட்டியல்"],
  ["as.title.followups", "ఫాలో-అప్‌లు", "फॉलो-अप", "தொடர் பணிகள்"],
  ["as.title.referrals", "రిఫరల్స్", "रेफरल", "பரிந்துரைகள்"],
  ["as.title.assist", "అపాయింట్‌మెంట్ సహాయం", "अपॉइंटमेंट सहायता", "சந்திப்பு உதவி"],
  ["as.title.camps", "సమీప శిబిరాలు", "नज़दीकी शिविर", "அருகிலுள்ள முகாம்கள்"],
  ["as.title.sync", "సింక్ క్యూ", "सिंक कतार", "ஒத்திசைவு வரிசை"],
  ["as.addHh", "కుటుంబాన్ని జోడించండి", "परिवार जोड़ें", "குடும்பத்தைச் சேர்"],
  ["as.visit", "సందర్శన నమోదు", "विज़िट दर्ज करें", "வருகை பதிவு"],
  ["as.done", "పూర్తయింది", "हो गया", "முடிந்தது"],
  ["as.newFu", "కొత్త ఫాలో-అప్", "नया फॉलो-अप", "புதிய தொடர் பணி"],
  ["as.newRef", "కొత్త రిఫరల్", "नया रेफरल", "புதிய பரிந்துரை"],
  ["as.syncNow", "సింక్ చేయండి", "अभी सिंक करें", "இப்போது ஒத்திசை"],
  ["as.pending", "పెండింగ్", "लंबित", "நிலுவை"],
  ["as.synced", "సింక్ అయింది", "सिंक हो गया", "ஒத்திசைந்தது"]
]);

export const nav = [
  { id: "home", icon: "home", key: "nav.home", label: "Today" },
  { id: "households", icon: "users", key: "nav.households", label: "Households" },
  { id: "followups", icon: "calendar", key: "nav.followups", label: "Follow-ups" },
  { id: "referrals", icon: "navi", key: "nav.referrals", label: "Referrals" },
  { id: "assist", icon: "phone", key: "as.nav.assist", label: "Appointment help" },
  { id: "camps", icon: "tent", key: "nav.camps", label: "Camps" },
  { id: "sync", icon: "refresh", key: "as.nav.sync", label: "Sync" }
];

export const css = `
.as-pend{outline:2px dashed var(--marigold);outline-offset:-2px}
.as-member{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;font-size:.88rem}
.as-late{color:var(--danger);font-weight:700}
`;

let activeCtx = null;

window.addEventListener("netstate", () => {
  if (activeCtx && document.querySelector(".as-root")) {
    activeCtx.refresh();
  }
});

// This prototype has no connected synchronization backend.
// Online connectivity alone must never mean that data was uploaded.
const backendConfigured = false;

const state = () => "pending";

const mineHh = u =>
  db.where("ashaHouseholds", x => x.ashaId === u.id);

const mineFu = u =>
  db.where("followups", x => x.ashaId === u.id);

const mineRef = u =>
  db.where("referrals", x => x.fromId === u.id);

const mineVis = u =>
  db.where("ashaVisits", x => x.ashaId === u.id);

const pendingAll = u => [
  ...mineHh(u),
  ...mineFu(u),
  ...mineRef(u),
  ...mineVis(u)
].filter(x => x.syncState !== "synced");

const syncBadge = r =>
  r.syncState === "synced"
    ? badge("Server acknowledged", "ok", "check")
    : badge("Saved locally · Pending", "warn", "cloud");

const wrap = (ctx, ...kids) => {
  activeCtx = ctx;
  return h("div", { class: "as-root" }, kids);
};

const syncChip = u => {
  const n = pendingAll(u).length;

  return badge(
    net.offline
      ? `Offline · ${n} pending`
      : `${n} saved locally · ${n} pending`,
    "warn",
    net.offline ? "wifioff" : "cloud"
  );
};

const offlineNote = () =>
  notice(
    "warn",
    h("strong", {}, net.offline ? "Offline mode. " : "Local prototype storage. "),
    net.offline
      ? "New entries are saved on this device. They are not uploaded."
      : "Internet is available, but central server synchronization is not configured. Entries remain pending."
  );

function recordAudit(action, target, detail, user) {
  audit(action, target, detail, user);
}

// ---- Home -----------------------------------------------------------------

async function home(ctx) {
  const u = ctx.user;
  const today = isoDay();

  const fu = mineFu(u)
    .filter(f => !f.done)
    .sort((a, b) => a.due.localeCompare(b.due));

  const overdue = fu.filter(f => f.due < today);
  const dueNow = fu.filter(f => f.due === today);
  const soon = fu.filter(f => f.due > today).slice(0, 5);

  const needVisit = mineHh(u).filter(x =>
    !x.lastVisit ||
    (Date.now() - new Date(x.lastVisit).getTime()) / 864e5 > 30
  );

  const household = id => db.get("ashaHouseholds", id);

  const fuRow = f =>
    h(
      "div",
      {
        class: "row" + (f.syncState !== "synced" ? " as-pend" : "")
      },

      h(
        "div",
        { class: "grow" },
        h("div", { class: "title" }, `${f.who} — ${f.reason}`),
        h(
          "small",
          { class: f.due < today ? "as-late" : "muted" },
          `${f.due < today ? "Overdue · " : ""}Due ${fmtDate(f.due)}${
            household(f.householdId)
              ? " · " + household(f.householdId).head
              : ""
          }`
        )
      ),

      syncBadge(f),

      btn(
        t("as.done", "Done"),
        () => completeFu(ctx, f),
        "sm"
      )
    );

  return wrap(
    ctx,

    pageHead(
      t("as.title.home", "Today"),
      `${u.name} · ${u.village || ""} ${u.mandal || ""}`,
      syncChip(u),
      btn(
        t("as.addHh", "Add household"),
        () => ctx.go("households"),
        "primary",
        "plus"
      )
    ),

    offlineNote(),

    grid(
      4,
      stat("Due today", dueNow.length, "", dueNow.length ? "warn" : ""),
      stat("Overdue", overdue.length, "", overdue.length ? "danger" : "ok"),
      stat("Households", mineHh(u).length, `${needVisit.length} not visited in 30+ days`),
      stat(
        "Referrals open",
        mineRef(u).filter(r =>
          !["completed", "declined"].includes(r.status)
        ).length
      )
    ),

    h(
      "div",
      {
        class: "split",
        style: { marginTop: "1rem" }
      },

      card(
        { title: "Follow-ups" },

        fu.length
          ? h("div", { class: "list" }, [
              ...overdue,
              ...dueNow,
              ...soon
            ].map(fuRow))
          : empty("No follow-ups waiting. Add one from a household visit.")
      ),

      card(
        {
          title: "Households needing a visit",
          sub: "Not visited in over 30 days"
        },

        needVisit.length
          ? h(
              "div",
              { class: "list" },

              needVisit.map(x =>
                h(
                  "div",
                  { class: "row" },

                  h(
                    "div",
                    { class: "grow" },
                    h("div", { class: "title" }, x.head),
                    h(
                      "small",
                      { class: "muted" },
                      `Last visit ${x.lastVisit ? ago(x.lastVisit) : "never"}`
                    )
                  ),

                  btn(
                    t("as.visit", "Record visit"),
                    () => visitForm(ctx, x),
                    "sm"
                  )
                )
              )
            )
          : empty("Every household was visited recently.")
      )
    )
  );
}

function completeFu(ctx, f) {
  db.update("followups", f.id, {
    done: true,
    doneAt: new Date().toISOString(),
    syncState: state()
  });

  recordAudit(
    "asha.followup.done",
    f.who,
    "Completed locally; awaiting server synchronization.",
    ctx.user
  );

  toast("Marked done locally. Server synchronization is pending.");
  ctx.refresh();
}

// ---- Households ------------------------------------------------------------

function parseMembers(text) {
  const out = [];
  const bad = [];

  text.split("\n")
    .map(s => s.trim())
    .filter(Boolean)
    .forEach((ln, i) => {
      const [name, age, sex, flags] = ln.split("|").map(s => s.trim());

      if (
        !name ||
        !/^\d{1,3}$/.test(age || "") ||
        +age > 120 ||
        !/^[MFOmfo]$/.test(sex || "")
      ) {
        bad.push(i + 1);
        return;
      }

      out.push({
        id: "m" + Date.now().toString(36) + i,
        name,
        age: +age,
        sex: sex.toUpperCase(),
        flags: flags
          ? flags.split(";").map(s => s.trim()).filter(Boolean)
          : []
      });
    });

  if (bad.length) {
    throw new Error(
      `Check member line ${bad.join(", ")}. Use: Name | age | M/F/O | flag; flag`
    );
  }

  return out;
}

async function households(ctx) {
  const list = mineHh(ctx.user);

  return wrap(
    ctx,

    pageHead(
      t("as.title.households", "Households"),
      "Only households you registered are shown.",
      syncChip(ctx.user),
      btn(
        t("as.addHh", "Add household"),
        () => addHh(ctx),
        "primary",
        "plus"
      )
    ),

    offlineNote(),

    list.length
      ? h(
          "div",
          { class: "grid g-auto" },

          list.map(x =>
            card(
              {
                cls: x.syncState !== "synced" ? "as-pend" : ""
              },

              h(
                "div",
                { class: "spread" },
                h("h3", {}, x.head),
                syncBadge(x)
              ),

              h(
                "p",
                { class: "small muted" },
                `${x.address || ""} · ${x.village}`
              ),

              h(
                "div",
                {
                  class: "stack",
                  style: { marginTop: ".5rem" }
                },

                x.members.map(m =>
                  h(
                    "div",
                    { class: "as-member" },
                    h("strong", {}, m.name),
                    `${m.age} y · ${m.sex}`,
                    ...m.flags.map(f => badge(f, "warn"))
                  )
                )
              ),

              h(
                "p",
                { class: "small muted" },
                `Last visit: ${x.lastVisit ? ago(x.lastVisit) : "never"}`
              ),

              h(
                "div",
                { class: "cluster" },

                btn(
                  t("as.visit", "Record visit"),
                  () => visitForm(ctx, x),
                  "sm primary"
                ),

                btn(
                  t("as.newFu", "Follow-up"),
                  () => fuForm(ctx, x),
                  "sm"
                )
              )
            )
          )
        )
      : empty(
          "No households yet.",
          btn(
            t("as.addHh", "Add household"),
            () => addHh(ctx),
            "primary"
          )
        )
  );
}

function addHh(ctx) {
  modal(
    t("as.addHh", "Add household"),

    close => form(
      [
        {
          name: "head",
          label: "Head of household",
          required: true
        },
        {
          name: "village",
          label: "Village",
          required: true,
          value: ctx.user.village
        },
        {
          name: "address",
          label: "House / landmark",
          wide: true
        },
        {
          name: "members",
          label: "Members (one per line)",
          type: "textarea",
          rows: 4,
          required: true,
          wide: true,
          hint: "Name | age | M/F/O | flag; flag"
        },
        {
          name: "consent",
          label: "The household has agreed to be registered for community health follow-up.",
          type: "checkbox",
          required: true
        }
      ],
      {
        submitLabel: t("common.save", "Save"),
        onCancel: close,

        onSubmit: v => {
          if (!v.consent) {
            throw new Error("Confirm the household agreed to registration.");
          }

          const members = parseMembers(v.members);

          if (!members.length) {
            throw new Error("Add at least one member.");
          }

          const r = db.insert("ashaHouseholds", {
            ashaId: ctx.user.id,
            head: v.head.trim(),
            village: v.village.trim(),
            address: v.address,
            members,
            consentRecordedAt: new Date().toISOString(),
            lastVisit: null,
            syncState: state(),
            demo: !!ctx.user.demo
          });

          recordAudit(
            "asha.household.added",
            r.head,
            "Saved locally; awaiting synchronization.",
            ctx.user
          );

          toast("Household saved locally. Server synchronization is pending.");
          close();
          ctx.refresh();
        }
      }
    )
  );
}

function visitForm(ctx, hhRow) {
  modal(
    `Visit: ${hhRow.head}`,

    close => form(
      [
        {
          name: "notes",
          label: "Visit notes",
          type: "textarea",
          required: true,
          wide: true,
          hint: "Record observations and advice. Do not enter a diagnosis."
        },
        {
          name: "fu",
          label: "Add a follow-up?",
          type: "checkbox"
        },
        {
          name: "who",
          label: "Follow-up for",
          type: "select",
          options: hhRow.members.map(m => m.name),
          show: v => v.fu
        },
        {
          name: "reason",
          label: "Follow-up reason",
          show: v => v.fu
        },
        {
          name: "due",
          label: "Due date",
          type: "date",
          min: isoDay(),
          show: v => v.fu
        }
      ],
      {
        submitLabel: t("as.visit", "Record visit"),
        onCancel: close,

        onSubmit: v => {
          if (v.fu && (!v.who || !v.reason?.trim() || !v.due)) {
            throw new Error("Fill in who, why and the due date for the follow-up.");
          }

          db.insert("ashaVisits", {
            ashaId: ctx.user.id,
            householdId: hhRow.id,
            at: new Date().toISOString(),
            notes: v.notes.trim(),
            syncState: state()
          });

          db.update("ashaHouseholds", hhRow.id, {
            lastVisit: new Date().toISOString(),
            syncState: state()
          });

          if (v.fu) {
            db.insert("followups", {
              ashaId: ctx.user.id,
              householdId: hhRow.id,
              who: v.who,
              reason: v.reason.trim(),
              due: v.due,
              done: false,
              syncState: state()
            });
          }

          recordAudit(
            "asha.visit",
            hhRow.head,
            "Visit saved locally; awaiting synchronization.",
            ctx.user
          );

          toast("Visit saved locally. Server synchronization is pending.");
          close();
          ctx.refresh();
        }
      }
    )
  );
}

function fuForm(ctx, hhRow) {
  const hs = mineHh(ctx.user);

  modal(
    t("as.newFu", "New follow-up"),

    close => form(
      [
        ...(hhRow
          ? []
          : [{
              name: "householdId",
              label: "Household",
              type: "select",
              required: true,
              options: hs.map(x => ({
                value: x.id,
                label: x.head
              }))
            }]
        ),
        {
          name: "who",
          label: "Person",
          required: true,
          ...(hhRow
            ? {
                type: "select",
                options: hhRow.members.map(m => m.name)
              }
            : {})
        },
        {
          name: "reason",
          label: "Reason",
          required: true
        },
        {
          name: "due",
          label: "Due date",
          type: "date",
          required: true,
          min: isoDay()
        }
      ],
      {
        submitLabel: t("common.save", "Save"),
        onCancel: close,

        onSubmit: v => {
          if (v.due < isoDay()) {
            throw new Error("Choose today or a future date.");
          }

          db.insert("followups", {
            ashaId: ctx.user.id,
            householdId: hhRow?.id || v.householdId,
            who: v.who.trim(),
            reason: v.reason.trim(),
            due: v.due,
            done: false,
            syncState: state()
          });

          recordAudit(
            "asha.followup.added",
            v.who,
            v.reason,
            ctx.user
          );

          toast("Follow-up saved locally.");
          close();
          ctx.refresh();
        }
      }
    )
  );
}

// ---- Follow-ups ------------------------------------------------------------

async function followups(ctx) {
  const list = mineFu(ctx.user).sort(
    (a, b) => (a.done - b.done) || a.due.localeCompare(b.due)
  );

  const today = isoDay();

  return wrap(
    ctx,

    pageHead(
      t("as.title.followups", "Follow-ups"),
      "",
      syncChip(ctx.user),
      btn(
        t("as.newFu", "New follow-up"),
        () => fuForm(ctx),
        "primary",
        "plus"
      )
    ),

    offlineNote(),

    card(
      {},

      table(
        [
          { h: "Person", f: f => f.who },
          { h: "Reason", f: f => f.reason },
          {
            h: "Household",
            f: f => db.get("ashaHouseholds", f.householdId)?.head || "—"
          },
          {
            h: "Due",
            f: f => h(
              "span",
              {
                class: !f.done && f.due < today ? "as-late" : ""
              },
              fmtDate(f.due),
              !f.done && f.due < today ? " · overdue" : ""
            )
          },
          {
            h: "Status",
            f: f => f.done
              ? badge("Done", "ok")
              : badge("Open", "info")
          },
          { h: "Sync", f: syncBadge },
          {
            h: "",
            f: f => f.done
              ? null
              : btn(
                  t("as.done", "Done"),
                  () => completeFu(ctx, f),
                  "sm"
                )
          }
        ],
        list,
        { empty: "No follow-ups yet." }
      )
    )
  );
}

// ---- Referrals -------------------------------------------------------------

async function referrals(ctx) {
  const list = mineRef(ctx.user);

  return wrap(
    ctx,

    pageHead(
      t("as.title.referrals", "Referrals"),
      "Track referral preparation and delivery. A locally saved referral is not a hospital-confirmed referral.",
      syncChip(ctx.user),
      btn(
        t("as.newRef", "New referral"),
        () => refForm(ctx),
        "primary",
        "plus"
      )
    ),

    offlineNote(),

    notice(
      "warn",
      "Referral records created here are saved locally. They are not delivered to the hospital until a secure referral service is connected."
    ),

    card(
      {},

      table(
        [
          { h: "Person", f: r => r.patientName },
          {
            h: "To",
            f: r => db.get("orgs", r.toOrgId)?.name || "—"
          },
          { h: "Speciality", f: r => r.toSpecialty },
          {
            h: "Urgency",
            f: r => r.urgency === "urgent"
              ? badge("Urgent", "danger")
              : badge("Routine")
          },
          { h: "Reason", f: r => r.reason },
          {
            h: "Delivery",
            f: () => badge("Not delivered · Local record", "warn")
          },
          { h: "Created", f: r => ago(r.createdAt) },
          { h: "Sync", f: syncBadge }
        ],
        list,
        { empty: "No referrals yet." }
      )
    )
  );
}

function refForm(ctx) {
  const d = districtByName(ctx.user.district);

  const orgs = db.where(
    "orgs",
    o => o.kind === "hospital" && o.verification === "verified"
  )
    .map(o => ({
      o,
      d: d && o.lat ? haversine(d, o) : null
    }))
    .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));

  const people = mineHh(ctx.user).flatMap(
    x => x.members.map(m => m.name)
  );

  modal(
    t("as.newRef", "New referral"),

    close => form(
      [
        {
          name: "patientName",
          label: "Person being referred",
          required: true,
          wide: true,
          hint: people.length
            ? "From your households: " + people.slice(0, 6).join(", ")
            : undefined
        },
        {
          name: "toOrgId",
          label: "Refer to (nearest first)",
          type: "select",
          required: true,
          wide: true,
          options: orgs.map(({ o, d: dd }) => ({
            value: o.id,
            label: `${o.name} — ${o.district}${dd != null ? " · " + km(dd) : ""}`
          }))
        },
        {
          name: "toSpecialty",
          label: "Speciality",
          type: "select",
          required: true,
          options: [
            "General Medicine",
            "Obstetrics & Gynaecology",
            "Paediatrics",
            "Orthopaedics",
            "Cardiology",
            "ENT",
            "Ophthalmology",
            "Emergency & Trauma"
          ]
        },
        {
          name: "urgency",
          label: "Urgency",
          type: "select",
          required: true,
          options: [
            { value: "routine", label: "Routine" },
            { value: "urgent", label: "Urgent" }
          ],
          value: "routine"
        },
        {
          name: "reason",
          label: "Reason for referral",
          type: "textarea",
          required: true,
          wide: true
        }
      ],
      {
        submitLabel: "Save referral",
        onCancel: close,

        onSubmit: v => {
          const target = db.get("orgs", v.toOrgId);

          if (!target || target.verification !== "verified") {
            throw new Error("The selected hospital is no longer verified.");
          }

          const r = db.insert("referrals", {
            fromId: ctx.user.id,
            fromName: ctx.user.name,
            fromRole: "asha",
            patientName: v.patientName.trim(),
            toOrgId: v.toOrgId,
            toSpecialty: v.toSpecialty,
            reason: v.reason.trim(),
            urgency: v.urgency,
            status: "pending_delivery",
            syncState: state(),
            createdAt: new Date().toISOString(),
            deliveryState: "not_sent",
            demo: !!ctx.user.demo
          });

          recordAudit(
            "asha.referral.created",
            r.patientName,
            `Local referral record for ${target.name}; not delivered.`,
            ctx.user
          );

          toast("Referral saved locally. It has NOT been sent to the hospital.");
          close();
          ctx.refresh();
        }
      }
    )
  );
}

// ---- Appointment assistance -----------------------------------------------

async function assist(ctx) {
  const members = mineHh(ctx.user).flatMap(
    x => x.members.map(m => ({
      value: x.id + "|" + m.name,
      label: `${m.name} (${x.head}'s household)`
    }))
  );

  const facs = db.where(
    "orgs",
    o => o.kind === "hospital" && o.verification === "verified"
  ).sort(
    (a, b) =>
      (a.district === ctx.user.district ? 0 : 1) -
      (b.district === ctx.user.district ? 0 : 1)
  );

  const camps = db.where(
    "camps",
    c =>
      c.status === "published" &&
      c.district === ctx.user.district &&
      c.date >= isoDay()
  );

  return wrap(
    ctx,

    pageHead(
      t("as.title.assist", "Appointment assistance"),
      "Help someone get an appointment. The person or their family books or confirms it themselves."
    ),

    offlineNote(),

    notice(
      "info",
      "This does not book anything. It creates a follow-up reminder so you can check whether the visit happened."
    ),

    h(
      "div",
      { class: "split even" },

      card(
        { title: "Record assistance" },

        members.length
          ? form(
              [
                {
                  name: "member",
                  label: "Person",
                  type: "select",
                  required: true,
                  options: members,
                  wide: true
                },
                {
                  name: "orgId",
                  label: "Facility",
                  type: "select",
                  required: true,
                  wide: true,
                  options: facs.map(o => ({
                    value: o.id,
                    label: `${o.name} — ${o.district}`
                  }))
                },
                {
                  name: "date",
                  label: "Preferred date",
                  type: "date",
                  required: true,
                  min: isoDay()
                },
                {
                  name: "note",
                  label: "Note",
                  wide: true
                }
              ],
              {
                submitLabel: "Save as follow-up",

                onSubmit: v => {
                  const [hid, who] = v.member.split("|");
                  const o = db.get("orgs", v.orgId);

                  db.insert("followups", {
                    ashaId: ctx.user.id,
                    householdId: hid,
                    who,
                    reason: `Appointment assistance at ${o.name}${v.note ? " — " + v.note : ""}`,
                    due: v.date,
                    kind: "assist",
                    done: false,
                    syncState: state()
                  });

                  recordAudit(
                    "asha.assist",
                    who,
                    o.name,
                    ctx.user
                  );

                  toast("Follow-up saved locally.");
                  ctx.refresh();
                }
              }
            )
          : empty(
              "Add a household first.",
              btn(
                t("as.addHh", "Add household"),
                () => ctx.go("households"),
                "primary"
              )
            )
      ),

      card(
        {
          title: t("as.title.camps", "Camps near you"),
          sub: ctx.user.district
        },
        campList(camps)
      )
    )
  );
}

// ---- Camps -----------------------------------------------------------------

const campText = c =>
  `${c.title}\n${fmtDate(c.date)} ${c.start}–${c.end}\n${c.venue}, ${c.village}, ${c.mandal}, ${c.district}\nServices: ${(c.services || []).join(", ")}\n(Confirm details with the organizer before travelling.)`;

function campList(camps) {
  return camps.length
    ? h(
        "div",
        { class: "list" },

        camps.map(c =>
          h(
            "div",
            { class: "row" },

            h(
              "div",
              { class: "grow" },
              h(
                "div",
                { class: "title" },
                c.title,
                c.demo ? " " : null,
                c.demo ? badge("DEMO", "demo") : null
              ),
              h(
                "small",
                { class: "muted" },
                `${fmtDate(c.date)} · ${c.village}, ${c.mandal}`
              ),
              h(
                "div",
                { class: "small" },
                (c.services || []).join(" · ")
              )
            ),

            btn(
              "Copy message",
              async () => {
                try {
                  await navigator.clipboard.writeText(campText(c));
                  toast("Message copied.");
                } catch {
                  toast("Copy is not available on this device.", "danger");
                }
              },
              "sm",
              "link"
            )
          )
        )
      )
    : empty("No published camps coming up in your district.");
}

async function camps(ctx) {
  const all = db.where(
    "camps",
    c => c.status === "published" && c.date >= isoDay()
  );

  const mine_ = all.filter(c => c.district === ctx.user.district);

  return wrap(
    ctx,

    pageHead(
      t("as.title.camps", "Camps near you"),
      "Share these with households in your area."
    ),

    card(
      { title: ctx.user.district || "Your district" },
      campList(mine_)
    ),

    all.length > mine_.length
      ? card(
          { title: "Other districts" },
          campList(all.filter(c => c.district !== ctx.user.district))
        )
      : null
  );
}

// ---- Sync ------------------------------------------------------------------

async function sync(ctx) {
  const u = ctx.user;
  const q = pendingAll(u);

  const label = r =>
    r.head
      ? `Household: ${r.head}`
      : r.notes
        ? `Visit note (${db.get("ashaHouseholds", r.householdId)?.head || ""})`
        : r.patientName
          ? `Referral: ${r.patientName}`
          : `Follow-up: ${r.who} — ${r.reason}`;

  const go = btn(
    `${t("as.syncNow", "Sync")} ${q.length} pending record${q.length === 1 ? "" : "s"}`,

    () => {
      if (net.offline) {
        toast("You are offline. Records remain saved locally.", "danger");
        return;
      }

      if (!backendConfigured) {
        toast(
          "Server synchronization is not configured. No records were uploaded.",
          "warn"
        );
        return;
      }
    },

    "primary",
    "refresh"
  );

  go.disabled = !q.length || net.offline || !backendConfigured;

  return wrap(
    ctx,

    pageHead(
      t("as.title.sync", "Sync queue"),
      "Records made without internet wait here.",
      syncChip(u),
      go
    ),

    net.offline
      ? notice(
          "warn",
          "You are offline. Records are stored on this device and cannot be uploaded."
        )
      : notice(
          "warn",
          "You are online, but the server synchronization service is not configured. Records have NOT been uploaded."
        ),

    card(
      {
        title: `${q.length} pending record(s)`,
        sub: "Pending means saved locally, not delivered to the platform."
      },

      table(
        [
          { h: "Record", f: label },
          { h: "State", f: syncBadge },
          {
            h: "Last updated",
            f: r => r.updatedAt ? ago(r.updatedAt) : "—"
          }
        ],
        q,
        { empty: "No pending records." }
      )
    )
  );
}

export const routes = {
  home,
  households,
  followups,
  referrals,
  assist,
  camps,
  sync
};
