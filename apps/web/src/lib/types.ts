import type { components } from "@todo/contracts/generated";

export type User = components["schemas"]["User"];
export type AuthResponse = components["schemas"]["AuthResponse"];
export type Workspace = components["schemas"]["Workspace"];
export type WorkspaceMember = components["schemas"]["WorkspaceMember"];
export type Todo = components["schemas"]["Todo"];
export type TodoList = components["schemas"]["TodoList"];
export type TodoStatus = components["schemas"]["TodoStatus"];
export type TodoPriority = components["schemas"]["TodoPriority"];
export type TodoInput = components["schemas"]["CreateTodoInput"];
export type TodoUpdate = components["schemas"]["UpdateTodoInput"];
export type TodoMutationResponse =
  components["schemas"]["TodoMutationResponse"];
export type Problem = components["schemas"]["Problem"];
export type AffectedTodo = components["schemas"]["AffectedTodo"];
