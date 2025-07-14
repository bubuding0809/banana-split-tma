import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_tma/chat")({
  component: ChatIndexRoute,
});

function ChatIndexRoute() {
  return <Outlet />;
}
