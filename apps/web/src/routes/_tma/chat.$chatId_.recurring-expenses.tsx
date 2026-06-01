import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import RecurringTemplatesList from "@/components/features/Expense/RecurringTemplatesList";

const searchSchema = z.object({
  // Set by the "View Schedule" deep-link consumers (chat.index.tsx /
  // chat.$chatId.tsx). RecurringTemplatesList reads this to auto-open the
  // matching template's details modal on land.
  selectedTemplate: z.string().optional(),
});

export const Route = createFileRoute("/_tma/chat/$chatId_/recurring-expenses")({
  validateSearch: zodValidator(searchSchema),
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  const { selectedTemplate } = Route.useSearch();
  return (
    <RecurringTemplatesList
      chatId={Number(chatId)}
      initialSelectedTemplateId={selectedTemplate ?? null}
    />
  );
}
