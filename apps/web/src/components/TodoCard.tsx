import {
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleDot,
  LockKeyhole,
  MoreHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Todo } from "@/lib/types";

const statusPresentation = {
  NotStarted: { label: "Not started", icon: Circle },
  InProgress: { label: "In progress", icon: CircleDot },
  Completed: { label: "Completed", icon: CheckCircle2 },
  Archived: { label: "Archived", icon: Circle },
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
  const status = statusPresentation[todo.status];
  const StatusIcon = status.icon;
  const due = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(todo.dueAt));
  return (
    <Card className="group flex h-64 flex-col gap-0 overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={todo.priority === "High" ? "destructive" : "secondary"}
            >
              {todo.priority}
            </Badge>
            {todo.blocked ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="gap-1">
                    <LockKeyhole className="size-3" />
                    Blocked
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {todo.blockingDependencyIds.length} incomplete prerequisite
                  {todo.blockingDependencyIds.length === 1 ? "" : "s"}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <CardTitle className="line-clamp-2 text-base leading-snug">
            {todo.name}
          </CardTitle>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Actions for ${todo.name}`}
              className="-mr-2 -mt-2 shrink-0 opacity-60 group-hover:opacity-100"
              size="icon"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpen}>View and edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {todo.description || "No description"}
        </p>
      </CardContent>
      <CardFooter className="mt-auto flex items-center justify-between border-t bg-muted/25 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <StatusIcon className="size-3.5" />
          {status.label}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5" />
          {due}
        </span>
      </CardFooter>
    </Card>
  );
}
