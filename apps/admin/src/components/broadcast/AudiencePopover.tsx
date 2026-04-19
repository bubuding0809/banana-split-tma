import { useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useUsers, type AdminUser } from "@/hooks/useUsers";
import { Check, Users2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type TargetMode = "all" | "specific";

type Props = {
  targetMode: TargetMode;
  onTargetModeChange: (m: TargetMode) => void;
  selectedUserIds: bigint[];
  onSelectedUserIdsChange: (ids: bigint[]) => void;
};

function userLabel(u: AdminUser) {
  const name =
    [u.firstName, u.lastName].filter(Boolean).join(" ") || "(no name)";
  return u.username ? `${name} · @${u.username}` : name;
}

function matches(u: AdminUser, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    u.firstName.toLowerCase().includes(needle) ||
    (u.lastName ?? "").toLowerCase().includes(needle) ||
    (u.username ?? "").toLowerCase().includes(needle)
  );
}

export function AudiencePopover({
  targetMode,
  onTargetModeChange,
  selectedUserIds,
  onSelectedUserIdsChange,
}: Props) {
  const { users, isLoading } = useUsers();
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(
    () => new Set(selectedUserIds.map((id) => id.toString())),
    [selectedUserIds]
  );

  const { pinned, rest } = useMemo(() => {
    const filtered = users.filter((u) => matches(u, query));
    const pinned: AdminUser[] = [];
    const rest: AdminUser[] = [];
    for (const u of filtered) {
      if (selectedSet.has(u.id.toString())) pinned.push(u);
      else rest.push(u);
    }
    return { pinned, rest };
  }, [users, query, selectedSet]);

  const toggleUser = (u: AdminUser) => {
    const key = u.id.toString();
    if (selectedSet.has(key)) {
      onSelectedUserIdsChange(
        selectedUserIds.filter((id) => id.toString() !== key)
      );
    } else {
      onSelectedUserIdsChange([...selectedUserIds, u.id]);
    }
  };

  return (
    <div className="flex w-[360px] flex-col gap-2">
      <div className="bg-muted grid grid-cols-2 gap-1 rounded-md p-1">
        <button
          onClick={() => onTargetModeChange("all")}
          className={cn(
            "flex items-center justify-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors",
            targetMode === "all"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Users2 className="h-3.5 w-3.5" /> All users ({users.length})
        </button>
        <button
          onClick={() => onTargetModeChange("specific")}
          className={cn(
            "flex items-center justify-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors",
            targetMode === "specific"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <UserRound className="h-3.5 w-3.5" /> Specific (
          {selectedUserIds.length})
        </button>
      </div>

      {targetMode === "specific" && (
        <Command shouldFilter={false} className="rounded-md border">
          <CommandInput
            placeholder="Search by name or @username…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-64">
            {isLoading && <CommandEmpty>Loading users…</CommandEmpty>}
            {!isLoading && pinned.length === 0 && rest.length === 0 && (
              <CommandEmpty>No users match.</CommandEmpty>
            )}

            {pinned.length > 0 && (
              <CommandGroup heading="Selected">
                {pinned.map((u) => (
                  <CommandItem
                    key={u.id.toString()}
                    onSelect={() => toggleUser(u)}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate">{userLabel(u)}</span>
                    <Check className="text-primary h-4 w-4" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {pinned.length > 0 && rest.length > 0 && <CommandSeparator />}

            {rest.length > 0 && (
              <CommandGroup heading="All">
                {rest.map((u) => (
                  <CommandItem
                    key={u.id.toString()}
                    onSelect={() => toggleUser(u)}
                    className="truncate"
                  >
                    {userLabel(u)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          {selectedUserIds.length > 0 && (
            <div className="text-muted-foreground flex items-center justify-between border-t px-2 py-1.5 text-xs">
              <span>{selectedUserIds.length} selected</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectedUserIdsChange([])}
              >
                Clear
              </Button>
            </div>
          )}
        </Command>
      )}
    </div>
  );
}
