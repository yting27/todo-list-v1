CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    disabled_at TIMESTAMPTZ,
    CONSTRAINT users_email_normalized CHECK (email = lower(trim(email)))
);

CREATE UNIQUE INDEX idx_users_email_unique ON users (email);

CREATE TABLE workspaces (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user ON workspace_members (user_id, workspace_id);

CREATE TABLE recurrence_series (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    interval_count INTEGER NOT NULL CHECK (interval_count BETWEEN 1 AND 365),
    interval_unit TEXT NOT NULL CHECK (interval_unit IN ('day', 'week', 'month')),
    anchor_local TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    anchor_day SMALLINT NOT NULL CHECK (anchor_day BETWEEN 1 AND 31),
    stopped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE todos (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 10000),
    due_at TIMESTAMPTZ NOT NULL,
    status SMALLINT NOT NULL DEFAULT 0 CHECK (status BETWEEN 0 AND 3),
    priority SMALLINT NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 2),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    recurrence_series_id UUID REFERENCES recurrence_series(id),
    recurrence_sequence INTEGER CHECK (recurrence_sequence IS NULL OR recurrence_sequence >= 0),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_by UUID NOT NULL REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_by UUID NOT NULL REFERENCES users(id),
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id),
    CONSTRAINT todos_completion_consistency CHECK (
        (status = 2 AND completed_at IS NOT NULL) OR (status <> 2 AND completed_at IS NULL)
    )
);

CREATE UNIQUE INDEX idx_todos_recurrence_slot
    ON todos (recurrence_series_id, recurrence_sequence)
    WHERE recurrence_series_id IS NOT NULL;

CREATE INDEX idx_todos_active_workspace_due
    ON todos (workspace_id, due_at, id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_todos_active_workspace_priority
    ON todos (workspace_id, priority, id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_todos_active_workspace_status
    ON todos (workspace_id, status, id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_todos_active_workspace_name
    ON todos (workspace_id, lower(name), name, id)
    WHERE deleted_at IS NULL;

CREATE TABLE todo_dependencies (
    todo_id UUID NOT NULL REFERENCES todos(id),
    depends_on_id UUID NOT NULL REFERENCES todos(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_by UUID NOT NULL REFERENCES users(id),
    CONSTRAINT todo_dependencies_not_self CHECK (todo_id <> depends_on_id),
    PRIMARY KEY (todo_id, depends_on_id)
);

CREATE INDEX idx_todo_dependencies_reverse
    ON todo_dependencies (depends_on_id, todo_id);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    event_type TEXT NOT NULL CHECK (event_type IN ('todo.created', 'todo.updated', 'todo.deleted')),
    aggregate_id UUID NOT NULL,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    aggregate_version INTEGER NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    claimed_at TIMESTAMPTZ,
    claimed_by TEXT,
    published_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_outbox_unpublished
    ON outbox_events (created_at, id)
    WHERE published_at IS NULL;
