import NewUserPage from "@/components/features/Chat/NewUserPage";
import RequestPhoneNumberPage from "@/components/features/User/RequestPhoneNumberPage";
import { useStartParams } from "@/hooks";
import { trpc } from "@/utils/trpc";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { initData, useSignal } from "@telegram-apps/sdk-react";
import { Caption, Spinner, Text } from "@telegram-apps/telegram-ui";

export const Route = createFileRoute("/_tma/chat")({
  component: ChatIndexRoute,
});

function ChatIndexRoute() {
  const { chat_id } = useStartParams() ?? {};
  const tUserData = useSignal(initData.user);

  const chatId = chat_id ?? 0;
  const userId = tUserData?.id ?? 0;

  const {
    status: getUserDataStatus,
    error: getUserDataError,
    data: userData,
  } = trpc.user.getUser.useQuery(
    {
      userId,
    },
    {
      enabled: !!userId,
    }
  );

  trpc.chat.getChat.usePrefetchQuery({
    chatId,
  });

  if (getUserDataStatus === "pending") {
    return (
      <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
        <Spinner size="l" />
        <Caption weight="1">Preparing bananas</Caption>
      </main>
    );
  }

  if (getUserDataStatus === "success") {
    // Check if user has phoneNumber populated and hasn't been asked before
    if (userData && !userData.phoneNumber && !userData.phoneNumberRequested) {
      return <RequestPhoneNumberPage />;
    }

    return <Outlet />;
  }

  //* Region for handling errors
  // User is not yet registered, show NewUserPage
  if (getUserDataError?.data?.code === "NOT_FOUND") {
    return <NewUserPage />;
  }

  // Other errors, show error message
  return (
    <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
      <Text className="text-red-500">
        Something went wrong, please try again later.
      </Text>
    </main>
  );
}
