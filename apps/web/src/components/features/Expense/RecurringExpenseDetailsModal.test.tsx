import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import RecurringExpenseDetailsModal from "./RecurringExpenseDetailsModal";

afterEach(() => {
  cleanup();
});

vi.mock("@telegram-apps/sdk-react", () => ({
  hapticFeedback: { impactOccurred: vi.fn() },
  themeParams: {
    sectionBackgroundColor: { sub: vi.fn(() => () => {}) },
    buttonColor: { sub: vi.fn(() => () => {}) },
    subtitleTextColor: { sub: vi.fn(() => () => {}) },
  },
  useSignal: vi.fn(() => "#888888"),
}));

vi.mock("@telegram-apps/telegram-ui", () => ({
  Modal: Object.assign(
    ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
      open ? <div data-testid="modal">{children}</div> : null,
    {
      Header: ({ before, after, children }: any) => (
        <div>
          {before}
          {children}
          {after}
        </div>
      ),
      Close: ({ children }: any) => <>{children}</>,
    }
  ),
  Cell: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Section: ({
    header,
    children,
  }: {
    header?: string;
    children?: React.ReactNode;
  }) => (
    <div>
      {header && <h3>{header}</h3>}
      {children}
    </div>
  ),
  Title: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Caption: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Text: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Badge: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  IconButton: ({ children, onClick, "aria-label": ariaLabel }: any) => (
    <button aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  ),
  Skeleton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Info: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/utils/trpc", () => ({
  trpc: {
    telegram: {
      getChatMember: {
        useQuery: vi.fn(() => ({ data: undefined, isLoading: true })),
      },
    },
  },
}));

vi.mock("@/components/ui/ChatMemberAvatar", () => ({
  default: () => <div data-testid="avatar" />,
}));

vi.mock("../Chat/ShareParticipant", () => ({
  default: ({ userId }: { userId: number }) => (
    <div data-testid={`share-${userId}`} />
  ),
}));

const baseTemplate = {
  id: "tmpl-1",
  chatId: 100,
  payerId: 200,
  description: "Cleaner bill",
  amount: "200",
  currency: "SGD",
  splitMode: "EQUAL" as const,
  participantIds: [200, 300],
  customSplits: null,
  categoryId: "cat-1",
  frequency: "MONTHLY" as const,
  interval: 1,
  weekdays: [],
  startDate: new Date("2026-04-25"),
  endDate: new Date("2026-10-31"),
  timezone: "Asia/Singapore",
  status: "ACTIVE" as const,
};

describe("RecurringExpenseDetailsModal", () => {
  it("renders all five sections when open with shares", () => {
    render(
      <RecurringExpenseDetailsModal
        open
        onOpenChange={() => {}}
        template={baseTemplate}
        shares={[
          { userId: 200, amount: 100 },
          { userId: 300, amount: 100 },
        ]}
        userId={200}
        categoryEmoji="🏠"
        categoryTitle="Home"
        onEdit={() => {}}
      />
    );
    expect(screen.getByText("What was this for?")).toBeDefined();
    expect(screen.getByText("Who paid for this?")).toBeDefined();
    expect(screen.getByText("Split amounts")).toBeDefined();
    expect(screen.getByText("How is this expense split?")).toBeDefined();
    expect(screen.getByText("Schedule")).toBeDefined();
    expect(screen.getByTestId("share-200")).toBeDefined();
    expect(screen.getByTestId("share-300")).toBeDefined();
  });

  it("omits the Split amounts section when there are no shares", () => {
    render(
      <RecurringExpenseDetailsModal
        open
        onOpenChange={() => {}}
        template={baseTemplate}
        shares={[]}
        userId={200}
        categoryEmoji="🏠"
        categoryTitle="Home"
        onEdit={() => {}}
      />
    );
    expect(screen.queryByText("Split amounts")).toBeNull();
  });

  it("renders 'Never' for end date when template has no endDate", () => {
    render(
      <RecurringExpenseDetailsModal
        open
        onOpenChange={() => {}}
        template={{ ...baseTemplate, endDate: null }}
        shares={[]}
        userId={200}
        categoryEmoji="🏠"
        categoryTitle="Home"
        onEdit={() => {}}
      />
    );
    expect(screen.getByText("Never")).toBeDefined();
  });

  it("calls onEdit when pencil clicked", () => {
    const onEdit = vi.fn();
    render(
      <RecurringExpenseDetailsModal
        open
        onOpenChange={() => {}}
        template={baseTemplate}
        shares={[]}
        userId={200}
        categoryEmoji="🏠"
        categoryTitle="Home"
        onEdit={onEdit}
      />
    );
    screen.getByLabelText("Edit recurring template").click();
    expect(onEdit).toHaveBeenCalledOnce();
  });
});
