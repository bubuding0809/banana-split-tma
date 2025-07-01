import { createFileRoute } from "@tanstack/react-router";
import { Title } from "@telegram-apps/telegram-ui";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-900">
      <Title weight="2">Banana Splitz 🍌</Title>
    </div>
  );
}
