import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import SettleUpPage from "@components/features/Settlement/SettleUpPage";

const searchSchema = z.object({
  prevTab: z.enum(["balance", "transaction"]).catch("balance"),
});

export const Route = createFileRoute("/_tma/chat/$chatId_/settle-debt/$userId")(
  {
    component: RouteComponent,
    validateSearch: zodValidator(searchSchema),
  }
);

function RouteComponent() {
  const { chatId, userId } = Route.useParams();
  return <SettleUpPage chatId={Number(chatId)} userId={Number(userId)} />;
}
