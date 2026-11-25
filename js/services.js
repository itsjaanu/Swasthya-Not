// Cross-role workflows. Views call these so every role sees the same rules.
import { db, audit, notify, notifyOrg, notifyRole } from "./db.js";
import { haversine, isoDay, addDays, refNo, uid, sum } from "./util.js";
import { BED_CATS } from "./seed.js";

// ---------- data provenance & freshness -------------------------------------

export const PROV = {
  verified: {
    label: "Verified live",
    cls: "ok",
    help: "Confirmed through an authorised system integration."
  },
  provider: {
    label: "Provider-reported",
    cls: "info",
    help: "Entered by the facility's authorised staff; timestamp shown."
  },
  public: {
    label: "Public directory",
    cls: "muted",
    help: "From a public government dataset. Not live — confirm with the facility."
  },
  demo: {
    label: "DEMO DATA",
    cls: "demo",
    help: "Sample record created for testing. Not real."
  },
  unverified: {
    label: "Unverified",
    cls: "warn",
    help: "Submitted but not yet verified."
  },
  outdated: {
    label: "Outdated",
    cls: "danger",
    help: "Not updated recently. Do not rely on it; call the facility."
  }
};

export function provenance(org, updatedAt) {
  if (!org) return "unverified";
  if (org.demo) return "demo";
  if (org.kind === "public") return "public";
  if (org.verification !== "verified") return "unverified";

  const hrs = updatedAt
    ? (Date.now() - new Date(updatedAt).getTime()) / 36e5
    : Infinity;

  if (hrs > db.cfg().staleHours) return "outdated";
  return org.integration ? "verified" : "provider";
}

export const isStale = ts =>
  !ts ||
  (Date.now() - new Date(ts).getTime()) / 36e5 >
    db.cfg().staleHours;

// ---------- beds ------------------------------------------------------------

export function bedRows(org) {
  return BED_CATS
    .filter(([key]) => org.beds?.[key])
    .map(([key, label]) => {
      const bed = org.beds[key];
      const available = Math.max(
        0,
        bed.total - bed.occupied - (bed.unavailable || 0)
      );

      return {
        key,
        label,
        ...bed,
        available
      };
    });
}

export const bedTotals = org => {
  const rows = bedRows(org);

  return {
    total: sum(rows, row => row.total),
    occupied: sum(rows, row => row.occupied),
    unavailable: sum(rows, row => row.unavailable),
    available: sum(rows, row => row.available),
    updatedAt: rows.map(row => row.updatedAt).sort().pop() || null
  };
};

export function setBeds(user, org, key, {
  total,
  occupied,
  unavailable
}) {
  total = +total;
  occupied = +occupied;
  unavailable = +unavailable || 0;

  if (
    [total, occupied, unavailable].some(
      number => !Number.isFinite(number) || number < 0
    )
  ) {
    throw new Error("Enter whole numbers (0 or more).");
  }

  if (occupied + unavailable > total) {
    throw new Error(
      "Occupied + unavailable cannot exceed total capacity."
    );
  }

  org.beds[key] = {
    total,
    occupied,
    unavailable,
    updatedAt: new Date().toISOString(),
    by: user.name
  };

  db.update("orgs", org.id, {
    beds: org.beds
  });

  audit(
    "beds.updated",
    org.name,
    `${key}: ${occupied}/${total} occupied, ${unavailable} unavailable`,
    user
  );
}

// ---------- appointments ----------------------------------------------------

export const ACTIVE_APPT = ["requested", "confirmed"];

export function slotsFor(doctor, dateStr) {
  const dow = new Date(dateStr + "T00:00").getDay();
  const out = [];

  for (const schedule of doctor.schedule || []) {
    if (schedule.day !== dow) continue;

    let [hour, minute] = schedule.start.split(":").map(Number);
    const [endHour, endMinute] = schedule.end.split(":").map(Number);

    while (
      hour * 60 + minute + schedule.slotMins <=
      endHour * 60 + endMinute
    ) {
      out.push(
        `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      );

      minute += schedule.slotMins;
      hour += Math.floor(minute / 60);
      minute %= 60;
    }
  }

  const taken = new Set(
    db.where(
      "appointments",
      appointment =>
        appointment.doctorId === doctor.id &&
        appointment.date === dateStr &&
        ACTIVE_APPT.includes(appointment.status)
    ).map(appointment => appointment.time)
  );

  const isToday = dateStr === isoDay();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  return out
    .filter(time =>
      !isToday ||
      +time.slice(0, 2) * 60 + +time.slice(3) > nowMin
    )
    .map(time => ({
      time,
      free: !taken.has(time)
    }));
}

export function requestAppointment(user, {
  doctorId,
  date,
  time,
  forId,
  forName,
  reason
}) {
  const doctor = db.get("doctors", doctorId);

  if (!doctor) throw new Error("Doctor not found.");

  const slot = slotsFor(doctor, date).find(
    item => item.time === time
  );

  if (!slot?.free) {
    throw new Error(
      "That slot is no longer available. Pick another time."
    );
  }

  if (!reason?.trim()) {
    throw new Error("Add a short reason for the visit.");
  }

  const appointment = db.insert("appointments", {
    ref: refNo("APT"),
    patientId: user.id,
    forId,
    forName,
    doctorId,
    orgId: doctor.orgId,
    date,
    time,
    reason: reason.trim(),
    status: "requested",
    history: [{
      at: new Date().toISOString(),
      by: user.name,
      text: "Requested"
    }],
    demo: !!user.demo
  });

  audit(
    "appointment.requested",
    appointment.ref,
    `${doctor.name} ${date} ${time}`,
    user
  );

  notifyOrg(doctor.orgId, {
    title: "New appointment request",
    body: `${forName} · ${doctor.name} · ${date} ${time}`,
    link: "#/app/appointments",
    type: "appointment"
  });

  if (doctor.userId) {
    notify(doctor.userId, {
      title: "New appointment request",
      body: `${forName} · ${date} ${time}`,
      link: "#/app/schedule",
      type: "appointment"
    });
  }

  notify(user.id, {
    title: "Appointment requested",
    body: `Ref ${appointment.ref}. You will be notified when ${doctor.name}'s hospital responds.`,
    link: "#/app/appointments",
    type: "appointment",
    channels: ["inapp", "sms"]
  });

  return appointment;
}

export function setApptStatus(actor, id, status, note = "") {
  const appointment = db.get("appointments", id);
  if (!appointment) return;

  if (status === "confirmed" || status === "rescheduled") {
    const clash = db.where(
      "appointments",
      item =>
        item.id !== id &&
        item.doctorId === appointment.doctorId &&
        item.date === appointment.date &&
        item.time === appointment.time &&
        ACTIVE_APPT.includes(item.status)
    );

    if (clash.length) {
      throw new Error(
        "Another appointment already holds this slot."
      );
    }
  }

  appointment.history.push({
    at: new Date().toISOString(),
    by: actor.name,
    text: `${status.replace("_", " ")}${note ? " — " + note : ""}`
  });

  db.update("appointments", id, {
    status,
    history: appointment.history
  });

  audit(
    "appointment." + status,
    appointment.ref,
    note,
    actor
  );

  const labels = {
    confirmed: "confirmed",
    rejected: "could not be accepted",
    cancelled: "cancelled",
    completed: "marked completed",
    no_show: "marked as missed"
  };

  notify(appointment.patientId, {
    title: `Appointment ${labels[status] || status}`,
    body: `${appointment.forName} · ${appointment.date} ${appointment.time}${note ? " · " + note : ""}`,
    link: "#/app/appointments",
    type: "appointment",
    channels: ["inapp", "sms"]
  });
}

export function rescheduleAppointment(actor, id, date, time) {
  const appointment = db.get("appointments", id);
  const doctor = db.get("doctors", appointment.doctorId);

  const slot = slotsFor(doctor, date).find(
    item => item.time === time
  );

  if (!slot?.free) {
    throw new Error("That slot is not free.");
  }

  appointment.history.push({
    at: new Date().toISOString(),
    by: actor.name,
    text: `Rescheduled from ${appointment.date} ${appointment.time} to ${date} ${time}`
  });

  db.update("appointments", id, {
    date,
    time,
    status: "requested",
    history: appointment.history
  });

  audit(
    "appointment.rescheduled",
    appointment.ref,
    `${date} ${time}`,
    actor
  );

  notifyOrg(appointment.orgId, {
    title: "Appointment rescheduled — please confirm",
    body: `${appointment.forName} · ${date} ${time}`,
    link: "#/app/appointments",
    type: "appointment"
  });
}

// Generates in-app notices for confirmed appointments in the next 24 hours.
export function runReminders() {
  const soon = Date.now() + 24 * 36e5;

  db.where(
    "appointments",
    appointment =>
      appointment.status === "confirmed" &&
      !appointment.reminded &&
      new Date(
        `${appointment.date}T${appointment.time}`
      ).getTime() < soon &&
      new Date(
        `${appointment.date}T${appointment.time}`
      ).getTime() > Date.now()
  ).forEach(appointment => {
    notify(appointment.patientId, {
      title: "Appointment reminder",
      body: `${appointment.forName} · ${db.get("doctors", appointment.doctorId)?.name} · ${appointment.date} ${appointment.time}`,
      link: "#/app/appointments",
      type: "reminder",
      channels: ["inapp", "sms"]
    });

    db.update("appointments", appointment.id, {
      reminded: true
    });
  });
}

// ---------- admissions ------------------------------------------------------

export const ADM_FLOW = {
  submitted: ["received", "rejected"],
  received: ["under_review", "info_requested", "rejected"],
  under_review: ["accepted", "info_requested", "rejected"],
  info_requested: ["under_review", "rejected"],
  accepted: ["arrived", "rejected"],
  arrived: ["admitted"],
  admitted: ["discharged"],
  rejected: [],
  discharged: [],
  cancelled: []
};

export const ADM_LABEL = {
  submitted: "Submitted",
  received: "Received by hospital",
  under_review: "Under review",
  info_requested: "More information requested",
  accepted: "Accepted — follow hospital instructions",
  rejected: "Not accepted",
  arrived: "Patient arrived",
  admitted: "Admitted",
  discharged: "Discharged",
  cancelled: "Cancelled"
};

export function submitAdmission(user, form) {
  if (!form.orgId || !form.department || !form.reason?.trim()) {
    throw new Error(
      "Choose a hospital, a department and describe the reason."
    );
  }

  const admission = db.insert("admissions", {
    ref: refNo("ADM"),
    patientId: user.id,
    forName: form.forName,
    orgId: form.orgId,
    department: form.department,
    category: form.category,
    urgency: form.urgency || "routine",
    reason: form.reason.trim(),
    docs: form.docs || [],
    status: "submitted",
    messages: [],
    history: [{
      at: new Date().toISOString(),
      by: user.name,
      text: "Submitted"
    }],
    demo: !!user.demo
  });

  audit(
    "admission.submitted",
    admission.ref,
    db.get("orgs", form.orgId)?.name,
    user
  );

  notifyOrg(form.orgId, {
    title: "New admission request",
    body: `${admission.ref} · ${form.forName} · ${form.department}`,
    link: "#/app/admissions",
    type: "admission"
  });

  notify(user.id, {
    title: "Admission request submitted",
    body: `Reference ${admission.ref}. This is a request, not a confirmed bed.`,
    link: "#/app/admissions",
    type: "admission",
    channels: ["inapp", "sms"]
  });

  return admission;
}

export function setAdmissionStatus(
  actor,
  id,
  status,
  message = "",
  extra = {}
) {
  const admission = db.get("admissions", id);
  if (!admission) return;

  if (
    !ADM_FLOW[admission.status]?.includes(status) &&
    !(
      status === "cancelled" &&
      ["submitted", "received", "under_review", "info_requested"]
        .includes(admission.status)
    )
  ) {
    throw new Error(
      `Cannot move from "${ADM_LABEL[admission.status]}" to "${ADM_LABEL[status]}".`
    );
  }

  if (
    ["rejected", "info_requested", "accepted"].includes(status) &&
    !message.trim()
  ) {
    throw new Error(
      "Add a message for the patient (reason or instructions)."
    );
  }

  admission.history.push({
    at: new Date().toISOString(),
    by: actor.name,
    text: ADM_LABEL[status]
  });

  if (message.trim()) {
    admission.messages.push({
      at: new Date().toISOString(),
      from: actor.role === "citizen" ? "Patient" : actor.name,
      text: message.trim()
    });
  }

  db.update("admissions", id, {
    status,
    history: admission.history,
    messages: admission.messages,
    ...extra
  });

  audit(
    "admission." + status,
    admission.ref,
    message,
    actor
  );

  notify(admission.patientId, {
    title: `Admission ${admission.ref}: ${ADM_LABEL[status]}`,
    body: message,
    link: "#/app/admissions",
    type: "admission",
    channels: ["inapp", "sms"]
  });
}

// ---------- records & consent ----------------------------------------------

export const activeConsent = consent =>
  !consent.revokedAt &&
  new Date(consent.expiresAt).getTime() > Date.now();

export function grantConsent(patient, {
  doctorUserId,
  recordIds,
  purpose,
  days
}) {
  const doctor = db.get("users", doctorUserId);

  if (!doctor || doctor.role !== "doctor") {
    throw new Error("Choose a doctor.");
  }

  if (doctor.status !== "active") {
    throw new Error("This doctor is not verified yet.");
  }

  if (!recordIds.length) {
    throw new Error("Select at least one record to share.");
  }

  if (!purpose?.trim()) {
    throw new Error("State the purpose of sharing.");
  }

  const consent = db.insert("consents", {
    patientId: patient.id,
    doctorUserId,
    doctorName: doctor.name,
    recordIds,
    purpose: purpose.trim(),
    grantedAt: new Date().toISOString(),
    expiresAt: new Date(
      Date.now() + days * 864e5
    ).toISOString(),
    revokedAt: null,
    via: "patient"
  });

  audit(
    "consent.granted",
    doctor.name,
    `${recordIds.length} records · ${days} days · ${purpose}`,
    patient
  );

  notify(doctor.id, {
    title: "A patient shared records with you",
    body: `${patient.name} · ${recordIds.length} record(s) · ${purpose}`,
    link: "#/app/patients",
    type: "consent"
  });

  return consent;
}

export function revokeConsent(patient, id) {
  const consent = db.get("consents", id);

  db.update("consents", id, {
    revokedAt: new Date().toISOString()
  });

  audit(
    "consent.revoked",
    consent.doctorName,
    "",
    patient
  );

  notify(consent.doctorUserId, {
    title: "Record access revoked",
    body: `${patient.name} withdrew access.`,
    type: "consent"
  });
}

export function accessibleRecords(doctor, patientId) {
  const consents = db.where(
    "consents",
    consent =>
      consent.patientId === patientId &&
      consent.doctorUserId === doctor.id &&
      activeConsent(consent)
  );

  const ids = new Set(
    consents.flatMap(consent =>
      consent.recordIds === "all"
        ? db.where(
            "records",
            record => record.ownerId === patientId
          ).map(record => record.id)
        : consent.recordIds
    )
  );

  return {
    consents,
    records: db.where(
      "records",
      record => ids.has(record.id)
    )
  };
}

export function logAccess(user, record, consent) {
  db.insert("accessLog", {
    at: new Date().toISOString(),
    recordId: record.id,
    recordTitle: record.title,
    patientId: record.ownerId,
    accessorId: user.id,
    accessorName: user.name,
    role: user.role,
    via: consent?.via === "emergency"
      ? "emergency"
      : "consent",
    consentId: consent?.id
  });

  audit(
    "record.viewed",
    record.title,
    consent?.via === "emergency"
      ? "EMERGENCY ACCESS"
      : "consented",
    user
  );
}

// Break-glass emergency access: mandatory reason, short expiry,
// patient notified, and flagged for administrator review.
export function emergencyAccess(doctor, patientId, reason) {
  if (!reason || reason.trim().length < 15) {
    throw new Error(
      "Describe the emergency in at least a sentence — this is reviewed by an administrator."
    );
  }

  const patient = db.get("users", patientId);
  if (!patient) throw new Error("Patient not found.");

  const hours = db.cfg().emergencyAccessHours;

  const consent = db.insert("consents", {
    patientId,
    doctorUserId: doctor.id,
    doctorName: doctor.name,
    recordIds: "all",
    purpose: "EMERGENCY ACCESS: " + reason.trim(),
    grantedAt: new Date().toISOString(),
    expiresAt: new Date(
      Date.now() + hours * 36e5
    ).toISOString(),
    revokedAt: null,
    via: "emergency",
    flagged: true
  });

  audit(
    "record.emergency_access",
    patient.email,
    reason,
    doctor
  );

  notify(patientId, {
    title: "Emergency access to your records",
    body: `${doctor.name} opened your records under emergency policy: ${reason}`,
    type: "security",
    channels: ["inapp", "sms"]
  });

  notifyRole("admin", {
    title: "Emergency record access needs review",
    body: `${doctor.name} → ${patient.name}`,
    link: "#/app/audit",
    type: "security"
  });

  return consent;
}

export function addRecord(owner, record) {
  return db.insert("records", {
    ownerId: owner.id,
    ...record
  });
}

// ---------- diagnostics -----------------------------------------------------

export const DGN_LABEL = {
  requested: "Requested",
  confirmed: "Confirmed",
  rejected: "Not accepted",
  sample_collected: "Sample collected",
  processing: "Processing",
  report_ready: "Report ready",
  cancelled: "Cancelled"
};

export function bookTest(user, form) {
  const org = db.get("orgs", form.orgId);
  const test = org?.tests.find(
    item => item.code === form.testCode
  );

  if (!test || !test.available) {
    throw new Error("This test is not currently offered.");
  }

  if (!form.date || !form.slot) {
    throw new Error("Choose a date and time.");
  }

  const booking = db.insert("diagBookings", {
    ref: refNo("DGN"),
    patientId: user.id,
    forId: form.forId,
    forName: form.forName,
    orgId: org.id,
    testCode: test.code,
    testName: test.name,
    date: form.date,
    slot: form.slot,
    doctorNote: form.doctorNote || "",
    status: "requested",
    history: [{
      at: new Date().toISOString(),
      by: user.name,
      text: "Requested"
    }],
    demo: !!user.demo
  });

  audit(
    "diagnostic.requested",
    booking.ref,
    `${test.name} @ ${org.name}`,
    user
  );

  notifyOrg(org.id, {
    title: "New test request",
    body: `${booking.ref} · ${test.name} · ${form.date} ${form.slot}`,
    link: "#/app/requests",
    type: "diagnostic"
  });

  notify(user.id, {
    title: "Test requested",
    body: `Ref ${booking.ref}. ${org.name} will confirm.`,
    link: "#/app/diagnostics",
    type: "diagnostic",
    channels: ["inapp", "sms"]
  });

  return booking;
}

export function setBookingStatus(actor, id, status, note = "") {
  const booking = db.get("diagBookings", id);

  if (!booking || !DGN_LABEL[status]) return;

  booking.history.push({
    at: new Date().toISOString(),
    by: actor.name,
    text: DGN_LABEL[status] + (note ? " — " + note : "")
  });

  db.update("diagBookings", id, {
    status,
    history: booking.history
  });

  audit(
    "diagnostic." + status,
    booking.ref,
    note,
    actor
  );

  notify(booking.patientId, {
    title: `Test ${booking.ref}: ${DGN_LABEL[status]}`,
    body: `${booking.testName}${note ? " · " + note : ""}`,
    link: "#/app/diagnostics",
    type: "diagnostic",
    channels: ["inapp", "sms"]
  });
}

export function releaseReport(actor, bookingId, {
  result,
  file
}) {
  const booking = db.get("diagBookings", bookingId);

  if (!booking) {
    throw new Error("Test booking not found.");
  }

  const org = db.get("orgs", booking.orgId);

  if (!org) {
    throw new Error("Diagnostic centre not found.");
  }

  if (!result?.trim()) {
    throw new Error("Enter the report findings.");
  }

  const subjectId = booking.forId || booking.patientId;

  const record = db.insert("records", {
    ownerId: booking.patientId,
    subjectId,
    subjectName: booking.forName,
    type: /X-ray|CT|MRI|Ultra/i.test(booking.testName)
      ? "imaging"
      : "lab",
    title: `${booking.testName} — ${org.name}`,
    date: isoDay(),
    orgId: org.id,
    source: "diagnostic",
    content: result.trim() + (
      org.demo ? "\n(DEMO report.)" : ""
    ),
    attachment: file || null,
    demo: !!org.demo,
    bookingId
  });

  db.update("diagBookings", bookingId, {
    reportId: record.id
  });

  setBookingStatus(
    actor,
    bookingId,
    "report_ready",
    "Report released to patient"
  );

  audit(
    "report.released",
    booking.ref,
    record.title,
    actor
  );

  return record;
}

// ---------- ambulance and hospital coordination ----------------------------

export const EM_LABEL = {
  registered: "Registered",
  hospital_proposed: "Hospital proposed",
  notified: "Hospital notified — awaiting acknowledgement",
  acknowledged: "Hospital acknowledged",
  resources_ready: "Hospital confirmed resources ready",
  arrived: "Arrived at hospital",
  closed: "Closed",
  cancelled: "Cancelled"
};

export const NEEDS = [
  ["icu", "ICU"],
  ["trauma", "Trauma / emergency"],
  ["cardiac", "Cardiac care"],
  ["neuro", "Neurology / stroke"],
  ["obstetric", "Obstetric emergency"],
  ["paediatric", "Paediatric"],
  ["surgery", "Surgery"]
];

const needDept = {
  trauma: ["Emergency & Trauma", "Orthopaedics"],
  cardiac: ["Cardiology"],
  neuro: ["Neurology"],
  obstetric: ["Obstetrics & Gynaecology"],
  paediatric: ["Paediatrics"],
  surgery: ["General Surgery"],
  icu: []
};

export function rankHospitals(loc, needs = []) {
  const candidates = db.where(
    "orgs",
    org =>
      org.kind === "hospital" &&
      org.verification === "verified" &&
      org.lat
  );

  return candidates.map(org => {
    const distance = haversine(loc, org) * 1.3;
    const eta = Math.round(distance / 45 * 60 + 2);

    const reasons = [];
    const warns = [];
    let score = 100 - distance * 1.2;

    if (!org.emergency24x7) {
      score -= 60;
      warns.push("No 24×7 emergency service listed");
    } else {
      reasons.push("24×7 emergency");
    }

    for (const need of needs) {
      if (need === "icu") {
        const beds = org.beds?.icu;
        const available = beds
          ? beds.total - beds.occupied - (beds.unavailable || 0)
          : 0;

        if (available > 0) {
          reasons.push(`${available} ICU bed(s) reported`);
          score += 15;
        } else {
          warns.push("No ICU bed reported");
          score -= 30;
        }
      } else {
        const supported = needDept[need]?.some(
          department => org.depts.includes(department)
        );

        if (supported) {
          reasons.push(
            NEEDS.find(item => item[0] === need)[1] +
            " department"
          );
          score += 12;
        } else {
          warns.push(
            `No ${NEEDS.find(item => item[0] === need)[1]} department listed`
          );
          score -= 25;
        }
      }
    }

    const emergencyBeds = org.beds?.emergency;
    const availableEmergencyBeds = emergencyBeds
      ? emergencyBeds.total -
        emergencyBeds.occupied -
        (emergencyBeds.unavailable || 0)
      : 0;

    if (availableEmergencyBeds > 0) {
      reasons.push(
        `${availableEmergencyBeds} emergency bed(s) reported`
      );
      score += 8;
    } else {
      warns.push("No emergency bed reported");
    }

    const stale = isStale(
      emergencyBeds?.updatedAt ||
      (org.beds && Object.values(org.beds)[0]?.updatedAt)
    );

    if (stale) {
      warns.push("Bed data is outdated — phone ahead");
      score -= 10;
    }

    return {
      org,
      distKm: distance,
      etaMin: eta,
      score: Math.round(score),
      reasons,
      warns,
      stale
    };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

const evt = (emergency, by, text, kind = "info") => {
  emergency.timeline.push({
    at: new Date().toISOString(),
    by,
    text,
    kind
  });

  return emergency;
};

export function createEmergency(user, form) {
  const emergency = db.insert("emergencies", {
    ref: refNo("EMG"),
    orgId: user.orgId,
    createdBy: user.id,
    vehicleId: form.vehicleId,
    patient: form.patient,
    location: form.location,
    needs: form.needs,
    status: "registered",
    dispatched: false,
    hospitalId: null,
    etaMin: null,
    timeline: [],
    demo: !!user.demo
  });

  evt(
    emergency,
    user.name,
    "Emergency request registered by ambulance operator"
  );

  db.save();

  audit(
    "emergency.registered",
    emergency.ref,
    form.patient.complaint,
    user
  );

  return emergency;
}

export function confirmDispatch(user, id) {
  const emergency = db.get("emergencies", id);
  if (!emergency) return;

  evt(
    emergency,
    user.name,
    "Operator confirmed the ambulance has been dispatched",
    "ok"
  );

  db.update("emergencies", id, {
    dispatched: true,
    timeline: emergency.timeline
  });

  audit(
    "emergency.dispatched",
    emergency.ref,
    "",
    user
  );
}

export function notifyHospital(user, id, hospitalId, etaMin) {
  const emergency = db.get("emergencies", id);
  const hospital = db.get("orgs", hospitalId);

  if (!emergency || !hospital) {
    throw new Error("Emergency or hospital not found.");
  }

  evt(
    emergency,
    user.name,
    `Hospital selected: ${hospital.name} (ETA ${etaMin} min). Notification sent.`
  );

  db.update("emergencies", id, {
    hospitalId,
    etaMin,
    status: "notified",
    timeline: emergency.timeline
  });

  audit(
    "emergency.notified",
    emergency.ref,
    hospital.name,
    user
  );

  notifyOrg(hospitalId, {
    title: `🚑 Incoming emergency ${emergency.ref}`,
    body: `${emergency.patient.triage?.toUpperCase()} · ${emergency.patient.age || "?"}${emergency.patient.sex || ""} · ${emergency.patient.complaint} · ETA ${etaMin} min`,
    link: "#/app/emergency",
    type: "emergency",
    channels: ["inapp", "sms"]
  });
}

export function emergencyAck(user, id) {
  const emergency = db.get("emergencies", id);
  if (!emergency) return;

  evt(
    emergency,
    user.name,
    "Hospital acknowledged the notification",
    "ok"
  );

  db.update("emergencies", id, {
    status: "acknowledged",
    timeline: emergency.timeline
  });

  audit(
    "emergency.acknowledged",
    emergency.ref,
    "",
    user
  );

  notifyOrg(emergency.orgId, {
    title: `${emergency.ref}: hospital acknowledged`,
    link: "#/app/console",
    type: "emergency"
  });
}

export function emergencyReady(user, id, note) {
  const emergency = db.get("emergencies", id);
  if (!emergency) return;

  evt(
    emergency,
    user.name,
    `Hospital confirmed resources ready${note ? ": " + note : ""}`,
    "ok"
  );

  db.update("emergencies", id, {
    status: "resources_ready",
    timeline: emergency.timeline,
    readyNote: note
  });

  audit(
    "emergency.ready",
    emergency.ref,
    note,
    user
  );

  notifyOrg(emergency.orgId, {
    title: `${emergency.ref}: resources ready`,
    body: note,
    link: "#/app/console",
    type: "emergency"
  });
}

export function emergencyEta(user, id, etaMin) {
  const emergency = db.get("emergencies", id);
  if (!emergency) return;

  evt(
    emergency,
    user.name,
    `Updated ETA: ${etaMin} min`
  );

  db.update("emergencies", id, {
    etaMin,
    timeline: emergency.timeline
  });

  if (emergency.hospitalId) {
    notifyOrg(emergency.hospitalId, {
      title: `${emergency.ref}: ETA ${etaMin} min`,
      link: "#/app/emergency",
      type: "emergency"
    });
  }
}

export function emergencyArrived(user, id) {
  const emergency = db.get("emergencies", id);
  if (!emergency) return;

  evt(
    emergency,
    user.name,
    "Hospital confirmed patient arrival",
    "ok"
  );

  db.update("emergencies", id, {
    status: "arrived",
    timeline: emergency.timeline
  });

  audit(
    "emergency.arrived",
    emergency.ref,
    "",
    user
  );

  notifyOrg(emergency.orgId, {
    title: `${emergency.ref}: patient arrived`,
    link: "#/app/console",
    type: "emergency"
  });
}

export function emergencyClose(user, id) {
  const emergency = db.get("emergencies", id);
  if (!emergency) return;

  evt(
    emergency,
    user.name,
    "Case closed"
  );

  db.update("emergencies", id, {
    status: "closed",
    timeline: emergency.timeline
  });

  audit(
    "emergency.closed",
    emergency.ref,
    "",
    user
  );
}

// ---------- camps -----------------------------------------------------------

export function registerForCamp(user, camp, forName) {
  const existing = db.where(
    "campRegs",
    registration =>
      registration.campId === camp.id &&
      registration.citizenId === user.id &&
      registration.forName === forName &&
      registration.status !== "cancelled"
  );

  if (existing.length) {
    throw new Error(`${forName} is already registered.`);
  }

  const registrations = db.where(
    "campRegs",
    registration =>
      registration.campId === camp.id &&
      registration.status !== "cancelled"
  ).length;

  if (camp.capacity && registrations >= camp.capacity) {
    throw new Error("This camp is full.");
  }

  const registration = db.insert("campRegs", {
    campId: camp.id,
    citizenId: user.id,
    forName,
    status: "registered",
    demo: !!user.demo
  });

  audit(
    "camp.registered",
    camp.title,
    forName,
    user
  );

  notify(user.id, {
    title: "Camp registration confirmed",
    body: `${camp.title} · ${camp.date} ${camp.start}`,
    link: "#/app/camps",
    type: "camp",
    channels: ["inapp", "sms"]
  });

  return registration;
}

// ---------- pharmacy --------------------------------------------------------

export function pharmacyStockFor(name) {
  const key = name.trim().toLowerCase();

  return db.where(
    "stock",
    item =>
      item.qty > 0 &&
      (
        item.name.toLowerCase().includes(key) ||
        item.generic.toLowerCase().includes(key)
      )
  )
    .map(item => ({
      stock: item,
      org: db.get("orgs", item.orgId)
    }))
    .filter(item =>
      item.org?.verification === "verified"
    );
}

// ---------- shared lookups --------------------------------------------------

export const orgName = id =>
  db.get("orgs", id)?.name || "—";

export const userName = id =>
  db.get("users", id)?.name || "—";

export function profilesFor(user) {
  return [
    {
      id: user.id,
      name: user.name,
      relation: "Self"
    },
    ...db.where(
      "family",
      family => family.ownerId === user.id
    ).map(family => ({
      id: family.id,
      name: family.name,
      relation: family.relation
    }))
  ];
}

export const unread = userId =>
  db.where(
    "notifications",
    notification =>
      notification.userId === userId &&
      !notification.read
  ).length;

export { uid };
