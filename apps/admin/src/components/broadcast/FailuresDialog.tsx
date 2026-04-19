import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export type BroadcastFailure = { userId: number; error: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  failures: BroadcastFailure[];
};

export function FailuresDialog({ open, onOpenChange, failures }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {failures.length} failed delivery
            {failures.length === 1 ? "" : "ies"}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh] rounded-md border">
          <ul className="divide-y text-sm">
            {failures.map((f, i) => (
              <li key={`${f.userId}-${i}`} className="flex flex-col gap-1 p-3">
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  user {f.userId}
                </span>
                <span className="text-destructive">{f.error}</span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
