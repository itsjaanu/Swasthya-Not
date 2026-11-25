import { createRequire } from "module"; const require = createRequire("/opt/node22/lib/node_modules/"); 
const { chromium } = require("playwright");
const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
p.on("pageerror", e => errs.push("PAGEERR " + e.message)); p.on("console", m => { if (m.type() === "error" && !/ERR_|Failed to load resource|fonts|unpkg/.test(m.text())) errs.push("CONSOLE " + m.text()); });
const base = process.argv[2] || "http://localhost:8801/";
await p.goto(base); await p.waitForSelector(".hero"); console.log("landing ok");
await p.goto(base + "#/find"); await p.waitForSelector(".fac"); console.log("find ok", await p.locator(".fac").count());
await p.goto(base + "#/login"); await p.click("text=Citizen / Patient"); await p.waitForURL(/#\/app/); await p.waitForSelector("#main h1, #main .notice"); console.log("citizen login ok:", await p.locator("#main h1").first().textContent());
for (const r of ["find","appointments","admissions","records","camps","notifications","settings"]) { await p.goto(base + "#/app/" + r); await p.waitForTimeout(400); console.log(r, (await p.locator("#main").innerText()).slice(0,50).replace(/\n/g," ")); }
await p.screenshot({ path: process.argv[3] || "/tmp/s.png" });
console.log(errs.length ? errs.join("\n") : "no errors"); await b.close();
