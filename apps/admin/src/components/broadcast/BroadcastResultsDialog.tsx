import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import type { BroadcastFailure, BroadcastSuccess } from "@dko/trpc";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  successes: BroadcastSuccess[];
  failures: BroadcastFailure[];
  isRetrying: boolean;
  onRetry: () => void;
};

function recipientLabel(r: { username: string | null; firstName: string }) {
  return r.username ? `@${r.username}` : r.firstName;
}

export function BroadcastResultsDialog({
  open,
  onOpenChange,
  successes,
  failures,
  isRetrying,
  onRetry,
}: Props) {
  const hasFailures = failures.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Broadcast results
          </DialogTitle>
          <div className="text-muted-foreground flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-emerald-500" />
              <span className="tabular-nums">{successes.length}</span> delivered
            </span>
            <span className="flex items-center gap-1.5">
              <XCircle className="text-destructive size-3.5" />
              <span className="tabular-nums">{failures.length}</span> failed
            </span>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {hasFailures && (
            <section className="space-y-1.5">
              <h3 className="text-destructive text-xs font-semibold uppercase tracking-wide">
                Failed
              </h3>
              <ScrollArea className="max-h-48 rounded-md border">
                <ul className="divide-y text-sm">
                  {failures.map((f) => (
                    <li
                      key={`fail-${f.userId}`}
                      className="flex flex-col gap-1 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-medium">
                          {recipientLabel(f)}
                        </span>
                        <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                          {f.userId}
                        </span>
                      </div>
                      <span className="text-destructive text-xs">
                        {f.error}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </section>
          )}

          {successes.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                Delivered
              </h3>
              <ScrollArea className="max-h-48 rounded-md border">
                <ul className="divide-y text-sm">
                  {successes.map((s) => (
                    <li
                      key={`ok-${s.userId}`}
                      className="flex items-center justify-between gap-3 p-3"
                    >
                      <span className="truncate">{recipientLabel(s)}</span>
                      <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                        {s.userId}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRetrying}
          >
            Close
          </Button>
          <Button
            onClick={onRetry}
            disabled={!hasFailures || isRetrying}
            className="gap-2"
          >
            <RotateCcw className="size-4" />
            {isRetrying
              ? "Retrying…"
              : `Retry failed${hasFailures ? ` (${failures.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
