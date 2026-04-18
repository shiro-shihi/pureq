# FAQ

## Does `@pureq/db` support migrations?

Yes, it includes a `MigrationManager` that handles transactional schema updates and tracks applied migrations in a specialized table.

## Can I use `@pureq/db` with existing ORMs like Prisma or Drizzle?

`@pureq/db` is designed as a standalone solution, but you can use its Schema DSL and Validation Bridge alongside other ORMs. We plan to provide compatibility layers to make this integration even smoother.

## Is it safe to use in Edge environments (Cloudflare Workers, etc.)?

Yes. The core of `@pureq/db` is runtime-agnostic. We provide (and are expanding) drivers that work over HTTP or other non-TCP protocols common in edge runtimes.

## How does validation affect performance?

Validation happens in-memory after data is fetched. For typical API result sets (10-100 rows), the overhead is negligible. For massive datasets, you should evaluate the performance impact or use selective validation.

## Why not just use Zod?

While Zod is excellent, `@pureq/db` is optimized for the Pureq ecosystem, offering deeper integration with our policy engine and native "push-down" capabilities that generic validation libraries cannot provide.
