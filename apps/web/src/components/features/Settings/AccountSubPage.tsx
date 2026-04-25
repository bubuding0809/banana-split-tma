import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Avatar,
  ButtonCell,
  Cell,
  Navigation,
  Section,
  Text,
} from "@telegram-apps/telegram-ui";
import {
  backButton,
  hapticFeedback,
  initData,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Phone, X } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useRequestContact } from "@/hooks";
import IconSquare from "./IconSquare";

interface AccountSubPageProps {
  chatId: number;
}

export default function AccountSubPage({ chatId }: AccountSubPageProps) {
  const navigate = useNavigate();
  const tUser = useSignal(initData.user);
  const userId = tUser?.id ?? 0;
  const { requestContactInfo, isSupported } = useRequestContact();
  const [busy, setBusy] = useState(false);

  const trpcUtils = trpc.useUtils();
  const { data: userData } = trpc.user.getUser.useQuery(
    { userId },
    { enabled: userId !== 0 }
  );
  const updateUser = trpc.user.updateUser.useMutation({
    onMutate: ({ phoneNumber }) => {
      trpcUtils.user.getUser.setData({ userId }, (prev) =>
        prev ? { ...prev, phoneNumber: phoneNumber ?? prev.phoneNumber } : prev
      );
    },
    onSuccess: () => trpcUtils.user.getUser.invalidate({ userId }),
  });

  useEffect(() => {
    backButton.show();
    return () => backButton.hide();
  }, []);

  useEffect(() => {
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      navigate({
        to: "/chat/$chatId/settings",
        params: { chatId: String(chatId) },
      });
    });
    return () => off();
  }, [chatId, navigate]);

  const onAddPhone = useCallback(async () => {
    if (!isSupported) return;
    try {
      setBusy(true);
      const phone = await requestContactInfo();
      if (phone && userId) {
        await updateUser.mutateAsync({ userId, phoneNumber: phone });
        hapticFeedback.notificationOccurred("success");
      }
    } catch (err) {
      console.error("Failed to add phone:", err);
      hapticFeedback.notificationOccurred("error");
    } finally {
      setBusy(false);
    }
  }, [isSupported, requestContactInfo, userId, updateUser]);

  const onRemovePhone = useCallback(async () => {
    try {
      setBusy(true);
      await updateUser.mutateAsync({ userId, phoneNumber: null });
      hapticFeedback.notificationOccurred("success");
    } catch (err) {
      console.error("Failed to remove phone:", err);
      hapticFeedback.notificationOccurred("error");
    } finally {
      setBusy(false);
    }
  }, [userId, updateUser]);

  const fullName = [tUser?.firstName, tUser?.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="px-3 pb-8">
      <div className="flex flex-col items-center px-4 pb-3 pt-4">
        <Avatar
          size={48}
          acronym={(tUser?.firstName?.[0] ?? "?").toUpperCase()}
          src={tUser?.photoUrl ?? undefined}
        />
        <div className="mt-2 text-base font-semibold">{fullName || "You"}</div>
        {tUser?.username && (
          <div className="text-(--tg-theme-subtitle-text-color) text-sm">
            @{tUser.username}
          </div>
        )}
      </div>

      <Section
        header="Contact"
        footer="Only used so the bot can recognize you across chats."
      >
        <Cell
          before={
            <IconSquare color="green">
              <Phone size={14} />
            </IconSquare>
          }
          after={
            userData?.phoneNumber ? (
              <Text>{userData.phoneNumber}</Text>
            ) : (
              <Navigation>
                <Text className="text-gray-500">Add</Text>
              </Navigation>
            )
          }
          onClick={() => !userData?.phoneNumber && onAddPhone()}
        >
          Phone
        </Cell>
      </Section>

      {userData?.phoneNumber && (
        <Section>
          <ButtonCell
            before={<X size={20} />}
            onClick={onRemovePhone}
            disabled={busy}
          >
            {busy ? "Removing…" : "Remove phone number"}
          </ButtonCell>
        </Section>
      )}

      {!isSupported && !userData?.phoneNumber && (
        <Section>
          <Cell>
            <Text className="text-sm text-gray-500">
              Phone number sharing is not supported in this version of Telegram.
            </Text>
          </Cell>
        </Section>
      )}
    </main>
  );
}
