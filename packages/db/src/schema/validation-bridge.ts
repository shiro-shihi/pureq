import { v } from "@pureq/validation";
import type { PolicySchema, ValidationPolicy } from "@pureq/validation";
import type { ColumnBuilder, Table } from "./dsl.js";

export function columnToValidationSchema(
  builder: ColumnBuilder<any, any>,
): PolicySchema<unknown> {
  let schema: PolicySchema<unknown>;

  switch (builder.type) {
    case "string":
    case "uuid":
      schema = v.string() as PolicySchema<unknown>;
      break;
    case "number":
      schema = v.number() as PolicySchema<unknown>;
      break;
    case "boolean":
      schema = v.boolean() as PolicySchema<unknown>;
      break;
    case "date":
      schema = v.guard((val: unknown): val is Date => val instanceof Date, "Date") as PolicySchema<unknown>;
      break;
    case "json":
      schema = v.guard((val: unknown): val is unknown => true, "JSON") as PolicySchema<unknown>;
      break;
    default:
      throw new Error(`Unsupported column type: ${builder.type}`);
  }

  if (builder.options.nullable) {
    schema = v.nullable(schema) as PolicySchema<unknown>;
  }

  if (builder.options.policy) {
    const policy: ValidationPolicy = {};
    if (builder.options.policy.pii) policy.pii = true;
    if (builder.options.policy.redact) policy.redact = builder.options.policy.redact;
    if (builder.options.policy.scope) policy.scope = builder.options.policy.scope;
    
    schema = schema.policy(policy);
  }

  return schema;
}

export function toValidationSchema<
  TName extends string,
  TColumns extends Record<string, ColumnBuilder<any, any>>,
>(table: Table<TName, TColumns>) {
  const shape: Record<string, PolicySchema<unknown>> = {};

  for (const [name, builder] of Object.entries(table.columns)) {
    shape[name] = columnToValidationSchema(builder);
  }

  return v.object(shape);
}
