import { createRequire } from "module";

const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");

const base = process.argv[2] || "http://localhost:8801/";
const browser = await chromium.launch();
let failures = 0;

const roles = {
  citizen: "Citizen / Patient",
  doctor: "Doctor",
  hospital: "Hospital / Facility",
  diagnostic: "Diagnostic Centre",
  pharmacy: "Pharmacy",
  organizer: "Medical Camp Organizer",
  asha: "ASHA / Community Health Worker",
  ambulance: "Ambulance Operator",
  district: "District Health Officer",
  admin: "Super Administrator"
};

for (const [role, label] of Object.entries(roles)) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];

  page.on("pageerror", error => {
    errors.push("PAGEERR " + error.message);
  });

  page.on("console", message => {
    if (
      message.type() === "error" &&
      !/ERR_|Failed to load resource|fonts|unpkg|ERR_BLOCKED/.test(message.text())
    ) {
      errors.push("CONSOLE " + message.text());
    }
  });

  await page.goto(base + "#/login");
  await page.click(`button:has-text("${label}")`);
  await page.waitForURL(/#\/app/);
  await page.waitForTimeout(500);

  const links = await page.$$eval(".nav a", anchors =>
    anchors.map(anchor => anchor.getAttribute("href"))
  );

  for (const link of links) {
    await page.goto(base + link);
    await page.waitForTimeout(350);

    const content = await page.locator("#main").innerText();

    if (/Something went wrong|does not exist/.test(content)) {
      errors.push(`${link}: ${content.slice(0, 120)}`);
    }
  }

  console.log(
    role.padEnd(11),
    links.length,
    "pages",
    errors.length
      ? "FAIL\n  " + errors.join("\n  ")
      : "ok"
  );

  failures += errors.length;
  await context.close();
}

await browser.close();
process.exit(failures ? 1 : 0);
