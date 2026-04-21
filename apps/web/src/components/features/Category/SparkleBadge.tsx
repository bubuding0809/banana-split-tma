import { Sparkles } from "lucide-react";

interface SparkleBadgeProps {
  label?: string;
  pending?: boolean;
}

export default function SparkleBadge({
  label,
  pending = false,
}: SparkleBadgeProps) {
  const baseClass =
    "inline-flex items-center rounded-full text-[11px] font-medium";
  const style = {
    background:
      "linear-gradient(90deg, rgba(167,139,250,0.18) 0%, rgba(236,72,153,0.18) 100%)",
    color: "rgb(139, 92, 246)",
  } as const;

  if (pending) {
    return (
      <span
        className={`${baseClass} h-5 w-5 animate-pulse justify-center`}
        style={style}
        aria-label="Suggesting a category"
      >
        <Sparkles
          size={12}
          className="[filter:drop-shadow(0_0_4px_rgba(167,139,250,0.8))]"
        />
      </span>
    );
  }

  return (
    <span className={`${baseClass} gap-1 px-2 py-0.5`} style={style}>
      <Sparkles size={12} />
      {label ?? "Auto"}
    </span>
  );
}
