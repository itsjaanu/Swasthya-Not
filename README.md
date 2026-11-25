# Swasthya Connect AI — Andhra Pradesh

An interactive, no-build healthcare coordination prototype built with plain HTML, CSS, and JavaScript ES modules.

## Prototype status

This project demonstrates 10 role-based workspaces:

1. Citizen / Patient
2. Doctor
3. Hospital / Facility
4. Diagnostic Centre
5. Ambulance Operator
6. Pharmacy
7. Medical Camp Organizer
8. ASHA / Community Health Worker
9. District Health Officer
10. Super Administrator

**Important:** This is a demonstration prototype. Demo data is stored in the browser's localStorage. It is not a live healthcare service. It does not connect to real hospitals, laboratories, pharmacies, ambulances, SMS, or email systems. Do not enter real patient information.

## Deploy with GitHub Pages

No build tools or terminal commands are required.

1. Open your existing GitHub repository.
2. Upload or replace the project files while preserving the folder structure.
3. Commit the changes to the `main` branch.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, select **Deploy from a branch**.
6. Select `main` and `/ (root)`, then save.
7. Wait for GitHub Pages to publish the site.

Your website will be available at:

`https://<your-username>.github.io/<repository-name>/`

## Demo mode

Use the demo sign-in options available on the login page to explore the workspaces.

Demo accounts and their data are for testing only. They do not represent verified healthcare providers or real service availability.

## Main capabilities

- Role-based dashboards and navigation.
- Patient appointment and admission request workflows.
- Patient-controlled record-sharing demonstrations.
- Provider and facility management.
- Diagnostic booking and report workflows.
- Ambulance request coordination demonstrations.
- Pharmacy inventory demonstrations.
- Medical camp and ASHA workflows.
- District-level aggregate dashboards.
- Administrative verification and audit demonstrations.
- English, Telugu, Hindi, and Tamil interface support.
- Responsive layout and offline shell.

## Data accuracy and limitations

Information displayed in the prototype may be demo, public-directory, provider-reported, unverified, or outdated.

A directory listing does not confirm that a facility is open, has available beds, or can accept a patient.

No appointment, admission, diagnostic booking, ambulance dispatch, prescription, or pharmacy order should be treated as confirmed unless a real authorized service independently confirms it.

Map locations and district positions may be approximate.

## Production requirements

Before real-world deployment, the project requires:

- A secure server-side authentication system.
- A production database with role-based access controls.
- Server-enforced patient consent and authorization.
- Secure medical document storage.
- Audit logging and monitoring.
- Verified healthcare-provider onboarding.
- Integration with appropriate healthcare systems.
- Reliable notification services.
- Security, privacy, accessibility, and clinical-safety reviews.
- Compliance review for applicable Indian healthcare and data-protection requirements.

Never place database service-role keys, private API keys, or other secrets in frontend JavaScript.

GitHub Pages hosts static frontend files only. It does not provide the backend services needed for real patient records or shared authentication.

## Project structure

```text
.
├── index.html
├── css/
│   └── app.css
├── icons/
├── js/
│   ├── main.js
│   ├── db.js
│   ├── services.js
│   ├── seed.js
│   └── views/
├── supabase/
│   └── migrations/
├── tests/
├── manifest.webmanifest
├── sw.js
└── README.md
