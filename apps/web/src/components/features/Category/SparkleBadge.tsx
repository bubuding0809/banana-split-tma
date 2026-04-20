import { Sparkles, LoaderCircle } from "lucide-react";

interface SparkleBadgeProps {
  label?: string;
  pending?: boolean;
}

export default function SparkleBadge({
  label,
  pending = false,
}: SparkleBadgeProps) {
  const resolvedLabel = label ?? (pending ? "Thinking…" : "Auto");
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background:
          "linear-gradient(90deg, rgba(167,139,250,0.18) 0%, rgba(236,72,153,0.18) 100%)",
        color: "rgb(139, 92, 246)",
      }}
    >
      {pending ? (
        <LoaderCircle size={12} className="animate-spin" />
      ) : (
        <Sparkles size={12} />
      )}
      {resolvedLabel}
    </span>
  );
}
