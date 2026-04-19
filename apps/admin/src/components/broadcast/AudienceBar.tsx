import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronDown, Users2, UserRound } from "lucide-react";
import { AudiencePopover, type TargetMode } from "./AudiencePopover";
import { useUsers } from "@/hooks/useUsers";

type Props = {
  targetMode: TargetMode;
  onTargetModeChange: (m: TargetMode) => void;
  selectedUserIds: bigint[];
  onSelectedUserIdsChange: (ids: bigint[]) => void;
};

export function AudienceBar(props: Props) {
  const { users } = useUsers();
  const count =
    props.targetMode === "all" ? users.length : props.selectedUserIds.length;
  const Icon = props.targetMode === "all" ? Users2 : UserRound;
  const label = props.targetMode === "all" ? "All users" : "Specific";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 tabular-nums">
          <Icon className="h-4 w-4" />
          <span>{label}</span>
          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
            {count}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-3">
        <AudiencePopover {...props} />
      </PopoverContent>
    </Popover>
  );
}
