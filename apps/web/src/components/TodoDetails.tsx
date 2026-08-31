import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Link2, Trash2, Unlink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import type { AffectedTodo, Todo, TodoUpdate } from "@/lib/types";
import { TodoForm } from "./TodoForm";

export function TodoDetails({
  workspaceId,
  todoId,
  timezone,
  listItems,
  canEdit,
  deleteRequested,
  onClose,
}: {
  workspaceId: string;
  todoId: string | null;
  timezone: string;
  listItems: Todo[];
  canEdit: boolean;
  deleteRequested?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [staleDraft, setStaleDraft] = useState<TodoUpdate | null>(null);
  const [latest, setLatest] = useState<Todo | null>(null);
  const [reopen, setReopen] = useState<{
    draft: TodoUpdate;
    affected: AffectedTodo[];
  } | null>(null);
  const [dependencyId, setDependencyId] = useState("");
  const detail = useQuery({
    queryKey: ["todo", workspaceId, todoId],
    queryFn: () => api.getTodo(workspaceId, todoId!),
    enabled: Boolean(todoId),
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["todo", workspaceId, todoId],
      }),
      queryClient.invalidateQueries({ queryKey: ["todos", workspaceId] }),
    ]);
  };
  const update = useMutation({
    mutationFn: ({ todo, draft }: { todo: Todo; draft: TodoUpdate }) =>
      api.updateTodo(workspaceId, todo.id, todo.version, draft),
    onSuccess: async (result) => {
      queryClient.setQueryData(
        ["todo", workspaceId, result.todo.id],
        result.todo,
      );
      await invalidate();
      toast.success(
        result.generatedOccurrenceId
          ? "TODO completed and the next occurrence was created."
          : "TODO updated.",
      );
    },
    onError: async (error, variables) => {
      if (error instanceof ApiError && error.status === 412) {
        setStaleDraft(variables.draft);
        setLatest(await api.getTodo(workspaceId, variables.todo.id));
      } else if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.problem.code === "reopen_requires_confirmation"
      ) {
        setReopen({
          draft: variables.draft,
          affected: error.problem.affectedTodos ?? [],
        });
      } else
        toast.error(error instanceof Error ? error.message : "Update failed.");
    },
  });
  const remove = useMutation({
    mutationFn: (todo: Todo) =>
      api.deleteTodo(workspaceId, todo.id, todo.version),
    onSuccess: async () => {
      await invalidate();
      setDeleteOpen(false);
      onClose();
      toast.success("TODO deleted. Its history is retained.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Delete failed."),
  });
  const addDependency = useMutation({
    mutationFn: ({ todo, dependsOnId }: { todo: Todo; dependsOnId: string }) =>
      api.addDependency(workspaceId, todo.id, todo.version, dependsOnId),
    onSuccess: async () => {
      setDependencyId("");
      await invalidate();
      toast.success("Prerequisite added.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not add prerequisite.",
      ),
  });
  const removeDependency = useMutation({
    mutationFn: ({ todo, dependsOnId }: { todo: Todo; dependsOnId: string }) =>
      api.removeDependency(workspaceId, todo.id, todo.version, dependsOnId),
    onSuccess: async () => {
      await invalidate();
      toast.success("Prerequisite removed.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not remove prerequisite.",
      ),
  });
  useEffect(() => {
    if (!todoId) {
      setDeleteOpen(false);
      setStaleDraft(null);
      setLatest(null);
      setReopen(null);
    }
  }, [todoId]);
  useEffect(() => {
    if (todoId && deleteRequested) setDeleteOpen(true);
  }, [deleteRequested, todoId]);
  const candidates = useMemo(
    () =>
      detail.data
        ? listItems.filter(
            (item) =>
              item.id !== detail.data.id &&
              !detail.data!.dependencies.some(
                (dependency) => dependency.id === item.id,
              ),
          )
        : [],
    [detail.data, listItems],
  );

  return (
    <>
      <Sheet
        open={Boolean(todoId)}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b">
            <SheetTitle>TODO details</SheetTitle>
            <SheetDescription>
              Versioned edits prevent silent overwrites from concurrent users.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 p-4">
            {detail.isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-9 w-2/3" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : null}
            {detail.error ? (
              <p role="alert" className="text-sm text-destructive">
                {detail.error.message}
              </p>
            ) : null}
            {detail.data ? (
              <>
                {canEdit ? (
                  <TodoForm
                    key={`${detail.data.id}:${detail.data.version}`}
                    initial={detail.data}
                    timezone={timezone}
                    options={listItems}
                    submitting={update.isPending}
                    submitLabel="Save changes"
                    onSubmit={(draft) =>
                      update.mutate({
                        todo: detail.data!,
                        draft: draft as TodoUpdate,
                      })
                    }
                  />
                ) : (
                  <ReadOnlyTodo todo={detail.data} timezone={timezone} />
                )}
                <section className="space-y-3 border-t pt-5">
                  <div>
                    <h3 className="font-medium">Prerequisites</h3>
                    <p className="text-xs text-muted-foreground">
                      Incomplete prerequisites block this TODO from starting.
                    </p>
                  </div>
                  {detail.data.dependencies.length ? (
                    <div className="space-y-2">
                      {detail.data.dependencies.map((dependency) => (
                        <div
                          className="flex items-center gap-2 rounded-md border p-2 text-sm"
                          key={dependency.id}
                        >
                          <Link2 className="size-4 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">
                            {dependency.name}
                          </span>
                          <Badge
                            variant={
                              dependency.completed ? "secondary" : "outline"
                            }
                          >
                            {dependency.completed
                              ? "Complete"
                              : dependency.status}
                          </Badge>
                          {canEdit ? (
                            <Button
                              aria-label={`Remove ${dependency.name} prerequisite`}
                              size="icon-sm"
                              variant="ghost"
                              disabled={removeDependency.isPending}
                              onClick={() =>
                                removeDependency.mutate({
                                  todo: detail.data!,
                                  dependsOnId: dependency.id,
                                })
                              }
                            >
                              <Unlink />
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No prerequisites.
                    </p>
                  )}
                  {canEdit && candidates.length ? (
                    <div className="flex gap-2">
                      <Select
                        value={dependencyId}
                        onValueChange={setDependencyId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a TODO" />
                        </SelectTrigger>
                        <SelectContent>
                          {candidates.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        disabled={!dependencyId || addDependency.isPending}
                        onClick={() =>
                          addDependency.mutate({
                            todo: detail.data!,
                            dependsOnId: dependencyId,
                          })
                        }
                      >
                        Add
                      </Button>
                    </div>
                  ) : null}
                </section>
                {canEdit ? (
                  <Button
                    className="w-full"
                    variant="destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 /> Delete TODO
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this TODO?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove it from the workspace. You can&apos;t undo this
              action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!detail.data || remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (detail.data) remove.mutate(detail.data);
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(reopen)}
        onOpenChange={(open) => {
          if (!open) setReopen(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset affected TODOs?</AlertDialogTitle>
            <AlertDialogDescription>
              Reopening this prerequisite will reset{" "}
              {reopen?.affected.length ?? 0} downstream TODO
              {reopen?.affected.length === 1 ? "" : "s"} to Not started:{" "}
              {reopen?.affected.map((todo) => todo.name).join(", ")}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep completed</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (reopen && detail.data) {
                  update.mutate({
                    todo: detail.data,
                    draft: { ...reopen.draft, cascadeDependents: true },
                  });
                  setReopen(null);
                }
              }}
            >
              Reset chain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(staleDraft)}
        onOpenChange={(open) => {
          if (!open) setStaleDraft(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-600" />
              This TODO changed elsewhere
            </DialogTitle>
            <DialogDescription>
              Your draft is still in the form. Review the latest saved version
              before deciding what to reapply.
            </DialogDescription>
          </DialogHeader>
          {latest ? (
            <div className="grid gap-3 rounded-lg border p-4 text-sm">
              <p>
                <strong>Latest name:</strong> {latest.name}
              </p>
              <p>
                <strong>Latest status:</strong> {latest.status}
              </p>
              <p>
                <strong>Latest priority:</strong> {latest.priority}
              </p>
              <p>
                <strong>Latest version:</strong> {latest.version}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaleDraft(null)}>
              Keep my draft open
            </Button>
            <Button
              onClick={() => {
                if (latest)
                  queryClient.setQueryData(
                    ["todo", workspaceId, latest.id],
                    latest,
                  );
                setStaleDraft(null);
              }}
            >
              Load latest
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReadOnlyTodo({ todo, timezone }: { todo: Todo; timezone: string }) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Name</Label>
        <p className="mt-1 text-lg font-medium">{todo.name}</p>
      </div>
      <div>
        <Label>Description</Label>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
          {todo.description || "No description"}
        </p>
      </div>
      <div className="flex gap-2">
        <Badge>{todo.status}</Badge>
        <Badge variant="secondary">{todo.priority}</Badge>
        {todo.blocked ? <Badge variant="outline">Blocked</Badge> : null}
      </div>
      <p className="text-sm">
        Due{" "}
        {new Intl.DateTimeFormat(undefined, {
          timeZone: timezone,
          dateStyle: "long",
          timeStyle: "short",
        }).format(new Date(todo.dueAt))}
      </p>
    </div>
  );
}
