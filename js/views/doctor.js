// Doctor workspace: appointments, schedule, consented patient records, consultations and referrals.
import { h, fmtDate, isoDay } from "../util.js";
import { db, audit, notify } from "../db.js";
import {
  accessibleRecords,
  logAccess,
  emergencyAccess,
  addRecord,
  activeConsent,
  orgName,
} from "../services.js";
import { DEPARTMENTS } from "../seed.js";
import {
  pageHead,
  grid,
  stat,
  card,
  table,
  statusBadge,
  empty,
  notice,
  btn,
  form,
  modal,
  toast,
  kv,
  badge,
} from "../ui.js";
import {
  again,
  apptActions,
  scheduleEditor,
  scheduleSummary,
} from "./provider-shared.js";
import { t } from "../i18n.js";

const me = (ctx) =>
  db.all("doctors").find((doctor) => doctor.userId === ctx.user.id);

const noProfile = () =>
  empty(
    "No doctor profile is linked to this account. Contact the platform administrator to link your verified professional profile."
  );

const verifiedHospitals = () =>
  db.where(
    "orgs",
    (org) => org.kind === "hospital" && org.verification === "verified"
  );

export const nav = [
  {
    id: "today",
    icon: "home",
    key: "nav.overview",
    label: "Today",
  },
  {
    id: "schedule",
    icon: "calendar",
    key: "nav.schedule",
    label: "My schedule",
  },
  {
    id: "patients",
    icon: "users",
    key: "nav.patients",
    label: "Patients",
  },
  {
    id: "referrals",
    icon: "link",
    key: "nav.referrals",
    label: "Referrals",
  },
  {
    id: "profile",
    icon: "user",
    label: "Profile",
  },
];

export const strings = {
  "dr.noaccess": {
    te: "ఈ రోగి రికార్డులకు మీకు అనుమతి లేదు",
    hi: "इस मरीज़ के रिकॉर्ड तक आपकी पहुँच नहीं है",
    ta: "இந்த நோயாளியின் பதிவுகளை அணுக அனுமதி இல்லை",
  },
};

export const routes = {
  today(ctx) {
    const doctor = me(ctx);
    if (!doctor) return noProfile();

    const today = isoDay();

    const appointments = db
      .where(
        "appointments",
        (appointment) =>
          appointment.doctorId === doctor.id &&
          appointment.date >= today &&
          !["cancelled", "rejected"].includes(appointment.status)
      )
      .sort((a, b) =>
        `${a.date || ""}${a.time || ""}`.localeCompare(
          `${b.date || ""}${b.time || ""}`
        )
      );

    const requests = appointments.filter(
      (appointment) => appointment.status === "requested"
    ).length;

    const confirmed = appointments.filter(
      (appointment) => appointment.status === "confirmed"
    ).length;

    const sharedPatients = new Set(
      db
        .where(
          "consents",
          (consent) =>
            consent.doctorUserId === ctx.user.id && activeConsent(consent)
        )
        .map((consent) => consent.patientId)
    ).size;

    return h(
      "div",
      { class: "stack" },
      pageHead(
        `Good day, ${doctor.name}`,
        `${doctor.spec || "Doctor"} · ${orgName(doctor.orgId)}`
      ),

      grid(
        3,
        stat("Requests to confirm", requests, "", requests ? "warn" : ""),
        stat("Confirmed upcoming", confirmed),
        stat("Patients sharing records", sharedPatients)
      ),

      card(
        {
          title: "Upcoming appointments",
          sub: "Review requests and update appointment status.",
        },
        table(
          [
            {
              h: "When",
              f: (appointment) =>
                `${fmtDate(appointment.date)} ${appointment.time || ""}`,
              cls: "nowrap",
            },
            {
              h: "Patient",
              f: (appointment) =>
                h(
                  "a",
                  {
                    href: "#/app/patient/" + encodeURIComponent(
                      appointment.patientId
                    ),
                  },
                  appointment.forName || "Patient"
                ),
            },
            {
              h: "Reason",
              f: (appointment) => appointment.reason || "—",
            },
            {
              h: "Status",
              f: (appointment) => statusBadge(appointment.status),
            },
            {
              h: "",
              f: (appointment) =>
                apptActions(ctx.user, appointment, again(ctx)),
            },
          ],
          appointments,
          {
            empty: "No upcoming appointments.",
            label: "Upcoming appointments",
          }
        )
      )
    );
  },

  schedule(ctx) {
    const doctor = me(ctx);
    if (!doctor) return noProfile();

    const editor = scheduleEditor(doctor.schedule || []);

    return h(
      "div",
      { class: "stack" },
      pageHead(
        t("nav.schedule", "My schedule"),
        "Patients can request appointment slots inside the sessions you publish."
      ),
      notice(
        "info",
        "Saving a schedule does not itself confirm an appointment. Review each patient request separately."
      ),
      card(
        {
          title: "Weekly availability",
          sub: "Set the days, hours and appointment duration you offer.",
        },
        editor.el,
        h(
          "div",
          { class: "form-actions" },
          btn(
            "Save schedule",
            () => {
              try {
                const schedule = editor.get();
                db.update("doctors", doctor.id, { schedule });
                audit(
                  "schedule.updated",
                  doctor.name,
                  scheduleSummary(schedule),
                  ctx.user
                );
                toast("Schedule saved.");
                again(ctx)();
              } catch (error) {
                toast(error.message, "danger");
              }
            },
            "primary"
          )
        )
      )
    );
  },

  patients(ctx) {
    const doctor = me(ctx);

    const appointmentPatientIds = doctor
      ? db
          .where(
            "appointments",
            (appointment) => appointment.doctorId === doctor.id
          )
          .map((appointment) => appointment.patientId)
      : [];

    const consentPatientIds = db
      .where(
        "consents",
        (consent) => consent.doctorUserId === ctx.user.id
      )
      .map((consent) => consent.patientId);

    const patientIds = new Set([
      ...appointmentPatientIds,
      ...consentPatientIds,
    ]);

    const rows = [...patientIds]
      .map((id) => db.get("users", id))
      .filter(Boolean)
      .map((patient) => ({
        patient,
        consents: db.where(
          "consents",
          (consent) =>
            consent.patientId === patient.id &&
            consent.doctorUserId === ctx.user.id &&
            activeConsent(consent)
        ),
      }));

    return h(
      "div",
      { class: "stack" },
      pageHead(
        t("nav.patients", "Patients"),
        "Patient records are available only when the patient has granted active consent or an authorized emergency-access policy applies."
      ),
      notice(
        "info",
        "No consent, no routine record access. Patients can limit or revoke sharing. Record access is logged."
      ),
      card(
        { title: "Patient list" },
        table(
          [
            {
              h: "Patient",
              f: (row) => row.patient.name,
            },
            {
              h: "Access",
              f: (row) =>
                row.consents.length
                  ? badge(
                      `${row.consents.reduce(
                        (count, consent) =>
                          count +
                          (consent.recordIds === "all"
                            ? 99
                            : consent.recordIds.length),
                        0
                      )} records shared`,
                      "ok"
                    )
                  : badge("No active consent", "muted"),
            },
            {
              h: "Expires",
              f: (row) =>
                row.consents[0]
                  ? fmtDate(row.consents[0].expiresAt)
                  : "—",
            },
            {
              h: "",
              f: (row) =>
                btn(
                  "Open",
                  () =>
                    ctx.go(
                      "patient/" + encodeURIComponent(row.patient.id)
                    ),
                  "sm primary"
                ),
            },
          ],
          rows,
          {
            empty: "No patients are linked to your account yet.",
            label: "Patients",
          }
        )
      )
    );
  },

  patient(ctx) {
    const patientId = ctx.param;
    const patient = db.get("users", patientId);

    if (!patient) return empty("Patient not found.");

    const doctor = me(ctx);
    if (!doctor) return noProfile();

    const { consents, records } = accessibleRecords(ctx.user, patientId);

    const openRecord = (record) => {
      const consent = consents.find(
        (item) =>
          item.recordIds === "all" || item.recordIds.includes(record.id)
      );

      if (!consent) {
        toast("You do not have permission to view this record.", "danger");
        return;
      }

      logAccess(ctx.user, record, consent);

      modal(
        record.title,
        h(
          "div",
          { class: "stack" },
          kv([
            ["Patient", record.subjectName],
            ["Date", fmtDate(record.date)],
            ["Type", record.type],
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
                margin: 0,
              },
            },
            record.content || "No record content."
          ),
          record.attachment
            ? h(
                "a",
                {
                  class: "btn sm",
                  href: record.attachment.data,
                  download: record.attachment.name,
                },
                "Download " + record.attachment.name
              )
            : null
        ),
        { wide: true }
      );
    };

    const emergency = () =>
      modal(
        "Emergency access",
        (close) =>
          h(
            "div",
            {},
            notice(
              "danger",
              "Emergency access is for situations where the patient cannot consent and delay risks harm. Access is time-limited, logged and subject to administrator review."
            ),
            form(
              [
                {
                  name: "reason",
                  label: "Describe the emergency",
                  type: "textarea",
                  required: true,
                  wide: true,
                },
              ],
              {
                submitLabel: "Continue under emergency policy",
                onCancel: close,
                onSubmit: (values) => {
                  if (!values.reason.trim()) {
                    throw new Error("Enter the emergency reason.");
                  }

                  emergencyAccess(ctx.user, patientId, values.reason.trim());
                  close();
                  toast("Emergency access granted and logged.", "danger");
                  again(ctx)();
                },
              }
            )
          ),
        { wide: true }
      );

    const consultation = () =>
      modal(
        "Consultation note",
        (close) =>
          form(
            [
              {
                name: "complaint",
                label: "Presenting complaint",
                required: true,
                wide: true,
              },
              {
                name: "diagnosis",
                label: "Clinical assessment",
                required: true,
                wide: true,
                hint: "Enter your professional assessment.",
              },
              {
                name: "notes",
                label: "Notes and advice",
                type: "textarea",
                wide: true,
              },
              {
                name: "rx",
                label: "Prescription details",
                type: "textarea",
                wide: true,
                hint: "If clinically appropriate, enter one item per line. This prototype does not transmit prescriptions to pharmacies.",
              },
              {
                name: "follow",
                label: "Follow-up date",
                type: "date",
              },
            ],
            {
              onCancel: close,
              submitLabel: "Save to patient records",
              onSubmit: (values) => {
                const base = {
                  subjectId: patientId,
                  subjectName: patient.name,
                  date: isoDay(),
                  orgId: doctor.orgId,
                  source: "consult",
                  createdBy: ctx.user.id,
                };

                addRecord(patient, {
                  ...base,
                  type: "consult",
                  title: `Consultation — ${doctor.name}`,
                  content: [
                    `Complaint: ${values.complaint}`,
                    `Clinical assessment: ${values.diagnosis}`,
                    values.notes || "",
                    values.follow
                      ? `Follow-up: ${values.follow}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                });

                const items = (values.rx || "")
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => {
                    const [name, dose, days] = line
                      .split("—")
                      .map((part) => part.trim());

                    return {
                      name,
                      dose: dose || "",
                      days: Number(days) || 0,
                    };
                  });

                if (items.length) {
                  addRecord(patient, {
                    ...base,
                    type: "prescription",
                    title: `Prescription — ${doctor.name}`,
                    content: items
                      .map(
                        (item) =>
                          `${item.name} — ${item.dose} × ${
                            item.days || "not specified"
                          } days`
                      )
                      .join("\n"),
                    rx: { items },
                  });
                }

                audit(
                  "consultation.saved",
                  patient.email,
                  "Consultation record saved",
                  ctx.user
                );

                notify(patientId, {
                  title: "New note from your doctor",
                  body: doctor.name,
                  link: "#/app/records",
                  type: "record",
                });

                close();
                toast("Saved to the patient's records.");
                again(ctx)();
              },
            }
          ),
        { wide: true }
      );

    const refer = () =>
      modal(
        "Refer patient",
        (close) =>
          form(
            [
              {
                name: "toOrgId",
                label: "Refer to hospital",
                type: "select",
                required: true,
                options: verifiedHospitals().map((org) => ({
                  value: org.id,
                  label: `${org.name} — ${org.district}`,
                })),
              },
              {
                name: "toSpecialty",
                label: "Specialty",
                type: "select",
                options: DEPARTMENTS,
                required: true,
              },
              {
                name: "urgency",
                label: "Urgency",
                type: "select",
                options: [
                  { value: "routine", label: "Routine" },
                  { value: "urgent", label: "Urgent" },
                ],
                required: true,
              },
              {
                name: "reason",
                label: "Reason for referral",
                type: "textarea",
                required: true,
                wide: true,
              },
            ],
            {
              onCancel: close,
              submitLabel: "Send referral",
              onSubmit: (values) => {
                db.insert("referrals", {
                  ...values,
                  fromId: ctx.user.id,
                  fromName: ctx.user.name,
                  fromRole: "doctor",
                  patientId,
                  patientName: patient.name,
                  status: "sent",
                });

                audit(
                  "referral.created",
                  patient.email,
                  values.toSpecialty,
                  ctx.user
                );

                notify(patientId, {
                  title: "Referral created",
                  body: values.toSpecialty,
                  type: "referral",
                });

                close();
                toast("Referral sent.");
                again(ctx)();
              },
            }
          ),
        { wide: true }
      );

    return h(
      "div",
      { class: "stack" },
      pageHead(
        patient.name,
        "Patient record access",
        btn("Write consultation", consultation, "primary", "edit"),
        btn("Refer", refer, "", "link")
      ),

      consents.length
        ? consents.map((consent) =>
            notice(
              consent.via === "emergency" ? "danger" : "ok",
              h(
                "strong",
                {},
                consent.via === "emergency"
                  ? "Emergency access. "
                  : "Patient consent. "
              ),
              `Purpose: ${consent.purpose || "Not specified"} · expires ${fmtDate(
                consent.expiresAt,
                true
              )}`
            )
          )
        : h(
            "div",
            {},
            notice(
              "warn",
              h(
                "strong",
                {},
                t(
                  "dr.noaccess",
                  "You do not have access to this patient's records. "
                )
              ),
              "Ask the patient to share records with you before opening them."
            ),
            h(
              "div",
              { class: "cluster" },
              btn(
                "Request access",
                () => {
                  notify(patientId, {
                    title: "A doctor requested access to your records",
                    body: ctx.user.name,
                    link: "#/app/records",
                    type: "consent",
                  });
                  toast("Access request sent to the patient.");
                },
                "sm"
              ),
              btn("Emergency access…", emergency, "sm danger")
            )
          ),

      card(
        {
          title: "Records you can view",
          sub: "Only records included in your active authorization are listed.",
        },
        table(
          [
            {
              h: "Record",
              f: (record) => record.title,
            },
            {
              h: "Type",
              f: (record) => record.type,
            },
            {
              h: "Date",
              f: (record) => fmtDate(record.date),
            },
            {
              h: "",
              f: (record) =>
                btn(
                  "Open",
                  () => openRecord(record),
                  "sm primary"
                ),
            },
          ],
          records,
          {
            empty: "No records are currently shared with you.",
            label: "Shared patient records",
          }
        )
      )
    );
  },

  referrals(ctx) {
    const doctor = me(ctx);
    if (!doctor) return noProfile();

    const referrals = db
      .where(
        "referrals",
        (referral) =>
          referral.fromId === ctx.user.id ||
          referral.toOrgId === doctor.orgId
      )
      .sort((a, b) =>
        String(b.createdAt || "").localeCompare(
          String(a.createdAt || "")
        )
      );

    return h(
      "div",
      { class: "stack" },
      pageHead(
        t("nav.referrals", "Referrals"),
        "Track referrals you sent and referrals addressed to your affiliated hospital."
      ),
      card(
        { title: "Referral list" },
        table(
          [
            {
              h: "Patient",
              f: (referral) => referral.patientName || "—",
            },
            {
              h: "From",
              f: (referral) => referral.fromName || "—",
            },
            {
              h: "To",
              f: (referral) =>
                `${orgName(referral.toOrgId)} · ${
                  referral.toSpecialty || "—"
                }`,
            },
            {
              h: "Reason",
              f: (referral) => referral.reason || "—",
            },
            {
              h: "Status",
              f: (referral) => statusBadge(referral.status),
            },
            {
              h: "",
              f: (referral) =>
                referral.toOrgId === doctor.orgId &&
                referral.status === "sent"
                  ? btn(
                      "Accept",
                      () => {
                        db.update("referrals", referral.id, {
                          status: "accepted",
                        });
                        audit(
                          "referral.accepted",
                          referral.id,
                          referral.toSpecialty,
                          ctx.user
                        );
                        toast("Referral accepted.");
                        again(ctx)();
                      },
                      "sm primary"
                    )
                  : null,
            },
          ],
          referrals,
          {
            empty: "No referrals yet.",
            label: "Patient referrals",
          }
        )
      )
    );
  },

  profile(ctx) {
    const doctor = me(ctx);
    if (!doctor) return noProfile();

    return h(
      "div",
      { class: "stack" },
      pageHead("Professional profile"),
      card(
        {
          title: "Doctor details",
          sub: "Keep your professional details and hospital affiliation accurate.",
        },
        form(
          [
            {
              name: "name",
              label: "Name",
              required: true,
            },
            {
              name: "spec",
              label: "Specialization",
              type: "select",
              options: DEPARTMENTS,
            },
            {
              name: "orgId",
              label: "Hospital affiliation",
              type: "select",
              options: verifiedHospitals().map((org) => ({
                value: org.id,
                label: `${org.name} — ${org.district}`,
              })),
            },
            {
              name: "regNo",
              label: "Professional registration number",
              required: true,
              hint: "Enter the registration details used for administrator verification.",
            },
          ],
          {
            initial: doctor,
            submitLabel: "Save profile",
            onSubmit: (values) => {
              if (!values.name.trim()) {
                throw new Error("Enter your name.");
              }

              if (!values.regNo.trim()) {
                throw new Error("Enter your professional registration number.");
              }

              db.update("doctors", doctor.id, {
                ...values,
                name: values.name.trim(),
                regNo: values.regNo.trim(),
              });

              audit(
                "doctor.profile.updated",
                doctor.id,
                "Professional profile updated",
                ctx.user
              );

              toast("Profile saved.");
              again(ctx)();
            },
          }
        )
      ),
      notice(
        "info",
        "This prototype stores profile information in this browser. It does not independently verify professional registration."
      )
    );
  },
};
