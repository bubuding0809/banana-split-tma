import { useEffect, useRef, useState } from "react";
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
  // telegram-ui's <Input> forwards refs to its wrapping <div>, not to the
  // underlying <input> (despite typing the ref as HTMLInputElement). We
  // hold the wrapper and query for the input when we need to focus it.
  const inputWrapperRef = useRef<HTMLInputElement | null>(null);

  // Reset the field whenever the sheet (re)opens with a different prefill.
  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  // Autofocus the name input when the sheet opens. The 300ms delay lets
  // vaul's open animation settle before iOS raises the keyboard — without
  // it, focus fires while the drawer is still translating, which on iOS
  // intermittently over-scrolls the sheet because WebKit's auto-scroll
  // and vaul's visualViewport resize handler race. preventScroll: true
  // silences WebKit's scroll-on-focus so vaul alone owns the height
  // adjustment.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      // Runtime value is actually the wrapping div; querySelector works
      // either way and finds the real <input>.
      const wrapper = inputWrapperRef.current as unknown as HTMLElement | null;
      wrapper?.querySelector("input")?.focus({ preventScroll: true });
    }, 300);
    return () => window.clearTimeout(t);
  }, [open]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_LEN && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch {
      // Parent already handled the error (haptic, log). Keep the sheet open
      // so the user can retry without re-entering the name.
    }
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
            ref={inputWrapperRef}
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
        </div>
      </div>
    </Modal>
  );
}
