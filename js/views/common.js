// Shared views for all roles: notifications, account settings and verification status.
import { h, icon, ago, fmtDate } from "../util.js";
import { db, auth, audit } from "../db.js";
import { ROLES, DISTRICTS } from "../seed.js";
import { t, LANGS, setLang, lang } from "../i18n.js";
import { card, pageHead, empty, form, toast, notice, btn, kv, table } from "../ui.js";

// -----------------------------------------------------------------------------
// Notifications
// -----------------------------------------------------------------------------

export function notifications(ctx) {
  const user = ctx.user;

  const mine = db
    .where("notifications", n => n.userId === user.id)
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));

  // Only show messages addressed to the signed-in user's own contact details.
  const outbox = db.where(
    "outbox",
    o => (
      (user.email && o.to === user.email) ||
      (user.phone && o.to === user.phone)
    )
  ).sort((a, b) => (b.at || "").localeCompare(a.at || ""));

  const announcements = db.all("announcements")
    .slice(0, 3);

  const unread = mine.filter(n => !n.read).length;

  const markOneRead = (notification) => {
    if (notification.read) return;

    db.update("notifications", notification.id, {
      read: true
    });
  };

  const markAllRead = () => {
    mine
      .filter(n => !n.read)
      .forEach(n => {
        db.update("notifications", n.id, {
          read: true
        });
      });

    toast("Notifications marked as read.");
    ctx.refresh();
  };

  const notificationRows = mine.length
    ? h("div", { class: "list" },
        mine.map(n => h(
          "div",
          {
            class: "row",
            style: {
              alignItems: "flex-start",
              opacity: n.read ? .68 : 1
            }
          },
          h("div", { class: "grow" },
            h("div", { class: "spread" },
              h("div", { class: "title" }, n.title || "Notification"),
              !n.read ? h("span", {
                class: "badge",
                style: { flexShrink: 0 }
              }, "New") : null
            ),
            n.body
              ? h("div", { class: "small muted" }, n.body)
              : null,
            h("div", { class: "small muted" }, ago(n.at))
          ),
          h("div", { class: "cluster" },
            n.link
              ? h("a", {
                  class: "btn sm",
                  href: n.link,
                  onclick: () => markOneRead(n)
                }, t("common.view", "View"))
              : null,
            !n.read
              ? btn("Mark read", () => {
                  markOneRead(n);
                  ctx.refresh();
                }, "sm")
              : null
          )
        ))
      )
    : empty("No notifications yet.");

  return h("div", { class: "stack" },
    pageHead(
      t("nav.notifications", "Notifications"),
      unread
        ? `${unread} unread notification${unread === 1 ? "" : "s"}`
        : "You are up to date.",
      unread
        ? btn("Mark all read", markAllRead, "sm", "check")
        : null
    ),

    announcements.map(a => notice(
      a.level === "warn" ? "warn" : "info",
      h("strong", {}, (a.title || "Announcement") + ". "),
      a.body || ""
    )),

    card({
      title: "Your notifications",
      sub: "Updates related to your account and activities."
    }, notificationRows),

    outbox.length
      ? card({
          title: "Simulated SMS / email",
          sub: "These are local prototype messages. No real SMS or email has been sent."
        },
        table([
          {
            h: "Channel",
            f: r => (r.channel || "message").toUpperCase()
          },
          {
            h: "Message",
            f: r => r.text || "—"
          },
          {
            h: "When",
            f: r => ago(r.at)
          }
        ], outbox.slice(0, 15), {
          empty: "No simulated messages.",
          label: "Message history"
        }))
      : null,

    notice(
      "info",
      "Prototype mode: notifications are stored in this browser. They are not guaranteed to reach another device."
    )
  );
}

// -----------------------------------------------------------------------------
// Account settings
// -----------------------------------------------------------------------------

export function settings(ctx) {
  const user = ctx.user;
  const role = ROLES[user.role];

  const profileForm = form([
    {
      name: "name",
      label: "Full name",
      required: true
    },
    {
      name: "phone",
      label: "Mobile number",
      type: "tel",
      hint: "Use a number you can access."
    },
    {
      name: "district",
      label: "District",
      type: "select",
      options: DISTRICTS.map(d => d.name)
    },
    {
      name: "lang",
      label: "Language",
      type: "select",
      options: LANGS.map(l => ({
        value: l[0],
        label: l[1]
      }))
    }
  ], {
    initial: {
      name: user.name || "",
      phone: user.phone || "",
      district: user.district || "",
      lang: user.lang || lang()
    },

    submitLabel: "Save profile",

    onSubmit: v => {
      const name = String(v.name || "").trim();
      const phone = String(v.phone || "").trim();

      if (!name) {
        throw new Error("Please enter your name.");
      }

      if (phone && !/^[+\d\s()-]{7,20}$/.test(phone)) {
        throw new Error("Please enter a valid mobile number.");
      }

      const updates = {
        name,
        phone,
        district: v.district,
        lang: v.lang
      };

      db.update("users", user.id, updates);

      // Keep the current session object in sync with the saved profile.
      Object.assign(user, updates);

      setLang(v.lang);

      audit(
        "profile.updated",
        user.email || user.id,
        "Profile settings updated",
        user
      );

      toast("Profile saved.");
      ctx.refresh();
    }
  });

  const passwordForm = form([
    {
      name: "old",
      label: "Current password",
      type: "password",
      required: true
    },
    {
      name: "pw",
      label: "New password",
      type: "password",
      required: true,
      hint: "Use at least 8 characters, including letters and numbers."
    }
  ], {
    submitLabel: "Change password",

    onSubmit: async v => {
      const password = String(v.pw || "");

      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        throw new Error(
          "Your new password must contain at least 8 characters, including letters and numbers."
        );
      }

      if (password === v.old) {
        throw new Error("Choose a password different from your current password.");
      }

      await auth.changePassword(user, v.old, password);

      db.update("users", user.id, {
        mustChange: false
      });

      user.mustChange = false;

      audit(
        "account.password_changed",
        user.email || user.id,
        "Password changed",
        user
      );

      toast("Password changed successfully.");
      ctx.refresh();
    }
  });

  return h("div", { class: "stack" },
    pageHead(
      t("nav.settings", "Settings"),
      `${role?.label || user.role} · ${user.email || ""}`
    ),

    user.mustChange
      ? notice(
          "warn",
          "Please change your temporary password before continuing."
        )
      : null,

    card({
      title: "Profile",
      sub: "Update your account information and language preference."
    }, profileForm),

    card({
      title: "Change password",
      sub: "Keep your account password private."
    }, passwordForm),

    card({
      title: "Account information"
    },
      kv([
        ["Account name", user.name || "—"],
        ["Email", user.email || "—"],
        ["Role", role?.label || user.role],
        ["District", user.district || "—"],
        ["Account status", user.status || "—"],
        ["Created", fmtDate(user.createdAt, true)],
        ["Account type", user.demo ? "DEMO account" : "Registered account"]
      ]),
      h("p", {
        class: "small muted",
        style: { marginTop: ".8rem" }
      },
        "Your account role determines which workspace and information you can access. Do not share your password or sign-in details."
      )
    ),

    card({
      title: "Privacy and records"
    },
      h("p", { class: "small" },
        "Medical records should only be shared with authorized healthcare professionals when the patient has provided the required permission. Record access and consent controls are available in the patient workspace."
      ),
      notice(
        "warn",
        "This prototype stores account and application data in browser storage. It is not a production medical-record system or secure multi-user backend."
      )
    )
  );
}

// -----------------------------------------------------------------------------
// Verification status
// -----------------------------------------------------------------------------

export function pending(ctx) {
  const user = ctx.user;
  const role = ROLES[user.role];

  const rejected = user.status === "rejected";
  const approved = user.status === "active";

  const statusNotice = rejected
    ? notice(
        "danger",
        h("strong", {}, "Registration not approved. "),
        user.rejectReason || "Please contact the administrator for further information."
      )
    : approved
      ? notice(
          "ok",
          h("strong", {}, "Your account is active. "),
          "Your verification is complete."
        )
      : notice(
          "warn",
          h("strong", {}, "Verification in progress. "),
          "An authorized administrator must review your submitted details before this workspace is unlocked."
        );

  return h("div", { class: "stack" },
    pageHead(
      rejected ? "Verification not approved" : "Verification status",
      role?.label || user.role
    ),

    statusNotice,

    card({
      title: "Your submitted information",
      sub: "Check the details associated with your registration."
    },
      kv([
        ["Name", user.name || "—"],
        ["Email", user.email || "—"],
        ["Mobile", user.phone || "—"],
        ["Role", role?.label || user.role],
        ["District", user.district || "—"],
        [
          "Registration / licence",
          user.regNo || user.licenceNo || user.ashaId || "—"
        ],
        ["Submitted", fmtDate(user.createdAt, true)],
        ["Account status", user.status || "Pending"]
      ])
    ),

    rejected
      ? card({
          title: "What happens next?"
        },
          h("p", {},
            "Your protected workspace remains unavailable while the account is not approved. Contact the authorized administrator if you believe the decision needs review."
          )
        )
      : !approved
        ? card({
            title: "What happens next?"
          },
            h("p", {},
              "Your registration is awaiting review. You will be able to access the relevant workspace after the authorized administrator approves your account."
            ),
            h("p", { class: "small muted" },
              "Do not submit another registration unless the administrator asks you to do so."
            )
          )
        : null
  );
}
