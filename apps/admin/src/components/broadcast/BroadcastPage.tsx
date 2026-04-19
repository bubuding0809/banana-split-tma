import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpcReact } from "../../utils/trpc";
import { useUsers } from "@/hooks/useUsers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { MessageComposer } from "./MessageComposer";
import { TelegramPreview } from "./TelegramPreview";
import { AudienceBar } from "./AudienceBar";
import { BroadcastButton } from "./BroadcastButton";
import { ConfirmBroadcastDialog } from "./ConfirmBroadcastDialog";
import { BroadcastResultsDialog } from "./BroadcastResultsDialog";
import { AttachmentPicker, type Attachment } from "./AttachmentPicker";
import type { TargetMode } from "./AudiencePopover";
import { broadcastWithMedia } from "@/lib/broadcastWithMedia";
import type { Session } from "@/hooks/useSession";
import type {
  BroadcastFailure,
  BroadcastResult,
  BroadcastSuccess,
} from "@dko/trpc";

type Props = {
  session: Session;
  onLogout: () => void;
};

export function BroadcastPage({ session, onLogout }: Props) {
  const [message, setMessage] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [selectedUserIds, setSelectedUserIds] = useState<bigint[]>([]);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successes, setSuccesses] = useState<BroadcastSuccess[]>([]);
  const [failures, setFailures] = useState<BroadcastFailure[]>([]);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const { users } = useUsers();
  const broadcastText = trpcReact.admin.broadcastMessage.useMutation();

  const recipientCount =
    targetMode === "all" ? users.length : selectedUserIds.length;

  const disabledReason = useMemo(() => {
    if (!message.trim() && !attachment) {
      return "Write a message or attach media to enable broadcast.";
    }
    if (targetMode === "specific" && selectedUserIds.length === 0) {
      return "Select at least one user.";
    }
    return null;
  }, [message, attachment, targetMode, selectedUserIds]);

  const handleAttach = (next: Attachment) => {
    setAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return next;
    });
  };

  const handleRemoveAttachment = () => {
    setAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  const runBroadcast = async (
    targetUserIds: number[] | undefined
  ): Promise<BroadcastResult> => {
    return attachment
      ? broadcastWithMedia({
          message,
          targetUserIds,
          file: attachment.file,
        })
      : broadcastText.mutateAsync({ message, targetUserIds });
  };

  const summarizeResult = (result: BroadcastResult) => {
    setSuccesses(result.successes);
    setFailures(result.failures);
    setResultsOpen(true);
    if (result.failCount === 0) {
      const n = result.successCount;
      toast.success(`Sent to ${n} ${n === 1 ? "user" : "users"}.`);
    } else {
      toast.warning(
        `Sent to ${result.successCount}, failed for ${result.failCount}.`
      );
    }
  };

  const handleConfirm = async () => {
    setIsSending(true);
    const targetUserIds =
      targetMode === "specific"
        ? selectedUserIds.map((id) => Number(id))
        : undefined;

    try {
      const result = await runBroadcast(targetUserIds);
      setConfirmOpen(false);
      summarizeResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Broadcast failed — ${msg}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleRetryFailed = async () => {
    const retryIds = failures.map((f) => f.userId);
    if (retryIds.length === 0) return;
    setIsSending(true);
    try {
      const result = await runBroadcast(retryIds);
      summarizeResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Retry failed — ${msg}`);
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCmdEnter = (e.metaKey || e.ctrlKey) && e.key === "Enter";
      if (isCmdEnter && !disabledReason && !isSending) {
        e.preventDefault();
        setConfirmOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [disabledReason, isSending]);

  return (
    <div className="flex h-screen flex-col">
      <header className="bg-background flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Broadcast</h1>
          <Badge variant="secondary" className="font-normal">
            Draft
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {session.username ? `@${session.username}` : session.firstName}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="h-7 gap-1.5 px-2 text-xs"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="grid flex-1 gap-4 overflow-hidden px-6 py-4 lg:grid-cols-[55fr_45fr]">
        <div className="flex min-h-0 flex-col gap-3">
          <MessageComposer
            value={message}
            onChange={setMessage}
            disabled={isSending}
          />
          <AttachmentPicker
            attachment={attachment}
            onAttach={handleAttach}
            onRemove={handleRemoveAttachment}
            disabled={isSending}
          />
        </div>
        <TelegramPreview value={message} attachment={attachment} />
      </main>

      <footer className="bg-background flex flex-col gap-2 border-t px-6 py-3">
        <p className="text-muted-foreground text-xs">
          {disabledReason ?? "Press ⌘↵ / Ctrl↵ to broadcast."}
        </p>
        <div className="flex items-center justify-between">
          <AudienceBar
            targetMode={targetMode}
            onTargetModeChange={setTargetMode}
            selectedUserIds={selectedUserIds}
            onSelectedUserIdsChange={setSelectedUserIds}
          />
          <BroadcastButton
            disabled={Boolean(disabledReason)}
            isSending={isSending}
            onClick={() => setConfirmOpen(true)}
          />
        </div>
      </footer>

      <ConfirmBroadcastDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        recipientCount={recipientCount}
        messageSnippet={message.slice(0, 200)}
        attachment={attachment}
        isSending={isSending}
        onConfirm={handleConfirm}
      />
      <BroadcastResultsDialog
        open={resultsOpen}
        onOpenChange={setResultsOpen}
        successes={successes}
        failures={failures}
        isRetrying={isSending}
        onRetry={handleRetryFailed}
      />
    </div>
  );
}
