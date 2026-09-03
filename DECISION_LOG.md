# Decision Log

This document summarizes the assumptions, architectural decisions, trade-offs, excluded scope, and future improvements recorded in the project plan and supporting architecture, performance, and decision documents.

## 1. Interpreting ambiguous instructions

The project brief leaves some behaviors unspecified. The following assumptions turn those instructions into concrete application rules.

| Area                 | Assumption and reasoning                                                                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared list          | One workspace represents one shared TODO list. Membership applies to the workspace rather than individual TODOs because the brief requires shared access but does not define its granularity.                                                                                                                   |
| Permissions          | Workspace roles are `owner`, `editor`, and `viewer`. Owners manage membership, editors change TODOs, and viewers can read. This avoids per-TODO access rules that the brief did not request.                                                                                                                    |
| Due date             | Every TODO has a required date and time. It is stored as a UTC instant and displayed in the workspace's IANA timezone because the brief does not define whether a due date is optional, date-only, or timezone-aware.                                                                                           |
| Business ordering    | Priorities sort `Low < Medium < High`; statuses sort `Not started < In progress < Completed < Archived`. The brief supplies the values but does not define their sorting order.                                                                                                                                 |
| Deletion             | Delete is a soft delete through `deleted_at` and `deleted_by`. Deleted records are hidden from the normal API and UI but retained because the brief requires that data not be permanently lost. A restore workflow is not required in v1.                                                                       |
| Dependencies         | Self-dependencies, duplicates, cross-workspace edges, and cycles are rejected. Graph changes use serializable transactions with bounded retries because the brief requires concurrent access but does not define the result of racing updates.                                                                  |
| Blocked transitions  | A blocked TODO cannot move to In progress or Completed. Adding an incomplete prerequisite to a TODO already in either state is also rejected, preventing the rule from being bypassed through a later dependency edit.                                                                                          |
| Reopening            | If reopening a prerequisite affects downstream TODOs that are In progress or Completed, the API returns `409 reopen_requires_confirmation`. Confirmation resets the affected chain atomically. Archived and deleted TODOs are excluded because the brief does not define reopening or cascading status changes. |
| Dependency deletion  | A prerequisite cannot be deleted while an active TODO depends on it. The brief does not choose between cascade, detach, or rejection; rejection avoids an invisible blocker.                                                                                                                                    |
| Custom recurrence    | Custom recurrence means every N days, weeks, or months in the workspace timezone because the brief does not define a custom recurrence syntax.                                                                                                                                                                  |
| Recurrence timing    | The original local wall-clock anchor is retained. Monthly schedules clamp invalid month-end dates without drifting, and schedules preserve local time across DST. Late completion creates only the first future occurrence and skips backlog because those cases are not defined by the brief.                  |
| Generated occurrence | The next occurrence copies name, description, and priority, starts Not started, and does not copy occurrence-specific dependencies. The brief does not state which fields or relationships carry forward.                                                                                                       |
| Concurrent edits     | TODO mutations use a version exposed as an ETag. One matching writer succeeds; stale writers receive `412`. The brief requires concurrent use but does not specify conflict resolution.                                                                                                                         |
| Pagination           | Lists use keyset pagination with 50 items by default, 100 maximum, and a stable TODO ID tie-breaker. The brief requires acceptable behavior at 10,000 or more items but does not prescribe pagination.                                                                                                          |

## 2. Key architectural decisions and trade-offs

**Modular monolith.** The application uses TypeScript, Express, explicit domain and service modules, PostgreSQL repositories, React, and an OpenAPI-generated shared contract. This is smaller to understand, test, and deploy than microservices. Separate API, relay, and migration entry points retain clear extraction boundaries if the workloads need to scale independently later.

**State ownership.** PostgreSQL is the source of truth for users, workspaces, TODOs, dependency graphs, recurrence anchors, audit metadata, and outbox events. Redis stores only expiring sessions, rate limits, and ephemeral Pub/Sub fan-out. Sharing session and event state keeps the API stateless and allows horizontal scaling without sticky sessions.

**Concurrent editing.** Each TODO carries an integer version exposed as an ETag, and mutations require `If-Match`. Optimistic concurrency avoids distributed edit locks and lets users edit independently. One matching request succeeds; a stale writer receives `412`, and the UI preserves the draft for comparison. SSE improves freshness but does not choose which edit wins.

**Real-time synchronization.** A TODO mutation and its outbox notification are written in the same PostgreSQL transaction. The relay claims committed rows with `FOR UPDATE SKIP LOCKED`, publishes them to Redis, and acknowledges publication. API replicas forward relevant events to their connected SSE clients. This costs more code than direct in-process notification, but it avoids losing a saved event during a process crash and supports multiple API replicas. Delivery is at least once, so clients compare versions and refetch canonical REST state.

**Pagination and indexing.** Lists use keyset cursors, workspace-leading partial indexes, static allow-listed sort queries, and a deterministic UUID tie-breaker. Keyset pagination cannot jump to an arbitrary page, but it avoids increasingly expensive offsets and unstable pages during concurrent inserts. Indexes are not created for every filter and sort combination; measured query plans guide targeted additions.

**Security.** Passwords use Argon2id. Opaque sessions are stored in Redis by SHA-256 digest with idle and absolute expiry. State-changing requests require a synchronizer CSRF token and a trusted origin. Local HTTP uses a non-Secure development cookie; a TLS deployment enables the Secure `__Host-` cookie.

**Delivery scope.** Docker Compose runs the web, API, relay, migration, PostgreSQL, and Redis services for v1. The documented production target maps the web, API, and relay to separate Kubernetes Deployments, runs migration as a one-shot Job, uses managed PostgreSQL and Redis, and begins with one replica per workload. Kubernetes manifests are not implemented.

## 3. Performance evidence

The performance document records a local development baseline, not a production latency promise.

| Check          | Recorded result                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Dataset        | 10,000 TODOs in one workspace on the Compose PostgreSQL 18.6 container, measured on 2026-08-31.                  |
| Due-date query | Returned 50 rows using `idx_todos_active_workspace_due`; planning took `0.252 ms` and execution took `0.042 ms`. |
| API pagination | A request for five items returned exactly five, `hasMore=true`, and a next keyset cursor.                        |

Production-shaped data distributions and combined filters should be measured before adding more composite indexes.

## 4. What I chose not to build

- **Product scope:** Bulk operations, multiple lists per workspace, workspace invitations by email, owner transfer, and a user-facing restore UI. These require additional product decisions and are outside the shared-list v1.
- **Authentication extensions:** Email verification, password reset, MFA, and social login. Basic email and password sessions are sufficient for the core authorization flow.
- **Field-level collaboration:** Collaborative typing, bidirectional WebSockets, and CRDTs. SSE provides record-level refresh after a save; simultaneous field editing is not required.
- **Deployment automation:** Kubernetes manifests, local-cluster automation, and managed-service provisioning. Docker Compose is the implemented delivery environment, while the production mapping is documented.
- **Speculative optimization:** Exhaustive performance-specific indexes. The measured baseline does not justify indexes for every filter and sort combination.
- **Undefined recurrence behavior:** Copying dependencies to new occurrences or generating a backlog of missed slots. Dependencies remain occurrence-specific, and late completion creates only the next future occurrence.

## 5. What I would do with more time

| Area                 | Follow-up recorded in the source documents                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser testing      | Add browser-level multi-user Playwright coverage.                                                                                                                                                   |
| Product workflows    | Add automatic email workflows, owner transfer, and an administrative restore screen.                                                                                                                |
| Observability        | Add OpenTelemetry exporters and dashboards, outbox-lag alerts, and a dead-letter policy for repeatedly failing publications.                                                                        |
| Performance          | Run load tests with production-shaped data distributions and use the results to drive index and capacity decisions.                                                                                 |
| Production hardening | Add automated backups, connection-pool sizing against database limits, network policies, a PodDisruptionBudget, and topology spreading. Add an HPA only after measuring CPU and request saturation. |
| Live collaboration   | Consider WebSockets and CRDTs only if field-level simultaneous editing becomes a requirement.                                                                                                       |
