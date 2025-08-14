import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import SnapShotPage from "@/components/features/Snapshot/SnapshotPage";

const searchSchema = z.object({
  selectedCurrency: z.string().optional(),
  title: z.string().optional(),
});

export const Route = createFileRoute("/_tma/chat/$chatId_/snapshots")({
  component: SnapshotsPage,
  validateSearch: zodValidator(searchSchema),
});

function SnapshotsPage() {
  const { chatId } = Route.useParams();
  const { selectedCurrency } = Route.useSearch();

  return (
    <div className="p-4">
      <SnapShotPage
        chatId={Number(chatId)}
        selectedCurrency={selectedCurrency ?? "SGD"}
      />
    </div>
  );
}
