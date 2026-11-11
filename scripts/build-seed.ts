// supabase/seed/*.csv → supabase/seed.sql ve lib/content/taxonomy.ts
// Kullanım: npx tsx scripts/build-seed.ts
import { writeFileSync } from "node:fs";
import { buildSeedSql, buildTaxonomyTs, loadL1Codes, loadTopics } from "./lib/seed";

const topics = loadTopics();
const codes = loadL1Codes();
writeFileSync(new URL("../supabase/seed.sql", import.meta.url), buildSeedSql(topics, codes));
writeFileSync(new URL("../lib/content/taxonomy.ts", import.meta.url), buildTaxonomyTs(topics, codes));
console.log(`seed.sql ve taxonomy.ts yazıldı: ${topics.length} konu, ${codes.length} hata kodu`);
