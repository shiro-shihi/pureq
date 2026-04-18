import { ArraySchema } from "./composite/array.js";
import { ObjectSchema } from "./composite/object.js";
import { NullableSchema } from "./composite/nullable.js";
import { OptionalSchema } from "./composite/optional.js";
import { GuardSchema, createGuardSchema } from "./composite/guard.js";
import type { PolicySchema } from "./base.js";
import { BooleanSchema } from "./primitive/boolean.js";
import { NumberSchema } from "./primitive/number.js";
import { StringSchema } from "./primitive/string.js";
import type {
  GuardFunction,
  GuardOptions,
} from "../guard/guard.js";

export const v = {
  string: (): StringSchema => new StringSchema(),
  number: (): NumberSchema => new NumberSchema(),
  boolean: (): BooleanSchema => new BooleanSchema(),
  object: <TShape extends Record<string, PolicySchema<unknown>>>(shape: TShape): ObjectSchema<TShape> =>
    new ObjectSchema(shape),
  array: <TItemSchema extends PolicySchema<unknown>>(schema: TItemSchema): ArraySchema<TItemSchema> =>
    new ArraySchema(schema),
  nullable: <T>(schema: PolicySchema<T>): NullableSchema<T> => new NullableSchema(schema),
  optional: <T>(schema: PolicySchema<T>): OptionalSchema<T> => new OptionalSchema(schema),
  guard: <T>(fn: GuardFunction<T>, nameOrOptions?: string | GuardOptions) =>
    createGuardSchema(fn, nameOrOptions),
};
