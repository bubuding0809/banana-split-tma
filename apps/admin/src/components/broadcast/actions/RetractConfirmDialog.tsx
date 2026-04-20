import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  count: number;
  isRetracting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function RetractConfirmDialog({
  open,
  count,
  isRetracting,
  onConfirm,
  onOpenChange,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retract broadcast?</DialogTitle>
          <DialogDescription>
            This will permanently delete the message from {count}{" "}
            {count === 1 ? "recipient" : "recipients"} in their Telegram chat.
            Cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRetracting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isRetracting}
          >
            {isRetracting ? "Retracting…" : "Retract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
