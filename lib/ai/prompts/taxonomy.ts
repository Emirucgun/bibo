// Komutlarda ortak, sabit taksonomi metni (önbelleklenen sistem komutunun parçası).
import { L1_CODES, TOPICS } from "@/lib/content/taxonomy";

export const TOPIC_LIST_TEXT = TOPICS.filter((t) => t.active)
  .map((t) => `- ${t.id} [${t.level}, ${t.kind}] ${t.title_en} — ${t.title_tr}`)
  .join("\n");

export const L1_CODE_LIST_TEXT = L1_CODES.map((c) => {
  const parts = [`- ${c.code}${c.topic_id ? ` (topic ${c.topic_id})` : ""}: ${c.name_tr}`];
  if (c.rule_tr) parts.push(`  Kural: ${c.rule_tr}`);
  if (c.wrong_example && c.right_example) {
    parts.push(`  Örnek: ✗ ${c.wrong_example} → ✓ ${c.right_example}`);
  }
  return parts.join("\n");
}).join("\n");

export const EXPLANATION_STYLE = `Explanation style (Turkish, for the student):
- Address the student with "sen". Never judge or scold ("yanlış yaptın" yerine doğru biçimi göster).
- First give the correct form, then one sentence comparing with Turkish when the error is L1-related.
- explanation_short_tr: at most 2 short sentences. explanation_long_tr: up to 5 sentences with 1–2 examples.
- hint_tr: a nudge, never the answer itself.`;
