import { createRequire } from "module";

const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");

const base = process.argv[2] || "http://localhost:8801/";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];

page.on("pageerror", error => errors.push(error.message));

try {
  await page.goto(base + "#/login");
  await page.waitForSelector(".demo-accts");

  const result = await page.evaluate(async () => {
    const dbModule = await import("/js/db.js");
    const services = await import("/js/services.js");
    const { db } = dbModule;
    const out = {};

    const citizen = db.get("users", "u_citizen");
    const hospital = db.get("users", "u_hospital");
    const doctor = db.get("users", "u_doctor");
    const ambulance = db.get("users", "u_ambulance");

    // Appointment booking and duplicate prevention
    const doctorRecord = db.get("doctors", "doc_001");
    let date = null;
    let time = null;

    for (let i = 1; i < 10 && !time; i++) {
      const day = new Date(Date.now() + i * 864e5)
        .toISOString()
        .slice(0, 10);

      const slot = services
        .slotsFor(doctorRecord, day)
        .find(item => item.free);

      if (slot) {
        date = day;
        time = slot.time;
      }
    }

    const appointment = services.requestAppointment(citizen, {
      doctorId: doctorRecord.id,
      date,
      time,
      forId: citizen.id,
      forName: citizen.name,
      reason: "Test"
    });

    try {
      services.requestAppointment(citizen, {
        doctorId: doctorRecord.id,
        date,
        time,
        forId: citizen.id,
        forName: citizen.name,
        reason: "Duplicate test"
      });

      out.doubleBook = "ALLOWED (bad)";
    } catch {
      out.doubleBook = "blocked";
    }

    services.setApptStatus(
      hospital,
      appointment.id,
      "confirmed"
    );

    out.apptStatus = db.get(
      "appointments",
      appointment.id
    ).status;

    out.patientNotified = db.where(
      "notifications",
      notification =>
        notification.userId === citizen.id &&
        /confirmed/.test(notification.title)
    ).length > 0;

    // Admission workflow
    const admission = services.submitAdmission(citizen, {
      orgId: hospital.orgId,
      department: "General Medicine",
      category: "Planned",
      reason: "Test",
      forName: citizen.name
    });

    try {
      services.setAdmissionStatus(
        hospital,
        admission.id,
        "admitted"
      );

      out.admSkip = "ALLOWED (bad)";
    } catch {
      out.admSkip = "blocked";
    }

    services.setAdmissionStatus(
      hospital,
      admission.id,
      "received"
    );

    services.setAdmissionStatus(
      hospital,
      admission.id,
      "under_review"
    );

    services.setAdmissionStatus(
      hospital,
      admission.id,
      "accepted",
      "Come to ward 3"
    );

    out.adm = db.get(
      "admissions",
      admission.id
    ).status;

    // Patient consent and record access
    const record = db.get("records", "rec_2");

    out.docSeesBefore = services
      .accessibleRecords(doctor, "u_citizen")
      .records
      .map(item => item.id)
      .includes("rec_2");

    const consent = services.grantConsent(citizen, {
      doctorUserId: doctor.id,
      recordIds: ["rec_2"],
      purpose: "test",
      days: 1
    });

    out.docSeesAfter = services
      .accessibleRecords(doctor, "u_citizen")
      .records
      .map(item => item.id)
      .includes("rec_2");

    services.revokeConsent(citizen, consent.id);

    out.docSeesRevoked = services
      .accessibleRecords(doctor, "u_citizen")
      .records
      .map(item => item.id)
      .includes("rec_2");

    // Emergency coordination
    const emergency = services.createEmergency(ambulance, {
      vehicleId: "veh_01",
      patient: {
        age: 50,
        sex: "M",
        triage: "critical",
        complaint: "Chest pain"
      },
      location: {
        lat: 16.3,
        lng: 80.44,
        label: "Test location"
      },
      needs: ["cardiac", "icu"]
    });

    const ranked = services.rankHospitals(
      emergency.location,
      emergency.needs
    );

    out.top = ranked[0].org.name;

    services.notifyHospital(
      ambulance,
      emergency.id,
      ranked[0].org.id,
      ranked[0].etaMin
    );

    out.dispatchedBeforeConfirm = db.get(
      "emergencies",
      emergency.id
    ).dispatched;

    services.emergencyAck(hospital, emergency.id);

    out.readyBeforePress =
      db.get("emergencies", emergency.id).status ===
      "resources_ready";

    // Audit-chain integrity
    out.chain = dbModule.verifyAuditChain();

    const audit = db.all("audit");

    audit[Math.floor(audit.length / 2)].detail =
      "tampered";

    out.tamper = dbModule.verifyAuditChain().ok
      ? "NOT DETECTED (bad)"
      : "detected";

    // Registration and privileged-role protection
    try {
      await db.auth.register({
        role: "admin",
        name: "Test",
        email: "x@x.com",
        password: "abcd1234"
      });

      out.adminReg = "ALLOWED (bad)";
    } catch {
      out.adminReg = "blocked";
    }

    const newDoctor = await db.auth.register({
      role: "doctor",
      name: "New Doc",
      email: "nd@x.com",
      password: "abcd1234",
      regNo: "R1",
      specialization: "ENT"
    });

    out.newDocStatus = newDoctor.status;

    return out;
  });

  console.log(JSON.stringify(result, null, 1));

  console.log(
    errors.length ? errors : "no page errors"
  );
} finally {
  await browser.close();
}
