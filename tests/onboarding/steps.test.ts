import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STEPS,
  hasReachedStep,
  isOnboardingStep,
  stepPath,
  toOnboardingStep,
} from "@/lib/onboarding/steps";

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, migrationsDir), "utf8"))
  .join("\n");

describe("başlangıç adımları", () => {
  it("veritabanındaki onboarding_step check kısıtıyla aynı kümedir", () => {
    const m = sql.match(/onboarding_step in \(([^)]*)\)/);
    expect(m).not.toBeNull();
    const values = [...m![1].matchAll(/'([^']*)'/g)].map((v) => v[1]);
    expect(values).toEqual([...ONBOARDING_STEPS]);
  });

  it("her adımın sayfası SPEC'teki yoldur", () => {
    expect(ONBOARDING_STEPS.map(stepPath)).toEqual([
      "/davet",
      "/baslangic/onam",
      "/baslangic/profil",
      "/baslangic/yerlestirme",
      "/",
    ]);
  });

  it("yalnızca 'done' ana sayfaya gider", () => {
    expect(ONBOARDING_STEPS.filter((s) => stepPath(s) === "/")).toEqual(["done"]);
  });

  it("bilinmeyen değer en baştaki adım sayılır (kapı atlanamaz)", () => {
    expect(toOnboardingStep("done")).toBe("done");
    expect(toOnboardingStep("DONE")).toBe("invite");
    expect(toOnboardingStep("")).toBe("invite");
    expect(toOnboardingStep(null)).toBe("invite");
    expect(toOnboardingStep(undefined)).toBe("invite");
    expect(isOnboardingStep("consent")).toBe(true);
    expect(isOnboardingStep("admin")).toBe(false);
  });

  it("hasReachedStep sırayı izler", () => {
    expect(hasReachedStep("invite", "consent")).toBe(false);
    expect(hasReachedStep("consent", "consent")).toBe(true);
    expect(hasReachedStep("done", "consent")).toBe(true);
    expect(hasReachedStep("profile", "placement")).toBe(false);
  });
});
