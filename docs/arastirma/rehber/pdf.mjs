// rehber.html → kaynak-sistem-rehberi.pdf (Chromium, A4). Depo kökünden: node docs/arastirma/rehber/pdf.mjs
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const dir = path.dirname(fileURLToPath(import.meta.url));
const html = path.join(dir, "rehber.html");
const out = path.join(dir, "..", "kaynak-sistem-rehberi.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#6b7280;font-family:Inter,sans-serif;padding:0 15mm;display:flex;justify-content:space-between"><span>Kaynak · Sistem rehberi · 18.11.2026</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: "16mm", bottom: "18mm", left: "15mm", right: "15mm" },
});
await browser.close();
console.log(`yazıldı: ${out}`);
