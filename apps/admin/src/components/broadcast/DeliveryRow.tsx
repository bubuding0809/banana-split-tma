import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

type Delivery = {
  id: string;
  username: string | null;
  firstName: string;
  status: "PENDING" | "SENT" | "FAILED" | "RETRACTED" | "EDITED";
  error: string | null;
};

type Props = {
  delivery: Delivery;
  selected: boolean;
  onToggle: () => void;
};

const BADGE: Record<Delivery["status"], { label: string; className: string }> =
  {
    PENDING: { label: "Pending", className: "bg-slate-100 text-slate-700" },
    SENT: { label: "Sent", className: "bg-emerald-100 text-emerald-800" },
    EDITED: { label: "Edited", className: "bg-indigo-100 text-indigo-800" },
    RETRACTED: { label: "Retracted", className: "bg-zinc-200 text-zinc-700" },
    FAILED: { label: "Failed", className: "bg-amber-100 text-amber-800" },
  };

export function DeliveryRow({ delivery, selected, onToggle }: Props) {
  const badge = BADGE[delivery.status];
  return (
    <div className="hover:bg-muted/50 flex items-center gap-3 border-b px-4 py-2 text-sm">
      <Checkbox checked={selected} onCheckedChange={onToggle} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-muted-foreground">
          {delivery.username ? `@${delivery.username}` : "(no username)"}
        </span>
        <span className="truncate">{delivery.firstName}</span>
      </div>
      <Badge variant="secondary" className={`font-normal ${badge.className}`}>
        {badge.label}
      </Badge>
    </div>
  );
}
