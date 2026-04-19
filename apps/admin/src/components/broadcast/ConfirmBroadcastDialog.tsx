import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientCount: number;
  messageSnippet: string;
  isSending: boolean;
  onConfirm: () => void;
};

export function ConfirmBroadcastDialog({
  open,
  onOpenChange,
  recipientCount,
  messageSnippet,
  isSending,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send broadcast?</DialogTitle>
          <DialogDescription>
            This message will be sent to{" "}
            <span className="font-medium tabular-nums">{recipientCount}</span>{" "}
            user{recipientCount === 1 ? "" : "s"}. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted/50 text-muted-foreground rounded-md border p-3 text-sm">
          <p className="line-clamp-4 whitespace-pre-wrap">
            {messageSnippet || "(empty)"}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSending} className="gap-2">
            <Send className="h-4 w-4" />
            {isSending ? "Sending…" : "Send broadcast"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
