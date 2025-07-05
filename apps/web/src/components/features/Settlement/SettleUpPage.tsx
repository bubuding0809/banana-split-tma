import { getRouteApi } from "@tanstack/react-router";
import { backButton } from "@telegram-apps/sdk-react";
import { useEffect } from "react";

const routeApi = getRouteApi("/_tma/chat/$chatId_/settle-debt/$userId");

interface SettleUpPageProps {
  chatId: number;
  userId: number;
}

const SettleUpPage = ({ chatId, userId }: SettleUpPageProps) => {
  const { prevTab } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  useEffect(() => {
    const offClick = backButton.onClick(() => {
      navigate({
        to: "../..",
        search: {
          selectedTab: prevTab,
          title: "👥 Group",
        },
      });
    });
    backButton.show.ifAvailable();
    return () => {
      offClick();
      backButton.hide.ifAvailable();
    };
  }, [chatId, navigate, prevTab]);

  return (
    <div>
      SettleUpPage {chatId} - {userId}
    </div>
  );
};

export default SettleUpPage;
