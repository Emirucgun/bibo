// docs/pedagoji/altin-set.csv (P4, pedagoji sahibi) → scripts/data/golden.json
// Kullanım: npx tsx scripts/build-golden.ts [--check]   (--check: yalnızca doğrula, yazma)
import { readFileSync, writeFileSync } from "node:fs";
import { L1_CODE_IDS, TOPICS } from "@/lib/content/taxonomy";
import { goldenFromCsv } from "./lib/eval";
import { parseCsv } from "./lib/seed";

const csv = readFileSync(new URL("../docs/pedagoji/altin-set.csv", import.meta.url), "utf8");
const { items, errors, warnings } = goldenFromCsv(parseCsv(csv), { topics: TOPICS, codes: L1_CODE_IDS });

for (const w of warnings) console.log(`uyarı  ${w}`);
for (const e of errors) console.error(`HATA   ${e}`);

const wrong = items.filter((i) => !i.expected.is_correct);
const perCode = new Map<string, number>();
for (const i of wrong) perCode.set(i.expected.l1_codes[0], (perCode.get(i.expected.l1_codes[0]) ?? 0) + 1);
const count = (f: (i: (typeof items)[number]) => boolean) => items.filter(f).length;
console.log(
  `${items.length} cümle · doğru ${items.length - wrong.length}, hatalı ${wrong.length} · ` +
    `çeviri ${count((i) => i.activity_type === "translate_tr_en")}, kısa yazma ${count((i) => i.activity_type === "short_write")} · ` +
    `A1 ${count((i) => i.level === "A1")}, A2 ${count((i) => i.level === "A2")} · ${perCode.size} farklı birincil kod`,
);
console.log([...perCode].sort().map(([c, n]) => `${c} ${n}`).join(" · "));
const unused = L1_CODE_IDS.filter((c) => !perCode.has(c));
if (unused.length > 0) console.log(`Birincil kod olarak hiç kullanılmayan: ${unused.join(", ")}`);

if (errors.length > 0) process.exit(1);
if (!process.argv.includes("--check")) {
  writeFileSync(new URL("./data/golden.json", import.meta.url), JSON.stringify(items, null, 2) + "\n");
  console.log("Yazıldı: scripts/data/golden.json");
}
