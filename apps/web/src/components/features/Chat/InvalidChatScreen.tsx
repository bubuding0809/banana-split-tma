import { Placeholder } from "@telegram-apps/telegram-ui";

const InvalidGroupScreen = () => {
  return (
    <div className="flex h-[80vh] flex-col items-center justify-center p-4">
      <Placeholder
        header="Group not found"
        description={`This group might have been migrated or deleted. Ask the bot for a new app link via /start@${import.meta.env.VITE_TELEGRAM_BOT_USERNAME}`}
      >
        <img
          alt="Telegram sticker"
          src="https://xelene.me/telegram.gif"
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

export default InvalidGroupScreen;
