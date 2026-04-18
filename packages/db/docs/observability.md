# Observability

`@pureq/db` is designed to be highly observable, providing insights into query performance and policy application.

## OpenTelemetry Integration

(Planned) The package will include automatic instrumentation for OpenTelemetry (OTEL). This allows you to trace database queries as spans in your distributed tracing system.

## Policy Tracing

When a query result is validated and policies (like redaction) are applied, `@pureq/db` logs these actions. This helps you understand *why* certain data was masked or hidden in a particular response.

## Query Metrics

Drivers can be wrapped to collect metrics such as:

- Query execution time.
- Row count per query.
- Error rates and specific database error codes.
- Connection pool utilization.
