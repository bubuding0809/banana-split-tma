import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { UserPage } from "@/components/features";

const searchSchema = z.object({
  selectedExpense: z.string().optional(),
  showPayments: z.boolean().catch(true),
  relatedOnly: z.boolean().catch(true),
  sortBy: z.enum(["date", "createdAt"]).catch("date"),
  sortOrder: z.enum(["asc", "desc"]).catch("desc"),
});

export const Route = createFileRoute("/_tma/chat/")({
  validateSearch: zodValidator(searchSchema),
  component: RouteComponent,
});

function RouteComponent() {
  return <UserPage />;
}
