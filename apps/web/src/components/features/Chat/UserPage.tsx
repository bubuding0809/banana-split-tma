import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { trpc } from "@/utils/trpc";
import { initData, useSignal } from "@telegram-apps/sdk-react";
import { Title } from "@telegram-apps/telegram-ui";

const UserPage = () => {
  const tUserData = useSignal(initData.user);

  const { data: duserData } = trpc.user.getUser.useQuery({
    userId: tUserData?.id ?? 0,
  });

  return (
    <div className="p-4">
      <Title>User: {tUserData?.firstName}</Title>
      <div className="mt-1.5 flex gap-2">
        <ChatMemberAvatar userId={tUserData?.id ?? 0} size={48} />
        <pre className="overflow-auto">
          <code className="truncate text-wrap">
            {JSON.stringify(duserData, null, 2)}
          </code>
        </pre>
      </div>
    </div>
  );
};

export default UserPage;
