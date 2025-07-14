import { assetUrls } from "@/assets/urls";
import { useStartParams } from "@/hooks";
import { mainButton, openTelegramLink } from "@telegram-apps/sdk-react";
import { Placeholder } from "@telegram-apps/telegram-ui";
import { useEffect } from "react";

const NewUserPage = () => {
  const { chat_id } = useStartParams() ?? {};
  const chatId = chat_id ?? 0;

  useEffect(() => {
    mainButton.setParams.ifAvailable({
      text: "Start here »",
      isEnabled: true,
      isVisible: true,
      hasShineEffect: true,
    });

    return () => {
      mainButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
        hasShineEffect: false,
      });
    };
  }, []);

  useEffect(() => {
    const offMainButton = mainButton.onClick.ifAvailable(() => {
      // This will open the Telegram app to start the bot
      openTelegramLink(
        `${import.meta.env.VITE_TELEGRAM_BOT_DEEP_LINK}?start=register:${chatId}`
      );
    });

    return () => {
      offMainButton?.();
    };
  }, [chatId]);

  return (
    <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
      <Placeholder
        header="Hey there! You seem to be new here."
        description="Let's get you started by initiating a chat with the bot."
      >
        <img
          alt="Telegram sticker"
          src={assetUrls.bananaSparklyEyes}
          style={{
            display: "block",
            height: "144px",
            width: "144px",
          }}
        />
      </Placeholder>
    </main>
  );
};

export default NewUserPage;
