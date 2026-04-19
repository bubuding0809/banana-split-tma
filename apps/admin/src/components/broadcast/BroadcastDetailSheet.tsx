import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { trpcReact } from "@/utils/trpc";
import { DeliveryRow } from "./DeliveryRow";
import type { DeliveryStatus } from "@dko/trpc";

type Props = {
  broadcastId: string | null;
  open: boolean;
};

type StatusFilter = "ALL" | DeliveryStatus;

export function BroadcastDetailSheet({ broadcastId, open }: Props) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<StatusFilter>("ALL");

  const detail = trpcReact.admin.broadcastGet.useQuery(
    { broadcastId: broadcastId ?? "" },
    { enabled: Boolean(broadcastId) }
  );

  const deliveries = useMemo(() => {
    const all = detail.data?.deliveries ?? [];
    return filter === "ALL" ? all : all.filter((d) => d.status === filter);
  }, [detail.data, filter]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) navigate("/broadcast/history");
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Broadcast details</SheetTitle>
        </SheetHeader>

        {detail.isLoading ? (
          <p className="text-muted-foreground p-6 text-sm">Loading…</p>
        ) : !detail.data ? (
          <p className="text-muted-foreground p-6 text-sm">Not found.</p>
        ) : (
          <div className="flex h-full flex-col">
            <div className="space-y-2 border-b px-6 py-4">
              <p className="text-muted-foreground text-xs">
                {new Date(detail.data.createdAt).toLocaleString()}
              </p>
              <pre className="bg-muted whitespace-pre-wrap rounded-md p-3 text-sm">
                {detail.data.text}
              </pre>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" disabled>
                  Edit all
                </Button>
                <Button size="sm" variant="outline" disabled>
                  Retract all
                </Button>
                <Button size="sm" variant="outline" disabled>
                  Resend…
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 border-b px-6 py-2 text-xs">
              {(
                [
                  "ALL",
                  "SENT",
                  "FAILED",
                  "RETRACTED",
                  "EDITED",
                ] as StatusFilter[]
              ).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={filter === k ? "default" : "outline"}
                  onClick={() => setFilter(k)}
                >
                  {k.toLowerCase()}
                </Button>
              ))}
              <span className="text-muted-foreground ml-auto">
                {deliveries.length} shown
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {deliveries.map((d) => (
                <DeliveryRow
                  key={d.id}
                  delivery={d}
                  selected={selected.has(d.id)}
                  onToggle={() => toggle(d.id)}
                />
              ))}
            </div>

            {selected.size > 0 && (
              <div className="bg-background flex items-center justify-between border-t px-6 py-3 text-sm">
                <span>{selected.size} selected</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled>
                    Retract
                  </Button>
                  <Button size="sm" variant="outline" disabled>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" disabled>
                    Resend
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
