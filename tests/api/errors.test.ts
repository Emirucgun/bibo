import { describe, expect, it } from "vitest";
import { API_ERRORS, ApiError, apiErrorBody, type ApiErrorCode } from "@/lib/api/errors";

const codes = Object.keys(API_ERRORS) as ApiErrorCode[];

describe("API hata biçimi (SPEC Bölüm 6)", () => {
  it("gövde { error: { code, message_tr } } biçimindedir", () => {
    expect(apiErrorBody("cohort_full")).toEqual({
      error: { code: "cohort_full", message_tr: API_ERRORS.cohort_full.message_tr },
    });
  });

  it("M2 durum kodları", () => {
    expect(API_ERRORS.unauthenticated.status).toBe(401);
    expect(API_ERRORS.forbidden.status).toBe(403);
    expect(API_ERRORS.invite_required.status).toBe(403);
    expect(API_ERRORS.invalid_input.status).toBe(400);
    expect(API_ERRORS.invalid_code.status).toBe(404);
    expect(API_ERRORS.cohort_full.status).toBe(409);
    expect(API_ERRORS.consent_version_mismatch.status).toBe(409);
    expect(API_ERRORS.server_error.status).toBe(500);
  });

  it.each(codes)("%s: Türkçe, nokta ile biten, 'siz' dili içermeyen mesaj", (code) => {
    const { message_tr, status } = API_ERRORS[code];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(message_tr.length).toBeGreaterThan(10);
    expect(message_tr.endsWith(".")).toBe(true);
    expect(message_tr).not.toMatch(/\b\p{L}+(?:[ıiuü]n[ıiuü]z|s[ıiuü]n[ıiuü]z)\b/u);
  });

  it("ApiError kodu, durumu ve mesajı taşır", () => {
    const err = new ApiError("invalid_code");
    expect(err).toBeInstanceOf(Error);
    expect([err.code, err.status, err.message_tr]).toEqual([
      "invalid_code",
      404,
      API_ERRORS.invalid_code.message_tr,
    ]);
  });
});
