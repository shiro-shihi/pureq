# Best Practices

Follow these guidelines to get the most out of `@pureq/db`.

## Use `.validate()` Judiciously
While `.validate()` provides excellent security and integrity guarantees, it does add overhead for large result sets. Use it for:
- External-facing API results.
- Critical business logic.
- Data with complex policies (masking, redaction).

For internal high-performance batch processing, you may choose to skip validation if you are certain of the data source.

## Leverage Type Inference
Avoid manually defining types for your query results. Always use `InferSelect<typeof table>` and `InferInsert<typeof table>` to ensure your code stays in sync with your schema.

## Transactional Integrity
Always wrap multi-step operations that must be atomic in a transaction:

```typescript
await db.driver.transaction(async (tx) => {
  const newDb = new DB(tx);
  await newDb.insert(users)...;
  await newDb.insert(profiles)...;
});
```

## Prepare Statements
The Query Builder uses prepared statements (placeholders) by default. **Never** manually concatenate strings into your SQL to prevent SQL injection vulnerabilities.
