import {
  mainButton,
  openTelegramLink,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Placeholder } from "@telegram-apps/telegram-ui";
import { useEffect } from "react";
import { assetUrls } from "@/assets/urls";

const UserPage = () => {
  const isMainButtonMounted = useSignal(mainButton.isMounted);

  useEffect(() => {
    mainButton.setParams.ifAvailable({
      text: "➕ Add to group",
      isEnabled: true,
      isVisible: true,
    });

    const offMainButtonClick = mainButton.onClick.ifAvailable(() => {
      // This will open the Telegram app to add the bot to a group
      openTelegramLink(
        `${import.meta.env.VITE_TELEGRAM_BOT_DEEP_LINK}?startgroup=group_add`
      );
    });

    return () => {
      offMainButtonClick?.();
      mainButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
      });
    };
  }, [isMainButtonMounted]);

  return (
    <div className="p-4">
      <Placeholder
        header="Nothing to see here"
        description="Add me to a group to start splitting expenses"
      >
        <img
          alt="Telegram sticker"
          src={assetUrls.bananaMiddleFinger}
          style={{
            display: "block",
            height: "144px",
            width: "144px",
          }}
        />
      </Placeholder>
    </div>
  );
};

export default UserPage;
