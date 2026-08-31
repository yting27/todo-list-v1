import { v7 as uuidv7 } from "uuid";

import { conflict, ProblemError } from "../domain/errors.js";
import { assertTimezone } from "../domain/recurrence.js";
import type { DbPool } from "../platform/db.js";
import { inTransaction } from "../platform/db.js";
import type { WorkspaceService } from "../modules/workspaces/service.js";
import {
  consumeUnknownPassword,
  hashPassword,
  verifyPassword,
} from "./password.js";
import type { SessionStore } from "./session-store.js";

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
}

function mapUser(row: UserRow) {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  workspaceName: string;
  timezone: string;
}

export class AuthService {
  constructor(
    private readonly pool: DbPool,
    private readonly sessions: SessionStore,
    private readonly workspaces: WorkspaceService,
  ) {}

  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    assertTimezone(input.timezone);
    const passwordHash = await hashPassword(input.password);
    const userId = uuidv7();
    const workspaceId = uuidv7();
    let user: ReturnType<typeof mapUser>;
    try {
      user = await inTransaction(this.pool, async (client) => {
        const inserted = await client.query<UserRow>(
          `INSERT INTO users (id, email, display_name, password_hash)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, display_name, password_hash`,
          [userId, email, input.displayName.trim(), passwordHash],
        );
        await client.query(
          "INSERT INTO workspaces (id, name, timezone) VALUES ($1, $2, $3)",
          [workspaceId, input.workspaceName.trim(), input.timezone],
        );
        await client.query(
          "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
          [workspaceId, userId],
        );
        return mapUser(inserted.rows[0]!);
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "23505") {
        throw conflict(
          "registration_conflict",
          "An account could not be created with those details.",
        );
      }
      throw error;
    }
    return this.issueResponse(user);
  }

  async login(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();
    const result = await this.pool.query<UserRow>(
      "SELECT id, email, display_name, password_hash FROM users WHERE email = $1 AND disabled_at IS NULL",
      [email],
    );
    const row = result.rows[0];
    if (!row) {
      await consumeUnknownPassword(password);
      throw invalidCredentials();
    }
    if (!(await verifyPassword(row.password_hash, password)))
      throw invalidCredentials();
    return this.issueResponse(mapUser(row));
  }

  async current(userId: string, csrfToken: string) {
    const result = await this.pool.query<UserRow>(
      "SELECT id, email, display_name, password_hash FROM users WHERE id = $1 AND disabled_at IS NULL",
      [userId],
    );
    const user = result.rows[0];
    if (!user) throw invalidCredentials();
    return {
      user: mapUser(user),
      csrfToken,
      workspaces: await this.workspaces.list(userId),
    };
  }

  private async issueResponse(user: ReturnType<typeof mapUser>) {
    const session = await this.sessions.create(user.id);
    return {
      token: session.token,
      body: {
        user,
        csrfToken: session.csrfToken,
        workspaces: await this.workspaces.list(user.id),
      },
    };
  }
}

function invalidCredentials() {
  return new ProblemError({
    status: 401,
    code: "invalid_credentials",
    title: "Authentication failed",
    detail: "The email or password is incorrect.",
  });
}
