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
import { api } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { AuthLayout } from "./AuthLayout";

export function LoginPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: api.login,
    onSuccess: async (data) => {
      // Cache the session so the app renders authenticated state immediately.
      queryClient.setQueryData(["session"], data);
      await navigate("/");
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ email, password });
  }

  // Map any API error to a user-friendly message.
  const error = mutation.error
    ? describeApiError(mutation.error, "Sign in failed.")
    : null;

  return (
    <AuthLayout>
      <Card className="w-full max-w-md border-0 shadow-none sm:border sm:shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to open your shared TODO workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              className="w-full"
              disabled={mutation.isPending}
              type="submit"
            >
              {mutation.isPending ? <Loader2 className="animate-spin" /> : null}{" "}
              Sign in
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link
                className="font-medium text-foreground underline underline-offset-4"
                to="/register"
              >
                Create an account
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
