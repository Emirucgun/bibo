// Yönetim paneli ölçütleri (PRD F11, F12; SPEC 6 "Yönetim"). Saf: satırlar ve zaman parametre olarak gelir.

const DAY = 86_400_000;

export interface EngagementInput {
  /** Başlangıcı bitmiş öğrenciler ve kayıt anları. */
  students: { id: string; created_at: Date }[];
  /** Bitmiş günlük oturumlar. */
  sessions: { user_id: string; finished_at: Date }[];
  now: Date;
}

export interface Engagement {
  registered: number;
  /** Son 7 günde en az 1 oturum bitiren. */
  active7d: number;
  /** Son 7 günde ≥ 4 oturum bitirenlerin kayıtlılara oranı (PRD Bölüm 3). */
  fourPerWeekRate: number | null;
  /** W4: kaydından ≥ 28 gün geçmişlerden 4. haftasında (21–28. gün) oturum yapanların oranı. */
  w4Rate: number | null;
  w4Eligible: number;
  sessions7d: number;
}

export function engagement({ students, sessions, now }: EngagementInput): Engagement {
  const ids = new Set(students.map((s) => s.id));
  const weekAgo = now.getTime() - 7 * DAY;
  const perUser = new Map<string, number>();
  let sessions7d = 0;
  for (const s of sessions) {
    if (!ids.has(s.user_id) || s.finished_at.getTime() < weekAgo || s.finished_at > now) continue;
    sessions7d++;
    perUser.set(s.user_id, (perUser.get(s.user_id) ?? 0) + 1);
  }
  const eligible = students.filter((s) => now.getTime() - s.created_at.getTime() >= 28 * DAY);
  const retained = eligible.filter((u) => {
    const from = u.created_at.getTime() + 21 * DAY;
    const to = u.created_at.getTime() + 28 * DAY;
    return sessions.some((s) => s.user_id === u.id && s.finished_at.getTime() >= from && s.finished_at.getTime() < to);
  });
  return {
    registered: students.length,
    active7d: perUser.size,
    fourPerWeekRate: students.length ? [...perUser.values()].filter((n) => n >= 4).length / students.length : null,
    w4Rate: eligible.length ? retained.length / eligible.length : null,
    w4Eligible: eligible.length,
    sessions7d,
  };
}

export interface UsageRow {
  provider: string;
  purpose: string;
  calls: number;
  ok_calls: number;
  cost_usd: number;
  tts_chars: number;
  input_tokens: number;
  cache_read_tokens: number;
}

export interface CostSummary {
  totalUsd: number;
  byProvider: { provider: string; usd: number; calls: number }[];
  byPurpose: { purpose: string; usd: number; calls: number; failed: number }[];
  ttsChars: number;
  /** İstem önbelleğinden okunan girdi tokenlarının oranı (dil modeli). */
  cacheHitRate: number | null;
  /** Ay içi maliyet / ay içi biten günlük oturum. */
  perSessionUsd: number | null;
}

export function costSummary(rows: UsageRow[], sessionsDone: number): CostSummary {
  const sum = <K extends string>(key: (r: UsageRow) => K) => {
    const m = new Map<K, { usd: number; calls: number; failed: number }>();
    for (const r of rows) {
      const k = key(r);
      const cur = m.get(k) ?? { usd: 0, calls: 0, failed: 0 };
      cur.usd += r.cost_usd;
      cur.calls += r.calls;
      cur.failed += r.calls - r.ok_calls;
      m.set(k, cur);
    }
    return m;
  };
  const totalUsd = rows.reduce((a, r) => a + r.cost_usd, 0);
  const llm = rows.filter((r) => r.purpose !== "tts" && r.purpose !== "transcribe");
  const input = llm.reduce((a, r) => a + r.input_tokens, 0);
  const cached = llm.reduce((a, r) => a + r.cache_read_tokens, 0);
  return {
    totalUsd,
    byProvider: [...sum((r) => r.provider)].map(([provider, v]) => ({ provider, usd: v.usd, calls: v.calls })),
    byPurpose: [...sum((r) => r.purpose)].map(([purpose, v]) => ({ purpose, ...v })),
    ttsChars: rows.reduce((a, r) => a + r.tts_chars, 0),
    // OpenRouter `prompt_tokens` önbellekten okunanları da içerir.
    cacheHitRate: input > 0 ? cached / input : null,
    perSessionUsd: sessionsDone > 0 ? totalUsd / sessionsDone : null,
  };
}

export interface AlertInput {
  killSwitch: boolean;
  monthCostUsd: number;
  ttsPlanUsd: number;
  budgetUsd: number;
  ttsChars: number;
  ttsCharAlert: number;
  ttsVoice: string | null;
  ttsEnabled: boolean;
}

export interface Alert {
  level: "danger" | "warning" | "info";
  text: string;
}

/** Panel uyarıları (SPEC 5.4, PRD F12). */
export function alerts(a: AlertInput): Alert[] {
  const out: Alert[] = [];
  const spent = a.monthCostUsd + a.ttsPlanUsd;
  if (a.killSwitch) out.push({ level: "danger", text: "Acil durdurma AÇIK: hiçbir yapay zekâ, transkript ya da seslendirme çağrısı yapılmıyor." });
  if (spent >= a.budgetUsd) {
    out.push({ level: "danger", text: `Aylık tavana ulaşıldı (${spent.toFixed(2)} $ / ${a.budgetUsd} $): yeni oturum üretimi durdu.` });
  } else if (spent >= 0.8 * a.budgetUsd) {
    out.push({ level: "warning", text: `Aylık tavanın %80'i geçildi (${spent.toFixed(2)} $ / ${a.budgetUsd} $).` });
  }
  if (a.ttsChars >= a.ttsCharAlert) {
    out.push({
      level: "warning",
      text: `Seslendirme kotası uyarısı: bu ay ${a.ttsChars.toLocaleString("tr-TR")} karakter (eşik ${a.ttsCharAlert.toLocaleString("tr-TR")}). Speechify Starter'a geçme kararı gerekiyor.`,
    });
  }
  if (!a.ttsEnabled) out.push({ level: "info", text: "Seslendirme kapalı: dinleme etkinlikleri metin türlerine düşüyor." });
  else if (!a.ttsVoice) out.push({ level: "info", text: "Seslendirme sesi seçilmemiş: dinleme etkinlikleri kapalı. Aşağıdan bir ses seç." });
  return out;
}

export interface ReviewRow {
  verdict: "agree" | "fix" | "not_error";
  l1_code: string;
  created_at: Date;
}

/** Haftalık uyum = "Doğru" kararları / tüm incelemeler (PRD F11; "Hata değil" paydada). */
export function reviewAgreement(reviews: ReviewRow[], weekStart: (d: Date) => string) {
  const weeks = new Map<string, { agree: number; total: number }>();
  const codes = new Map<string, { agree: number; total: number }>();
  for (const r of reviews) {
    for (const [m, k] of [
      [weeks, weekStart(r.created_at)],
      [codes, r.l1_code],
    ] as const) {
      const cur = m.get(k) ?? { agree: 0, total: 0 };
      cur.total++;
      if (r.verdict === "agree") cur.agree++;
      m.set(k, cur);
    }
  }
  const rate = (v: { agree: number; total: number }) => v.agree / v.total;
  return {
    overall: reviews.length ? reviews.filter((r) => r.verdict === "agree").length / reviews.length : null,
    total: reviews.length,
    weekly: [...weeks].sort((a, b) => b[0].localeCompare(a[0])).map(([week, v]) => ({ week, ...v, rate: rate(v) })),
    byCode: [...codes].sort((a, b) => b[1].total - a[1].total).map(([code, v]) => ({ code, ...v, rate: rate(v) })),
  };
}
