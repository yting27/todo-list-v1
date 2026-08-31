# Decision log

## Scope and requirement interpretations

I treated one workspace as one shared TODO list. Access belongs to a workspace rather than individual TODOs, with `owner`, `editor`, and `viewer` roles. Owners manage membership, editors change TODOs, and viewers can read. This supports multiple concurrent users without a per-record ACL that the brief did not request.

Due dates are required instants stored in UTC and displayed in the workspace's IANA timezone. Priorities sort `Low < Medium < High`; statuses sort `Not started < In progress < Completed < Archived`. Deletion is soft deletion (`deleted_at`, `deleted_by`) and ordinary reads exclude deleted records. A v1 restore UI is omitted, but retained records permit future administrative recovery.

Dependency edges must stay within a workspace and cannot be self-referential, duplicated, or cyclic. A blocked TODO cannot start. Adding an incomplete prerequisite to an already in-progress TODO is rejected because it would bypass the same rule. Deleting a prerequisite used by an active TODO is also rejected, avoiding an invisible blocker.

Reopening a completed prerequisite is ambiguous. The API finds active transitive downstream TODOs. If any are in progress or completed it first returns `409 reopen_requires_confirmation`. Confirmation atomically resets the prerequisite and affected downstream chain to Not started. Archived and deleted TODOs are excluded.

Custom recurrence means every N days, weeks, or months. The first occurrence owns an immutable local wall-clock anchor. Monthly schedules clamp missing month-end days without drifting the anchor; schedules preserve local time across DST. Late completion creates only the first scheduled slot strictly after the server-recorded completion and skips backlog. The next occurrence copies name, description, and priority, starts Not started, and does not copy occurrence-specific dependencies.

## Architecture and trade-offs

This is a TypeScript modular monolith: Express transport, explicit domain/service modules, PostgreSQL repositories, React, and an OpenAPI-generated shared contract. It is smaller to understand, test, and deploy than microservices, while module boundaries and separate API/relay commands leave clean extraction points. PostgreSQL is the source of truth; Redis holds ephemeral sessions, rate limits, and fan-out only.

Optimistic concurrency uses an integer version exposed as an ETag. It avoids distributed locks and lets users edit independently. One matching writer succeeds; stale writers get `412` and the UI preserves their draft for comparison. Real-time SSE improves freshness but never chooses which edit wins.

Each mutation writes its outbox notification in the same transaction. A separate relay publishes committed rows to Redis, and every API replica forwards only relevant events to its connected SSE clients. Delivery is at least once; clients compare versions and refetch REST state. This costs more code than direct in-process notifications, but avoids losing a saved event during a process crash and supports horizontal API scaling without sticky sessions.

Lists use keyset pagination (50 by default, 100 maximum), workspace-leading partial indexes, a deterministic UUID tie-breaker, and static allow-listed sort queries. Keyset cursors do not support jumping to an arbitrary page, but they avoid increasingly expensive offsets and unstable pages under concurrent inserts. I intentionally did not create an index for every filter/sort combination; the 10,000-row seed and real query plans should guide targeted indexes.

Authentication is included because it makes workspace authorization credible. Passwords use Argon2id; opaque sessions are stored in Redis by SHA-256 digest with idle and absolute expiry; state changes require a synchronizer CSRF token and trusted origin. Plain local HTTP uses a non-Secure development cookie. TLS deployments enable the Secure `__Host-` cookie.

## Deliberately not built

Bulk operations, restore UI, email verification, password reset, MFA/social login, field-level collaborative typing, Kubernetes manifests, and exhaustive performance-specific indexes are outside v1. They are optional or need product/operational decisions that do not improve the core demo as much as correct CRUD, recurrence, dependencies, and concurrency.

With more time I would add browser-level multi-user Playwright coverage, automatic email workflows, an owner-transfer flow, an administrative restore screen, OpenTelemetry exporters and dashboards, and load tests that drive index decisions from production-shaped data distributions. A WebSocket/CRDT layer would be considered only if field-level simultaneous editing became a requirement.
