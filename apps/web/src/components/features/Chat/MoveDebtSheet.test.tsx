import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MoveDebtSheet } from "./MoveDebtSheet";
import type { MoveParams } from "./deriveMoveParams";

afterEach(() => cleanup());

vi.mock("@telegram-apps/sdk-react", () => ({
  hapticFeedback: {
    impactOccurred: { ifAvailable: vi.fn() },
    notificationOccurred: { ifAvailable: vi.fn() },
  },
  popup: { open: { ifAvailable: vi.fn(async () => "cancel") } },
  themeParams: { sectionBackgroundColor: {}, subtitleTextColor: {} },
  useSignal: vi.fn(() => "#888888"),
  initDataRaw: vi.fn(() => "raw-init-data"),
}));

vi.mock("@telegram-apps/telegram-ui", () => ({
  Modal: Object.assign(
    ({ open, header, children }: any) =>
      open ? (
        <div data-testid="modal">
          {header}
          {children}
        </div>
      ) : null,
    { Header: ({ children }: any) => <div>{children}</div> }
  ),
  Section: ({ header, children }: any) => (
    <div>
      {typeof header === "string" ? <h3>{header}</h3> : header}
      {children}
    </div>
  ),
  Cell: ({ children, onClick, before, after }: any) => (
    <button onClick={onClick}>
      {before}
      {children}
      {after}
    </button>
  ),
  Caption: ({ children }: any) => <span>{children}</span>,
  Text: ({ children }: any) => <span>{children}</span>,
  Skeleton: ({ children }: any) => <>{children}</>,
  Info: ({ children }: any) => <div>{children}</div>,
  Snackbar: ({ children }: any) => <div>{children}</div>,
  Avatar: ({ children, src }: any) => <span data-src={src}>{children}</span>,
}));

const mutateAsync = vi.fn(async () => ({}));
vi.mock("@utils/trpc", () => ({
  trpc: {
    expenseShare: {
      getEligibleTransferTargets: {
        useQuery: vi.fn(() => ({
          data: [
            { chatId: 200, chatTitle: "LADS 2026" },
            { chatId: 300, chatTitle: "Ski 2026" },
          ],
          isLoading: false,
        })),
      },
    },
    debtTransfer: {
      createTransfer: {
        useMutation: vi.fn(() => ({ mutateAsync, isPending: false })),
      },
    },
    useUtils: vi.fn(() => ({
      debtTransfer: { getAllByChat: { invalidate: vi.fn() } },
      currency: { getCurrenciesWithBalance: { invalidate: vi.fn() } },
      chat: { getBulkChatDebts: { invalidate: vi.fn() } },
      expenseShare: {
        getMyBalancesAcrossChats: { invalidate: vi.fn() },
        getMyCounterpartyBalances: { invalidate: vi.fn() },
      },
    })),
  },
}));

vi.mock("@/components/ui/ChatMemberAvatar", () => ({
  default: () => <span data-testid="avatar" />,
}));

const move: MoveParams = {
  debtorId: 1,
  creditorId: 2,
  amount: 71.79,
  currency: "SGD",
  sourceChatId: 100,
  sourceChatTitle: "Japan Trip",
  callerOwes: true,
};

describe("MoveDebtSheet", () => {
  it("lists each eligible target group", () => {
    render(
      <MoveDebtSheet
        open
        move={move}
        counterpartyUserId={2}
        counterpartyName="Sean"
        onOpenChange={() => {}}
        onAfterMutate={() => {}}
      />
    );
    expect(screen.getByText("LADS 2026")).toBeTruthy();
    expect(screen.getByText("Ski 2026")).toBeTruthy();
  });

  it("shows an empty state when there are no shared groups", async () => {
    const { trpc } = await import("@utils/trpc");
    (
      trpc.expenseShare.getEligibleTransferTargets.useQuery as any
    ).mockReturnValueOnce({ data: [], isLoading: false });
    render(
      <MoveDebtSheet
        open
        move={move}
        counterpartyUserId={2}
        counterpartyName="Sean"
        onOpenChange={() => {}}
        onAfterMutate={() => {}}
      />
    );
    expect(screen.getByText(/No shared groups with Sean/i)).toBeTruthy();
  });
});
