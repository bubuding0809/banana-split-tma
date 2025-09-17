import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import CreateSnapshotPage from "@/components/features/Snapshot/CreateSnapshotPage";

const searchSchema = z.object({
  selectedExpenseIds: z.array(z.string()).catch([]),
  prevTab: z.enum(["balance", "transaction"]).catch("transaction"),
  title: z.string().optional(),
});

export const Route = createFileRoute("/_tma/chat/$chatId_/create-snapshot")({
  component: RouteComponent,
  validateSearch: zodValidator(searchSchema),
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  const { prevTab } = Route.useSearch();

  return <CreateSnapshotPage chatId={Number(chatId)} prevTab={prevTab} />;
}
