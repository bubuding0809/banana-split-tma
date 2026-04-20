import { AppRoot } from "@telegram-apps/telegram-ui";
import {
  Aperture,
  ArrowLeftRight,
  ChevronRight,
  FileText,
  Plus,
  Settings,
  Wand2,
} from "lucide-react";
import { TapRipple } from "./TapRipple";
import { TAP_DURATION, TAP_GROUP_SETTINGS_START } from "./scenes";

type Props = {
  frame: number;
};

export const FakeGroupPage: React.FC<Props> = ({ frame }) => {
  return (
    <AppRoot
      appearance="dark"
      platform="ios"
      style={{
        height: "100%",
        width: "100%",
        background: "transparent",
        overflow: "hidden",
      }}
    >
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          color: "#ffffff",
        }}
      >
        {/* Group header cell (the settings entry point) */}
        <div
          style={{
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background:
                "conic-gradient(from 120deg, #3dd67b, #c6e23a, #3dd67b)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>
              Banana Splitz STG
            </div>
            <div
              style={{
                fontSize: 15,
                color: "rgba(255,255,255,0.5)",
                marginTop: 2,
              }}
            >
              4 members
            </div>
          </div>
          <Settings size={22} color="rgba(255,255,255,0.85)" />
          <ChevronRight size={18} color="rgba(255,255,255,0.35)" />
          <TapRipple
            frame={frame}
            start={TAP_GROUP_SETTINGS_START}
            duration={TAP_DURATION}
            x={450}
            y={40}
          />
        </div>

        <InfoRow
          icon={<Aperture size={22} color="#ffffff" />}
          iconBg="#d9362c"
          title="Snapshots"
          subtitle="See what you have spent"
          after={
            <>
              <div
                style={{
                  background: "#3390ec",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 600,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 6,
                }}
              >
                3
              </div>
              <ChevronRight size={18} color="rgba(255,255,255,0.35)" />
            </>
          }
        />

        <InfoRow
          icon={<Wand2 size={22} color="#ffffff" />}
          iconBg="#3390ec"
          title="Simplify debts"
          subtitle="Combine debts to simplify payments"
          after={<FakeSwitch checked={true} />}
        />

        <div style={{ padding: "16px" }}>
          <button
            style={{
              width: "100%",
              background: "#3390ec",
              color: "#ffffff",
              border: "none",
              borderRadius: 14,
              padding: "14px 16px",
              fontSize: 17,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            <Plus size={20} strokeWidth={2.5} />
            Add expense
          </button>
        </div>

        <div
          style={{
            display: "flex",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            padding: "0 16px",
          }}
        >
          <TabItem label="Balances" icon={<FileText size={16} />} active />
          <TabItem
            label="Transactions"
            icon={<ArrowLeftRight size={16} />}
            active={false}
          />
        </div>

        <div style={{ padding: "20px 16px" }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
            🚨 Debts
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              borderRadius: 12,
              padding: "22px",
              textAlign: "center",
              color: "rgba(255,255,255,0.55)",
              fontSize: 17,
              fontWeight: 500,
            }}
          >
            🔥 You are all settled
          </div>
        </div>

        <div style={{ padding: "0 16px" }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
            🤑 Collectables
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              borderRadius: 12,
              padding: "22px",
              textAlign: "center",
              color: "rgba(255,255,255,0.55)",
              fontSize: 17,
              fontWeight: 500,
            }}
          >
            🤷 No one owes you
          </div>
        </div>
      </main>
    </AppRoot>
  );
};

const InfoRow: React.FC<{
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  after: React.ReactNode;
}> = ({ icon, iconBg, title, subtitle, after }) => (
  <div
    style={{
      padding: "14px 16px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}
  >
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: iconBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {icon}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
      <div
        style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 2 }}
      >
        {subtitle}
      </div>
    </div>
    {after}
  </div>
);

const TabItem: React.FC<{
  label: string;
  icon: React.ReactNode;
  active: boolean;
}> = ({ label, icon, active }) => (
  <div
    style={{
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "14px 20px",
      fontSize: 16,
      fontWeight: 600,
      color: active ? "#3390ec" : "rgba(255,255,255,0.5)",
      borderBottom: active ? "2px solid #3390ec" : "2px solid transparent",
      marginBottom: -1,
    }}
  >
    {icon}
    {label}
  </div>
);

const FakeSwitch: React.FC<{ checked: boolean }> = ({ checked }) => (
  <div
    style={{
      width: 52,
      height: 32,
      borderRadius: 16,
      background: checked ? "#3390ec" : "#2a2d35",
      position: "relative",
      flexShrink: 0,
      transition: "background 150ms ease",
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 2,
        left: checked ? 22 : 2,
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: "#ffffff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
        transition: "left 150ms ease",
      }}
    />
  </div>
);
