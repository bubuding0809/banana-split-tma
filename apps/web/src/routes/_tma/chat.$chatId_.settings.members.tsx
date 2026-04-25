import { createFileRoute } from "@tanstack/react-router";
import MembersSubPage from "@/components/features/Settings/MembersSubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/members")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <MembersSubPage chatId={Number(chatId)} />;
}
