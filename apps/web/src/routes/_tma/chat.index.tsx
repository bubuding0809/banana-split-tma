import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { UserPage } from "@/components/features";
import { useStartParams } from "@/hooks";

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
  const startParams = useStartParams();
  const navigate = useNavigate();

  // Mirror the deep-link consumer in `chat.$chatId.tsx`: when a personal
  // chat deep link (chat_type "p") carries an expense entity, land the
  // user on the personal transactions tab with the modal auto-opened.
  // Without this, a "View Expense" tap from the bot DM lands on the
  // hub but the modal never opens because only the group route consumed
  // entity_type === "e".
  useEffect(() => {
    if (!startParams?.entity_id) return;
    const consumedKey = `deep_link_consumed_${startParams.entity_id}`;
    if (sessionStorage.getItem(consumedKey)) return;

    if (startParams.entity_type === "e") {
      sessionStorage.setItem(consumedKey, "true");
      void navigate({
        to: "/chat",
        search: {
          selectedTab: "personal",
          selectedExpense: startParams.entity_id,
        },
        replace: true,
      });
    }
  }, [startParams?.entity_type, startParams?.entity_id, navigate]);

  return <UserPage />;
}
