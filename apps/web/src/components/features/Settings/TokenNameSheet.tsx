import { useEffect, useState } from "react";
import { Button, Input, Modal, Text, Title } from "@telegram-apps/telegram-ui";

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
    <Modal open={open} onOpenChange={onOpenChange}>
      <div className="px-4 py-3">
        <Title level="2">
          {mode === "create" ? "New API token" : "Edit token"}
        </Title>
        <Text className="text-(--tg-theme-subtitle-text-color) mt-2 block">
          Give it a name so you can tell it apart from your other tokens.
        </Text>
        <Input
          header="Name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, MAX_LEN))}
          placeholder="e.g., CLI on Macbook"
          className="mt-3"
        />
        <div className="text-(--tg-theme-subtitle-text-color) mt-2 text-right text-xs">
          {trimmed.length}/{MAX_LEN}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Button
            stretched
            mode="filled"
            disabled={!canSubmit}
            onClick={submit}
          >
            {mode === "create" ? "Create" : "Save"}
          </Button>
          {mode === "edit" && onRevoke && (
            <Button stretched mode="plain" onClick={onRevoke} disabled={busy}>
              <span className="text-red-500">Revoke token</span>
            </Button>
          )}
          <Button
            stretched
            mode="outline"
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
