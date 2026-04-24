import { useEffect } from "react";
import { Button, Placeholder, Skeleton } from "@telegram-apps/telegram-ui";
import { backButton, hapticFeedback, popup } from "@telegram-apps/sdk-react";
import { RefreshCcw } from "lucide-react";
import { getRouteApi } from "@tanstack/react-router";
import { useSnapshotAggregations } from "./hooks/useSnapshotAggregations";
import { SnapshotHero } from "./SnapshotHero";
import { SnapshotViewTabs, type SnapshotView } from "./SnapshotViewTabs";
import { CategoryView } from "./views/CategoryView";
import { DateView } from "./views/DateView";
import { PayerView } from "./views/PayerView";

const routeApi = getRouteApi("/_tma/chat/$chatId_/snapshots_/$snapshotId");

interface SnapshotFullPageProps {
  chatId: number;
  snapshotId: string;
}

export function SnapshotFullPage({
  chatId,
  snapshotId,
}: SnapshotFullPageProps) {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const view = (search.view ?? "cat") as SnapshotView;

  const { status, error, aggregations } = useSnapshotAggregations(snapshotId);

  useEffect(() => {
    if (backButton.mount.isAvailable()) backButton.mount();
    backButton.show.ifAvailable();
    const off = backButton.onClick(() => {
      if (hapticFeedback.isSupported())
        hapticFeedback.notificationOccurred("success");
      navigate({
        to: "/chat/$chatId/snapshots",
        params: { chatId: String(chatId) },
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          snapshotId: undefined,
        }),
      });
    });
    return () => {
      backButton.hide.ifAvailable();
      off();
    };
  }, [navigate, chatId]);

  useEffect(() => {
    const code = (error as { data?: { code?: string } } | undefined)?.data
      ?.code;
    if (code === "NOT_FOUND") {
      if (popup.isSupported()) {
        popup.open({
          title: "Snapshot Not Found",
          message: "This snapshot has been deleted or does not exist.",
          buttons: [{ type: "ok", id: "ok" }],
        });
      }
      navigate({
        to: "/chat/$chatId/snapshots",
        params: { chatId: String(chatId) },
      });
    }
  }, [error, navigate, chatId]);

  if (status === "pending") {
    return (
      <div style={{ padding: 16 }}>
        <Skeleton visible>
          <div
            style={{
              height: 80,
              borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
              marginBottom: 12,
            }}
          />
        </Skeleton>
        <Skeleton visible>
          <div
            style={{
              height: 40,
              borderRadius: 8,
              background: "rgba(255,255,255,0.06)",
              marginBottom: 12,
            }}
          />
        </Skeleton>
        <Skeleton visible>
          <div
            style={{
              height: 240,
              borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
            }}
          />
        </Skeleton>
      </div>
    );
  }

  if (status === "error" || !aggregations) {
    return (
      <Placeholder
        header="Something went wrong loading the snapshot"
        description="You can try again later or reload the page now"
        action={
          <Button
            stretched
            before={<RefreshCcw />}
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        }
      >
        <img
          alt="Telegram sticker"
          src="https://xelene.me/telegram.gif"
          style={{ display: "block", height: 144, width: 144 }}
        />
      </Placeholder>
    );
  }

  const handleTabChange = (next: SnapshotView) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, view: next }),
      replace: true,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SnapshotHero
        aggregations={aggregations}
        onYourShareClick={() => handleTabChange("payer")}
      />
      <SnapshotViewTabs value={view} onChange={handleTabChange} />
      {view === "cat" && <CategoryView aggregations={aggregations} />}
      {view === "date" && <DateView aggregations={aggregations} />}
      {view === "payer" && <PayerView aggregations={aggregations} />}
    </div>
  );
}
