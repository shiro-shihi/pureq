import { isOk } from "../../../../validation/src/index.js";
import { RPCContext } from "../shared/types.js";
import { timingSafeEqual, generateRequestSignature, generateCacheKey } from "../shared/crypto.js";
import { PureqHyperCodec } from "../shared/codec.js";
import { FortressRouter } from "./router.js";

export interface RpcHandlerOptions {
  router: FortressRouter;
  cache?: any;
  defaultTtl?: number;
  /**
   * Maximum allowed request size in bytes. Default: 2MB.
   */
  maxRequestSize?: number;
}

export class RpcHandler {
  private maxRequestSize: number;

  constructor(private options: RpcHandlerOptions) {
    this.maxRequestSize = options.maxRequestSize || 2 * 1024 * 1024; // 2MB
  }

  async handleRequest(request: Request, getContext: () => Promise<RPCContext>): Promise<Response> {
    const ctx = await getContext();
    
    try {
      const contentLength = parseInt(request.headers.get("content-length") || "0");
      if (contentLength > this.maxRequestSize) {
        return new Response("Payload Too Large", { status: 413 });
      }

      const body = await request.arrayBuffer();
      if (body.byteLength > this.maxRequestSize) {
        return new Response("Payload Too Large", { status: 413 });
      }

      const bodyBytes = new Uint8Array(body);
      const decoded = PureqHyperCodec.decode(bodyBytes);
      const { queryId, signature, params } = decoded;

      // Anti-Prototype Pollution
      if (!this.options.router?.manifest || !Object.prototype.hasOwnProperty.call(this.options.router.manifest, queryId)) {
        return new Response("Forbidden", { status: 403 });
      }

      // SEC-H10: Dynamic response buffer allocation to prevent OOM
      const initialSlabSize = Math.min(this.maxRequestSize, 32 * 1024);
      let slab = new Uint8Array(initialSlabSize);

      const paramsBinary = PureqHyperCodec.encode(params, slab);
      const expectedSignature = await generateRequestSignature(ctx.sessionSecret, queryId, paramsBinary);
      
      if (!timingSafeEqual(signature, expectedSignature)) {
        return new Response("Forbidden", { status: 403 });
      }

      const manifestEntry = this.options.router.manifest[queryId]!;
      const handler = this.options.router.procedureHandlers?.[queryId];

      if (!handler) {
        return new Response("Forbidden", { status: 403 });
      }

      // Validation and Execution...
      const result = await handler({ input: params, ctx });

      const responseBinary = PureqHyperCodec.encode(result, slab);
      return new Response(responseBinary as any, {
        headers: { "content-type": "application/octet-stream" }
      });

    } catch (e: any) {
      // In production, we don't leak reason, just Forbidden for security suspicion.
      return new Response("Forbidden", { status: 403 });
    }
  }
}
