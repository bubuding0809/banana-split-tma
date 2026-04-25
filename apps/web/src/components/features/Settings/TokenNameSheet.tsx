import { useEffect, useState } from "react";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Button,
  IconButton,
  Input,
  Modal,
  Section,
  Title,
} from "@telegram-apps/telegram-ui";
import { X } from "lucide-react";

export interface TokenNameSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialName?: string;
  onSubmit: (name: string) => Promise<void> | void;
  onRevoke?: () => void; // edit mode only
  busy?: boolean;
}

const MAX_LEN = 40;

export default function TokenNameSheet({
  open,
  onOpenChange,
  mode,
  initialName = "",
  onSubmit,
  onRevoke,
  busy,
}: TokenNameSheetProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tDestructiveTextColor = useSignal(themeParams.destructiveTextColor);

  const [name, setName] = useState(initialName);

  // Reset the field whenever the sheet (re)opens with a different prefill.
  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_LEN && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    await onSubmit(trimmed);
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={
        <Modal.Header
          before={
            <Title weight="2" level="3">
              {mode === "create" ? "New API token" : "Edit token"}
            </Title>
          }
          after={
            <Modal.Close>
              <IconButton
                size="s"
                mode="gray"
                onClick={() => hapticFeedback.impactOccurred("light")}
              >
                <X
                  size={20}
                  strokeWidth={3}
                  style={{ color: tSubtitleTextColor }}
                />
              </IconButton>
            </Modal.Close>
          }
        />
      }
    >
      <div className="pb-6">
        <Section
          className="px-3"
          header="Token name"
          footer={`Give it a name so you can tell it apart from your other tokens. ${trimmed.length}/${MAX_LEN}`}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, MAX_LEN))}
            placeholder="e.g., CLI on Macbook"
          />
        </Section>

        <div className="flex flex-col gap-2 px-3 pt-2">
          <Button
            stretched
            size="l"
            mode="filled"
            disabled={!canSubmit}
            onClick={submit}
          >
            {mode === "create" ? "Create" : "Save"}
          </Button>
          {mode === "edit" && onRevoke && (
            <Button
              stretched
              size="l"
              mode="plain"
              onClick={onRevoke}
              disabled={busy}
            >
              <span style={{ color: tDestructiveTextColor }}>Revoke token</span>
            </Button>
          )}
          <Button
            stretched
            size="l"
            mode="plain"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
