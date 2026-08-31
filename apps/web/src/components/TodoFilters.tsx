import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ArrowUpDown, Filter, RotateCcw } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TodoPriority, TodoStatus } from "@/lib/types";

const statuses: { value: TodoStatus; label: string }[] = [
  { value: "NotStarted", label: "Not started" },
  { value: "InProgress", label: "In progress" },
  { value: "Completed", label: "Completed" },
  { value: "Archived", label: "Archived" },
];
const priorities: TodoPriority[] = ["Low", "Medium", "High"];

export function TodoFilters({ timezone }: { timezone: string }) {
  const [params, setParams] = useSearchParams();
  const selectedStatuses = new Set(
    (params.get("status") ?? "").split(",").filter(Boolean),
  );
  const selectedPriorities = new Set(
    (params.get("priority") ?? "").split(",").filter(Boolean),
  );
  const activeCount =
    selectedStatuses.size +
    selectedPriorities.size +
    (params.has("dependencyState") ? 1 : 0) +
    (params.has("dueFrom") ? 1 : 0) +
    (params.has("dueTo") ? 1 : 0);

  function change(name: string, value: string | null) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(name, value);
      else next.delete(name);
      next.delete("cursor");
      return next;
    });
  }
  function toggle(
    name: "status" | "priority",
    value: string,
    current: Set<string>,
  ) {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    change(name, [...next].join(",") || null);
  }
  function dateValue(name: "dueFrom" | "dueTo") {
    const value = params.get(name);
    return value ? formatInTimeZone(value, timezone, "yyyy-MM-dd") : "";
  }
  function changeDate(name: "dueFrom" | "dueTo", value: string) {
    change(
      name,
      value ? fromZonedTime(`${value}T00:00:00`, timezone).toISOString() : null,
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter /> Filters{" "}
            {activeCount ? (
              <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {activeCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Status</legend>
            <div className="grid grid-cols-2 gap-2">
              {statuses.map((status) => (
                <label
                  className="flex items-center gap-2 text-sm"
                  key={status.value}
                >
                  <input
                    type="checkbox"
                    checked={selectedStatuses.has(status.value)}
                    onChange={() =>
                      toggle("status", status.value, selectedStatuses)
                    }
                  />
                  {status.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Priority</legend>
            <div className="flex gap-4">
              {priorities.map((priority) => (
                <label
                  className="flex items-center gap-2 text-sm"
                  key={priority}
                >
                  <input
                    type="checkbox"
                    checked={selectedPriorities.has(priority)}
                    onChange={() =>
                      toggle("priority", priority, selectedPriorities)
                    }
                  />
                  {priority}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="mb-2 block text-sm font-medium">
              Dependency state
            </label>
            <Select
              value={params.get("dependencyState") ?? "all"}
              onValueChange={(value) =>
                change("dependencyState", value === "all" ? null : value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tasks</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="unblocked">Unblocked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2 text-sm font-medium">
              Due from
              <Input
                aria-label="Due from"
                type="date"
                value={dateValue("dueFrom")}
                onChange={(event) => changeDate("dueFrom", event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Due before
              <Input
                aria-label="Due before"
                type="date"
                value={dateValue("dueTo")}
                onChange={(event) => changeDate("dueTo", event.target.value)}
              />
            </label>
          </div>
        </PopoverContent>
      </Popover>
      <Select
        value={params.get("sort") ?? "dueAt"}
        onValueChange={(value) => change("sort", value)}
      >
        <SelectTrigger size="sm" className="w-40" aria-label="Sort field">
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="dueAt">Due date</SelectItem>
          <SelectItem value="priority">Priority</SelectItem>
          <SelectItem value="status">Status</SelectItem>
          <SelectItem value="name">Name</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={params.get("direction") ?? "asc"}
        onValueChange={(value) => change("direction", value)}
      >
        <SelectTrigger size="sm" className="w-36" aria-label="Sort direction">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="asc">Ascending</SelectItem>
          <SelectItem value="desc">Descending</SelectItem>
        </SelectContent>
      </Select>
      {activeCount ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setParams((current) => {
              const next = new URLSearchParams(current);
              for (const key of [
                "status",
                "priority",
                "dependencyState",
                "dueFrom",
                "dueTo",
                "cursor",
              ])
                next.delete(key);
              return next;
            })
          }
        >
          <RotateCcw /> Clear
        </Button>
      ) : null}
    </div>
  );
}
