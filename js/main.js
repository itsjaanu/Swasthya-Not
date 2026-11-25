// App entry: router, shell, session handling and workspace loading.
import { h, $, clear, icon } from "./util.js";
import { db, load, auth, onChange, net } from "./db.js";
import { ROLES } from "./seed.js";
import { t, setLang, lang, LANGS } from "./i18n.js";
import { unread, runReminders } from "./services.js";
import * as pub from "./views/public.js";
import * as common from "./views/common.js";
import { mountAssistant } from "./assistant.js";

load();

const MODULES = {
  citizen: () => import("./views/citizen.js"),
  doctor: () => import("./views/doctor.js"),
  hospital: () => import("./views/hospital.js"),
  diagnostic: () => import("./views/diagnostic.js"),
  pharmacy: () => import("./views/pharmacy.js"),
  organizer: () => import("./views/organizer.js"),
  asha: () => import("./views/asha.js"),
  ambulance: () => import("./views/ambulance.js"),
  district: () => import("./views/district.js"),
  admin: () => import("./views/admin.js")
};

const loaded = {};
const injected = new Set();
const root = document.getElementById("app");

let shell = null;
let current = null;
let renderToken = 0;

const parse = () => {
  return (location.hash.replace(/^#\/?/, "") || "")
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
};

export const go = path => {
  location.hash = path.startsWith("#")
    ? path
    : "#/app/" + path.replace(/^\//, "");
};

window.swGo = go;

async function loadRole(role) {
  if (loaded[role]) return loaded[role];

  let module;

  try {
    const importer = MODULES[role];

    if (!importer) {
      throw new Error(`Unknown workspace role: ${role}`);
    }

    module = await importer();
  } catch (error) {
    console.warn("Workspace module could not be loaded:", role, error);

    module = {
      nav: [
        {
          id: "unavailable",
          icon: "info",
          label: "Workspace"
        }
      ],
      routes: {
        unavailable: () =>
          h(
            "div",
            { class: "notice info" },
            icon("info", 18),
            h(
              "div",
              {},
              h("strong", {}, "Workspace unavailable. "),
              "This workspace could not be loaded. Please refresh the application."
            )
          )
      }
    };
  }

  loaded[role] = module;

  if (module.css && !injected.has(role)) {
    injected.add(role);

    document.head.append(
      h("style", { "data-view": role }, module.css)
    );
  }

  if (module.strings) {
    const i18n = await import("./i18n.js");
    i18n.registerStrings(module.strings);
  }

  return module;
}

async function route() {
  const token = ++renderToken;
  const parts = parse();
  const user = auth.current();

  document.body.classList.toggle(
    "is-public",
    parts[0] !== "app"
  );

  if (parts[0] === "app") {
    if (!user) {
      sessionStorage.setItem("swasthya.next", location.hash);
      location.hash = "#/login";
      return;
    }

    return renderApp(user, parts.slice(1), token);
  }

  shell = null;

  const view = parts[0] || "";
  const ctx = { user, parts, go };

  clear(root).append(
    pub.frame(ctx, view, parts)
  );
}

function navItems(role, module, user) {
  const base = module.nav || [];

  const tail = [
    {
      id: "notifications",
      icon: "bell",
      key: "nav.notifications",
      label: "Notifications",
      badge: unread(user.id)
    },
    {
      id: "settings",
      icon: "key",
      key: "nav.settings",
      label: "Settings"
    }
  ];

  return [
    ...base,
    { grp: "Account" },
    ...tail
  ];
}

async function renderApp(user, parts, token) {
  let module = null;

  const pending = user.status !== "active";

  if (!pending) {
    module = await loadRole(user.role);
  } else {
    module = {
      nav: [],
      routes: {}
    };
  }

  if (token !== renderToken) return;

  if (user.mustChange && parts[0] !== "settings") {
    return go("settings");
  }

  const section =
    parts[0] ||
    module.nav?.[0]?.id ||
    "settings";

  const param = parts[1];
  const rest = parts.slice(2);

  const ctx = {
    user,
    param,
    rest,
    go,
    refresh: () => paint(),
    section,
    t
  };

  current = {
    user,
    mod: module,
    ctx,
    section
  };

  if (!shell || shell.dataset.user !== user.id) {
    shell = buildShell(user, module);

    clear(root).append(shell);

    mountAssistant(() => auth.current());
  }

  paintShell(user, module, section);

  await paint();
}

async function paint() {
  if (!current) return;

  const {
    user,
    mod,
    ctx,
    section
  } = current;

  const main = $("#main");

  if (!main) return;

  const scrollPosition = window.scrollY;

  const commonRoutes = {
    notifications: common.notifications,
    settings: common.settings
  };

  const fn =
    user.status !== "active" &&
    section !== "settings" &&
    section !== "notifications"
      ? common.pending
      : (
          commonRoutes[section] ||
          mod.routes?.[section]
        );

  let element;

  try {
    element = fn
      ? await fn(ctx)
      : h(
          "div",
          { class: "empty" },
          "This page does not exist."
        );
  } catch (error) {
    console.error("Page rendering failed:", error);

    element = h(
      "div",
      { class: "notice danger" },
      icon("alert", 18),
      h(
        "div",
        {},
        h("strong", {}, "Something went wrong. "),
        error?.message || "Please try again."
      )
    );
  }

  clear(main).append(element);

  main.focus({ preventScroll: true });

  paintShell(user, mod, section);

  window.scrollTo(
    0,
    ctx._keepScroll ? scrollPosition : 0
  );

  document.title =
    `${navLabel(mod, section) || "Swasthya Connect"} · Swasthya Connect AI`;
}

const navLabel = (module, section) => {
  const item = [
    ...(module.nav || []),
    {
      id: "notifications",
      label: "Notifications"
    },
    {
      id: "settings",
      label: "Settings"
    }
  ].find(item => item.id === section);

  return item
    ? t(item.key, item.label)
    : "";
};

function buildShell(user, module) {
  const side = h("aside", {
    class: "side",
    id: "side",
    "aria-label": "Main navigation"
  });

  const top = h("div", {
    class: "top"
  });

  return h(
    "div",
    {
      class: "shell",
      "data-user": user.id
    },
    side,
    h(
      "div",
      { class: "main" },
      h(
        "div",
        {
          class: "sos",
          role: "note"
        },
        icon("siren", 16),
        h("span", {}, t("emerg.banner")),
        h("a", { href: "tel:108" }, "Call 108"),
        h("a", { href: "tel:112" }, "112")
      ),
      top,
      h("div", { id: "banners" }),
      h("main", {
        id: "main",
        class: "content",
        tabindex: "-1"
      })
    )
  );
}

function paintShell(user, module, section) {
  const side = $("#side");
  const top = $(".top");

  if (!side || !top) return;

  clear(side).append(
    h(
      "a",
      {
        class: "brand",
        href: "#/"
      },
      h(
        "span",
        { class: "mark" },
        icon("heart", 20)
      ),
      "Swasthya Connect"
    ),

    h(
      "nav",
      { class: "nav" },
      navItems(user.role, module, user).map(item => {
        if (item.grp) {
          return h(
            "div",
            { class: "grp" },
            item.grp
          );
        }

        return h(
          "a",
          {
            href: "#/app/" + item.id,
            "aria-current": item.id === section
              ? "page"
              : null,
            onclick: () => side.classList.remove("open")
          },
          icon(item.icon, 18),
          h(
            "span",
            {},
            t(item.key, item.label)
          ),
          item.badge
            ? h(
                "span",
                {
                  class: "count-dot",
                  style: {
                    position: "static",
                    marginLeft: "auto"
                  }
                },
                item.badge
              )
            : null
        );
      })
    ),

    h(
      "div",
      { class: "who" },
      h("b", {}, user.name),
      ROLES[user.role]?.label || user.role,
      user.status !== "active"
        ? h(
            "div",
            {},
            h(
              "span",
              { class: "badge warn" },
              user.status
            )
          )
        : null,
      h(
        "div",
        { style: { marginTop: ".6rem" } },
        h(
          "button",
          {
            class: "btn sm",
            onclick: () => {
              auth.logout();
              location.hash = "#/";
            }
          },
          icon("logout", 14),
          t("common.signout", "Sign out")
        )
      )
    )
  );

  clear(top).append(
    h(
      "button",
      {
        class: "icon-btn menu-btn",
        "aria-label": "Menu",
        onclick: () => side.classList.toggle("open")
      },
      icon("menu", 20)
    ),

    h("div", { class: "grow" }),

    h(
      "label",
      {
        class: "cluster small",
        title: "Language"
      },
      icon("globe", 16),
      h(
        "span",
        {
          class: "sr",
          style: {
            position: "absolute",
            left: "-999px"
          }
        },
        "Language"
      ),
      (() => {
        return h(
          "select",
          {
            "aria-label": "Choose language",
            onchange: event => {
              setLang(event.target.value);

              if (user.id) {
                db.update("users", user.id, {
                  lang: event.target.value
                });
              }
            }
          },
          LANGS.map(language =>
            h(
              "option",
              {
                value: language[0],
                selected: language[0] === lang()
              },
              language[1]
            )
          )
        );
      })()
    ),

    ...a11yControls(),

    h(
      "button",
      {
        class: "icon-btn",
        "aria-label": net.simulated
          ? "Go back online"
          : "Simulate offline mode",
        title: "Simulate offline",
        "aria-pressed": net.simulated,
        onclick: () => net.toggleSim()
      },
      icon("wifioff", 18)
    ),

    h(
      "a",
      {
        class: "icon-btn",
        href: "#/app/notifications",
        "aria-label": "Notifications"
      },
      icon("bell", 18),
      unread(user.id)
        ? h(
            "span",
            { class: "count-dot" },
            unread(user.id)
          )
        : null
    )
  );

  paintBanners(user);
}

export function a11yControls() {
  const rootElement = document.documentElement;

  const changeSize = delta => {
    const currentSize =
      parseInt(getComputedStyle(rootElement).fontSize) || 16;

    const nextSize = Math.max(
      14,
      Math.min(22, currentSize + delta)
    );

    rootElement.style.setProperty(
      "--fs",
      nextSize + "px"
    );

    try {
      localStorage.setItem(
        "swasthya.fs",
        nextSize
      );
    } catch {
      // Preference storage is optional.
    }
  };

  return [
    h(
      "button",
      {
        class: "icon-btn",
        "aria-label": "Smaller text",
        onclick: () => changeSize(-1)
      },
      h(
        "span",
        {
          style: {
            fontWeight: 700,
            fontSize: ".8rem"
          }
        },
        "A−"
      )
    ),

    h(
      "button",
      {
        class: "icon-btn",
        "aria-label": "Larger text",
        onclick: () => changeSize(1)
      },
      h(
        "span",
        {
          style: {
            fontWeight: 700,
            fontSize: "1rem"
          }
        },
        "A+"
      )
    ),

    h(
      "button",
      {
        class: "icon-btn",
        "aria-label": "Toggle high contrast",
        onclick: () => {
          const enabled =
            rootElement.dataset.contrast === "high";

          rootElement.dataset.contrast =
            enabled ? "" : "high";

          try {
            localStorage.setItem(
              "swasthya.contrast",
              enabled ? "" : "high"
            );
          } catch {
            // Preference storage is optional.
          }
        }
      },
      icon("contrast", 18)
    ),

    h(
      "button",
      {
        class: "icon-btn",
        "aria-label": "Toggle dark mode",
        onclick: () => {
          const dark =
            rootElement.dataset.theme === "dark";

          rootElement.dataset.theme =
            dark ? "light" : "dark";

          try {
            localStorage.setItem(
              "swasthya.theme",
              dark ? "light" : "dark"
            );
          } catch {
            // Preference storage is optional.
          }
        }
      },
      icon("sun", 18)
    )
  ];
}

function paintBanners(user) {
  const banners = $("#banners");

  if (!banners) return;

  clear(banners);

  if (net.offline) {
    banners.append(
      h(
        "div",
        {
          class: "banner offline",
          role: "status"
        },
        icon("wifioff", 16),
        "You are offline. Showing saved information — it may be out of date. New entries are saved on this device and sync when you reconnect."
      )
    );
  }

  if (user.demo || db.cfg().demoMode) {
    banners.append(
      h(
        "div",
        { class: "banner demo" },
        icon("info", 16),
        h(
          "span",
          {},
          h("strong", {}, "DEMO ENVIRONMENT. "),
          "Sample data only — never enter real patient information. Nothing here is sent to real hospitals, pharmacies or ambulances."
        )
      )
    );
  }

  if (user.status === "pending") {
    banners.append(
      h(
        "div",
        { class: "banner pending" },
        icon("clock", 16),
        "Your account is awaiting verification. You can update your profile; other features unlock once an administrator approves you."
      )
    );
  }

  if (user.status === "rejected") {
    banners.append(
      h(
        "div",
        { class: "banner pending" },
        icon("alert", 16),
        "Your registration was not approved. See the message on the Overview page."
      )
    );
  }
}

// Restore accessibility and display preferences.
try {
  const fontSize = localStorage.getItem("swasthya.fs");

  if (fontSize) {
    document.documentElement.style.setProperty(
      "--fs",
      fontSize + "px"
    );
  }

  const theme = localStorage.getItem("swasthya.theme");

  if (theme) {
    document.documentElement.dataset.theme = theme;
  } else if (
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  ) {
    document.documentElement.dataset.theme = "dark";
  }

  document.documentElement.dataset.contrast =
    localStorage.getItem("swasthya.contrast") || "";
} catch {
  // Defaults remain active if storage is unavailable.
}

window.addEventListener("hashchange", route);

window.addEventListener("langchange", () => {
  shell = null;
  route();
});

window.addEventListener("netchange", () => {
  if (current && $("#banners")) {
    paintBanners(current.user);
  }

  window.dispatchEvent(
    new Event("netstate")
  );
});

onChange(source => {
  if (
    source !== "remote" ||
    !current ||
    !$("#main")
  ) {
    return;
  }

  const active = document.activeElement;

  if (
    document.querySelector(".modal-back") ||
    (
      active &&
      /INPUT|TEXTAREA|SELECT/.test(active.tagName) &&
      $("#main").contains(active)
    )
  ) {
    return;
  }

  const user = auth.current();

  if (!user) return;

  current.user = user;
  current.ctx.user = user;
  current.ctx._keepScroll = true;

  paintShell(
    user,
    current.mod,
    current.section
  );

  paint();
});

setInterval(() => {
  if (!document.hidden) {
    runReminders();
  }
}, 60000);

runReminders();
route();

if (
  "serviceWorker" in navigator &&
  location.protocol.startsWith("http")
) {
  navigator.serviceWorker
    .register("./sw.js")
    .catch(() => {
      // Offline shell unavailable.
    });
}
