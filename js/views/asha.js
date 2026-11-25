async function sync(ctx) {
  const u = ctx.user;
  const q = pendingAll(u);

  const label = (r) =>
    r.head
      ? `Household: ${r.head}`
      : r.notes
        ? `Visit note (${db.get("ashaHouseholds", r.householdId)?.head || ""})`
        : r.patientName
          ? `Referral: ${r.patientName}`
          : `Follow-up: ${r.who} — ${r.reason}`;

  // This project currently uses browser-local storage.
  // Being online does NOT mean records have reached a server.
  const backendConfigured = false;

  const go = btn(
    `Sync ${q.length} pending record${q.length === 1 ? "" : "s"}`,
    () => {
      if (net.offline) {
        toast("You are offline. Records remain saved on this device.", "danger");
        return;
      }

      toast(
        "No server sync is configured yet. Your records remain safely marked as pending.",
        "warn"
      );
    },
    "primary",
    "refresh"
  );

  if (!q.length || net.offline || !backendConfigured) {
    go.disabled = true;
  }

  return wrap(
    ctx,

    pageHead(
      t("as.title.sync", "Sync queue"),
      "Locally saved records waiting for secure server synchronization.",
      syncChip(u),
      go
    ),

    net.offline
      ? notice(
          "warn",
          "You are offline. Your records are stored locally and cannot be uploaded."
        )
      : notice(
          "warn",
          "Internet connection detected, but central server synchronization is not configured. Records have NOT been uploaded."
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
        {
          empty: "No pending records."
        }
      )
    ),

    notice(
      "info",
      "When the Supabase backend is configured, this queue can be connected to authenticated uploads with retry handling and server acknowledgements."
    )
  );
}
