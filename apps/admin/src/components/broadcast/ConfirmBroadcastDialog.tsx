import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Send, FileVideo } from "lucide-react";
import type { Attachment } from "./AttachmentPicker";
import { formatBytes } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientCount: number;
  messageSnippet: string;
  attachment?: Attachment | null;
  isSending: boolean;
  onConfirm: () => void;
};

export function ConfirmBroadcastDialog({
  open,
  onOpenChange,
  recipientCount,
  messageSnippet,
  attachment,
  isSending,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send broadcast?</DialogTitle>
          <DialogDescription>
            This{" "}
            {attachment
              ? attachment.kind === "photo"
                ? "photo"
                : "video"
              : "message"}{" "}
            will be sent to{" "}
            <span className="font-medium tabular-nums">{recipientCount}</span>{" "}
            user{recipientCount === 1 ? "" : "s"}. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {attachment && (
          <div className="bg-muted/50 flex items-center gap-3 rounded-md border p-2">
            {attachment.kind === "photo" ? (
              <img
                src={attachment.previewUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="bg-foreground/10 text-muted-foreground flex h-12 w-12 shrink-0 items-center justify-center rounded">
                <FileVideo className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">
                {attachment.file.name}
              </p>
              <p className="text-muted-foreground text-[11px] tabular-nums">
                {attachment.kind === "photo" ? "Image" : "Video"} ·{" "}
                {formatBytes(attachment.file.size)}
              </p>
            </div>
          </div>
        )}

        {(messageSnippet || !attachment) && (
          <div className="bg-muted/50 text-muted-foreground rounded-md border p-3 text-sm">
            <p className="line-clamp-4 whitespace-pre-wrap">
              {messageSnippet || "(empty)"}
            </p>
          </div>
        )}

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
