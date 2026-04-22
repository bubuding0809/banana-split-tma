import { Placeholder } from "@telegram-apps/telegram-ui";

export default function UserBalancesTab() {
  return (
    <Placeholder
      header="Balances across groups"
      description="Coming soon — a consolidated view of how much you owe or are owed across every chat you're in."
    >
      <div className="text-[72px] leading-none" aria-hidden>
        🧮
      </div>
    </Placeholder>
  );
}
