import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import ChatSettingsPage from "@/components/features/Settings/ChatSettingsPage";

const searchSchema = z.object({
  prevTab: z.enum(["balance", "transaction"]).catch("balance"),
  prevCurrency: z.string().catch("SGD"),
});

export const Route = createFileRoute("/_tma/chat/$chatId_/settings")({
  component: RouteComponent,
  validateSearch: zodValidator(searchSchema),
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <ChatSettingsPage chatId={Number(chatId)} />;
}
