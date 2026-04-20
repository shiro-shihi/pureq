import { describe, it, expect } from "vitest";
import { PureqHyperCodec } from "../src/runtime/shared/codec.ts";
import { TYPE_IDS } from "../src/runtime/shared/types.ts";

describe("PureqHyperCodec (v1.0.0)", () => {
  const slab = new Uint8Array(1024 * 1024);

  it("should encode and decode NULL", () => {
    const encoded = PureqHyperCodec.encode(null, slab);
    expect(encoded[0]).toBe(TYPE_IDS.NULL);
    expect(PureqHyperCodec.decode(encoded)).toBe(null);
  });

  it("should encode and decode Booleans", () => {
    const val = true;
    const encoded = PureqHyperCodec.encode(val, slab);
    expect(encoded[0]).toBe(TYPE_IDS.BOOL);
    expect(encoded[1]).toBe(1);
    expect(PureqHyperCodec.decode(encoded)).toBe(true);
  });

  it("should encode and decode Integers (Bitwise)", () => {
    const val = 123456;
    const encoded = PureqHyperCodec.encode(val, slab);
    expect(encoded[0]).toBe(TYPE_IDS.INT);
    expect(PureqHyperCodec.decode(encoded)).toBe(val);
  });

  it("should encode and decode Floats", () => {
    const val = 3.14159;
    const encoded = PureqHyperCodec.encode(val, slab);
    expect(encoded[0]).toBe(TYPE_IDS.FLOAT);
    expect(PureqHyperCodec.decode(encoded)).toBeCloseTo(val);
  });

  it("should encode and decode Strings (UTF-8)", () => {
    const val = "Hello Pureq 🏰";
    const encoded = PureqHyperCodec.encode(val, slab);
    expect(encoded[0]).toBe(TYPE_IDS.STRING);
    expect(PureqHyperCodec.decode(encoded)).toBe(val);
  });

  it("should encode and decode Dates", () => {
    const val = new Date();
    const encoded = PureqHyperCodec.encode(val, slab);
    expect(encoded[0]).toBe(TYPE_IDS.DATE);
    expect(PureqHyperCodec.decode(encoded).getTime()).toBe(val.getTime());
  });

  it("should encode and decode nested Objects", () => {
    const val = { id: 1, name: "Alice", active: true };
    const encoded = PureqHyperCodec.encode(val, slab);
    expect(encoded[0]).toBe(TYPE_IDS.OBJECT);
    expect(PureqHyperCodec.decode(encoded)).toEqual(val);
  });

  it("should encode and decode nested Arrays", () => {
    const val = [1, "two", { three: 3 }];
    const encoded = PureqHyperCodec.encode(val, slab);
    expect(encoded[0]).toBe(TYPE_IDS.ARRAY);
    expect(PureqHyperCodec.decode(encoded)).toEqual(val);
  });

  it("should handle Error objects", () => {
    const val = new Error("Security Violation");
    const encoded = PureqHyperCodec.encode(val, slab);
    expect(encoded[0]).toBe(TYPE_IDS.ERROR);
    const decoded = PureqHyperCodec.decode(encoded);
    expect(decoded).toBeInstanceOf(Error);
    expect(decoded.message).toBe(val.message);
  });
});
