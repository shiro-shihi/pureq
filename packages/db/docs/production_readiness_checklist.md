# Production Readiness Checklist

Before you deploy your application with `@pureq/db`, ensure you have covered these essential points.

## 1. Schema & Validation

- [ ] Have you marked sensitive columns with `.policy({ pii: true })`?
- [ ] Have you decided which columns should be masked or hidden (`redact`)?
- [ ] Are you using `.validate()` on queries that handle external/user-provided data?

## 2. Infrastructure & Drivers

- [ ] For PostgreSQL: Is your connection pool size configured correctly?
- [ ] For Edge (Neon/D1): Are you using the specialized `NeonHttpDriver` or `CloudflareD1Driver`?
- [ ] Have you enabled the `TracingDriver` to monitor performance and errors?

## 3. Security

- [ ] Are you using `QueryContext` to enforce row-level access control?
- [ ] Have you verified that all queries use prepared statements (Query Builder does this by default)?

## 4. Maintenance

- [ ] Have you run `migrationManager.apply()` as part of your deployment CI/CD?
- [ ] Do you have a rollback plan using `migrationManager.rollback()`?
- [ ] Have you checked for `DBError` retryable flags to implement automatic retries for transient failures?
