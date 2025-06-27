import { trpc } from "@/utils/trpc";
import { createFileRoute } from "@tanstack/react-router";
import { Title } from "@telegram-apps/telegram-ui";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { data: user } = trpc.hello.user.useQuery({ id: 1 });
  console.log("User data:", user);
  console.log(typeof user?.id);
  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-900">
      <Title weight="2">Banana Splitz 🍌</Title>
    </div>
  );
}
