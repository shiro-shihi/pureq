import { Table } from "../schema/dsl.js";

export interface ValidationResult {
  tableName: string;
  columnName: string;
  issue: string;
  severity: "error" | "warning";
}

/**
 * Validates a table schema for policy coverage.
 * Checks for sensitive column names that might be missing PII or redaction policies.
 */
export function validateTablePolicy(table: Table<any, any>): ValidationResult[] {
  const results: ValidationResult[] = [];
  const sensitiveNames = [/email/i, /password/i, /phone/i, /address/i, /ssn/i, /credit_card/i];

  for (const [name, col] of Object.entries(table.columns)) {
    const options = (col as any).options;
    const policy = options?.policy;

    const isSensitiveName = sensitiveNames.some(regex => regex.test(name));

    if (isSensitiveName && !policy?.pii) {
      results.push({
        tableName: table.name,
        columnName: name,
        issue: `Column name "${name}" suggests sensitive data, but pii: true is not set in policy.`,
        severity: "warning"
      });
    }

    if (policy?.pii && !policy?.redact) {
      results.push({
        tableName: table.name,
        columnName: name,
        issue: `PII column "${name}" has no redaction policy set (e.g., redact: "mask").`,
        severity: "warning"
      });
    }
  }

  return results;
}

export function printValidationReport(results: ValidationResult[]) {
  if (results.length === 0) {
    console.log("✅ Schema validation passed. Policy coverage looks good.");
    return;
  }

  console.log(`🔍 Schema Policy Report (${results.length} issues found):`);
  for (const res of results) {
    const icon = res.severity === "error" ? "❌" : "⚠️";
    console.log(`${icon} [${res.tableName}.${res.columnName}] ${res.issue}`);
  }
}
