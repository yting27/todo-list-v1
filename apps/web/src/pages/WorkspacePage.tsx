import { useQuery } from "@tanstack/react-query";
import { CheckSquare2, ChevronLeft, ChevronRight, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AppLayout } from "@/components/AppLayout";
import { BoardView } from "@/components/BoardView";
import { CreateTodoDialog } from "@/components/CreateTodoDialog";
import { TodoDetails } from "@/components/TodoDetails";
import { TodoFilters } from "@/components/TodoFilters";
import {
  CreateWorkspaceDialog,
  MembersDialog,
} from "@/components/WorkspaceDialogs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceEvents } from "@/hooks/useWorkspaceEvents";
import { api } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import type { AuthResponse } from "@/lib/types";

const listParameters = new Set([
  "status",
  "priority",
  "dueFrom",
  "dueTo",
  "dependencyState",
  "search",
  "sort",
  "direction",
  "limit",
  "cursor",
]);

/**
 * Main workspace view: shows the TODO board for the active workspace.
 * `session` carries the authenticated user and their accessible workspaces.
 */
export function WorkspacePage({ session }: { session: AuthResponse }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [deleteRequestedId, setDeleteRequestedId] = useState<string | null>(
    null,
  );
  // Restore the last-used workspace, falling back to the first accessible one.
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
  // Build the TODO list query from the subset of URL params we support as filters.
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
    // Persist the active workspace and clear any open TODO on switch.
    if (workspace?.id)
      window.localStorage.setItem("active-workspace", workspace.id);
    setSelectedTodoId(null);
  }, [workspace?.id]);

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
  // Switch workspaces and reset any list filters/pagination.
  function selectWorkspace(value: string) {
    setWorkspaceId(value);
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  return (
    <AppLayout
      session={session}
      workspace={workspace}
      onSelectWorkspace={selectWorkspace}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <TodoFilters timezone={workspace.timezone} />
          <p className="hidden text-sm text-muted-foreground md:block">
            {workspace.role} access · Deadlines in {workspace.timezone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateWorkspaceDialog compact />
          <MembersDialog workspace={workspace} />
          <CreateTodoDialog
            workspaceId={workspace.id}
            timezone={workspace.timezone}
            items={todos.data?.items ?? []}
            disabled={!canEdit}
          />
        </div>
      </div>

      {todos.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            {describeApiError(todos.error, "Please try again.")}
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
        <BoardView
          items={todos.data.items}
          timezone={workspace.timezone}
          onOpen={(id) => {
            setDeleteRequestedId(null);
            setSelectedTodoId(id);
          }}
          onDelete={(id) => {
            setDeleteRequestedId(id);
            setSelectedTodoId(id);
          }}
        />
      ) : null}

      {todos.data && (searchParams.has("cursor") || todos.data.hasMore) ? (
        <nav
          aria-label="TODO pages"
          className="mt-6 flex items-center justify-end gap-2"
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
    </AppLayout>
  );
}
