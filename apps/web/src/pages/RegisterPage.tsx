import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { AuthLayout } from "./AuthLayout";

export function RegisterPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const localTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    workspaceName: "My workspace",
    timezone: localTimezone,
  });
  const mutation = useMutation({
    mutationFn: api.register,
    onSuccess: async (data) => {
      queryClient.setQueryData(["session"], data);
      await navigate("/");
    },
  });
  function field(name: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [name]: event.target.value }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(form);
  }
  const error =
    mutation.error instanceof ApiError
      ? mutation.error.problem.detail
      : mutation.error
        ? "Registration failed."
        : null;

  return (
    <AuthLayout>
      <Card className="w-full max-w-lg border-0 shadow-none sm:border sm:shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Create your workspace</CardTitle>
          <CardDescription>
            Your account starts with one shared TODO list that you own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                required
                maxLength={120}
                value={form.displayName}
                onChange={field("displayName")}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={field("email")}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={form.password}
                onChange={field("password")}
              />
              <p className="text-xs text-muted-foreground">
                Use at least 12 characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace">Workspace</Label>
              <Input
                id="workspace"
                required
                maxLength={120}
                value={form.workspaceName}
                onChange={field("workspaceName")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">IANA timezone</Label>
              <Input
                id="timezone"
                required
                value={form.timezone}
                onChange={field("timezone")}
              />
            </div>
            {error ? (
              <p
                role="alert"
                className="text-sm text-destructive sm:col-span-2"
              >
                {error}
              </p>
            ) : null}
            <Button
              className="sm:col-span-2"
              disabled={mutation.isPending}
              type="submit"
            >
              {mutation.isPending ? <Loader2 className="animate-spin" /> : null}{" "}
              Create account
            </Button>
            <p className="text-center text-sm text-muted-foreground sm:col-span-2">
              Already have an account?{" "}
              <Link
                className="font-medium text-foreground underline underline-offset-4"
                to="/login"
              >
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
