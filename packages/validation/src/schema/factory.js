import { ArraySchema } from "./composite/array.js";
import { ObjectSchema } from "./composite/object.js";
import { NullableSchema } from "./composite/nullable.js";
import { OptionalSchema } from "./composite/optional.js";
import { createGuardSchema } from "./composite/guard.js";
import { BooleanSchema } from "./primitive/boolean.js";
import { NumberSchema } from "./primitive/number.js";
import { StringSchema } from "./primitive/string.js";
export const v = {
    string: () => new StringSchema(),
    number: () => new NumberSchema(),
    boolean: () => new BooleanSchema(),
    object: (shape) => new ObjectSchema(shape),
    array: (schema) => new ArraySchema(schema),
    nullable: (schema) => new NullableSchema(schema),
    optional: (schema) => new OptionalSchema(schema),
    guard: (fn, nameOrOptions) => createGuardSchema(fn, nameOrOptions),
};
