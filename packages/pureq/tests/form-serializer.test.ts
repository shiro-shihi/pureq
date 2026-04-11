import { describe, expect, it } from "vitest";
import { createFormUrlEncodedSerializer } from "../src/serializers/formUrlEncodedSerializer";

describe("form urlencoded serializer", () => {
  it("serializes object with repeated array keys by default", () => {
    const serializer = createFormUrlEncodedSerializer();
    const result = serializer.serialize({ a: 1, tags: ["x", "y"] });

    expect(result.contentType).toBe("application/x-www-form-urlencoded");
    expect(result.payload).toBe("a=1&tags=x&tags=y");
  });

  it("serializes arrays as comma-separated when configured", () => {
    const serializer = createFormUrlEncodedSerializer({ arrayMode: "comma" });
    const result = serializer.serialize({ tags: ["x", "y"] });

    expect(result.payload).toBe("tags=x%2Cy");
  });
});
