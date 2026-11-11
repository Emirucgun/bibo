// supabase/seed/*.csv → supabase/seed.sql
// Kullanım: npx tsx scripts/build-seed.ts
import { writeFileSync } from "node:fs";
import { buildSeedSql, loadL1Codes, loadTopics } from "./lib/seed";

const topics = loadTopics();
const codes = loadL1Codes();
writeFileSync(new URL("../supabase/seed.sql", import.meta.url), buildSeedSql(topics, codes));
console.log(`seed.sql yazıldı: ${topics.length} konu, ${codes.length} hata kodu`);
