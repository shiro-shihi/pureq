import { type Statement } from "../builder/ast.js";
import { type QueryContext } from "./context.js";

export interface QuerySpan {
  id: string;
  statement?: Statement;
  sql: string;
  params: unknown[];
  startTime: number;
  endTime?: number;
  duration?: number;
  error?: Error;
  context?: QueryContext | undefined;
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
