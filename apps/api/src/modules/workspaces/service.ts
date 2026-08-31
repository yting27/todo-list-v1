import { v7 as uuidv7 } from "uuid";

import { conflict, forbidden, notFound } from "../../domain/errors.js";
import { assertTimezone } from "../../domain/recurrence.js";
import type { DbPool, Queryable } from "../../platform/db.js";

export type WorkspaceRole = "owner" | "editor" | "viewer";

interface WorkspaceRow {
  id: string;
  name: string;
  timezone: string;
  role: WorkspaceRole;
  created_at: Date;
  updated_at: Date;
}

export function mapWorkspace(row: WorkspaceRow) {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    role: row.role,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class WorkspaceService {
  constructor(private readonly pool: DbPool) {}

  async list(userId: string) {
    const result = await this.pool.query<WorkspaceRow>(
      `SELECT w.id, w.name, w.timezone, wm.role, w.created_at, w.updated_at
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       ORDER BY lower(w.name), w.id`,
      [userId],
    );
    return result.rows.map(mapWorkspace);
  }

  async create(userId: string, input: { name: string; timezone: string }) {
    assertTimezone(input.timezone);
    const id = uuidv7();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<WorkspaceRow>(
        `INSERT INTO workspaces (id, name, timezone)
         VALUES ($1, $2, $3)
         RETURNING id, name, timezone, 'owner'::text AS role, created_at, updated_at`,
        [id, input.name.trim(), input.timezone],
      );
      await client.query(
        "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
        [id, userId],
      );
      await client.query("COMMIT");
      return mapWorkspace(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async update(
    userId: string,
    workspaceId: string,
    input: { name: string; timezone: string },
  ) {
    await this.requireRole(userId, workspaceId, ["owner"]);
    assertTimezone(input.timezone);
    const result = await this.pool.query<WorkspaceRow>(
      `UPDATE workspaces SET name = $2, timezone = $3, updated_at = clock_timestamp()
       WHERE id = $1
       RETURNING id, name, timezone, 'owner'::text AS role, created_at, updated_at`,
      [workspaceId, input.name.trim(), input.timezone],
    );
    if (!result.rows[0]) throw notFound("Workspace not found.");
    return mapWorkspace(result.rows[0]);
  }

  async role(
    userId: string,
    workspaceId: string,
    queryable: Queryable = this.pool,
  ): Promise<WorkspaceRole | null> {
    const result = await queryable.query<{ role: WorkspaceRole }>(
      "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
      [workspaceId, userId],
    );
    return result.rows[0]?.role ?? null;
  }

  async requireRole(
    userId: string,
    workspaceId: string,
    roles: readonly WorkspaceRole[],
    queryable: Queryable = this.pool,
  ): Promise<WorkspaceRole> {
    const role = await this.role(userId, workspaceId, queryable);
    if (!role) throw notFound("Workspace not found.");
    if (!roles.includes(role)) throw forbidden();
    return role;
  }

  async listMembers(userId: string, workspaceId: string) {
    await this.requireRole(userId, workspaceId, ["owner", "editor", "viewer"]);
    const result = await this.pool.query<{
      user_id: string;
      email: string;
      display_name: string;
      role: WorkspaceRole;
      created_at: Date;
    }>(
      `SELECT u.id AS user_id, u.email, u.display_name, wm.role, wm.created_at
       FROM workspace_members wm JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1 ORDER BY wm.created_at, u.id`,
      [workspaceId],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      joinedAt: row.created_at.toISOString(),
    }));
  }

  async addMember(
    userId: string,
    workspaceId: string,
    email: string,
    role: "editor" | "viewer",
  ) {
    await this.requireRole(userId, workspaceId, ["owner"]);
    const result = await this.pool.query<{
      user_id: string;
      email: string;
      display_name: string;
      role: WorkspaceRole;
      created_at: Date;
    }>(
      `WITH inserted AS (
         INSERT INTO workspace_members (workspace_id, user_id, role)
         SELECT $1, u.id, $3 FROM users u WHERE u.email = $2 AND u.disabled_at IS NULL
         ON CONFLICT DO NOTHING
         RETURNING user_id, role, created_at
       )
       SELECT i.user_id, u.email, u.display_name, i.role, i.created_at
       FROM inserted i JOIN users u ON u.id = i.user_id`,
      [workspaceId, email.trim().toLowerCase(), role],
    );
    const row = result.rows[0];
    if (!row) {
      const exists = await this.pool.query(
        "SELECT 1 FROM users WHERE email = $1",
        [email.trim().toLowerCase()],
      );
      if (exists.rowCount === 0)
        throw notFound("No registered user has that email address.");
      throw conflict(
        "member_exists",
        "That user is already a member of this workspace.",
      );
    }
    return {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      joinedAt: row.created_at.toISOString(),
    };
  }

  async updateMember(
    userId: string,
    workspaceId: string,
    memberId: string,
    role: "editor" | "viewer",
  ) {
    await this.requireRole(userId, workspaceId, ["owner"]);
    const existing = await this.pool.query<{ role: WorkspaceRole }>(
      "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
      [workspaceId, memberId],
    );
    if (existing.rows[0]?.role === "owner")
      throw conflict(
        "owner_change_forbidden",
        "The workspace owner role cannot be changed.",
      );
    const updated = await this.pool.query<{
      user_id: string;
      email: string;
      display_name: string;
      role: WorkspaceRole;
      created_at: Date;
    }>(
      `UPDATE workspace_members wm SET role = $3
       FROM users u WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND u.id = wm.user_id
       RETURNING wm.user_id, u.email, u.display_name, wm.role, wm.created_at`,
      [workspaceId, memberId, role],
    );
    const row = updated.rows[0];
    if (!row) throw notFound("Workspace member not found.");
    return {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      joinedAt: row.created_at.toISOString(),
    };
  }

  async removeMember(userId: string, workspaceId: string, memberId: string) {
    await this.requireRole(userId, workspaceId, ["owner"]);
    const result = await this.pool.query<{ role: WorkspaceRole }>(
      "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND role <> 'owner' RETURNING role",
      [workspaceId, memberId],
    );
    if (!result.rows[0])
      throw conflict(
        "member_remove_forbidden",
        "The owner cannot be removed, or the member does not exist.",
      );
  }
}
