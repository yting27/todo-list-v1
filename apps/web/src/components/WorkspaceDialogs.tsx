import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { Workspace } from "@/lib/types";

export function CreateWorkspaceDialog({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: api.createWorkspace,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      setOpen(false);
      toast.success("Workspace created.");
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={compact ? "outline" : "ghost"}
          size={compact ? "sm" : "default"}
          className={compact ? "" : "w-full justify-start"}
        >
          <Plus />{" "}
          <span className={compact ? "hidden xl:inline" : ""}>
            New workspace
          </span>
          {compact ? (
            <span className="sr-only xl:hidden">New workspace</span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            A workspace is one shared TODO list.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ name, timezone });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-timezone">IANA timezone</Label>
            <Input
              id="workspace-timezone"
              required
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            />
          </div>
          <Button className="w-full" disabled={create.isPending}>
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MembersDialog({ workspace }: { workspace: Workspace }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: ["members", workspace.id],
    queryFn: () => api.listMembers(workspace.id),
    enabled: open,
  });
  const add = useMutation({
    mutationFn: () => api.addMember(workspace.id, { email, role }),
    onSuccess: async () => {
      setEmail("");
      await queryClient.invalidateQueries({
        queryKey: ["members", workspace.id],
      });
      toast.success("Member added.");
    },
    onError: (error) => toast.error(error.message),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Members
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Workspace members</DialogTitle>
          <DialogDescription>
            Owners manage access. Editors can change TODOs; viewers are
            read-only.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-60 space-y-2 overflow-y-auto">
          {members.data?.items.map((member) => (
            <div
              className="flex items-center gap-3 rounded-lg border p-3"
              key={member.userId}
            >
              <div className="grid size-8 place-items-center rounded-full bg-muted text-xs font-medium">
                {member.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.displayName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {member.email}
                </p>
              </div>
              <Badge variant="secondary">{member.role}</Badge>
            </div>
          ))}
        </div>
        {workspace.role === "owner" ? (
          <form
            className="grid grid-cols-[1fr_120px_auto] gap-2"
            onSubmit={submit}
          >
            <div>
              <Label className="sr-only" htmlFor="member-email">
                Member email
              </Label>
              <Input
                id="member-email"
                type="email"
                placeholder="teammate@example.com"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as typeof role)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="icon"
              aria-label="Add member"
              disabled={add.isPending}
            >
              <UserPlus />
            </Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
