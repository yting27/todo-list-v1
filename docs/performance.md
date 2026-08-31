# Performance baseline

Measured locally on 2026-08-31 against the Compose PostgreSQL 18.6 container after the repeat-safe seed inserted 10,000 TODOs into one workspace.

The due-date list shape was analyzed after `ANALYZE todos`:

```text
Limit  (actual time=0.010..0.031 rows=50 loops=1)
  -> Index Scan using idx_todos_active_workspace_due on todos
       (actual time=0.009..0.028 rows=50 loops=1)
       Index Cond: workspace_id = <seed workspace>
Planning Time: 0.252 ms
Execution Time: 0.042 ms
```

The same-origin API smoke test requested five items and returned exactly five with `hasMore=true` and a next keyset cursor. This is a development-machine baseline, not a production latency promise. Data distributions and combined filters should be measured under production-shaped load before adding more composite indexes.
