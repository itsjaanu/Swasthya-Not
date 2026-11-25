import { createRequire } from "module";

const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];

page.on("pageerror", error => {
  errors.push("PAGEERR " + error.message);
});

page.on("console", message => {
  if (
    message.type() === "error" &&
    !/ERR_|Failed to load resource|fonts|unpkg/.test(message.text())
  ) {
    errors.push("CONSOLE " + message.text());
  }
});

const base = process.argv[2] || "http://localhost:8801/";

await page.goto(base);
await page.waitForSelector(".hero");
console.log("landing ok");

await page.goto(base + "#/find");
await page.waitForSelector(".fac");
console.log("find ok", await page.locator(".fac").count());

await page.goto(base + "#/login");
await page.click("text=Citizen / Patient");
await page.waitForURL(/#\/app/);
await page.waitForSelector("#main h1, #main .notice");

console.log(
  "citizen login ok:",
  await page.locator("#main h1").first().textContent()
);

for (const route of [
  "find",
  "appointments",
  "admissions",
  "records",
  "camps",
  "notifications",
  "settings"
]) {
  await page.goto(base + "#/app/" + route);
  await page.waitForTimeout(400);

  console.log(
    route,
    (await page.locator("#main").innerText())
      .slice(0, 50)
      .replace(/\n/g, " ")
  );
}

await page.screenshot({
  path: process.argv[3] || "/tmp/s.png"
});

console.log(errors.length ? errors.join("\n") : "no errors");

await browser.close();
