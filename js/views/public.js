// Public pages: landing, sign in, register, password recovery, public facility finder.
import { h, icon, clear } from "../util.js";
import { db, auth } from "../db.js";
import { ROLES, DISTRICTS, FACILITY_TYPES, DEPARTMENTS } from "../seed.js";
import { t, setLang, lang, LANGS } from "../i18n.js";
import { form, card, notice, btn, toast, grid, stat, provBadge } from "../ui.js";
import { explorer, profile, allFacilities } from "./find.js";
import { createMap } from "../map.js";
import { a11yControls } from "../main.js";

export function frame(ctx, view, parts) {
  const body = { "": landing, login, register, recover, find: findPage, about }[view] || landing;

  return h("div", { class: "pub" },
    h("div", { class: "sos" },
      icon("siren", 16),
      h("span", {}, t("emerg.banner")),
      h("a", { href: "tel:108", "aria-label": "Call emergency number 108" }, "Call 108"),
      h("a", { href: "tel:112", "aria-label": "Call emergency number 112" }, "112")
    ),
    h("header", { class: "pub-top" },
      h("a", { class: "brand", href: "#/", "aria-label": "Swasthya Connect AI home" },
        h("span", { class: "mark" }, icon("heart", 20)),
        "Swasthya Connect AI"
      ),
      h("div", { class: "grow" }),
      h("a", { class: "btn ghost", href: "#/find" }, t("nav.find", "Find hospitals")),
      h("a", { class: "btn ghost", href: "#/about" }, "About"),
      h("select", {
        "aria-label": "Language",
        onchange: e => setLang(e.target.value)
      }, LANGS.map(l => h("option", {
        value: l[0],
        selected: l[0] === lang()
      }, l[1]))),
      ...a11yControls(),
      ...(ctx.user
        ? [h("a", { class: "btn primary", href: "#/app" }, "Open my workspace")]
        : [
            h("a", { class: "btn", href: "#/login" }, t("common.signin", "Sign in")),
            h("a", { class: "btn primary", href: "#/register" }, t("common.register", "Register"))
          ])
    ),
    h("main", { id: "main", tabindex: "-1" }, body(ctx, parts))
  );
}

function landing() {
  const mapEl = h("div", {});
  const map = createMap(mapEl, {
    height: "430px",
    center: { lat: 15.9, lng: 80.2 },
    zoom: 7
  });

  const facilities = allFacilities();
  map.setMarkers(facilities
    .filter(f => Number.isFinite(Number(f.lat)) && Number.isFinite(Number(f.lng)))
    .map(f => ({
      id: f.id,
      lat: Number(f.lat),
      lng: Number(f.lng),
      kind: f.kind === "hospital" ? f.type : f.kind,
      title: f.name
    }))
  );

  const districtSelect = h("select", {
    "aria-label": "District"
  },
    h("option", { value: "" }, t("common.district", "District")),
    DISTRICTS.map(d => h("option", { value: d.name }, d.name))
  );

  const query = h("input", {
    type: "search",
    placeholder: "Hospital, village or PIN code",
    "aria-label": "Search hospitals, villages or PIN codes"
  });

  const go = () => {
    location.hash = "#/find";
  };

  const hospitals = facilities.filter(f => f.kind === "hospital");

  return h("div", {},
    h("section", { class: "hero" },
      h("div", { class: "hero-in" },
        h("div", {},
          h("h1", {}, t("hero.title", "Find the right care, close to home.")),
          h("p", {}, t(
            "hero.sub",
            "Hospitals, doctors, tests, pharmacies, camps and ambulances across Andhra Pradesh — one connected place."
          )),
          h("form", {
            class: "finder",
            onsubmit: e => {
              e.preventDefault();
              localStorage.setItem("swasthya.q", query.value.trim());
              if (districtSelect.value) {
                localStorage.setItem("swasthya.district", districtSelect.value);
              } else {
                localStorage.removeItem("swasthya.district");
              }
              go();
            }
          },
            query,
            districtSelect,
            h("button", { class: "btn primary", type: "submit" },
              icon("search", 16),
              t("common.search", "Search")
            )
          ),
          h("div", { class: "quick" },
            h("a", { href: "#/find" }, "Hospitals near me"),
            h("a", { href: "#/register" }, "Create an account"),
            h("a", { href: "#/login" }, "Try the demo")
          )
        ),
        mapEl
      )
    ),

    h("section", { class: "pub-sec" },
      h("h2", {}, "What each person gets"),
      h("div", {
        class: "grid g3",
        style: { marginTop: "1rem" }
      },
        ...[
          [
            "user",
            "Patients & families",
            "Find hospitals, book appointments, request admission, order tests, and decide which doctor sees which record — and for how long."
          ],
          [
            "building",
            "Hospitals & labs",
            "Publish beds with timestamps, review admission requests, run appointment queues, receive ambulance alerts before arrival."
          ],
          [
            "siren",
            "Ambulances",
            "Rank hospitals by distance, capability and how fresh their bed data is. The platform never says “dispatched” or “ready” until a person confirms it."
          ],
          [
            "heart",
            "ASHA & camps",
            "Field records that work offline and sync later; camp registrations and attendance."
          ],
          [
            "chart",
            "District officers",
            "Aggregates only, with small-number suppression — no patient names."
          ],
          [
            "shield",
            "Administrators",
            "Verification queue and a tamper-evident audit log."
          ]
        ].map(([symbol, title, description]) =>
          card(
            { title },
            h("div", {
              class: "cluster",
              style: {
                alignItems: "flex-start",
                flexWrap: "nowrap"
              }
            },
              icon(symbol, 22),
              h("p", { style: { margin: 0 } }, description)
            )
          )
        )
      )
    ),

    h("section", { class: "pub-sec" },
      h("div", { class: "honest" },
        h("h2", {}, "How we label information"),
        h("p", {}, "A public facility listing does not tell you whether a bed, doctor or medicine is available today. Every figure here carries a label:"),
        h("div", { class: "cluster" },
          ["verified", "provider", "public", "demo", "unverified", "outdated"]
            .map(key => h("span", {}, provBadge(key)))
        ),
        h("p", { class: "small muted" },
          "This build runs on DEMO data in your browser. Nothing is sent to real hospitals, pharmacies or ambulances."
        )
      )
    ),

    h("section", { class: "pub-sec" },
      grid(
        3,
        stat("Demo hospitals", hospitals.length),
        stat("Districts covered", new Set(hospitals.map(f => f.district)).size, "of 28"),
        stat("Languages", "4", "Telugu · English · Hindi · Tamil")
      )
    )
  );
}

function findPage(ctx, parts) {
  return h("div", { class: "pub-sec" },
    parts[1]
      ? profile(ctx, parts[1])
      : [
          h("h1", { style: { marginBottom: "1rem" } }, t("nav.find", "Find hospitals")),
          explorer(ctx)
        ]
  );
}

function about() {
  return h("div", {
    class: "pub-sec stack",
    style: { maxWidth: "800px" }
  },
    h("h1", {}, "About this prototype"),
    notice(
      "demo",
      "Runs entirely in your browser with DEMO data. Accounts, records and audit logs are stored in this browser's localStorage — a production system needs the server, database and security controls described in the README and the supabase/ folder."
    ),
    h("p", {},
      "Swasthya Connect AI is a design prototype of a healthcare coordination platform for Andhra Pradesh: individual accounts with role-based access, patient-controlled record sharing, bed availability with timestamps, appointment and admission workflows, diagnostics, ambulance-to-hospital coordination, pharmacies, camps, ASHA field work, district aggregates and an audit trail."
    ),
    h("p", {},
      "Public facility locations come from the Andhra Pradesh GIS layers when reachable. They are a directory, not live data."
    )
  );
}

function afterLogin() {
  const next = sessionStorage.getItem("swasthya.next");
  sessionStorage.removeItem("swasthya.next");
  location.hash = next && next.startsWith("#/app") ? next : "#/app";
}

function login() {
  const demo = db.all("users")
    .filter(user => user.demo)
    .sort((a, b) =>
      Object.keys(ROLES).indexOf(a.role) - Object.keys(ROLES).indexOf(b.role)
    );

  const seen = new Set();
  const picks = demo.filter(user => {
    if (seen.has(user.role)) return false;
    seen.add(user.role);
    return true;
  });

  const loginForm = form([
    {
      name: "email",
      label: t("common.email", "Email"),
      type: "email",
      required: true,
      autocomplete: "username"
    },
    {
      name: "password",
      label: t("common.password", "Password"),
      type: "password",
      required: true,
      autocomplete: "current-password"
    }
  ], {
    submitLabel: t("common.signin", "Sign in"),
    onSubmit: async values => {
      await auth.login(values.email, values.password);
      afterLogin();
    }
  });

  return h("div", { class: "auth-wrap stack" },
    h("h1", {}, t("common.signin", "Sign in")),
    card({},
      loginForm,
      h("p", { class: "small" },
        h("a", { href: "#/recover" }, "Forgot password?"),
        " · ",
        h("a", { href: "#/register" }, "Create an account")
      )
    ),
    card({
      title: "Try a DEMO account",
      sub: "Password for all demo accounts: demo1234. Demo accounts only ever see demo data."
    },
      h("div", { class: "demo-accts" },
        picks.map(user =>
          h("button", {
            class: "btn sm",
            type: "button",
            onclick: async () => {
              await auth.login(user.email, "demo1234");
              afterLogin();
            }
          },
            icon(ROLES[user.role].icon, 14),
            ROLES[user.role].label
          )
        )
      )
    )
  );
}

function register() {
  let role = "citizen";
  const holder = h("div", {});
  const roleBox = h("div", {
    class: "role-cards",
    role: "group",
    "aria-label": "Account type"
  });

  const roles = Object.entries(ROLES).filter(([, roleInfo]) => roleInfo.self);

  const hints = {
    citizen: "Active immediately.",
    doctor: "Needs professional verification.",
    hospital: "Facility verification required.",
    pharmacy: "Licence verification required.",
    organizer: "Approval required.",
    asha: "Role verification required.",
    diagnostic: "Verification required.",
    ambulance: "Verification required."
  };

  const districtOptions = DISTRICTS.map(district => district.name);

  function paint() {
    clear(roleBox).append(
      ...roles.map(([key, roleInfo]) =>
        h("button", {
          type: "button",
          class: "role-card",
          "aria-pressed": key === role,
          onclick: () => {
            role = key;
            paint();
          }
        },
          icon(roleInfo.icon, 20),
          h("span", {},
            roleInfo.label,
            h("small", {}, hints[key] || "Verification may be required.")
          )
        )
      )
    );

    const isOrganisation = ["hospital", "pharmacy", "diagnostic", "ambulance"].includes(role);

    const fields = [
      {
        name: "name",
        label: isOrganisation ? "Contact person name" : "Full name",
        required: true
      },
      {
        name: "email",
        label: "Email",
        type: "email",
        required: true,
        autocomplete: "email"
      },
      {
        name: "phone",
        label: "Mobile number",
        type: "tel",
        inputmode: "tel"
      },
      {
        name: "password",
        label: "Password",
        type: "password",
        required: true,
        hint: "8+ characters with letters and numbers.",
        autocomplete: "new-password"
      },
      {
        name: "district",
        label: "District",
        type: "select",
        options: districtOptions,
        required: true
      },

      ...(role === "citizen" ? [
        { name: "dob", label: "Date of birth", type: "date" },
        {
          name: "sex",
          label: "Sex",
          type: "select",
          options: [
            { value: "F", label: "Female" },
            { value: "M", label: "Male" },
            { value: "O", label: "Other" }
          ]
        }
      ] : []),

      ...(role === "doctor" ? [
        {
          name: "council",
          label: "Medical council",
          type: "select",
          options: [
            "Andhra Pradesh Medical Council",
            "National Medical Commission register",
            "Other"
          ],
          required: true
        },
        {
          name: "regNo",
          label: "Registration number",
          required: true
        },
        {
          name: "specialization",
          label: "Specialization",
          type: "select",
          options: DEPARTMENTS,
          required: true
        },
        {
          name: "docName",
          label: "Certificate (file name for review)",
          hint: "Prototype: provide the file name; production uploads to protected storage."
        }
      ] : []),

      ...(isOrganisation ? [
        {
          name: "orgName",
          label: role === "hospital" ? "Facility name" : "Business name",
          required: true
        },
        ...(role === "hospital" ? [
          {
            name: "facilityType",
            label: "Facility type",
            type: "select",
            options: Object.entries(FACILITY_TYPES)
              .filter(([key]) => ["govt_hospital", "private_hospital", "chc", "phc"].includes(key))
              .map(([value, label]) => ({ value, label })),
            required: true
          }
        ] : []),
        {
          name: "address",
          label: "Address",
          wide: true
        },
        {
          name: "pin",
          label: "PIN code",
          pattern: "[0-9]{6}",
          inputmode: "numeric"
        },
        {
          name: "licenceNo",
          label: role === "hospital" ? "Registration / ABDM HFR ID" : "Licence number",
          required: true
        }
      ] : []),

      ...(role === "asha" ? [
        { name: "ashaId", label: "ASHA / worker ID", required: true },
        { name: "mandal", label: "Mandal" }
      ] : []),

      ...(role === "organizer" ? [
        { name: "affiliation", label: "Organisation / trust name", required: true }
      ] : []),

      {
        name: "agree",
        label: "I consent to my information being processed to provide this service, as described in the privacy notice (prototype).",
        type: "checkbox",
        required: true
      }
    ];

    clear(holder).append(
      form(fields, {
        submitLabel: t("common.register", "Register"),
        onSubmit: async values => {
          if (!values.agree) {
            throw new Error("Please accept the consent statement to continue.");
          }

          delete values.agree;

          const user = await auth.register({
            ...values,
            role,
            lang: lang()
          });

          await auth.login(values.email, values.password);

          toast(
            user.status === "pending"
              ? "Registered. An administrator will verify your details."
              : "Welcome!"
          );

          location.hash = "#/app";
        }
      })
    );
  }

  paint();

  return h("div", {
    class: "auth-wrap stack",
    style: { maxWidth: "720px" }
  },
    h("h1", {}, t("common.register", "Register")),
    notice(
      "info",
      "District Health Officer and Super Administrator accounts cannot be created here — they are issued by authorised administrators."
    ),
    card({ title: "I am a…" }, roleBox),
    card({}, holder)
  );
}

function recover() {
  const output = h("div", {});

  const recoveryForm = form([
    {
      name: "email",
      label: "Account email",
      type: "email",
      required: true
    }
  ], {
    submitLabel: "Send reset code",
    onSubmit: async values => {
      const code = await auth.startRecovery(values.email);

      clear(output).append(
        notice(
          "warn",
          h("strong", {}, "PROTOTYPE: "),
          "no email is really sent. ",
          code
            ? h("span", {}, "Your code is ", h("b", {}, code), ".")
            : "If the account exists, a code was issued."
        ),
        form([
          {
            name: "code",
            label: "6-digit code",
            required: true,
            inputmode: "numeric"
          },
          {
            name: "password",
            label: "New password",
            type: "password",
            required: true
          }
        ], {
          submitLabel: "Reset password",
          onSubmit: async resetValues => {
            await auth.finishRecovery(
              values.email,
              resetValues.code,
              resetValues.password
            );
            toast("Password updated. Please sign in.");
            location.hash = "#/login";
          }
        })
      );
    }
  });

  return h("div", { class: "auth-wrap stack" },
    h("h1", {}, "Reset password"),
    card({}, recoveryForm, output)
  );
}
