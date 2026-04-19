import { useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { trpcReact } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BroadcastDetailSheet } from "./BroadcastDetailSheet";
import { Image as ImageIcon, MoreHorizontal, Paperclip } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function relativeTime(d: Date): string {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return day === 1 ? "yesterday" : `${day}d ago`;
}

export function BroadcastHistoryPage() {
  const { broadcastId } = useParams<{ broadcastId?: string }>();
  const [search, setSearch] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const navigate = useNavigate();

  const list = trpcReact.admin.broadcastList.useInfiniteQuery(
    { limit: 25 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined }
  );

  const resend = trpcReact.admin.broadcastResend.useMutation();
  const resume = trpcReact.admin.broadcastResumeSend.useMutation();
  const onResume = async (id: string) => {
    try {
      const r = await resume.mutateAsync({ broadcastId: id });
      toast.success(`Resumed — delivered to ${r.successCount}.`);
      list.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resume failed");
    }
  };
  const onResendFailures = async (id: string) => {
    try {
      const r = await resend.mutateAsync({
        broadcastId: id,
        failuresOnly: true,
      });
      toast.success(
        `Re-sent to ${r.successCount}${r.failCount ? ` — ${r.failCount} failed` : ""}.`
      );
      list.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resend failed");
    }
  };

  const rows = (list.data?.pages ?? [])
    .flatMap((p) => p.items)
    .filter((b) => {
      if (failedOnly && b.failCount === 0) return false;
      if (search && !b.text.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Broadcast history</h1>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search preview…"
            className="h-8 w-60"
          />
          <Button
            size="sm"
            variant={failedOnly ? "default" : "outline"}
            onClick={() => setFailedOnly((v) => !v)}
          >
            Failed only
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {list.isLoading ? (
          <p className="text-muted-foreground p-6 text-sm">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground p-6 text-sm">
            No broadcasts yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 text-left">
              <tr>
                <th className="px-6 py-2 font-medium">Sent</th>
                <th className="px-2 py-2 font-medium">Preview</th>
                <th className="w-10 px-2 py-2 font-medium"></th>
                <th className="w-24 px-2 py-2 font-medium">Delivered</th>
                <th className="w-40 px-6 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const statusLabel =
                  b.status === "SENDING"
                    ? "Interrupted"
                    : b.retractedCount > 0
                      ? `${b.retractedCount} retracted`
                      : b.editedCount > 0
                        ? `${b.editedCount} edited`
                        : b.failCount > 0
                          ? "Partial failure"
                          : "Sent";
                return (
                  <tr key={b.id} className="hover:bg-muted/50 border-b">
                    <td className="whitespace-nowrap px-6 py-2">
                      <NavLink
                        to={`/broadcast/history/${b.id}`}
                        className="block"
                      >
                        {relativeTime(b.createdAt)}
                      </NavLink>
                    </td>
                    <td className="max-w-sm truncate px-2 py-2">
                      {b.text.slice(0, 60)}
                      {b.text.length > 60 ? "…" : ""}
                    </td>
                    <td className="px-2 py-2">
                      {b.mediaKind === "PHOTO" ? (
                        <ImageIcon className="h-3.5 w-3.5" />
                      ) : b.mediaKind === "VIDEO" ? (
                        <Paperclip className="h-3.5 w-3.5" />
                      ) : null}
                    </td>
                    <td
                      className={`px-2 py-2 ${b.failCount > 0 ? "text-amber-600" : ""}`}
                    >
                      {b.successCount}/{b.totalRecipients}
                    </td>
                    <td className="px-6 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span>{statusLabel}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() =>
                                navigate(`/broadcast/history/${b.id}`)
                              }
                            >
                              Open detail
                            </DropdownMenuItem>
                            {b.failCount > 0 && (
                              <DropdownMenuItem
                                onSelect={() => onResendFailures(b.id)}
                              >
                                Resend to failures
                              </DropdownMenuItem>
                            )}
                            {b.status === "SENDING" &&
                              Date.now() - new Date(b.createdAt).getTime() >
                                10 * 60_000 && (
                                <DropdownMenuItem
                                  onSelect={() => onResume(b.id)}
                                >
                                  Resume send
                                </DropdownMenuItem>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {list.hasNextPage && (
          <div className="flex justify-center p-4">
            <Button
              variant="outline"
              size="sm"
              disabled={list.isFetchingNextPage}
              onClick={() => list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </main>

      <BroadcastDetailSheet
        broadcastId={broadcastId ?? null}
        open={Boolean(broadcastId)}
      />
    </div>
  );
}
