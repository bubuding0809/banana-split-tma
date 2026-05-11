import { useEffect } from "react";
import NewUserPage from "@/components/features/Chat/NewUserPage";
import RequestPhoneNumberPage from "@/components/features/User/RequestPhoneNumberPage";
import { useStartParams } from "@/hooks";
import { trpc } from "@/utils/trpc";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { initData, useSignal } from "@telegram-apps/sdk-react";
import { Button, Caption, Spinner, Text } from "@telegram-apps/telegram-ui";

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
    refetch: refetchUser,
    isFetching: isRefetchingUser,
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

  // WebView lifecycle: Telegram can pause/restart the WebView during launch
  // (drag, rotate, swipe-to-close partials), dropping in-flight requests
  // between the CORS preflight and the actual GET. When visibility returns,
  // auto-refetch any failed user query so the user doesn't have to tap Try
  // again themselves in the common case.
  useEffect(() => {
    if (getUserDataStatus !== "error") return;
    if (getUserDataError?.data?.code === "NOT_FOUND") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refetchUser();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [getUserDataStatus, getUserDataError?.data?.code, refetchUser]);

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

  const errorData = getUserDataError?.data as
    | { code?: string; requestId?: string; initDataExpired?: boolean }
    | undefined;
  // Server told us the Telegram initData expired. Retrying with the same
  // expired data won't help — only a fresh WebView launch (force-close +
  // reopen from the bot) can mint new initData. Don't show Try again.
  const isExpired = errorData?.initDataExpired === true;
  // No `data.code` on the error means we never got a structured server
  // response — fetch was aborted, network dropped, or the WebView lost the
  // request after the CORS preflight. Treat as transient and prompt to retry
  // rather than as a hard server failure.
  const isTransport = !errorData?.code;
  const requestId = errorData?.requestId;

  return (
    <main className="flex h-[80vh] flex-col items-center justify-center gap-3 px-6 pb-4 text-center">
      {isExpired ? (
        <>
          <Text>⏳ Session expired</Text>
          <Caption weight="3" className="text-gray-500">
            Please close this Mini App and reopen it from the bot.
          </Caption>
        </>
      ) : isTransport ? (
        <>
          <Text>🌐 Connection hiccup</Text>
          <Caption weight="3" className="text-gray-500">
            Couldn't reach our servers. Tap below to try again.
          </Caption>
        </>
      ) : (
        <>
          <Text className="text-red-500">
            Something went wrong, please try again later.
          </Text>
          {requestId && (
            <Caption weight="3" className="text-gray-500">
              Reference: {requestId}
            </Caption>
          )}
        </>
      )}
      {!isExpired && (
        <Button
          size="m"
          mode="filled"
          loading={isRefetchingUser}
          onClick={() => void refetchUser()}
        >
          Try again
        </Button>
      )}
    </main>
  );
}
