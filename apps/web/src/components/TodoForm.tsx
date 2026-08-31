import { format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { CalendarDays } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  Todo,
  TodoInput,
  TodoPriority,
  TodoStatus,
  TodoUpdate,
} from "@/lib/types";

const emptyDue = (timezone: string) =>
  formatInTimeZone(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
    timezone,
    "yyyy-MM-dd'T'HH:mm",
  );

export function TodoForm({
  initial,
  timezone,
  options,
  submitting,
  submitLabel,
  onSubmit,
}: {
  initial?: Todo;
  timezone: string;
  options: Todo[];
  submitting: boolean;
  submitLabel: string;
  onSubmit: (value: TodoInput | TodoUpdate) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueLocal, setDueLocal] = useState(
    initial
      ? formatInTimeZone(initial.dueAt, timezone, "yyyy-MM-dd'T'HH:mm")
      : emptyDue(timezone),
  );
  const [status, setStatus] = useState<TodoStatus>(
    initial?.status ?? "NotStarted",
  );
  const [priority, setPriority] = useState<TodoPriority>(
    initial?.priority ?? "Medium",
  );
  const [recurring, setRecurring] = useState(Boolean(initial?.recurrence));
  const [intervalCount, setIntervalCount] = useState(
    initial?.recurrence?.intervalCount ?? 1,
  );
  const [intervalUnit, setIntervalUnit] = useState<"day" | "week" | "month">(
    initial?.recurrence?.intervalUnit ?? "week",
  );
  const [dependencyIds, setDependencyIds] = useState<string[]>(
    initial?.dependencies.map((item) => item.id) ?? [],
  );
  const candidates = useMemo(
    () => options.filter((todo) => todo.id !== initial?.id),
    [initial?.id, options],
  );
  const calendarDate = useMemo(() => {
    const [year, month, day] = dueLocal.slice(0, 10).split("-").map(Number);
    return year && month && day ? new Date(year, month - 1, day) : undefined;
  }, [dueLocal]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const core = {
      name: name.trim(),
      description,
      dueAt: fromZonedTime(dueLocal, timezone).toISOString(),
      status,
      priority,
    };
    onSubmit(
      initial
        ? { ...core, cascadeDependents: false }
        : {
            ...core,
            recurrence: recurring ? { intervalCount, intervalUnit } : null,
            dependencyIds,
          },
    );
  }
  function toggleDependency(id: string) {
    setDependencyIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="todo-name">Name</Label>
        <Input
          id="todo-name"
          required
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="todo-description">Description</Label>
        <Textarea
          id="todo-description"
          rows={4}
          maxLength={10000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="todo-status">Status</Label>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as TodoStatus)}
          >
            <SelectTrigger id="todo-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NotStarted">Not started</SelectItem>
              <SelectItem value="InProgress">In progress</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="todo-priority">Priority</Label>
          <Select
            value={priority}
            onValueChange={(value) => setPriority(value as TodoPriority)}
          >
            <SelectTrigger id="todo-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Low">Low</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="High">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="todo-due">Due in {timezone}</Label>
        <div className="flex gap-2">
          <Input
            id="todo-due"
            type="datetime-local"
            required
            value={dueLocal}
            onChange={(event) => setDueLocal(event.target.value)}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Choose due date"
              >
                <CalendarDays />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={calendarDate}
                onSelect={(date) => {
                  if (date)
                    setDueLocal(
                      `${format(date, "yyyy-MM-dd")}${dueLocal.slice(10)}`,
                    );
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {!initial ? (
        <>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(event) => setRecurring(event.target.checked)}
            />
            Repeat this TODO
          </label>
          {recurring ? (
            <div className="grid grid-cols-[1fr_1.5fr] gap-3 rounded-lg border p-3">
              <div className="space-y-2">
                <Label htmlFor="repeat-count">Every</Label>
                <Input
                  id="repeat-count"
                  type="number"
                  min={1}
                  max={365}
                  value={intervalCount}
                  onChange={(event) =>
                    setIntervalCount(Number(event.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="repeat-unit">Unit</Label>
                <Select
                  value={intervalUnit}
                  onValueChange={(value) =>
                    setIntervalUnit(value as typeof intervalUnit)
                  }
                >
                  <SelectTrigger id="repeat-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day(s)</SelectItem>
                    <SelectItem value="week">Week(s)</SelectItem>
                    <SelectItem value="month">Month(s)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          {candidates.length ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Prerequisites</legend>
              <div className="max-h-32 space-y-2 overflow-y-auto rounded-lg border p-3">
                {candidates.map((todo) => (
                  <label
                    className="flex items-center gap-2 text-sm"
                    key={todo.id}
                  >
                    <input
                      type="checkbox"
                      checked={dependencyIds.includes(todo.id)}
                      onChange={() => toggleDependency(todo.id)}
                    />
                    <span className="truncate">{todo.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {todo.status}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </>
      ) : null}
      <Button
        className="w-full"
        disabled={submitting || !name.trim()}
        type="submit"
      >
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
