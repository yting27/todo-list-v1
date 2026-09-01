import type {
  AuthResponse,
  Problem,
  Todo,
  TodoInput,
  TodoList,
  TodoMutationResponse,
  TodoUpdate,
  Workspace,
  WorkspaceMember,
} from "./types";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
let csrfToken: string | undefined;

export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem;

  constructor(status: number, problem: Problem) {
    super(problem.detail);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

function rememberCsrf(body: unknown) {
  if (
    body &&
    typeof body === "object" &&
    "csrfToken" in body &&
    typeof body.csrfToken === "string"
  ) {
    csrfToken = body.csrfToken;
  }
}

/**
 * Core fetch wrapper for the `/api/v1` endpoints: sets JSON/CSRF headers,
 * sends session cookies, and throws `ApiError` (RFC 9457 problem details)
 * on non-2xx responses.
 *
 * @param T Type of the JSON response body to decode.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (
    options.method &&
    !["GET", "HEAD"].includes(options.method) &&
    csrfToken
  ) {
    headers.set("X-CSRF-Token", csrfToken);
  }
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    const fallback: Problem = {
      type: "about:blank",
      title: "Request failed",
      status: response.status,
      detail: response.statusText || "The request could not be completed.",
    };
    const problem = (await response.json().catch(() => fallback)) as Problem;
    throw new ApiError(response.status, problem);
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as T;
  rememberCsrf(body);
  return body;
}

export const api = {
  /** Returns the current authenticated user. */
  me: () => request<AuthResponse>("/auth/me"),
  /** Logs in and starts an authenticated session. */
  login: (input: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Registers a new account and workspace. */
  register: (input: {
    email: string;
    password: string;
    displayName: string;
    workspaceName: string;
    timezone: string;
  }) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Logs out and clears the stored CSRF token. */
  logout: async () => {
    await request<void>("/auth/logout", { method: "POST" });
    csrfToken = undefined;
  },
  /** Lists workspaces the user belongs to. */
  listWorkspaces: () => request<{ items: Workspace[] }>("/workspaces"),
  /** Creates a new workspace. */
  createWorkspace: (input: { name: string; timezone: string }) =>
    request<Workspace>("/workspaces", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Lists members of a workspace. */
  listMembers: (workspaceId: string) =>
    request<{ items: WorkspaceMember[] }>(`/workspaces/${workspaceId}/members`),
  /** Adds a member to a workspace. */
  addMember: (
    workspaceId: string,
    input: { email: string; role: "editor" | "viewer" },
  ) =>
    request<WorkspaceMember>(`/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Lists todos in a workspace using the given filters. */
  listTodos: (workspaceId: string, query: URLSearchParams) =>
    request<TodoList>(`/workspaces/${workspaceId}/todos?${query.toString()}`),
  /** Fetches a single todo. */
  getTodo: (workspaceId: string, todoId: string) =>
    request<Todo>(`/workspaces/${workspaceId}/todos/${todoId}`),
  /** Creates a new todo. */
  createTodo: (workspaceId: string, input: TodoInput) =>
    request<Todo>(`/workspaces/${workspaceId}/todos`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Updates a todo using optimistic concurrency via If-Match. */
  updateTodo: (
    workspaceId: string,
    todoId: string,
    version: number,
    input: TodoUpdate,
  ) =>
    request<TodoMutationResponse>(
      `/workspaces/${workspaceId}/todos/${todoId}`,
      {
        method: "PATCH",
        headers: { "If-Match": `"${version}"` },
        body: JSON.stringify(input),
      },
    ),
  /** Deletes a todo using optimistic concurrency via If-Match. */
  deleteTodo: (workspaceId: string, todoId: string, version: number) =>
    request<void>(`/workspaces/${workspaceId}/todos/${todoId}`, {
      method: "DELETE",
      headers: { "If-Match": `"${version}"` },
    }),
  /** Adds a dependency on another todo. */
  addDependency: (
    workspaceId: string,
    todoId: string,
    version: number,
    dependsOnId: string,
  ) =>
    request<Todo>(`/workspaces/${workspaceId}/todos/${todoId}/dependencies`, {
      method: "POST",
      headers: { "If-Match": `"${version}"` },
      body: JSON.stringify({ dependsOnId }),
    }),
  /** Removes a dependency from a todo. */
  removeDependency: (
    workspaceId: string,
    todoId: string,
    version: number,
    dependsOnId: string,
  ) =>
    request<Todo>(
      `/workspaces/${workspaceId}/todos/${todoId}/dependencies/${dependsOnId}`,
      {
        method: "DELETE",
        headers: { "If-Match": `"${version}"` },
      },
    ),
};

export function eventStreamUrl(workspaceId: string) {
  return `${baseUrl}/api/v1/workspaces/${workspaceId}/events`;
}
