/**
 * @pureq/rpc v1.0.0 - Sealed Client Proxy
 * High-performance, Type-safe Binary Bridge.
 */
import { PureqHyperCodec } from "../shared/codec.js";
import { generateRequestSignature } from "../shared/crypto.js";

export interface ClientOptions {
  url: string;
  getSessionSecret: () => string | Promise<string>;
}

export function createPureqClient<TRouter>(options: ClientOptions) {
  return new Proxy({} as any, {
    get(_target, prop: string) {
      return async (params: any) => {
        const sessionSecret = await options.getSessionSecret();
        const queryId = prop;

        const slab = new Uint8Array(256 * 1024); // Client-side scratch slab
        const paramsBinary = PureqHyperCodec.encode(params, slab);
        const signature = await generateRequestSignature(sessionSecret, queryId, paramsBinary);

        const requestObject = { queryId, signature, params };
        const serializedRequest = PureqHyperCodec.encode(requestObject, slab);

        const response = await fetch(options.url, {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: serializedRequest as any
        });

        if (!response.ok) {
          throw new Error(`RPC Security Violation: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        return PureqHyperCodec.decode(new Uint8Array(buffer));
      };
    }
  }) as TRouter;
}
