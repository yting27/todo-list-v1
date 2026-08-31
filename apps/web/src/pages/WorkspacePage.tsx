import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  LogOut,
  MoreVertical,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { CreateTodoDialog } from "@/components/CreateTodoDialog";
import { TodoCard } from "@/components/TodoCard";
import { TodoDetails } from "@/components/TodoDetails";
import { TodoFilters } from "@/components/TodoFilters";
import {
  CreateWorkspaceDialog,
  MembersDialog,
} from "@/components/WorkspaceDialogs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceEvents } from "@/hooks/useWorkspaceEvents";
import { api } from "@/lib/api";
import type { AuthResponse } from "@/lib/types";

const listParameters = new Set([
  "status",
  "priority",
  "dueFrom",
  "dueTo",
  "dependencyState",
  "sort",
  "direction",
  "limit",
  "cursor",
]);

export function WorkspacePage({ session }: { session: AuthResponse }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [deleteRequestedId, setDeleteRequestedId] = useState<string | null>(
    null,
  );
  const storedWorkspace = window.localStorage.getItem("active-workspace");
  const initialWorkspace = session.workspaces.some(
    (workspace) => workspace.id === storedWorkspace,
  )
    ? storedWorkspace!
    : session.workspaces[0]?.id;
  const [workspaceId, setWorkspaceId] = useState(initialWorkspace);
  const workspace =
    session.workspaces.find((item) => item.id === workspaceId) ??
    session.workspaces[0];
  const apiQuery = useMemo(() => {
    const query = new URLSearchParams();
    for (const [key, value] of searchParams)
      if (listParameters.has(key)) query.set(key, value);
    return query;
  }, [searchParams]);
  const todos = useQuery({
    queryKey: ["todos", workspace?.id, apiQuery.toString()],
    queryFn: () => api.listTodos(workspace!.id, apiQuery),
    enabled: Boolean(workspace),
    placeholderData: (previous) => previous,
  });
  useWorkspaceEvents(workspace?.id);
  useEffect(() => {
    if (workspace?.id)
      window.localStorage.setItem("active-workspace", workspace.id);
    setSelectedTodoId(null);
  }, [workspace?.id]);
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/login");
    },
    onError: (error) => toast.error(error.message),
  });

  if (!workspace) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="max-w-sm space-y-4 text-center">
          <CheckSquare2 className="mx-auto size-10" />
          <h1 className="text-2xl font-semibold">
            Create your first workspace
          </h1>
          <p className="text-muted-foreground">
            A workspace is a shared TODO list.
          </p>
          <CreateWorkspaceDialog />
        </div>
      </main>
    );
  }
  const canEdit = workspace.role !== "viewer";
  function selectWorkspace(value: string) {
    setWorkspaceId(value);
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <div className="mr-2 flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <CheckSquare2 className="size-4" />
            </span>
            <span className="hidden sm:inline">SleekFlow TODO</span>
          </div>
          <Select value={workspace.id} onValueChange={selectWorkspace}>
            <SelectTrigger className="w-[190px] sm:w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {session.workspaces.map((item) => (
                <SelectItem value={item.id} key={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <CreateWorkspaceDialog compact />
            <MembersDialog workspace={workspace} />
            <CreateTodoDialog
              workspaceId={workspace.id}
              timezone={workspace.timezone}
              items={todos.data?.items ?? []}
              disabled={!canEdit}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Account menu">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <span className="block">{session.user.displayName}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {session.user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/api/docs" target="_blank" rel="noreferrer">
                    API documentation
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={logout.isPending}
                  onSelect={() => logout.mutate()}
                >
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              {workspace.role} access
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {workspace.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Deadlines shown in {workspace.timezone}
            </p>
          </div>
          <TodoFilters timezone={workspace.timezone} />
        </div>

        {todos.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton className="h-64 rounded-xl" key={index} />
            ))}
          </div>
        ) : null}
        {todos.error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <WifiOff className="mx-auto mb-3 size-7 text-destructive" />
            <p className="font-medium">Could not load TODOs</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {todos.error.message}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => void todos.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : null}
        {todos.data && todos.data.items.length === 0 ? (
          <div className="grid min-h-72 place-items-center rounded-xl border border-dashed">
            <div className="max-w-sm text-center">
              <CheckSquare2 className="mx-auto mb-3 size-9 text-muted-foreground" />
              <h2 className="font-semibold">No TODOs match</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Clear the filters or create the first task in this workspace.
              </p>
            </div>
          </div>
        ) : null}
        {todos.data?.items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {todos.data.items.map((todo) => (
              <TodoCard
                key={todo.id}
                todo={todo}
                timezone={workspace.timezone}
                onOpen={() => {
                  setDeleteRequestedId(null);
                  setSelectedTodoId(todo.id);
                }}
                onDelete={() => {
                  setDeleteRequestedId(todo.id);
                  setSelectedTodoId(todo.id);
                }}
              />
            ))}
          </div>
        ) : null}

        {todos.data && (searchParams.has("cursor") || todos.data.hasMore) ? (
          <nav
            aria-label="TODO pages"
            className="mt-7 flex items-center justify-end gap-2"
          >
            <Button
              variant="outline"
              disabled={!searchParams.has("cursor")}
              onClick={() => window.history.back()}
            >
              <ChevronLeft /> Previous
            </Button>
            <Button
              variant="outline"
              disabled={!todos.data.nextCursor}
              onClick={() =>
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  if (todos.data?.nextCursor)
                    next.set("cursor", todos.data.nextCursor);
                  return next;
                })
              }
            >
              Next <ChevronRight />
            </Button>
          </nav>
        ) : null}
      </main>

      <TodoDetails
        workspaceId={workspace.id}
        todoId={selectedTodoId}
        timezone={workspace.timezone}
        listItems={todos.data?.items ?? []}
        canEdit={canEdit}
        deleteRequested={selectedTodoId === deleteRequestedId}
        onClose={() => {
          setSelectedTodoId(null);
          setDeleteRequestedId(null);
        }}
      />
    </div>
  );
}
