import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import type { Todo, TodoInput } from "@/lib/types";
import { TodoForm } from "./TodoForm";

export function CreateTodoDialog({
  workspaceId,
  timezone,
  items,
  disabled,
}: {
  workspaceId: string;
  timezone: string;
  items: Todo[];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (input: TodoInput) => api.createTodo(workspaceId, input),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["todos", workspaceId] });
      toast.success("TODO created.");
    },
    onError: (error) =>
      toast.error(describeApiError(error, "Could not create TODO.")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={disabled}
          className="fixed bottom-6 right-6 size-14 rounded-full shadow-lg sm:static sm:size-auto sm:rounded-full sm:px-4"
        >
          <Plus />
          <span className="hidden sm:inline">New TODO</span>
          <span className="sr-only sm:hidden">New TODO</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create TODO</DialogTitle>
          <DialogDescription>
            Add a deadline, recurrence schedule, and prerequisites.
          </DialogDescription>
        </DialogHeader>
        <TodoForm
          key={String(open)}
          timezone={timezone}
          options={items}
          submitting={create.isPending}
          submitLabel="Create TODO"
          onSubmit={(input) => create.mutate(input as TodoInput)}
        />
      </DialogContent>
    </Dialog>
  );
}
