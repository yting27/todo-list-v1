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
  me: () => request<AuthResponse>("/auth/me"),
  login: (input: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
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
  logout: async () => {
    await request<void>("/auth/logout", { method: "POST" });
    csrfToken = undefined;
  },
  listWorkspaces: () => request<{ items: Workspace[] }>("/workspaces"),
  createWorkspace: (input: { name: string; timezone: string }) =>
    request<Workspace>("/workspaces", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listMembers: (workspaceId: string) =>
    request<{ items: WorkspaceMember[] }>(`/workspaces/${workspaceId}/members`),
  addMember: (
    workspaceId: string,
    input: { email: string; role: "editor" | "viewer" },
  ) =>
    request<WorkspaceMember>(`/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listTodos: (workspaceId: string, query: URLSearchParams) =>
    request<TodoList>(`/workspaces/${workspaceId}/todos?${query.toString()}`),
  getTodo: (workspaceId: string, todoId: string) =>
    request<Todo>(`/workspaces/${workspaceId}/todos/${todoId}`),
  createTodo: (workspaceId: string, input: TodoInput) =>
    request<Todo>(`/workspaces/${workspaceId}/todos`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
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
  deleteTodo: (workspaceId: string, todoId: string, version: number) =>
    request<void>(`/workspaces/${workspaceId}/todos/${todoId}`, {
      method: "DELETE",
      headers: { "If-Match": `"${version}"` },
    }),
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
