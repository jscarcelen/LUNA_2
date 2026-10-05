import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhone } from "../../lib/phone.js";
import { validatePasswordPair } from "../../lib/accountsCore.js";

describe("normalizePhone", () => {
  it("turns the usual ways of writing an international number into E.164", () => {
    for (const [input, expected] of [
      ["+1 415 555 2671", "+14155552671"],
      ["+1 (415) 555-2671", "+14155552671"],
      ["  +34 612 34 56 78 ", "+34612345678"],
      ["+44 (0)20 7946 0958", "+442079460958"],
      ["+44 20 7946 0958", "+442079460958"],
      ["0034 612-345-678", "+34612345678"],
      ["+49.151.2345.6789", "+4915123456789"],
      ["+14155552671", "+14155552671"]
    ]) {
      expect(normalizePhone(input), input).toEqual({ ok: true, e164: expected });
    }
  });

  it("requires a country code and never guesses a default country", () => {
    for (const input of ["415 555 2671", "(415) 555-2671", "612345678", "020 7946 0958"]) {
      const result = normalizePhone(input);
      expect(result.ok, input).toBe(false);
      expect(result.error).toMatch(/country code/i);
    }
  });

  it("refuses letters, extensions, a misplaced plus and numbers of the wrong length", () => {
    for (const input of ["+1 415 555 CALL", "+1 415 555 2671 x12", "++14155552671", "1+4155552671", "+0 415 555 2671", "+1234", "+1234567890123456", "abc"]) {
      expect(normalizePhone(input).ok, input).toBe(false);
    }
    expect(normalizePhone("+".padEnd(60, "1")).ok).toBe(false);
  });

  it("is required by default (sign-up) and can be left empty only behind the explicit flag", () => {
    expect(normalizePhone("").ok).toBe(false);
    expect(normalizePhone(undefined).ok).toBe(false);
    expect(normalizePhone("   ", { required: false })).toEqual({ ok: true, e164: "" });
    expect(normalizePhone(null, { required: false })).toEqual({ ok: true, e164: "" });
  });

  it("gives the same E.164 for two spellings of one number, which is what the unique index compares", () => {
    expect(normalizePhone("+1 (415) 555-2671")).toEqual(normalizePhone("001 415 555 2671"));
  });

  it("masks a number for display", () => {
    expect(maskPhone("+14155552671")).toBe("+1••••••2671");
    expect(maskPhone("")).toBe("");
  });
});

describe("password typed twice", () => {
  it("accepts matching passwords and rejects a mismatch with a clear message", () => {
    expect(validatePasswordPair("correct horse", "correct horse", "a@b.co")).toEqual({ ok: true });
    expect(validatePasswordPair("correct horse", "correct horsE", "a@b.co")).toEqual({ ok: false, error: "The two passwords do not match." });
    expect(validatePasswordPair("correct horse", undefined, "a@b.co").ok).toBe(false);
    expect(validatePasswordPair("correct horse", ["correct horse"], "a@b.co").ok).toBe(false);
  });
  it("does not trim: a trailing space is part of the password", () => {
    expect(validatePasswordPair("correct horse", "correct horse ", "").ok).toBe(false);
  });
  it("still applies the length and email rules first", () => {
    expect(validatePasswordPair("short", "short", "").error).toMatch(/at least 8/);
    expect(validatePasswordPair("me@x.com", "me@x.com", "me@x.com").error).toMatch(/cannot be your email/);
  });
});
