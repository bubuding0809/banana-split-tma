import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { UserPage } from "@/components/features";

const searchSchema = z.object({
  selectedTab: z.enum(["groups", "personal"]).catch("personal"),
  selectedExpense: z.string().optional(),
  showPayments: z.boolean().catch(true),
  relatedOnly: z.boolean().catch(true),
  sortBy: z.enum(["date", "createdAt"]).catch("date"),
  sortOrder: z.enum(["asc", "desc"]).catch("desc"),
  // Consumed by the aggregation ticker inside ChatTransactionTab. Declared
  // here so the zod validator doesn't strip it on navigate.
  categoryFilters: z.array(z.string()).catch([]),
});

export const Route = createFileRoute("/_tma/chat/")({
  validateSearch: zodValidator(searchSchema),
  component: RouteComponent,
});

function RouteComponent() {
  return <UserPage />;
}
