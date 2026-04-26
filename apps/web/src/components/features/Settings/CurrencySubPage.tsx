import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import { Avatar, Cell, Section, Skeleton } from "@telegram-apps/telegram-ui";
import { Check } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { getFlagUrl } from "@/utils/emoji";

interface CurrencySubPageProps {
  chatId: number;
}

export default function CurrencySubPage({ chatId }: CurrencySubPageProps) {
  const navigate = useNavigate();
  const trpcUtils = trpc.useUtils();

  const { data: chat } = trpc.chat.getChat.useQuery({ chatId });
  const { data: currencies, status } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  const updateChat = trpc.chat.updateChat.useMutation({
    onMutate: ({ baseCurrency }) => {
      trpcUtils.chat.getChat.setData({ chatId }, (prev) =>
        prev
          ? { ...prev, baseCurrency: baseCurrency ?? prev.baseCurrency }
          : prev
      );
    },
    onSuccess: () => trpcUtils.chat.getChat.invalidate({ chatId }),
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

  const select = (code: string) => {
    if (chat?.baseCurrency === code) return;
    hapticFeedback.notificationOccurred("success");
    updateChat.mutate({ chatId, baseCurrency: code });
  };

  const all = currencies ?? [];
  const selected = all.find((c) => c.code === chat?.baseCurrency);
  const others = all.filter((c) => c.code !== chat?.baseCurrency);

  return (
    <main className="px-3 pb-8">
      <Section header="Selected">
        {status === "pending" || !selected ? (
          <Cell
            before={<Avatar size={28} />}
            subtitle={
              <Skeleton visible>
                <span>CODE · ¤</span>
              </Skeleton>
            }
          >
            <Skeleton visible>
              <span>Loading currency</span>
            </Skeleton>
          </Cell>
        ) : (
          <Cell
            before={
              <Avatar size={28} src={getFlagUrl(selected.countryCode)}>
                {selected.flagEmoji}
              </Avatar>
            }
            subtitle={`${selected.code} · ${selected.symbol ?? ""}`}
            after={<Check size={18} />}
          >
            {selected.name}
          </Cell>
        )}
      </Section>

      <Section
        header="All currencies"
        footer="Used as the base currency for splits in this chat."
      >
        {status === "pending"
          ? Array.from({ length: 8 }).map((_, i) => (
              <Cell
                key={`skeleton-${i}`}
                before={<Avatar size={28} />}
                subtitle={
                  <Skeleton visible>
                    <span>CODE · ¤</span>
                  </Skeleton>
                }
              >
                <Skeleton visible>
                  <span>Loading currency</span>
                </Skeleton>
              </Cell>
            ))
          : others.map((c) => (
              <Cell
                key={c.code}
                before={
                  <Avatar size={28} src={getFlagUrl(c.countryCode)}>
                    {c.flagEmoji}
                  </Avatar>
                }
                subtitle={`${c.code} · ${c.symbol ?? ""}`}
                onClick={() => select(c.code)}
              >
                {c.name}
              </Cell>
            ))}
      </Section>
    </main>
  );
}
