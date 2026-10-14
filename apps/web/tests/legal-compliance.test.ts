import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS modules
import * as core from "../lib/accountsCore.js";
// @ts-ignore - plain JS modules
import { stripHeavy, OWNER_TABLES } from "../lib/accountData.js";
// @ts-ignore - plain JS modules
import { aiNotice, operatorDetails, privacyPolicy, termsOfService } from "../lib/legalTexts.js";
// @ts-ignore - plain JS modules
import { firstNameOf } from "../lib/guardianConsent.js";

const c: any = core;
const NOW = new Date(Date.UTC(2026, 9, 13));

describe("age gate rules", () => {
  it("accepts only real, plausible birth dates", () => {
    expect(c.parseBirthDate("2012-03-04", NOW)).toBe("2012-03-04");
    expect(c.parseBirthDate("2012-02-31", NOW)).toBe("");
    expect(c.parseBirthDate("2030-01-01", NOW)).toBe("");
    expect(c.parseBirthDate("1800-01-01", NOW)).toBe("");
    expect(c.parseBirthDate("04/03/2012", NOW)).toBe("");
    expect(c.parseBirthDate("", NOW)).toBe("");
  });

  it("computes whole years and the 14 / 18 lines", () => {
    expect(c.ageFromBirthDate("2012-10-13", NOW)).toBe(14);
    expect(c.ageFromBirthDate("2012-10-14", NOW)).toBe(13);
    expect(c.needsGuardianConsent(13)).toBe(true);
    expect(c.needsGuardianConsent(14)).toBe(false);
    expect(c.isMinorAge(17)).toBe(true);
    expect(c.isMinorAge(18)).toBe(false);
  });

  it("derives a minor from the birth date first, then from the flags", () => {
    expect(c.isMinorAccount({ birth_date: "2000-01-01", is_minor: true }, NOW)).toBe(false);
    expect(c.isMinorAccount({ birth_date: "2012-01-01" }, NOW)).toBe(true);
    expect(c.isMinorAccount({ under_13: true }, NOW)).toBe(true);
    expect(c.isMinorAccount({ age: 16 }, NOW)).toBe(true);
    expect(c.isMinorAccount({ age: 30 }, NOW)).toBe(false);
    expect(c.isMinorAccount(null, NOW)).toBe(false);
  });

  it("shows the owner their minor status and accepted terms, never a password hash", () => {
    const own = c.ownAccount({ id: "a", email: "a@b.co", display_name: "A", role: "student", birth_date: "2012-01-01", terms_version: c.TERMS_VERSION, password_hash: "secret" });
    expect(own.isMinor).toBe(true);
    expect(own.termsAccepted).toBe(c.TERMS_VERSION);
    expect(JSON.stringify(own)).not.toContain("secret");
  });
});

describe("guardian consent keeps almost nothing about the child", () => {
  it("keeps only a first name", () => {
    expect(firstNameOf("  María   José García ")).toBe("María");
    expect(firstNameOf("")).toBe("");
  });
});

describe("data export and deletion", () => {
  it("drops heavy original-file payloads and screenshots from an export", () => {
    const out = stripHeavy({ name: "n", sourceContentBase64: "AAAA", nested: [{ source_render_html: "<p/>", keep: 1 }], screenshot: "data:..." });
    expect(out).toEqual({ name: "n", nested: [{ keep: 1 }] });
  });

  it("erases workspaces last among owner tables, after the tables that point at their documents", () => {
    expect(OWNER_TABLES[OWNER_TABLES.length - 1]).toBe("workspaces");
    expect(OWNER_TABLES).toContain("attempts");
    expect(OWNER_TABLES).toContain("student_concept_state");
  });
});

describe("legal texts", () => {
  it("exist, carry the version and cover the promises the app makes", () => {
    for (const doc of [privacyPolicy(), termsOfService(), aiNotice()]) {
      expect(doc.updated).toBe(c.TERMS_VERSION);
      expect(doc.sections.length).toBeGreaterThan(3);
    }
    const privacy = JSON.stringify(privacyPolicy());
    expect(privacy).toMatch(/48 hours/);
    expect(privacy).toMatch(/Children/);
    expect(JSON.stringify(aiNotice())).toMatch(/not a final grade/i);
  });

  it("takes the operator from the environment", () => {
    const o = operatorDetails({ LUNA_LEGAL_NAME: "Luna Labs S.L.", LUNA_LEGAL_ADDRESS: "Calle 1, Madrid", LUNA_PRIVACY_EMAIL: "privacy@luna.test" });
    expect(o.name).toBe("Luna Labs S.L.");
    expect(o.contact).toBe("privacy@luna.test");
  });
});

describe("Spanish texts and minor protections", () => {
  it("serves the Spanish versions with the same structure", () => {
    for (const fn of [privacyPolicy, termsOfService, aiNotice]) {
      const en: any = (fn as any)("en");
      const es: any = (fn as any)("es");
      expect(es.sections.length).toBe(en.sections.length);
      expect(es.title).not.toBe(en.title);
    }
  });

  it("keeps the retention numbers promised in the privacy text", async () => {
    const data: any = await import("../lib/accountData.js");
    expect(data.DELETION_GRACE_DAYS).toBe(30);
    expect(data.FEEDBACK_SCREENSHOT_DAYS).toBe(90);
    expect(JSON.stringify(privacyPolicy())).toMatch(/90 days/);
  });
});

// @ts-ignore - plain JS modules
import { scrubPii, scrubMessages } from "../lib/aiPrivacy.js";

describe("scrubPii", () => {
  it("masks emails and phone numbers but keeps ordinary numbers", () => {
    expect(scrubPii("write to ana@school.es or call +34 612 345 678")).toBe("write to [email] or call [phone]");
    expect(scrubPii("the answer is 3.14 in 2026, score 12 34")).toBe("the answer is 3.14 in 2026, score 12 34");
  });
  it("scrubs chat message contents only", () => {
    expect(scrubMessages([{ role: "user", content: "mail me a@b.co" }])).toEqual([{ role: "user", content: "mail me [email]" }]);
  });
});
