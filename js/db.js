// Browser-local data store, authentication, audit chain and notifications.
//
// PROTOTYPE ONLY:
// Data is stored in this browser's localStorage. This is not a secure
// multi-user backend. Production deployment requires server-side
// authentication, database access controls, RLS and protected file storage.

import { sha256, uid, isoDay } from "./util.js";
import { buildSeed, ROLES } from "./seed.js";

const KEY = "swasthya.db.v3";
const SESSION = "swasthya.session";

let data = null;
const listeners = new Set();

export const onChange = fn => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const emit = (source = "local") => {
  listeners.forEach(fn => {
    try {
      fn(source);
    } catch (error) {
      console.error("Database listener error:", error);
    }
  });
};

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.warn("Storage unavailable or full:", error);
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);

    if (raw) {
      const parsed = JSON.parse(raw);

      if (
        parsed &&
        parsed.meta?.version === 3 &&
        typeof parsed === "object"
      ) {
        data = parsed;
        return data;
      }
    }
  } catch (error) {
    console.warn("Could not load saved data:", error);
  }

  data = buildSeed();
  persist();

  return data;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", event => {
    if (event.key !== KEY || !event.newValue) return;

    try {
      const updated = JSON.parse(event.newValue);

      if (updated && updated.meta?.version === 3) {
        data = updated;
        emit("remote");
      }
    } catch {
      // Ignore invalid cross-tab updates.
    }
  });
}

export const db = {
  get data() {
    return data || load();
  },

  all(collection) {
    const result = db.data[collection];

    if (Array.isArray(result)) return result;

    db.data[collection] = [];
    return db.data[collection];
  },

  get(collection, id) {
    return db.all(collection).find(item => item.id === id) || null;
  },

  where(collection, predicate) {
    return db.all(collection).filter(predicate);
  },

  insert(collection, object) {
    const record = {
      id: uid(collection.slice(0, 3)),
      createdAt: new Date().toISOString(),
      ...object
    };

    db.all(collection).unshift(record);
    persist();
    emit();

    return record;
  },

  update(collection, id, patch) {
    const record = db.get(collection, id);

    if (!record) return null;

    const changes =
      typeof patch === "function"
        ? patch(record)
        : patch;

    if (!changes || typeof changes !== "object") {
      return record;
    }

    Object.assign(record, changes);

    persist();
    emit();

    return record;
  },

  remove(collection, id) {
    const records = db.all(collection);
    const index = records.findIndex(item => item.id === id);

    if (index < 0) return false;

    records.splice(index, 1);

    persist();
    emit();

    return true;
  },

  save() {
    persist();
    emit();
  },

  reset() {
    data = buildSeed();
    persist();

    try {
      sessionStorage.removeItem(SESSION);
    } catch {
      // Session storage may be unavailable.
    }

    emit();
  },

  cfg() {
    return db.data.config || {};
  }
};

// -------------------------------------------------------------------------------------------------
// Audit log
// -------------------------------------------------------------------------------------------------

export function audit(
  action,
  target = "",
  detail = "",
  actor = auth.current()
) {
  const log = db.all("audit");
  const previousHash = log.length
    ? log[0].hash
    : "GENESIS";

  const entry = {
    seq: (log[0]?.seq || 0) + 1,
    at: new Date().toISOString(),
    actorId: actor?.id || "anonymous",
    actorRole: actor?.role || "-",
    actorName: actor?.name || "Anonymous",
    action,
    target,
    detail,
    prev: previousHash
  };

  entry.hash = sha256(JSON.stringify([
    entry.seq,
    entry.at,
    entry.actorId,
    entry.action,
    entry.target,
    entry.detail,
    previousHash
  ]));

  log.unshift(entry);

  if (log.length > 2000) {
    log.length = 2000;
  }

  persist();
  emit();

  return entry;
}

export function verifyAuditChain() {
  const log = [...db.all("audit")].reverse();

  for (let index = 0; index < log.length; index++) {
    const entry = log[index];

    const expectedPrevious =
      index === 0
        ? entry.prev
        : log[index - 1].hash;

    const expectedHash = sha256(JSON.stringify([
      entry.seq,
      entry.at,
      entry.actorId,
      entry.action,
      entry.target,
      entry.detail,
      entry.prev
    ]));

    if (
      expectedHash !== entry.hash ||
      (index > 0 && entry.prev !== expectedPrevious)
    ) {
      return {
        ok: false,
        brokenAt: entry.seq,
        total: log.length
      };
    }
  }

  return {
    ok: true,
    total: log.length
  };
}

// -------------------------------------------------------------------------------------------------
// Notifications
// -------------------------------------------------------------------------------------------------

export function notify(
  userId,
  {
    title,
    body = "",
    link = "",
    type = "info",
    channels = ["inapp"]
  } = {}
) {
  if (!userId || !title) return null;

  const notification = db.insert("notifications", {
    userId,
    title,
    body,
    link,
    type,
    at: new Date().toISOString(),
    read: false
  });

  const user = db.get("users", userId);

  if (user) {
    channels
      .filter(channel => channel !== "inapp")
      .forEach(channel => {
        const destination =
          channel === "sms"
            ? user.phone
            : user.email;

        if (!destination) return;

        db.insert("outbox", {
          channel,
          to: destination,
          text: `${title}${body ? " — " + body : ""}`,
          simulated: true,
          at: new Date().toISOString()
        });
      });
  }

  return notification;
}

export const notifyOrg = (orgId, payload) => {
  if (!orgId) return;

  return db
    .where("users", user => user.orgId === orgId)
    .forEach(user => notify(user.id, payload));
};

export const notifyRole = (
  role,
  payload,
  filter = () => true
) => {
  return db
    .where(
      "users",
      user => user.role === role && filter(user)
    )
    .forEach(user => notify(user.id, payload));
};

// -------------------------------------------------------------------------------------------------
// Password handling
// -------------------------------------------------------------------------------------------------

const encoder =
  typeof TextEncoder !== "undefined"
    ? new TextEncoder()
    : null;

const hex = buffer =>
  [...new Uint8Array(buffer)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

function hasSubtleCrypto() {
  return Boolean(
    globalThis.crypto &&
    globalThis.crypto.subtle &&
    encoder
  );
}

async function pbkdf2(password, salt) {
  if (!hasSubtleCrypto()) {
    return "sha256:" + sha256(salt + password);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: 150000
    },
    key,
    256
  );

  return "pbkdf2:" + hex(bits);
}

export const passwordProblem = password => {
  if (typeof password !== "string" || password.length < 8) {
    return "Use at least 8 characters.";
  }

  if (
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return "Include both letters and numbers.";
  }

  return "";
};

// -------------------------------------------------------------------------------------------------
// Authentication
// -------------------------------------------------------------------------------------------------

const MAX_FAILS = 5;
const LOCK_MIN = 10;

function recentFails(email) {
  const since = Date.now() - LOCK_MIN * 60000;

  return db.all("loginAttempts").filter(attempt =>
    attempt.email === email &&
    !attempt.ok &&
    new Date(attempt.at).getTime() > since
  ).length;
}

function logAttempt(email, ok, reason = "") {
  const attempts = db.all("loginAttempts");

  attempts.unshift({
    email,
    ok,
    reason,
    at: new Date().toISOString()
  });

  if (attempts.length > 300) {
    attempts.length = 300;
  }

  db.save();
}

function getSession() {
  try {
    return JSON.parse(
      sessionStorage.getItem(SESSION) || "null"
    );
  } catch {
    return null;
  }
}

function saveSession(userId) {
  sessionStorage.setItem(
    SESSION,
    JSON.stringify({
      userId,
      at: Date.now(),
      touched: Date.now()
    })
  );
}

export const auth = {
  current() {
    try {
      const session = getSession();

      if (!session?.userId) return null;

      const idleMinutes =
        Number(db.cfg().sessionIdleMinutes) || 30;

      const idleLimit = idleMinutes * 60000;

      if (
        !session.touched ||
        Date.now() - session.touched > idleLimit
      ) {
        sessionStorage.removeItem(SESSION);
        return null;
      }

      const user = db.get("users", session.userId);

      if (!user || user.status === "suspended") {
        sessionStorage.removeItem(SESSION);
        return null;
      }

      return user;
    } catch {
      return null;
    }
  },

  touch() {
    try {
      const session = getSession();

      if (!session) return;

      session.touched = Date.now();

      sessionStorage.setItem(
        SESSION,
        JSON.stringify(session)
      );
    } catch {
      // Ignore unavailable session storage.
    }
  },

  async login(email, password) {
    email = String(email || "").trim().toLowerCase();
    password = String(password || "");

    if (!email || !password) {
      throw new Error("Enter your email and password.");
    }

    if (recentFails(email) >= MAX_FAILS) {
      audit(
        "login.locked",
        email,
        "Too many failed attempts",
        null
      );

      throw new Error(
        `Too many failed attempts. Try again in ${LOCK_MIN} minutes.`
      );
    }

    const user = db.all("users").find(
      item =>
        String(item.email || "").toLowerCase() === email
    );

    let valid = false;

    if (user) {
      if (user.passAlgo === "sha256") {
        valid =
          sha256(user.salt + password) === user.passHash;

        if (valid && hasSubtleCrypto()) {
          user.passHash = await pbkdf2(password, user.salt);
          user.passAlgo = "pbkdf2";
        }
      } else {
        valid =
          (await pbkdf2(password, user.salt)) === user.passHash;
      }
    } else {
      // Reduce timing differences for unknown accounts.
      await pbkdf2(password, "unknown-account");
    }

    if (!valid) {
      logAttempt(
        email,
        false,
        user ? "bad password" : "unknown account"
      );

      audit("login.failed", email, "", null);

      throw new Error("Email or password is incorrect.");
    }

    if (user.status === "suspended") {
      logAttempt(email, false, "suspended");

      throw new Error(
        "This account is suspended. Contact the platform administrator."
      );
    }

    logAttempt(email, true);

    saveSession(user.id);

    user.lastLogin = new Date().toISOString();

    db.save();

    audit(
      "login.success",
      user.email,
      user.role,
      user
    );

    return user;
  },

  logout() {
    const user = auth.current();

    if (user) {
      audit("logout", user.email, "", user);
    }

    try {
      sessionStorage.removeItem(SESSION);
    } catch {
      // Ignore unavailable storage.
    }

    emit();
  },

  async register(fields = {}) {
    const role = fields.role;

    if (!ROLES[role]?.self) {
      throw new Error(
        "This account type cannot be created through public registration."
      );
    }

    const email = String(fields.email || "")
      .trim()
      .toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Enter a valid email address.");
    }

    if (
      db.all("users").some(
        user =>
          String(user.email || "").toLowerCase() === email
      )
    ) {
      throw new Error(
        "An account with this email already exists."
      );
    }

    const password = String(fields.password || "");
    const passwordError = passwordProblem(password);

    if (passwordError) {
      throw new Error(passwordError);
    }

    const name = String(fields.name || "").trim();

    if (!name) {
      throw new Error("Enter your name.");
    }

    const salt = uid("s");
    const needsVerification = Boolean(ROLES[role].verify);

    let orgId = null;

    const organisationRoles = [
      "hospital",
      "pharmacy",
      "diagnostic",
      "ambulance"
    ];

    if (organisationRoles.includes(role)) {
      const typeMap = {
        hospital: fields.facilityType || "private_hospital",
        pharmacy: "pharmacy",
        diagnostic: "diagnostic",
        ambulance: "ambulance"
      };

      const organisation = db.insert("orgs", {
        kind: role,
        name: fields.orgName || name,
        type: typeMap[role],
        district: fields.district || "",
        mandal: fields.mandal || "",
        address: fields.address || "",
        pin: fields.pin || "",
        phone: fields.phone || "",
        lat: Number(fields.lat) || null,
        lng: Number(fields.lng) || null,
        verification: "pending",
        demo: false,
        depts: [],
        beds: {},
        tests: [],
        services: [],
        vehicles: role === "ambulance" ? [] : undefined,
        hours: "",
        licenceNo: fields.licenceNo || "",
        regNo: fields.regNo || "",
        emergency24x7: false
      });

      orgId = organisation.id;
    }

    const user = db.insert("users", {
      id: uid("u"),
      role,
      name,
      email,
      phone: fields.phone || "",
      district: fields.district || "",
      mandal: fields.mandal || "",
      salt,
      passHash: await pbkdf2(password, salt),
      passAlgo: hasSubtleCrypto() ? "pbkdf2" : "sha256",
      status: needsVerification ? "pending" : "active",
      lang: fields.lang || "en",
      orgId,
      regNo: fields.regNo || "",
      council: fields.council || "",
      specialization: fields.specialization || "",
      affiliation: fields.affiliation || "",
      ashaId: fields.ashaId || "",
      licenceNo: fields.licenceNo || "",
      docName: fields.docName || "",
      dob: fields.dob || "",
      sex: fields.sex || "",
      demo: false
    });

    if (orgId) {
      db.update("orgs", orgId, {
        ownerUserId: user.id
      });
    }

    if (role === "doctor") {
      const doctor = db.insert("doctors", {
        name: user.name.startsWith("Dr")
          ? user.name
          : "Dr. " + user.name,
        spec: fields.specialization || "General Medicine",
        orgId: fields.affiliationOrgId || null,
        userId: user.id,
        schedule: [],
        fee: 0,
        languages: [],
        verified: false,
        demo: false,
        regNo: fields.regNo || ""
      });

      db.update("users", user.id, {
        doctorId: doctor.id
      });
    }

    audit(
      "account.registered",
      user.email,
      `${role}${needsVerification ? " (pending verification)" : ""}`,
      user
    );

    notify(user.id, {
      title: needsVerification
        ? "Registration received"
        : "Welcome to Swasthya Connect",
      body: needsVerification
        ? "Your account is waiting for verification by the platform administrator."
        : "Your account is ready.",
      channels: ["inapp", "email"],
      type: "account"
    });

    if (needsVerification) {
      notifyRole(
        "admin",
        {
          title: `New ${ROLES[role].label} awaiting verification`,
          body: user.name,
          link: "#/app/approvals",
          type: "approval"
        }
      );
    }

    return user;
  },

  async startRecovery(email) {
    email = String(email || "").trim().toLowerCase();

    const user = db.all("users").find(
      item =>
        String(item.email || "").toLowerCase() === email
    );

    audit(
      "recovery.requested",
      email,
      user ? "" : "unknown account",
      null
    );

    if (!user) return null;

    const code = String(
      Math.floor(100000 + Math.random() * 900000)
    );

    db.update("users", user.id, {
      recovery: {
        code: sha256(code + user.salt),
        exp: Date.now() + 15 * 60000
      }
    });

    db.insert("outbox", {
      channel: "email",
      to: user.email,
      text: `Your Swasthya Connect password reset code is ${code} (valid 15 minutes).`,
      simulated: true,
      at: new Date().toISOString()
    });

    // PROTOTYPE ONLY: no email is sent.
    return code;
  },

  async finishRecovery(email, code, newPassword) {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    const user = db.all("users").find(
      item =>
        String(item.email || "").toLowerCase() === normalizedEmail
    );

    const recovery = user?.recovery;

    if (
      !recovery ||
      Date.now() > recovery.exp ||
      sha256(String(code || "").trim() + user.salt) !== recovery.code
    ) {
      throw new Error("That code is invalid or has expired.");
    }

    const passwordError = passwordProblem(newPassword);

    if (passwordError) {
      throw new Error(passwordError);
    }

    db.update("users", user.id, {
      passHash: await pbkdf2(newPassword, user.salt),
      passAlgo: hasSubtleCrypto() ? "pbkdf2" : "sha256",
      recovery: null
    });

    audit(
      "recovery.completed",
      user.email,
      "",
      user
    );
  },

  async changePassword(user, oldPassword, newPassword) {
    if (!user) {
      throw new Error("Please sign in again.");
    }

    const valid =
      user.passAlgo === "sha256"
        ? sha256(user.salt + oldPassword) === user.passHash
        : (await pbkdf2(oldPassword, user.salt)) === user.passHash;

    if (!valid) {
      throw new Error("Current password is incorrect.");
    }

    const passwordError = passwordProblem(newPassword);

    if (passwordError) {
      throw new Error(passwordError);
    }

    db.update("users", user.id, {
      passHash: await pbkdf2(newPassword, user.salt),
      passAlgo: hasSubtleCrypto() ? "pbkdf2" : "sha256"
    });

    audit(
      "password.changed",
      user.email,
      "",
      user
    );
  },

  async inviteOfficer(admin, {
    name,
    email,
    district
  } = {}) {
    if (admin?.role !== "admin") {
      throw new Error(
        "Only a super administrator can create district officer accounts."
      );
    }

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!name?.trim() || !normalizedEmail || !district) {
      throw new Error(
        "Enter the officer name, email and district."
      );
    }

    if (
      db.all("users").some(
        user =>
          String(user.email || "").toLowerCase() === normalizedEmail
      )
    ) {
      throw new Error(
        "An account with this email already exists."
      );
    }

    const temporaryPassword =
      "Dist-" + Math.random().toString(36).slice(2, 8) + "9";

    const salt = uid("s");

    const user = db.insert("users", {
      id: uid("u"),
      role: "district",
      name: name.trim(),
      email: normalizedEmail,
      district,
      salt,
      passHash: await pbkdf2(temporaryPassword, salt),
      passAlgo: hasSubtleCrypto() ? "pbkdf2" : "sha256",
      status: "active",
      lang: "en",
      demo: false,
      mustChange: true
    });

    audit(
      "officer.created",
      normalizedEmail,
      district,
      admin
    );

    db.insert("outbox", {
      channel: "email",
      to: normalizedEmail,
      text: `Your district health officer account has been created. Temporary password: ${temporaryPassword}`,
      simulated: true,
      at: new Date().toISOString()
    });

    return {
      user,
      temp: temporaryPassword
    };
  }
};

// -------------------------------------------------------------------------------------------------
// Passive session keep-alive
// -------------------------------------------------------------------------------------------------

if (typeof window !== "undefined") {
  ["click", "keydown"].forEach(eventName => {
    window.addEventListener(
      eventName,
      () => auth.touch(),
      { passive: true }
    );
  });
}

// -------------------------------------------------------------------------------------------------
// Network state
// -------------------------------------------------------------------------------------------------

export const net = {
  simulated: false,

  get offline() {
    return this.simulated ||
      (typeof navigator !== "undefined" && !navigator.onLine);
  },

  toggleSim() {
    this.simulated = !this.simulated;

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("netchange"));
    }
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    window.dispatchEvent(new Event("netchange"));
  });

  window.addEventListener("offline", () => {
    window.dispatchEvent(new Event("netchange"));
  });
}

export const today = () => isoDay();
