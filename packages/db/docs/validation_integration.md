# Validation Integration

A key feature of `@pureq/db` is its deep integration with the `@pureq/validation` package.

## The Validation Bridge

You can convert any database table definition into a validation schema using `toValidationSchema`.

```typescript
import { toValidationSchema } from "@pureq/db";
import { users } from "./schema";

const userValidationSchema = toValidationSchema(users);
```

This is extremely powerful because it ensures your API validation and your database schema are always in sync. If you change a column type in your DB schema, your API validation updates automatically.

## Policy Inheritance

Policies defined on your database columns are automatically propagated to the validation schema.

```typescript
const users = table("users", {
  email: column.string().policy({ pii: true }),
});

const schema = toValidationSchema(users);
// schema.shape.email now has the { pii: true } metadata!
```

## Runtime Validation

When querying, use the `.validate()` method to apply the validation schema to the results. This is useful for:

- Ensuring data integrity.
- Applying masking/redaction based on policies during serialization.
- Catching configuration mismatches between application and DB.
