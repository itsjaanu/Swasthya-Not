import { createRequire } from "module"; const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const base = process.argv[2] || "http://localhost:8801/";
const b = await chromium.launch(); let bad = 0;
const roles = { citizen: "Citizen / Patient", doctor: "Doctor", hospital: "Hospital / Facility", diagnostic: "Diagnostic Centre", pharmacy: "Pharmacy", organizer: "Medical Camp Organizer", asha: "ASHA / Community Health Worker", ambulance: "Ambulance Operator", district: "District Health Officer", admin: "Super Administrator" };
for (const [role, label] of Object.entries(roles)) {
  const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message)); p.on("console", m => { if (m.type() === "error" && !/ERR_|Failed to load resource|fonts|unpkg|ERR_BLOCKED/.test(m.text())) errs.push("CONSOLE " + m.text()); });
  await p.goto(base + "#/login"); await p.click(`button:has-text("${label}")`); await p.waitForURL(/#\/app/); await p.waitForTimeout(500);
  const links = await p.$$eval(".nav a", as => as.map(a => a.getAttribute("href")));
  for (const l of links) { await p.goto(base + l); await p.waitForTimeout(350); const txt = await p.locator("#main").innerText(); if (/Something went wrong|does not exist/.test(txt)) { errs.push(`${l}: ${txt.slice(0, 120)}`); } }
  console.log(role.padEnd(11), links.length, "pages", errs.length ? "FAIL\n  " + errs.join("\n  ") : "ok"); bad += errs.length; await ctx.close();
}
await b.close(); process.exit(bad ? 1 : 0);
