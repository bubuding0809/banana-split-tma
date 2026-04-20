import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  count: number;
  currentKind: "PHOTO" | "VIDEO" | null;
  initialText: string;
  isSubmitting: boolean;
  onConfirm: (args: { text: string }) => void;
  onOpenChange: (open: boolean) => void;
};

export function EditBroadcastDialog({
  open,
  count,
  currentKind,
  initialText,
  isSubmitting,
  onConfirm,
  onOpenChange,
}: Props) {
  const [text, setText] = useState(initialText);
  useEffect(() => setText(initialText), [initialText, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Edit {currentKind ? "caption" : "message"} for {count}{" "}
            {count === 1 ? "recipient" : "recipients"}
          </DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={currentKind ? "Caption…" : "Message…"}
        />
        <p className="text-muted-foreground text-xs">
          {currentKind
            ? "Media cannot be removed via edit. Use Retract + Resend instead."
            : "Text-only messages cannot gain media via edit. Use Retract + Resend instead."}
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm({ text })}
            disabled={isSubmitting || text.trim().length === 0}
          >
            {isSubmitting ? "Saving…" : "Save edit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
