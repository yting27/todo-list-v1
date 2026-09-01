import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { TooltipProvider } from "@/components/ui/tooltip";
import { api, ApiError } from "@/lib/api";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";

// Code-split the workspace page into its own chunk to keep the initial bundle
// small; remap named export to `default` for lazy().
const WorkspacePage = lazy(() =>
  import("@/pages/WorkspacePage").then((module) => ({
    default: module.WorkspacePage,
  })),
);

export function App() {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: api.me,
    retry: false,
  });
  const authenticated = Boolean(session.data);
  const unauthenticated =
    session.error instanceof ApiError && session.error.status === 401;

  if (session.isPending) {
    return (
      <main className="grid min-h-screen place-items-center" aria-busy="true">
        <div className="text-center">
          <div className="mx-auto mb-4 size-9 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">
            Loading your workspace…
          </p>
        </div>
      </main>
    );
  }

  return (
    <TooltipProvider>
      <Routes>
        <Route
          path="/login"
          element={authenticated ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={
            authenticated ? <Navigate to="/" replace /> : <RegisterPage />
          }
        />
        <Route
          path="/"
          element={
            authenticated && session.data ? (
              <Suspense
                fallback={
                  <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">
                    Loading workspace…
                  </main>
                }
              >
                <WorkspacePage session={session.data} />
              </Suspense>
            ) : unauthenticated ? (
              <Navigate to="/login" replace />
            ) : (
              <LoginPage />
            )
          }
        />
        <Route
          path="*"
          element={<Navigate to={authenticated ? "/" : "/login"} replace />}
        />
      </Routes>
    </TooltipProvider>
  );
}
