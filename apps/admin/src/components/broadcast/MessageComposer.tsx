import MDEditor from "@uiw/react-md-editor";

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

export function MessageComposer({ value, onChange, disabled }: Props) {
  return (
    <div className="flex h-full flex-col gap-2" data-color-mode="light">
      <div className="text-muted-foreground text-[10px] uppercase tracking-wider">
        Compose
      </div>
      <div className="flex-1 overflow-hidden rounded-lg border">
        <MDEditor
          value={value}
          onChange={(v) => onChange(v ?? "")}
          height="100%"
          preview="edit"
          visibleDragbar={false}
          textareaProps={{ disabled }}
        />
      </div>
      <p className="text-muted-foreground text-[11px]">
        Markdown (MarkdownV2) is sent to Telegram as-is.
      </p>
    </div>
  );
}
