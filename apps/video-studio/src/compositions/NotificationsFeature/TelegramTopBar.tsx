import { ChevronDown, ChevronLeft, MoreHorizontal, X } from "lucide-react";

type Props = {
  variant: "close" | "back";
  title: string;
  titleIcon: React.ReactNode;
};

export const TelegramTopBar: React.FC<Props> = ({
  variant,
  title,
  titleIcon,
}) => {
  return (
    <div
      style={{
        height: 48,
        background: "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        color: "#ffffff",
        flexShrink: 0,
        position: "relative",
      }}
    >
      <LeftPill variant={variant} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 17,
          fontWeight: 600,
          color: "#ffffff",
        }}
      >
        {titleIcon}
        <span>{title}</span>
      </div>
      <RightPill />
    </div>
  );
};

const LeftPill: React.FC<{ variant: "close" | "back" }> = ({ variant }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 4,
      background: "rgba(255,255,255,0.1)",
      borderRadius: 999,
      padding: "6px 14px 6px 10px",
      fontSize: 15,
      fontWeight: 500,
      color: "#ffffff",
    }}
  >
    {variant === "close" ? (
      <X size={16} strokeWidth={2.25} color="#ffffff" />
    ) : (
      <ChevronLeft size={18} strokeWidth={2.25} color="#ffffff" />
    )}
    <span>{variant === "close" ? "Close" : "Back"}</span>
  </div>
);

const RightPill: React.FC = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      background: "rgba(255,255,255,0.1)",
      borderRadius: 999,
      padding: "6px 12px",
      color: "#ffffff",
    }}
  >
    <ChevronDown size={16} strokeWidth={2.25} color="#ffffff" />
    <MoreHorizontal size={16} strokeWidth={2.25} color="#ffffff" />
  </div>
);
