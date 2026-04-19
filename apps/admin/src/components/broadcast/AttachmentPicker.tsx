import { useMemo, useRef } from "react";
import { Paperclip, X, Image as ImageIcon, FileVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";

export type AttachmentKind = "photo" | "video";

export type Attachment = {
  file: File;
  kind: AttachmentKind;
  previewUrl: string;
};

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function classifyFile(file: File): AttachmentKind | null {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

export function validateAttachment(file: File): {
  kind: AttachmentKind;
  error?: string;
} | null {
  const kind = classifyFile(file);
  if (!kind) return null;
  const limit = kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (file.size > limit) {
    return {
      kind,
      error: `${kind === "photo" ? "Image" : "Video"} exceeds ${formatBytes(limit)} limit.`,
    };
  }
  return { kind };
}

type Props = {
  attachment: Attachment | null;
  onAttach: (attachment: Attachment) => void;
  onRemove: () => void;
  disabled?: boolean;
};

export function AttachmentPicker({
  attachment,
  onAttach,
  onRemove,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const result = validateAttachment(file);
    if (!result) {
      alert("Only images and videos are supported.");
      return;
    }
    if (result.error) {
      alert(result.error);
      return;
    }
    onAttach({
      file,
      kind: result.kind,
      previewUrl: URL.createObjectURL(file),
    });
  };

  const sizeLabel = useMemo(
    () => (attachment ? formatBytes(attachment.file.size) : ""),
    [attachment]
  );

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />

      {!attachment ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="gap-2"
        >
          <Paperclip className="h-3.5 w-3.5" />
          Attach photo or video
        </Button>
      ) : (
        <div className="bg-muted/50 flex min-w-0 flex-1 items-center gap-3 rounded-md border p-2">
          <AttachmentThumb attachment={attachment} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">
              {attachment.file.name}
            </p>
            <p className="text-muted-foreground text-[11px] tabular-nums">
              {attachment.kind === "photo" ? "Image" : "Video"} · {sizeLabel}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove attachment"
            className="h-7 w-7 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  if (attachment.kind === "photo") {
    return (
      <img
        src={attachment.previewUrl}
        alt=""
        className="h-10 w-10 shrink-0 rounded object-cover"
      />
    );
  }
  return (
    <div className="bg-foreground/10 text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded">
      <FileVideo className="h-5 w-5" />
    </div>
  );
}

export function iconForKind(kind: AttachmentKind) {
  return kind === "photo" ? ImageIcon : FileVideo;
}
