import { assetUrls } from "@/assets/urls";
import { useStartParams } from "@/hooks";
import { mainButton, openTelegramLink } from "@telegram-apps/sdk-react";
import { Caption, Placeholder, Text } from "@telegram-apps/telegram-ui";
import { useEffect } from "react";

const NewUserPage = () => {
  const { chat_id } = useStartParams() ?? {};
  const chatId = chat_id ?? 0;

  useEffect(() => {
    mainButton.setParams.ifAvailable({
      text: "Let's go!",
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
        `${import.meta.env.VITE_TELEGRAM_BOT_DEEP_LINK}?start=register`
      );
    });

    return () => {
      offMainButton?.();
    };
  }, [chatId]);

  return (
    <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
      <Placeholder
        header="👋 You seem new here"
        description={
          <div>
            <Text>Get started by talking to the bot.</Text>
            <div className="mt-10 flex flex-col items-center gap-4">
              <Caption>1. Click the button below to go to the bot</Caption>
              <Caption>
                2. Tap &quot;Start&quot; to initial the registration process
              </Caption>
              <Caption>3. Once done, come back here to continue</Caption>
            </div>
          </div>
        }
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
