import { describe, expect, it } from "vitest";
import {
  analyzeAuthMigration,
  formatMigrationParityReport,
  generateMigrationChecklists,
} from "../src/migration";

describe("migration diagnostics", () => {
  it("builds parity analysis with actionable cutover items", () => {
    const analysis = analyzeAuthMigration({
      legacyInput: { access_token: "access-1" },
      hasProviders: false,
      hasAdapter: false,
      hasCallbacks: false,
      hasSsrBridge: false,
      enableCsrf: false,
      enableRevocation: false,
    });

    expect(analysis.parity.providers).toBe("missing");
    expect(analysis.parity.adapter).toBe("missing");
    expect(analysis.parity.legacyTokens).toBe("covered");
    expect(analysis.cutoverChecklist.length).toBeGreaterThan(0);
  });

  it("formats parity report and checklists", () => {
    const analysis = analyzeAuthMigration({
      legacyInput: { accessToken: "access-2", refreshToken: "refresh-2" },
      hasProviders: true,
      hasAdapter: true,
      hasCallbacks: true,
      hasSsrBridge: true,
      enableCsrf: true,
      enableRevocation: true,
    });

    const report = formatMigrationParityReport(analysis);
    expect(report).toContain("| providers | covered |");
    expect(report).toContain("| adapter | covered |");

    const checklists = generateMigrationChecklists(analysis);
    expect(checklists.rollback.length).toBeGreaterThan(0);
  });
});
