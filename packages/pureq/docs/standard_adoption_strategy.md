# pureq Standard Adoption Strategy

This document defines a practical strategy to make pureq a default choice for both beginners and advanced users.

## 1. Goal

Make pureq the package teams can adopt by default for daily HTTP use, from first project setup to production operation.

## 2. North-Star Metrics

- Beginner metric: first successful API call in 5 minutes or less.
- Expert metric: at least 30% less request boilerplate compared to handwritten fetch usage in common flows.
- Team metric: production incident triage possible from pureq logs/traces without adding ad-hoc instrumentation.
- Runtime metric: same API contract across browser and server runtimes.

## 3. Three-Pillar Strategy

### Pillar A: Beginner Success by Default

- Keep one obvious onboarding path:
- GET JSON example.
- POST JSON example.
- Result-based error handling example.
- Optimize docs for copy-paste success before conceptual depth.

### Pillar B: Expert-Level Control and Extensibility

- Keep default behavior safe, but offer strong escape hatches.
- Formalize extension boundaries:
- Adapter boundary.
- Serializer boundary.
- Retry policy boundary.
- Strengthen error contract:
- Machine-readable error kinds.
- Rich metadata for retry count, status, and root cause.
- Provide first-class observability hooks:
- Request ID.
- Latency.
- Retry attempts.
- Trace context propagation.

### Pillar C: Operational Trust for Team Standardization

- Publish runtime compatibility matrix.
- Enforce strict quality gates in CI:
- Unit tests.
- Integration tests.
- Contract tests.
- Stress tests.
- Define release policy:
- SemVer guarantees.
- Clear deprecation timeline.
- Changelog with migration notes.

## 4. 0-3 Month Execution Plan

### Phase 1 (Weeks 1-4): Entry Experience

- Ship safe defaults and clear advanced options in the same API surface.
- Publish three copy-paste quickstarts.
- Add migration guides from fetch and axios.

Success criteria:

- New-user first-call success >= 90%.
- Majority of onboarding feedback reports "setup was straightforward".

### Phase 2 (Weeks 5-8): Advanced Value

- Finalize robust error taxonomy and metadata.
- Add observability hook API.
- Add advanced policy docs and examples.

Success criteria:

- Incident triage time reduced meaningfully in pilot teams.
- No major API friction reported by advanced adopters.

### Phase 3 (Weeks 9-12): Trust and Scale

- Expand automated test surface and compatibility coverage.
- Finalize release and support SLOs.
- Publish benchmark and reliability reports.

Success criteria:

- Stable minor releases with low regression rate.
- Repeat adoption across multiple internal/external projects.

## 5. Prioritized Backlog

1. Default-safe API design with explicit advanced options.
2. Error contract hardening with metadata and clear docs.
3. Official observability hooks.
4. Compatibility matrix and CI expansion.
5. Migration guides and side-by-side fetch/axios comparisons.

## 6. Adoption Strategy

pureq is designed to be introduced incrementally:

- Start by replacing a single fetch call
- Introduce Result API for error handling
- Gradually move shared logic into middleware

## 7. Competitive Positioning

Compared to fetch:

- Adds structure without hiding behavior

Compared to axios:

- Removes hidden state and mutation

Compared to ky/got:

- Stronger type inference for routes

## 8. KPI Dashboard (Quarterly)

- Weekly downloads and growth rate.
- 30-day retention for new projects.
- Issue response and resolution lead time.
- Regression incidence per release.
- Documentation-driven onboarding success rate.

## 9. Product Principle

Default safe, expert-capable.

Beginners should succeed fast with minimal decisions.
Experts should never be blocked when deeper control is required.
