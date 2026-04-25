import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import RecurringExpenseCell from "./RecurringExpenseCell";

afterEach(() => {
  cleanup();
});

vi.mock("@telegram-apps/sdk-react", () => ({
  hapticFeedback: { selectionChanged: vi.fn() },
  themeParams: {
    buttonColor: { sub: vi.fn(() => () => {}) },
    subtitleTextColor: { sub: vi.fn(() => () => {}) },
  },
  initData: {
    user: { sub: vi.fn(() => () => {}) },
  },
  useSignal: vi.fn(() => undefined),
}));

vi.mock("@telegram-apps/telegram-ui", () => ({
  Cell: ({
    children,
    after,
  }: {
    children?: React.ReactNode;
    after?: React.ReactNode;
  }) => (
    <div>
      {children}
      {after}
    </div>
  ),
  Caption: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Info: ({
    children,
    avatarStack,
  }: {
    children?: React.ReactNode;
    avatarStack?: React.ReactNode;
  }) => (
    <div>
      {avatarStack}
      {children}
    </div>
  ),
  Skeleton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/utils/trpc", () => ({
  trpc: {
    telegram: {
      getChatMember: {
        useQuery: vi.fn(() => ({
          data: { user: { id: 200, first_name: "Alex", last_name: "Y" } },
          isLoading: false,
        })),
      },
    },
    currency: {
      getSupportedCurrencies: {
        useQuery: vi.fn(() => ({
          data: [{ code: "SGD", flagEmoji: "🇸🇬" }],
        })),
      },
    },
  },
}));

vi.mock("@/utils/financial", () => ({
  formatCurrencyWithCode: (n: number, c: string) => `${c} ${n.toFixed(2)}`,
}));

const baseTemplate = {
  id: "tmpl-1",
  description: "Cleaner bill",
  amount: "200",
  currency: "SGD",
  payerId: 200,
  chatId: 100,
  weekdays: [],
  startDate: new Date("2026-04-25"),
  endDate: null,
  categoryId: null,
};

describe("RecurringExpenseCell", () => {
  it("interval=1 MONTHLY shows preset label", () => {
    render(
      <RecurringExpenseCell
        template={{ ...baseTemplate, frequency: "MONTHLY", interval: 1 }}
        onClick={() => {}}
      />
    );
    expect(screen.getByText(/Monthly/)).toBeDefined();
  });

  it("interval=2 MONTHLY uses 'months' (regression test for plural bug)", () => {
    render(
      <RecurringExpenseCell
        template={{ ...baseTemplate, frequency: "MONTHLY", interval: 2 }}
        onClick={() => {}}
      />
    );
    expect(screen.getByText(/Every 2 months/)).toBeDefined();
    expect(screen.queryByText(/monthlys/)).toBeNull();
  });

  it("interval=3 WEEKLY uses 'weeks'", () => {
    render(
      <RecurringExpenseCell
        template={{ ...baseTemplate, frequency: "WEEKLY", interval: 3 }}
        onClick={() => {}}
      />
    );
    expect(screen.getByText(/Every 3 weeks/)).toBeDefined();
  });
});
