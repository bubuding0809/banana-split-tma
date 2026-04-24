import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { SnapshotFullPage } from "@/components/features/Snapshot/SnapshotFullPage";
import { SNAPSHOT_VIEWS } from "@/components/features/Snapshot/SnapshotViewTabs";

const searchSchema = z.object({
  view: z.enum(SNAPSHOT_VIEWS).optional(),
});

export const Route = createFileRoute(
  "/_tma/chat/$chatId_/snapshots/$snapshotId"
)({
  component: SnapshotDetailsRoute,
  validateSearch: zodValidator(searchSchema),
});

function SnapshotDetailsRoute() {
  const { chatId, snapshotId } = Route.useParams();
  return <SnapshotFullPage chatId={Number(chatId)} snapshotId={snapshotId} />;
}
