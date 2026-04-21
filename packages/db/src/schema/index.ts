import { v } from "@pureq/validation";

/**
 * Schema DSL for @pureq/db, reusing @pureq/validation.
 * Matches RFC for OIDC Claims Mapping API.
 */
export const t = {
  string: () => {
    const s = v.string() as any;
    s.optional = () => v.optional(s);
    s.nullable = () => v.nullable(s);
    return s;
  },
  number: () => {
    const n = v.number() as any;
    n.optional = () => v.optional(n);
    n.nullable = () => v.nullable(n);
    return n;
  },
  boolean: () => {
    const b = v.boolean() as any;
    b.optional = () => v.optional(b);
    b.nullable = () => v.nullable(b);
    return b;
  },
  record: v.object,
  object: v.object,
  array: v.array,
  optional: v.optional,
  nullable: v.nullable,
};
