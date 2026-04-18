# Policy Push-down

Policy Push-down is an advanced feature where security policies defined in the Schema DSL are automatically incorporated into the generated SQL.

## Why Push-down?

If you have a policy that says "a user can only see their own posts", you could filter this in your application code. However, it's more efficient and secure to add this condition directly to the `WHERE` clause of your SQL query.

## Row-Level Security

(Planned) Future versions will automatically append filters to the `where` clause based on the current execution context and the policies defined on the table.

## Column-Level Security

By examining the selected columns and the current user's scope, `@pureq/db` can:

- Remove unauthorized columns from the `SELECT` list.
- Replace unauthorized columns with `NULL` or a masked value at the database level.

## Synchronization with Validation

The policies pushed down to the database are the same ones used by `@pureq/validation`. This ensures that even if a developer forgets to add a `WHERE` clause, the security policies are still enforced at the highest possible performance level.
