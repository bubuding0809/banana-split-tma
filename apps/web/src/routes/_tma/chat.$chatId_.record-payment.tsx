import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import RecordPaymentPage from "@components/features/Payment/RecordPaymentPage";

const searchSchema = z.object({
  prevTab: z.enum(["balance", "transaction"]).catch("balance"),
  currentFormStep: z.number().catch(0),
  direction: z.enum(["paid", "received"]).optional().catch(undefined),
  counterpartyId: z.number().optional().catch(undefined),
  amount: z.number().optional().catch(undefined),
  currency: z.string().length(3).optional().catch(undefined),
  title: z.string().optional(),
});

export const Route = createFileRoute("/_tma/chat/$chatId_/record-payment")({
  component: RouteComponent,
  validateSearch: zodValidator(searchSchema),
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <RecordPaymentPage chatId={Number(chatId)} />;
}
