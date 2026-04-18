export interface QuerySpan {
  sql: string;
  params: unknown[];
  startTime: number;
  endTime?: number;
  duration?: number;
  error?: Error;
  policiesApplied?: string[];
}

export interface Diagnostics {
  onQueryStart(span: QuerySpan): void;
  onQueryEnd(span: QuerySpan): void;
  onPolicyApplied(policyName: string, details: any): void;
}

export class DefaultDiagnostics implements Diagnostics {
  onQueryStart(span: QuerySpan): void {}
  onQueryEnd(span: QuerySpan): void {}
  onPolicyApplied(policyName: string, details: any): void {}
}
