import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { motion, AnimatePresence } from "framer-motion";
import type { Attachment } from "./AttachmentPicker";

marked.setOptions({ breaks: true, gfm: true });

function normalizeForPreview(raw: string): string {
  return raw.replace(/([^\n])\n(\s*[-*+]\s)/g, "$1\n\n$2");
}

function renderMessage(md: string): string {
  const html = marked.parse(normalizeForPreview(md), {
    async: false,
  }) as string;
  return DOMPurify.sanitize(html);
}

type Props = { value: string; attachment?: Attachment | null };

export function TelegramPreview({ value, attachment }: Props) {
  const trimmed = useMemo(() => value.trim(), [value]);
  const html = useMemo(
    () => (trimmed ? renderMessage(trimmed) : ""),
    [trimmed]
  );
  const hasContent = Boolean(trimmed) || Boolean(attachment);

  return (
    <div className="flex h-full flex-col gap-2 rounded-lg bg-stone-900 p-4">
      <div className="text-[10px] uppercase tracking-wider text-stone-400">
        Telegram preview
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        <AnimatePresence initial={false} mode="wait">
          {!hasContent ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="m-auto text-sm text-stone-500"
            >
              Start typing or attach media to see a preview.
            </motion.div>
          ) : (
            <motion.div
              key="bubble"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="bg-primary/80 text-primary-foreground telegram-bubble max-w-[85%] self-start overflow-hidden rounded-2xl text-sm shadow-sm"
            >
              {attachment && <AttachmentMedia attachment={attachment} />}
              {trimmed && (
                <div
                  className="px-4 py-3"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="text-[11px] text-stone-500">
        Approximate preview. Telegram MarkdownV2 rendering may differ.
      </p>
    </div>
  );
}

function AttachmentMedia({ attachment }: { attachment: Attachment }) {
  if (attachment.kind === "photo") {
    return (
      <img
        src={attachment.previewUrl}
        alt=""
        className="block max-h-96 w-full object-cover"
      />
    );
  }
  return (
    <video
      src={attachment.previewUrl}
      controls
      playsInline
      className="block max-h-96 w-full bg-black object-contain"
    />
  );
}
