import { TodoCard } from "@/components/TodoCard";
import { TODO_STATUS_LABELS } from "@/lib/constants";
import type { Todo, TodoStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const columns: {
  status: TodoStatus;
  label: string;
  bar: string;
}[] = [
  {
    status: "NotStarted",
    label: TODO_STATUS_LABELS.NotStarted,
    bar: "bg-slate-400",
  },
  {
    status: "InProgress",
    label: TODO_STATUS_LABELS.InProgress,
    bar: "bg-sky-500",
  },
  {
    status: "Completed",
    label: TODO_STATUS_LABELS.Completed,
    bar: "bg-primary",
  },
  {
    status: "Archived",
    label: TODO_STATUS_LABELS.Archived,
    bar: "bg-zinc-400",
  },
];

export function BoardView({
  items,
  timezone,
  onOpen,
  onDelete,
}: {
  items: Todo[];
  timezone: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  // List of columns where each represents a unique status key
  const visibleColumns = columns
    .map((column) => ({
      ...column,
      todos: items.filter((todo) => todo.status === column.status),
    }))
    .filter((column) => column.todos.length > 0);

  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 260px), 1fr))`,
      }}
    >
      {visibleColumns.map((column) => {
        const todos = column.todos;
        const highPriority = todos.filter(
          (todo) => todo.priority === "High",
        ).length;
        return (
          <section
            key={column.status}
            className={cn(
              "flex min-h-40 flex-col gap-3 rounded-2xl p-3",
              column.status === "Completed" ? "bg-primary/10" : "bg-muted/60",
            )}
            aria-label={column.label}
          >
            <header
              className={cn(
                "sticky top-17 z-10 -mx-3 -mt-3 px-4 pb-2 pt-3 backdrop-blur-md",
                column.status === "Completed" ? "bg-primary/10" : "bg-muted/60",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn("h-1.5 w-6 rounded-full", column.bar)}
                  aria-hidden="true"
                />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {column.label}
                </h2>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                <span className="text-base font-semibold text-foreground">
                  {todos.length}
                </span>{" "}
                task{todos.length === 1 ? "" : "s"}
                {highPriority ? (
                  <span className="ml-1.5 text-xs">
                    · {highPriority} high priority
                  </span>
                ) : null}
              </p>
            </header>
            {/* Display TODO item cards */}
            <div className="flex flex-1 flex-col gap-3">
              {todos.map((todo) => (
                <TodoCard
                  key={todo.id}
                  todo={todo}
                  timezone={timezone}
                  onOpen={() => onOpen(todo.id)}
                  onDelete={() => onDelete(todo.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
