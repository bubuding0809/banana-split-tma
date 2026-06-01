// apps/web/src/routes/_tma/chat.index.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { Route } from "./chat.index";
import { useStartParams } from "@/hooks";

const mockNavigate = vi.fn();
const mockSetItem = vi.fn();
const mockGetItem = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createFileRoute: () => (config: any) => config,
  useNavigate: () => mockNavigate,
}));

vi.mock("@tanstack/zod-adapter", () => ({
  zodValidator: vi.fn(),
}));

vi.mock("@/hooks", () => ({
  useStartParams: vi.fn(),
}));

vi.mock("@dko/trpc/src/utils/counterpartyDeepLink", () => ({
  uuidToNumericId: () => 9999n,
}));

vi.mock("@/components/features", () => ({
  UserPage: () => <div data-testid="user-page" />,
}));

// Setup global mock for sessionStorage
global.sessionStorage = {
  setItem: mockSetItem,
  getItem: mockGetItem,
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
} as unknown as Storage;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ChatIndexRoute = (Route as any).component;

describe("chat.index Deep Link Routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes private expense deep link to personal tab with selectedExpense", () => {
    mockGetItem.mockReturnValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useStartParams as any).mockReturnValue({
      chat_id: 1234,
      chat_type: "p",
      entity_type: "e",
      entity_id: "expense-uuid-5678",
    });

    render(<ChatIndexRoute />);

    expect(mockSetItem).toHaveBeenCalledWith(
      "deep_link_consumed_expense-uuid-5678",
      "true"
    );
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/chat",
      search: {
        selectedTab: "personal",
        selectedExpense: "expense-uuid-5678",
      },
      replace: true,
    });
  });

  it("routes cross-group counterparty deep link to groups tab with openCounterpartyId", () => {
    mockGetItem.mockReturnValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useStartParams as any).mockReturnValue({
      chat_id: 1234,
      chat_type: "p",
      entity_type: "c",
      entity_id: "counterparty-uuid",
    });

    render(<ChatIndexRoute />);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/chat",
      search: {
        selectedTab: "groups",
        openCounterpartyId: "9999",
      },
      replace: true,
    });
  });

  it("routes private recurring-template deep link to the schedule list with the modal pre-selected", () => {
    mockGetItem.mockReturnValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useStartParams as any).mockReturnValue({
      chat_id: 259941064,
      chat_type: "p",
      entity_type: "rt",
      entity_id: "tmpl-uuid-1234",
    });

    render(<ChatIndexRoute />);

    expect(mockSetItem).toHaveBeenCalledWith(
      "deep_link_consumed_tmpl-uuid-1234",
      "true"
    );
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/chat/$chatId/recurring-expenses",
      params: { chatId: "259941064" },
      search: { selectedTemplate: "tmpl-uuid-1234" },
      replace: true,
    });
  });

  it("does not navigate when the deep link is already consumed", () => {
    mockGetItem.mockReturnValue("true");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useStartParams as any).mockReturnValue({
      chat_id: 259941064,
      chat_type: "p",
      entity_type: "rt",
      entity_id: "tmpl-uuid-1234",
    });

    render(<ChatIndexRoute />);

    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
