import { Link } from "@tanstack/react-router";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { Badge, Cell, Navigation, Skeleton } from "@telegram-apps/telegram-ui";
import { Aperture } from "lucide-react";
import { trpc } from "@/utils/trpc";

interface SnapshotsLinkProps {
  chatId: number;
}

const SnapshotsLink = ({ chatId }: SnapshotsLinkProps) => {
  const { data: snapShots, status: snapShotsStatus } =
    trpc.snapshot.getByChat.useQuery({
      chatId,
    });

  return (
    <Link
      onClick={() => hapticFeedback.impactOccurred("light")}
      to="/chat/$chatId/snapshots"
      params={{
        chatId: chatId.toString(),
      }}
      search={{
        title: "📸 Snapshots",
      }}
    >
      <Cell
        Component="label"
        before={
          <span className="rounded-lg bg-red-600 p-1.5">
            <Aperture size={20} color="white" />
          </span>
        }
        after={
          <Skeleton visible={snapShotsStatus === "pending"}>
            <Navigation>
              <Badge type="number">{snapShots?.length ?? 0}</Badge>
            </Navigation>
          </Skeleton>
        }
        description="See what you have spent"
      >
        Snapshots
      </Cell>
    </Link>
  );
};

export default SnapshotsLink;
