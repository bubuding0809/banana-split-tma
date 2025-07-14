import { trpc } from "@/utils/trpc";
import { useEffect } from "react";

interface UseEnsureChatMemberProps {
  chatId: number;
  userId: number;
}

interface UseEnsureChatMemberOptions {
  enabled?: boolean;
}

const useEnsureChatMember = (
  { chatId, userId }: UseEnsureChatMemberProps,
  { enabled = true }: UseEnsureChatMemberOptions = {}
) => {
  // * Hooks ======================================================================================
  const trpcUtils = trpc.useUtils();

  // * Queries ====================================================================================
  const { data: dchatData } = trpc.chat.getChat.useQuery({ chatId });

  //* Mutations ===================================================================================
  const {
    mutateAsync: addMember,
    isPending,
    isError,
    error,
  } = trpc.chat.addMember.useMutation();

  //* Effects
  useEffect(() => {
    // Check if chat data is available and the hook is enabled
    if (!dchatData || !enabled) return;

    // Check if user is a member of the chat
    const member = dchatData.members.find((m) => Number(m.id) === userId);

    // Add user as a member of the chat if they are not already a member
    if (!member) {
      addMember(
        {
          chatId,
          userId,
        },
        {
          onSettled: () => {
            trpcUtils.chat.getChat.invalidate({ chatId });
          },
        }
      );
    }
  }, [addMember, chatId, dchatData, enabled, trpcUtils.chat.getChat, userId]);

  return {
    isPending,
    isError,
    error,
    data: dchatData,
  };
};

export default useEnsureChatMember;
