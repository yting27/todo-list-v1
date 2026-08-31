# Architecture and production target

## Runtime ownership

- **Web** serves immutable React assets and reverse-proxies same-origin REST/SSE traffic. It stores no application state.
- **API** authenticates sessions, authorizes workspace access, executes domain transactions, serves metrics/health endpoints, subscribes to Redis, and owns only the in-memory set of SSE connections attached to that process.
- **Relay** claims committed PostgreSQL outbox rows with `FOR UPDATE SKIP LOCKED`, publishes them to a workspace Redis channel, and acknowledges publication. Re-publication is safe.
- **Migrate** takes a PostgreSQL advisory lock and applies each ordered SQL file once in a transaction before API/relay startup.
- **PostgreSQL** owns durable users, workspaces, TODOs, dependency graphs, recurrence anchors, audit metadata, and outbox events.
- **Redis** owns expiring session records/rate limits and ephemeral cross-replica Pub/Sub.

## Kubernetes mapping (documented, not implemented)

Deploy web, API, and relay as separate Deployments and ClusterIP Services behind a TLS Ingress. Run the migration image as a one-shot Job before the API rollout. Begin with one replica per workload, resource requests/limits, readiness/liveness probes, and a 20-second termination grace period.

Use managed PostgreSQL and Redis outside the cluster workloads. Put connection credentials in Secrets and non-secret settings in ConfigMaps. The API is stateless and session/event state is shared, so API replicas can later scale horizontally without sticky sessions. Every replica subscribes to Redis and forwards events only to its locally attached browsers.

Add an HPA only after measuring CPU/request saturation. Production hardening should also add a PodDisruptionBudget, topology spreading, connection-pool sizing against the database limit, TLS-only `COOKIE_SECURE=true`, network policies, automated backups, outbox-lag alerts, and a dead-letter policy for repeatedly failing publications.

## Observability

The API emits JSON logs with request IDs and traceparent correlation, exposes `/metrics`, `/health/live`, and dependency-aware `/health/ready`, and separates service names for API and relay. OpenTelemetry's propagation format is preserved; exporters can be attached without changing domain code.
