import { createFileRoute } from "@tanstack/react-router";
import { Title } from "@telegram-apps/telegram-ui";

export const Route = createFileRoute("/")({ component: Index });

export function Index() {
  return (
    <div className="bg-linear-to-br flex h-screen items-center justify-center from-emerald-500 to-emerald-900">
      <Title weight="2">🍌 Banana Splitz</Title>
    </div>
  );
}
