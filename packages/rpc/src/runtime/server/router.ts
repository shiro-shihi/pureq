import { QueryManifest } from "../shared/types.js";

export type ProcedureHandler<TInput, TOutput> = (opts: { 
  input: TInput; 
  ctx: any;
}) => Promise<TOutput>;

export class FortressRouter {
  public procedureHandlers: Record<string, ProcedureHandler<any, any>> = {};
  public schemas: Record<string, any> = {};

  constructor(public readonly manifest: QueryManifest) {}

  procedure<TInput, TOutput>(queryId: string, handler: ProcedureHandler<TInput, TOutput>) {
    const entry = this.manifest[queryId];
    if (!entry) throw new Error(`[Pureq RPC] QueryId ${queryId} not in manifest.`);
    this.procedureHandlers[queryId] = handler;
    this.schemas[queryId] = entry.inputSchema;
    return this;
  }
}
