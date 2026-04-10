import type { BodySerializer } from "../types/http";

export interface FormUrlEncodedSerializerOptions {
  readonly arrayMode?: "repeat" | "comma";
}

export function createFormUrlEncodedSerializer(
  options: FormUrlEncodedSerializerOptions = {}
): BodySerializer {
  const arrayMode = options.arrayMode ?? "repeat";

  return {
    serialize(body) {
      if (body === undefined || body === null) {
        return { payload: null };
      }

      if (typeof body !== "object") {
        return {
          payload: String(body),
          contentType: "application/x-www-form-urlencoded",
        };
      }

      const params = new URLSearchParams();

      for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (value === undefined || value === null) {
          continue;
        }

        if (Array.isArray(value)) {
          if (arrayMode === "comma") {
            params.set(key, value.map((item) => String(item)).join(","));
            continue;
          }

          for (const item of value) {
            params.append(key, String(item));
          }
          continue;
        }

        params.set(key, String(value));
      }

      return {
        payload: params.toString(),
        contentType: "application/x-www-form-urlencoded",
      };
    },
  };
}
