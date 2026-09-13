import type { ComponentType, ReactNode } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* The four states every data page has, written once. */

export function Skeleton({ rows = 2, lines = 2 }: { rows?: number; lines?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <Card key={row} className="gap-0 p-3.5" aria-hidden>
          <div className="animate-pulse space-y-2.5">
            {Array.from({ length: lines }, (_, line) => (
              <div
                key={line}
                className={cn("rounded bg-muted", line === 0 ? "h-2 w-16" : "h-4 w-44")}
              />
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="items-center gap-2 p-8 text-center">
      <Icon className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="max-w-xs text-xs text-muted-foreground">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </Card>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="items-center gap-2 p-8 text-center">
      <AlertCircle className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{message}</p>
      <Button variant="outline" size="lg" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  );
}

/** Inline, under a form. `role="alert"` so it is announced when it appears. */
export function FormError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-destructive-border bg-destructive-muted px-3 py-2.5 text-xs text-destructive",
        className,
      )}
    >
      <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
