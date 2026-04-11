import type { BodySerializer } from "../types/http";

function isBodyInitLike(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof ReadableStream
  );
}

export const jsonBodySerializer: BodySerializer = {
  serialize(body) {
    if (body === undefined || body === null) {
      return { payload: null };
    }

    if (isBodyInitLike(body)) {
      return { payload: body };
    }

    return {
      payload: JSON.stringify(body),
      contentType: "application/json",
    };
  },
};
