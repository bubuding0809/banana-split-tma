import { Navigate, createFileRoute } from "@tanstack/react-router";
import useStartParams from "@/hooks/useStartParams";

export const Route = createFileRoute("/_tma/home")({
  component: TmaIndexRoute,
});

function TmaIndexRoute() {
  const tmaStartParams = useStartParams();
  const { chat_id, chat_type } = tmaStartParams ?? {};

  const chatId = chat_id ?? 0;
  const chatType = chat_type ?? "private";

  // Only redirect to the /chat/$chatId route if it is a group chat and currently on /_tma/chat
  if (chatType !== "private") {
    return (
      <Navigate
        to="/chat/$chatId"
        params={{ chatId: chatId.toString() }}
        search={{
          title: "",
        }}
      />
    );
  }

  return <Navigate to="/chat" search={{ title: "" }} />;
}
