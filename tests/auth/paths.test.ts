import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decideRoute,
  inviteCodeFromPath,
  isApiPath,
  isPublicPage,
  isValidInviteCode,
} from "@/lib/auth/paths";

describe("decideRoute (proxy.ts)", () => {
  it("girişsiz ziyaretçi / adresinde tanıtım sayfasını görür (rewrite)", () => {
    expect(decideRoute({ pathname: "/", signedIn: false })).toEqual({ kind: "rewrite", to: "/tanitim" });
  });

  it.each([false, true])("tanıtım sayfasının iç yolu dışarıdan açılmaz: /tanitim → / (signedIn=%s)", (signedIn) => {
    expect(decideRoute({ pathname: "/tanitim", signedIn })).toEqual({ kind: "redirect", to: "/" });
    expect(decideRoute({ pathname: "/tanitim/", signedIn })).toEqual({ kind: "redirect", to: "/" });
  });

  it.each(["/oturum/123", "/ilerleme", "/ayarlar", "/yonetim", "/baslangic/onam", "/baslangic/profil"])(
    "girişsiz kullanıcı %s → /giris",
    (pathname) => {
      expect(decideRoute({ pathname, signedIn: false })).toEqual({ kind: "redirect", to: "/giris" });
    },
  );

  it.each(["/giris", "/davet", "/davet/ABC123", "/gizlilik", "/auth/callback"])(
    "girişsiz kullanıcı %s sayfasını açabilir",
    (pathname) => {
      expect(decideRoute({ pathname, signedIn: false })).toEqual({ kind: "next" });
    },
  );

  it("giriş yapmış kullanıcı /giris'ten ana sayfaya gider", () => {
    expect(decideRoute({ pathname: "/giris", signedIn: true })).toEqual({ kind: "redirect", to: "/" });
  });

  it.each(["/", "/davet", "/davet/ABC123", "/baslangic/onam", "/gizlilik", "/oturum/1"])(
    "giriş yapmış kullanıcı %s için proxy yönlendirmez (kapı sayfada)",
    (pathname) => {
      expect(decideRoute({ pathname, signedIn: true })).toEqual({ kind: "next" });
    },
  );

  it.each(["/api/health", "/api/onboarding/invite", "/api/account", "/api/cron/daily"])(
    "API yolu %s hiç yönlendirilmez (handler 401 döner)",
    (pathname) => {
      expect(decideRoute({ pathname, signedIn: false })).toEqual({ kind: "next" });
      expect(decideRoute({ pathname, signedIn: true })).toEqual({ kind: "next" });
    },
  );

  it("önek benzerliği herkese açık saymaz", () => {
    expect(isPublicPage("/girisx")).toBe(false);
    expect(isPublicPage("/davetiye")).toBe(false);
    expect(isPublicPage("/gizlilik-degil")).toBe(false);
    expect(isApiPath("/apix")).toBe(false);
    expect(decideRoute({ pathname: "/apix", signedIn: false })).toEqual({ kind: "redirect", to: "/giris" });
  });
});

describe("davet kodu", () => {
  it("yoldan kodu çıkarır", () => {
    expect(inviteCodeFromPath("/davet/PILOT-2026_a")).toBe("PILOT-2026_a");
    expect(inviteCodeFromPath("/davet/PILOT2026/")).toBe("PILOT2026");
  });

  it.each([
    "/davet",
    "/davet/",
    "/davet/abc",
    "/davet/a b c d",
    "/davet/kod%3Bdrop",
    "/davet/%E0%A4%A",
    "/davet/ABCD/ek",
    "/giris/ABCD1234",
    `/davet/${"a".repeat(65)}`,
  ])("%s için kod yok", (pathname) => {
    expect(inviteCodeFromPath(pathname)).toBeNull();
  });

  it("biçim: 4–64 karakter, harf, rakam, tire, alt çizgi", () => {
    expect(isValidInviteCode("abcd")).toBe(true);
    expect(isValidInviteCode("a".repeat(64))).toBe(true);
    expect(isValidInviteCode("abc")).toBe(false);
    expect(isValidInviteCode("abcd;")).toBe(false);
    expect(isValidInviteCode("abcd\n")).toBe(false);
    expect(isValidInviteCode(undefined)).toBe(false);
    expect(isValidInviteCode(1234)).toBe(false);
  });
});

describe("proxy.ts", () => {
  const source = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");

  it("Next 16 adıyla dışa aktarılır ve statik dosyaları dışarıda bırakır", () => {
    expect(source).toMatch(/export async function proxy\(/);
    expect(source).toContain("_next/static");
  });

  it("matcher API yollarını dışarıda bırakmaz (oturum API çağrılarında da yenilenir)", () => {
    const matcher = source.match(/matcher:\s*\[([\s\S]*?)\]/);
    expect(matcher).not.toBeNull();
    expect(matcher![1]).not.toMatch(/\bapi\b/);
  });
});
