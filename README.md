# Swasthya Connect AI — Andhra Pradesh (interactive prototype)

A no-build, static web app (plain ES modules) that demonstrates a connected healthcare platform: 10 role workspaces,
real sign-up/sign-in with role-based access, patient-controlled record sharing, bed availability with timestamps,
appointments, admission requests, diagnostics, ambulance-to-hospital coordination, pharmacies, camps, ASHA field work,
district aggregates, an admin console with a tamper-evident audit log, a multilingual assistant (Telugu/English/Hindi/Tamil),
offline shell and accessibility controls.

> **Prototype honesty.** All data is DEMO data stored in *your browser's* localStorage. There is no server, so nothing is sent
> to real hospitals, pharmacies, ambulances, SMS or email, and browser-side "security" is not real security. For production use
> the schema in `supabase/migrations/` and the server-side items listed under "Going to production".

## Deploy: 3 steps, no build, no commands
1. On github.com click **New repository** (Public), then **uploading an existing file** and drag in **everything inside this folder** (including the `js`, `css`, `icons` folders and `.nojekyll`). Commit.
2. Repo **Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch: `main` / `(root)` → Save**.
3. Wait ~1 minute. Your link appears at the top of that page: `https://<your-username>.github.io/<repo-name>/`

It works at that sub-path because every URL is relative and the app uses `#/` routes. Updating = upload the changed files again.
Local preview: `python3 -m http.server 8000` and open http://localhost:8000.

## Try it
Sign-in page → "Try a DEMO account" (password for all: `demo1234`). Open two tabs with different roles — they share the
same browser database and refresh live, so you can watch a citizen's request reach the hospital.

* Citizen → book appointment / request admission / share records with a doctor (scope, purpose, expiry, revoke, access log).
* Hospital → update beds (timestamped), review admissions with enforced status flow, confirm appointments.
* Ambulance → register emergency → ranked hospitals (distance, 24×7, ICU, data freshness) → notify. "Dispatched" and "resources ready" appear only after a person confirms.
* Doctor → sees only consented records; break-glass emergency access (reason required, time-limited, patient notified, admin review).
* Admin → approve verifications, audit log with hash-chain verification, integrations (honest "not connected" statuses), data quality.
* District officer → aggregates only, small-number suppression.

## Data honesty
Labels: Verified live · Provider-reported · Public directory · DEMO · Unverified · Outdated (>24h, configurable).
Public AP GIS layers (hospitals, PHCs) are fetched when reachable and cached; they are a directory, not live availability.
Districts' map positions are approximate centroids. Mandal/village/PIN search matches record fields; reconciliation with LGD
boundary data is a production task.

## Not done / next
* Server backend (auth, database, storage, notifications, AI) — see `supabase/` starter schema (needs extending for the new tables).
* Real integrations: ABDM HFR, hospital HIS, lab systems, 108 ambulance systems, SMS/email.
* Telugu/Hindi/Tamil strings are first drafts — have native speakers review them.
* Leaflet/OpenStreetMap load from a CDN when online; offline a schematic map is used.

## Layout
`index.html` · `css/app.css` · `js/` (`db.js` store/auth/audit, `services.js` workflows, `seed.js` demo data, `views/` per role) · `sw.js` offline shell · `tests/` Playwright checks.
