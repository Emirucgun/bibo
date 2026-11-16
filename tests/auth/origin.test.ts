import { describe, expect, it } from "vitest";
import { requestOrigin, resolveAppOrigin } from "@/lib/auth/origin";

const base = { forwardedHost: null, forwardedProto: null, host: null };

describe("resolveAppOrigin (OAuth dönüş adresi)", () => {
  it("canlıda APP_URL kullanılır, sondaki eğik çizgi atılır", () => {
    expect(
      resolveAppOrigin({
        ...base,
        appUrl: "https://kaynak.example/",
        vercelEnv: "production",
        forwardedHost: "bibo-abc.vercel.app",
        forwardedProto: "https",
      }),
    ).toBe("https://kaynak.example");
  });

  it("önizlemede isteğin kendi adresi kullanılır (APP_URL tanımlı olsa bile)", () => {
    expect(
      resolveAppOrigin({
        ...base,
        appUrl: "https://kaynak.example",
        vercelEnv: "preview",
        forwardedHost: "bibo-git-m2-ekip.vercel.app",
        forwardedProto: "https",
      }),
    ).toBe("https://bibo-git-m2-ekip.vercel.app");
  });

  it("yerelde localhost http ile döner", () => {
    expect(resolveAppOrigin({ ...base, appUrl: undefined, vercelEnv: undefined, host: "localhost:3000" })).toBe(
      "http://localhost:3000",
    );
  });

  it("istek adresi okunamazsa APP_URL'e düşer", () => {
    expect(resolveAppOrigin({ ...base, appUrl: "https://kaynak.example", vercelEnv: "preview" })).toBe(
      "https://kaynak.example",
    );
  });

  it("canlıda APP_URL yoksa isteğin adresi kullanılır", () => {
    expect(
      resolveAppOrigin({ ...base, appUrl: undefined, vercelEnv: "production", host: "bibo.vercel.app" }),
    ).toBe("https://bibo.vercel.app");
  });

  it("hiçbiri yoksa hata verir", () => {
    expect(() => resolveAppOrigin({ ...base, appUrl: undefined, vercelEnv: undefined })).toThrow();
  });
});

describe("requestOrigin", () => {
  it("x-forwarded-host, host'tan önce gelir; listede ilk değer alınır", () => {
    expect(
      requestOrigin({ forwardedHost: "a.vercel.app, b.internal", forwardedProto: "https, http", host: "c" }),
    ).toBe("https://a.vercel.app");
  });

  it("protokol yoksa yerel adres http, diğerleri https sayılır", () => {
    expect(requestOrigin({ ...base, host: "127.0.0.1:3000" })).toBe("http://127.0.0.1:3000");
    expect(requestOrigin({ ...base, host: "bibo.vercel.app" })).toBe("https://bibo.vercel.app");
  });

  it("host yoksa null", () => {
    expect(requestOrigin(base)).toBeNull();
  });
});
