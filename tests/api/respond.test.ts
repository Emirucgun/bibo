import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { readOptionalJson } = await import("@/lib/api/respond");
const { ApiError } = await import("@/lib/api/errors");

const req = (body?: string) => new Request("http://x/api", { method: "POST", ...(body === undefined ? {} : { body }) });

describe("readOptionalJson", () => {
  it("boş gövde `{}` sayılır", async () => {
    expect(await readOptionalJson(req())).toEqual({});
    expect(await readOptionalJson(req("  "))).toEqual({});
  });

  it("geçerli JSON okunur", async () => {
    expect(await readOptionalJson(req('{"rating":4}'))).toEqual({ rating: 4 });
  });

  it("bozuk JSON `invalid_input` (400) olur", async () => {
    await expect(readOptionalJson(req("{rating"))).rejects.toBeInstanceOf(ApiError);
    await expect(readOptionalJson(req("{rating"))).rejects.toMatchObject({ code: "invalid_input", status: 400 });
  });
});
