import { CheckCircle2 } from "lucide-react";
import type { PropsWithChildren } from "react";

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="text-xl font-semibold tracking-tight">TODO</div>
        <div className="max-w-xl space-y-6">
          <p className="text-5xl font-semibold leading-[1.08] tracking-tight">
            Plan clearly. Move together.
          </p>
          <p className="max-w-lg text-lg text-primary-foreground/75">
            A shared workspace for deadlines, dependencies, recurring work, and
            conflict-safe collaboration.
          </p>
          <ul className="space-y-3 text-sm text-primary-foreground/85">
            {[
              "See what is blocked before work starts",
              "Keep recurring work on its original schedule",
              "Stay current when teammates save changes",
            ].map((feature) => (
              <li className="flex items-center gap-2" key={feature}>
                <CheckCircle2 className="size-4" /> {feature}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/55">
          Workspace-scoped and built for concurrent teams.
        </p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        {children}
      </section>
    </main>
  );
}
