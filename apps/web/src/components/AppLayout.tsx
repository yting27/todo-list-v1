import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  SquaresIntersect,
  ChevronsUpDown,
  CircleHelp,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  SquareKanban,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import type { AuthResponse, Workspace } from "@/lib/types";
import { cn } from "@/lib/utils";

const sidebarItems = [{ icon: SquareKanban, label: "Board", active: true }];

function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center",
          collapsed ? "justify-center px-2" : "justify-between px-5",
        )}
      >
        {collapsed ? (
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <SquaresIntersect className="size-4" />
          </span>
        ) : (
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <SquaresIntersect className="size-4" />
            </span>
            sleekflow
          </span>
        )}
        {!collapsed ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Collapse sidebar"
            onClick={onToggle}
          >
            <PanelLeftClose className="size-4 text-muted-foreground" />
          </Button>
        ) : null}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {collapsed ? (
          <div className="mb-2 flex justify-center">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Expand sidebar"
              onClick={onToggle}
            >
              <PanelLeftOpen className="size-4 text-muted-foreground" />
            </Button>
          </div>
        ) : null}
        <ul className="space-y-0.5">
          {sidebarItems.map((item) => (
            <li key={item.label}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href="#"
                    onClick={(event) => event.preventDefault()}
                    aria-current={item.active ? "page" : undefined}
                    aria-label={item.label}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground",
                      collapsed && "justify-center px-0",
                      item.active &&
                        "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {collapsed ? null : item.label}
                  </a>
                </TooltipTrigger>
                {collapsed ? (
                  <TooltipContent side="right">{item.label}</TooltipContent>
                ) : null}
              </Tooltip>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function Topbar({
  session,
  workspace,
  onSelectWorkspace,
}: {
  session: AuthResponse;
  workspace: Workspace;
  onSelectWorkspace: (id: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(
    searchParams.get("search") ?? "",
  );
  const queryClient = useQueryClient();

  // Debounce: update the `search` URL param 1s after typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = searchParams.get("search") ?? "";
      if (searchTerm === current) return;
      const next = new URLSearchParams(searchParams);
      if (searchTerm) next.set("search", searchTerm);
      else next.delete("search");
      setSearchParams(next, { replace: true });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [searchTerm, searchParams, setSearchParams]);
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/login");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <header className="sticky top-0 z-10 border-b border-border/60 bg-background/60 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <div className="min-w-0">
          <Select value={workspace.id} onValueChange={onSelectWorkspace}>
            <SelectTrigger className="h-auto border-0 bg-transparent p-0 text-xl font-semibold tracking-tight shadow-none focus:ring-0 sm:text-2xl [&_svg]:text-muted-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {session.workspaces.map((item) => (
                <SelectItem value={item.id} key={item.id}>
                  {item.name}{" "}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search tasks…"
              className="h-9 w-52 rounded-full bg-muted/60 pl-8 lg:w-64"
              aria-label="Search tasks"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Notifications">
                <Bell className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Notifications</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="API documentation"
                asChild
              >
                <a href="/api/docs" target="_blank" rel="noreferrer">
                  <CircleHelp className="size-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>API Documentation</TooltipContent>
          </Tooltip>
          <Separator
            orientation="vertical"
            className="mx-1 hidden h-6 sm:block"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="gap-1.5 rounded-full px-2"
                aria-label="Account menu"
              >
                <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {session.user.displayName
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <ChevronsUpDown className="size-3.5 text-muted-foreground" />
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
  );
}

export function AppLayout({
  session,
  workspace,
  onSelectWorkspace,
  children,
}: {
  session: AuthResponse;
  workspace: Workspace;
  onSelectWorkspace: (id: string) => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          session={session}
          workspace={workspace}
          onSelectWorkspace={onSelectWorkspace}
        />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
