import { describe, expect, it } from "vitest";
import { ApiError, type ApiErrorCode } from "@/lib/api/errors";
import {
  deleteAccount,
  submitConsent,
  submitInvite,
  submitProfile,
  type ClaimResult,
  type OnboardingStore,
} from "@/lib/onboarding/service";
import type { OnboardingStep } from "@/lib/onboarding/steps";

const NOW = new Date("2026-11-15T12:00:00.000Z");
const VERSION = "2026-11-pilot-v1";

/** Bellek içi sahte: kapasiteli tek kohort, `claim_invite` ile aynı kurallar. */
function fakeStore(options: { code?: string; capacity?: number } = {}) {
  const code = options.code ?? "PILOT-2026";
  const capacity = options.capacity ?? 60;
  const members = new Set<string>();
  const steps = new Map<string, OnboardingStep>();
  const consents = new Map<string, { version: string; at: string }>();
  const deleted: string[] = [];
  const profiles = new Map<string, { level_self: string; level_est: string; interests: string[] }>();
  const calls = { claim: 0, consent: 0 };

  const store: OnboardingStore = {
    async claimInvite(userId, given): Promise<ClaimResult> {
      calls.claim += 1;
      if (members.has(userId)) return { status: "already_joined", cohortName: "Pilot" };
      if (given !== code) return { status: "invalid_code", cohortName: null };
      if (members.size >= capacity) return { status: "full", cohortName: "Pilot" };
      members.add(userId);
      steps.set(userId, "consent");
      return { status: "ok", cohortName: "Pilot" };
    },
    async recordConsent(userId, consentVersion, now) {
      calls.consent += 1;
      if (steps.get(userId) !== "consent") return false;
      consents.set(userId, { version: consentVersion, at: now.toISOString() });
      steps.set(userId, "profile");
      return true;
    },
    async saveProfile(userId, profile) {
      if (steps.get(userId) !== "profile") return false;
      profiles.set(userId, profile);
      steps.set(userId, "placement");
      return true;
    },
    async deleteUser(userId) {
      deleted.push(userId);
    },
  };
  return { store, members, steps, consents, deleted, calls, profiles };
}

async function codeOf(promise: Promise<unknown>): Promise<ApiErrorCode | "resolved"> {
  try {
    await promise;
    return "resolved";
  } catch (err) {
    if (err instanceof ApiError) return err.code;
    throw err;
  }
}

describe("submitInvite (POST /api/onboarding/invite)", () => {
  it("geçerli kod → { ok, cohortName }", async () => {
    const { store } = fakeStore();
    expect(
      await submitInvite(store, { userId: "a", onboardingStep: "invite" }, { code: "PILOT-2026" }),
    ).toEqual({ ok: true, cohortName: "Pilot" });
  });

  it("kodun başındaki ve sonundaki boşluk atılır", async () => {
    const { store } = fakeStore();
    expect(
      await submitInvite(store, { userId: "a", onboardingStep: "invite" }, { code: "  PILOT-2026\n" }),
    ).toEqual({ ok: true, cohortName: "Pilot" });
  });

  it("kapasite 1 iken ikinci kullanıcı 409 cohort_full alır", async () => {
    const { store, members } = fakeStore({ capacity: 1 });
    await submitInvite(store, { userId: "a", onboardingStep: "invite" }, { code: "PILOT-2026" });
    const err = await submitInvite(
      store,
      { userId: "b", onboardingStep: "invite" },
      { code: "PILOT-2026" },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).code).toBe("cohort_full");
    expect([...members]).toEqual(["a"]);
  });

  it("yanlış kod → 404 invalid_code", async () => {
    const { store } = fakeStore();
    const err = await submitInvite(
      store,
      { userId: "a", onboardingStep: "invite" },
      { code: "YANLIS-KOD" },
    ).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).code).toBe("invalid_code");
  });

  it("biçimi bozuk kod veritabanına sorulmadan reddedilir", async () => {
    const { store, calls } = fakeStore();
    expect(
      await codeOf(submitInvite(store, { userId: "a", onboardingStep: "invite" }, { code: "a b;c" })),
    ).toBe("invalid_code");
    expect(calls.claim).toBe(0);
  });

  it.each([undefined, null, {}, { code: "" }, { code: "   " }, { code: 42 }, { code: "x".repeat(65) }, "PILOT"])(
    "geçersiz gövde %j → 400 invalid_input",
    async (body) => {
      const { store, calls } = fakeStore();
      expect(await codeOf(submitInvite(store, { userId: "a", onboardingStep: "invite" }, body))).toBe(
        "invalid_input",
      );
      expect(calls.claim).toBe(0);
    },
  );

  it("zaten kohortta olan kullanıcı yeniden çağırırsa yer ayrılmaz, ok döner", async () => {
    const { store, members } = fakeStore({ capacity: 1 });
    await submitInvite(store, { userId: "a", onboardingStep: "invite" }, { code: "PILOT-2026" });
    expect(
      await submitInvite(store, { userId: "a", onboardingStep: "consent" }, { code: "PILOT-2026" }),
    ).toEqual({ ok: true, cohortName: "Pilot" });
    expect(members.size).toBe(1);
  });

  it("profili olmayan kullanıcı → 401", async () => {
    const store: OnboardingStore = {
      ...fakeStore().store,
      claimInvite: async () => ({ status: "no_profile", cohortName: null }),
    };
    expect(
      await codeOf(submitInvite(store, { userId: "x", onboardingStep: "invite" }, { code: "PILOT-2026" })),
    ).toBe("unauthenticated");
  });
});

describe("submitConsent (POST /api/onboarding/consent)", () => {
  const body = { adult: true, consentVersion: VERSION };
  const options = { expectedVersion: VERSION, now: NOW };

  it("davet kodu girmemiş kullanıcı onam veremez → 403 invite_required", async () => {
    const { store, calls, consents } = fakeStore();
    const err = await submitConsent(store, { userId: "a", onboardingStep: "invite" }, body, options).catch(
      (e: unknown) => e,
    );
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).code).toBe("invite_required");
    expect(calls.consent).toBe(0);
    expect(consents.size).toBe(0);
  });

  it("davetli kullanıcının rıza sürümü ve zamanı kaydedilir, adım profile olur", async () => {
    const { store, consents, steps } = fakeStore();
    await submitInvite(store, { userId: "a", onboardingStep: "invite" }, { code: "PILOT-2026" });
    expect(await submitConsent(store, { userId: "a", onboardingStep: "consent" }, body, options)).toEqual({
      ok: true,
    });
    expect(consents.get("a")).toEqual({ version: VERSION, at: "2026-11-15T12:00:00.000Z" });
    expect(steps.get("a")).toBe("profile");
  });

  it.each([
    { consentVersion: VERSION },
    { adult: false, consentVersion: VERSION },
    { adult: "true", consentVersion: VERSION },
    { adult: true },
    { adult: true, consentVersion: "" },
    null,
  ])("18+ beyanı ya da sürüm eksikse %j → 400 invalid_input", async (bad) => {
    const { store, calls } = fakeStore();
    expect(await codeOf(submitConsent(store, { userId: "a", onboardingStep: "consent" }, bad, options))).toBe(
      "invalid_input",
    );
    expect(calls.consent).toBe(0);
  });

  it("sayfadaki sürüm güncel değilse → 409 consent_version_mismatch", async () => {
    const { store, calls } = fakeStore();
    const err = await submitConsent(
      store,
      { userId: "a", onboardingStep: "consent" },
      { adult: true, consentVersion: "2026-10-eski" },
      options,
    ).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).code).toBe("consent_version_mismatch");
    expect(calls.consent).toBe(0);
  });

  it("CONSENT_VERSION tanımlı değilse rıza kaydedilmez → 500", async () => {
    const { store, calls } = fakeStore();
    expect(
      await codeOf(
        submitConsent(store, { userId: "a", onboardingStep: "consent" }, body, {
          expectedVersion: undefined,
          now: NOW,
        }),
      ),
    ).toBe("server_error");
    expect(calls.consent).toBe(0);
  });

  it.each(["profile", "placement", "done"] as const)(
    "rızası kayıtlı kullanıcı (%s) yeniden gönderirse ilk kayıt korunur",
    async (step) => {
      const { store, calls } = fakeStore();
      expect(await submitConsent(store, { userId: "a", onboardingStep: step }, body, options)).toEqual({
        ok: true,
      });
      expect(calls.consent).toBe(0);
    },
  );
});

describe("deleteAccount (DELETE /api/account)", () => {
  it('{ confirm: "SİL" } ile kullanıcı silinir', async () => {
    const { store, deleted } = fakeStore();
    expect(await deleteAccount(store, { userId: "a" }, { confirm: "SİL" })).toEqual({ ok: true });
    expect(deleted).toEqual(["a"]);
  });

  it.each([undefined, {}, { confirm: "SIL" }, { confirm: "sil" }, { confirm: "SİL " }, { confirm: true }])(
    "onay metni tutmazsa %j silinmez → 400",
    async (body) => {
      const { store, deleted } = fakeStore();
      expect(await codeOf(deleteAccount(store, { userId: "a" }, body))).toBe("invalid_input");
      expect(deleted).toEqual([]);
    },
  );
});

describe("submitProfile (POST /api/onboarding/profile, PRD F2)", () => {
  it("en az 2 ilgi alanı olmadan devam edilemez → 400", async () => {
    const { store, steps } = fakeStore();
    steps.set("a", "profile");
    const err = await submitProfile(store, { userId: "a", onboardingStep: "profile" }, { levelSelf: "A1", interests: ["music"] }, NOW).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("invalid_input");
    expect(steps.get("a")).toBe("profile");
  });

  it("bilinmeyen ilgi alanı ya da seviye → 400", async () => {
    const { store } = fakeStore();
    for (const body of [
      { levelSelf: "A1", interests: ["music", "chess"] },
      { levelSelf: "B1", interests: ["music", "food"] },
    ]) {
      const err = await submitProfile(store, { userId: "a", onboardingStep: "profile" }, body, NOW).catch((e: unknown) => e);
      expect((err as ApiError).code).toBe("invalid_input");
    }
  });

  it("kaydeder, A2 beyanı başlangıç tahmini A2, adım yerleştirmeye geçer", async () => {
    const { store, steps, profiles } = fakeStore();
    steps.set("a", "profile");
    steps.set("b", "profile");
    await submitProfile(store, { userId: "a", onboardingStep: "profile" }, { levelSelf: "A2", interests: ["music", "food", "music"] }, NOW);
    await submitProfile(store, { userId: "b", onboardingStep: "profile" }, { levelSelf: "unsure", interests: ["music", "food"] }, NOW);
    expect(profiles.get("a")).toEqual({ level_self: "A2", level_est: "A2", interests: ["music", "food"] });
    expect(profiles.get("b")?.level_est).toBe("A1");
    expect(steps.get("a")).toBe("placement");
  });

  it("onamı vermemiş kullanıcı profil kaydedemez", async () => {
    const { store } = fakeStore();
    const err = await submitProfile(store, { userId: "a", onboardingStep: "consent" }, { levelSelf: "A1", interests: ["music", "food"] }, NOW).catch(
      (e: unknown) => e,
    );
    expect((err as ApiError).code).toBe("onboarding_incomplete");
  });
});
