import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import EditSnapshotPage from "@/components/features/Snapshot/EditSnapshotPage";

const searchSchema = z.object({
  prevTab: z.enum(["balance", "transaction"]).catch("transaction"),
  title: z.string().optional(),
});

export const Route = createFileRoute(
  "/_tma/chat/$chatId_/edit-snapshot/$snapshotId"
)({
  component: RouteComponent,
  validateSearch: zodValidator(searchSchema),
});

function RouteComponent() {
  const { chatId, snapshotId } = Route.useParams();
  const { prevTab } = Route.useSearch();

  return (
    <EditSnapshotPage
      chatId={Number(chatId)}
      snapshotId={snapshotId}
      prevTab={prevTab}
    />
  );
}
