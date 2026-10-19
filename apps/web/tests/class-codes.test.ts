import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS modules
import * as codes from "../lib/classCodes.js";
// @ts-ignore - plain JS modules
import * as core from "../lib/accountsCore.js";
// @ts-ignore - plain JS modules
import { limits } from "../lib/accountLimits.js";
// @ts-ignore - plain JS modules
import { aiNotice, operatorDetails, privacyPolicy, termsOfService } from "../lib/legalTexts.js";

const c: any = codes;
const k: any = core;
const NOW = new Date(Date.UTC(2026, 9, 19));
const consented = { enabled: true, schoolConsentAt: "2026-10-19T09:00:00Z", schoolConsentBy: "teacher-1" };

describe("class code generation", () => {
  it("makes 6 letters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = c.generateClassCode((max: number) => Math.floor(Math.random() * max));
      expect(code).toMatch(/^[A-Z]{6}$/);
      for (const letter of code) expect(c.CODE_ALPHABET).toContain(letter);
    }
  });
  it("never uses look-alike letters", () => {
    for (const bad of "ILOQUV01") expect(c.CODE_ALPHABET).not.toContain(bad);
    expect(new Set(c.CODE_ALPHABET).size).toBe(c.CODE_ALPHABET.length);
  });
  it("is driven by the injected random source and rejects a bad one", () => {
    expect(c.generateClassCode(() => 0)).toBe("AAAAAA");
    expect(c.generateClassCode(() => c.CODE_ALPHABET.length - 1)).toBe("ZZZZZZ");
    expect(() => c.generateClassCode(() => c.CODE_ALPHABET.length)).toThrow();
    expect(() => c.generateClassCode(() => 1.5)).toThrow();
  });
});

describe("class code validation", () => {
  it("cleans what a person types", () => {
    expect(c.normalizeClassCode(" abc-def ")).toBe("ABCDEF");
    expect(c.normalizeClassCode("abc def")).toBe("ABCDEF");
  });
  it("refuses anything that cannot be a code", () => {
    for (const bad of ["", "ABCDE", "ABCDEFG", "ABC1EF", "ABCDEO", "ÁBCDEF", null, undefined, "ABC%DEF"]) expect(c.normalizeClassCode(bad)).toBe("");
  });
  it("formats in two blocks", () => {
    expect(c.formatClassCode("ABCDEF")).toBe("ABC DEF");
  });
  it("needs a class name and records consent only when literally true", () => {
    expect(c.validateClassCreation({ name: "  " }).ok).toBe(false);
    expect(c.validateClassCreation({ name: " 2B   Biology ", schoolConsent: true })).toEqual({ ok: true, name: "2B Biology", schoolConsent: true });
    for (const value of ["true", 1, "on", undefined, null]) expect(c.validateClassCreation({ name: "A", schoolConsent: value }).schoolConsent).toBe(false);
  });
});

describe("under-14 decision", () => {
  it("rejects a missing or switched-off class the same way", () => {
    expect(c.decideClassJoin({ age: 16, classRow: null })).toEqual({ ok: false, code: "invalid_code" });
    expect(c.decideClassJoin({ age: 16, classRow: { ...consented, enabled: false } })).toEqual({ ok: false, code: "invalid_code" });
  });
  it("lets 14 and over join without any approval step", () => {
    expect(c.decideClassJoin({ age: 14, classRow: { enabled: true } })).toEqual({ ok: true, approval: "none" });
    expect(c.decideClassJoin({ age: null, classRow: { enabled: true } })).toEqual({ ok: true, approval: "none" });
  });
  it("approves an under-14 by the school's consent when the class has it", () => {
    expect(c.decideClassJoin({ age: 13, classRow: consented })).toEqual({ ok: true, approval: "school" });
    expect(c.decideClassJoin({ age: 8, classRow: consented })).toEqual({ ok: true, approval: "school" });
  });
  it("keeps the guardian flow for an under-14 when the class has no confirmation", () => {
    expect(c.decideClassJoin({ age: 13, classRow: { enabled: true } })).toEqual({ ok: false, code: "needs_guardian", needsGuardian: true });
    expect(c.decideClassJoin({ age: 13, classRow: { enabled: true, schoolConsentAt: "2026-10-19", schoolConsentBy: null } }).ok).toBe(false);
  });
  it("agrees with the account rules on the 14th birthday", () => {
    const just13 = k.ageFromBirthDate("2012-10-20", NOW);
    const just14 = k.ageFromBirthDate("2012-10-19", NOW);
    expect([just13, just14]).toEqual([13, 14]);
    expect(c.studentAgeOf({ birth_date: "2012-10-20" }, NOW)).toBe(just13);
    expect(c.studentAgeOf({ birth_date: "2012-10-19" }, NOW)).toBe(just14);
    expect(c.decideClassJoin({ age: just13, classRow: { enabled: true } }).ok).toBe(k.needsGuardianConsent(just13) ? false : true);
  });
  it("reads the age of an existing account from the birth date, then the flags", () => {
    expect(c.studentAgeOf({ birth_date: "2010-01-01", under_13: false }, NOW)).toBe(16);
    expect(c.studentAgeOf({ under_13: true }, NOW)).toBeLessThan(14);
    expect(c.studentAgeOf({ age: 12 }, NOW)).toBe(12);
    expect(c.studentAgeOf({}, NOW)).toBeNull();
  });
});

describe("brute-force brake", () => {
  it("blocks an address after 10 wrong guesses", () => {
    limits.classCodeGuessesByAddress.clear();
    for (let i = 0; i < 10; i += 1) limits.classCodeGuessesByAddress.fail("1.2.3.4");
    expect(limits.classCodeGuessesByAddress.isBlocked("1.2.3.4")).toBe(true);
    expect(limits.classCodeGuessesByAddress.isBlocked("5.6.7.8")).toBe(false);
    limits.classCodeGuessesByAddress.clear();
  });
});

describe("legal placeholders", () => {
  it("never prints a placeholder address", () => {
    for (const email of ["privacy@yourdomain", "privacy@yourdomain.com", "you@example.com", "", "not an email", undefined]) {
      const o = operatorDetails({ LUNA_PRIVACY_EMAIL: email } as any);
      expect(o.email).toBe("");
      expect(o.contact).toBe("the Feedback button inside LUNA");
    }
  });
  it("renders no 'yourdomain' in any legal text, either language", () => {
    const previous = process.env.LUNA_PRIVACY_EMAIL;
    process.env.LUNA_PRIVACY_EMAIL = "privacy@yourdomain";
    try {
      for (const lang of ["en", "es"]) for (const fn of [privacyPolicy, termsOfService, aiNotice]) expect(JSON.stringify(fn(lang))).not.toMatch(/yourdomain/i);
    } finally {
      if (previous === undefined) delete process.env.LUNA_PRIVACY_EMAIL;
      else process.env.LUNA_PRIVACY_EMAIL = previous;
    }
  });
  it("keeps a real address and mentions school consent in both languages", () => {
    expect(operatorDetails({ LUNA_PRIVACY_EMAIL: "privacy@luna.test" } as any).contact).toBe("privacy@luna.test");
    expect(JSON.stringify(privacyPolicy("en"))).toMatch(/school holds parental consent/);
    expect(JSON.stringify(privacyPolicy("es"))).toMatch(/consentimiento parental/);
  });
});
