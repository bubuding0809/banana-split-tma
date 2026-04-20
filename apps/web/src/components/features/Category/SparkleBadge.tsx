import { Sparkles } from "lucide-react";

interface SparkleBadgeProps {
  label?: string;
}

export default function SparkleBadge({ label = "Auto" }: SparkleBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background:
          "linear-gradient(90deg, rgba(167,139,250,0.18) 0%, rgba(236,72,153,0.18) 100%)",
        color: "rgb(139, 92, 246)",
      }}
    >
      <Sparkles size={12} />
      {label}
    </span>
  );
}
