import {
  CalendarClock,
  Link2,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Repeat2,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Todo, TodoPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

const priorityStyles: Record<TodoPriority, string> = {
  High: "bg-destructive/10 text-destructive",
  Medium: "bg-amber-500/15 text-amber-600",
  Low: "bg-primary/15 text-accent-foreground",
};

export function TodoCard({
  todo,
  timezone,
  onOpen,
  onDelete,
}: {
  todo: Todo;
  timezone: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  // `dueAt` is stored as an ISO timestamp (UTC). Format it in the user's
  // workspace timezone so every viewer sees the same local wall-clock time.
  const due = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(todo.dueAt));
  return (
    <Card className="group flex h-64 flex-col gap-0 overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="flex grid-rows-none flex-row items-start justify-between gap-2 pb-3">
        <CardTitle className="line-clamp-2 min-w-0 flex-1 text-base leading-snug">
          {todo.name}
        </CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Actions for ${todo.name}`}
              className="-mr-2 -mt-1.5 shrink-0"
              size="icon-sm"
              variant="ghost"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpen}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`View details of ${todo.name}`}
          className="block w-full cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="line-clamp-3 text-ellipsis text-sm leading-relaxed text-muted-foreground">
            {todo.description || "No description"}
          </p>
          {todo.description ? (
            <span className="mt-1 inline-block text-xs font-medium text-accent-foreground underline-offset-2 group-hover:underline">
              View details
            </span>
          ) : null}
        </button>
      </CardContent>
      <CardFooter className="mt-auto flex items-center justify-between border-t bg-muted/25 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 font-medium",
              priorityStyles[todo.priority],
            )}
          >
            {todo.priority}
          </span>
          {todo.blockingDependencyIds.length ? (
            <span className="flex items-center gap-1">
              <Link2 className="size-3.5" />
              {todo.blockingDependencyIds.length}
            </span>
          ) : null}
          {todo.recurrence ? (
            <span className="flex items-center gap-1">
              <Repeat2 className="size-3.5" />
            </span>
          ) : null}
          {todo.dependencies.length ? (
            <span className="flex items-center gap-1">
              <ListChecks className="size-3.5" />
              {todo.dependencies.length}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5" />
          {due}
        </span>
      </CardFooter>
    </Card>
  );
}
