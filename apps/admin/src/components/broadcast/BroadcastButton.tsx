import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";

type Props = {
  disabled?: boolean;
  isSending?: boolean;
  onClick: () => void;
};

export function BroadcastButton({ disabled, isSending, onClick }: Props) {
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={disabled || isSending}
      className="gap-2"
    >
      {isSending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Send className="h-4 w-4" />
      )}
      {isSending ? "Sending…" : "Broadcast"}
    </Button>
  );
}
