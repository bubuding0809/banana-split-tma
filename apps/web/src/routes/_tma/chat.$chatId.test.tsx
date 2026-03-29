// apps/web/src/routes/_tma/chat.$chatId.spec.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { Route } from "./chat.$chatId";
import { useStartParams } from "@/hooks";

const mockNavigate = vi.fn();
const mockSetItem = vi.fn();
const mockGetItem = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createFileRoute: () => (config: any) => config,
  useNavigate: () => mockNavigate,
}));

vi.mock("@/hooks", () => ({
  useStartParams: vi.fn(),
}));

vi.mock("@/utils/trpc", () => ({
  trpc: {
    chat: {
      getChat: {
        useQuery: vi.fn(() => ({ data: undefined, status: "pending" })),
      },
    },
  },
}));

vi.mock("@components/features", () => ({
  GroupPage: () => <div data-testid="group-page" />,
}));

vi.mock("@/components/features/Chat/InvalidChatScreen", () => ({
  default: () => <div data-testid="invalid-chat" />,
}));

vi.mock("@telegram-apps/telegram-ui", () => ({
  Caption: () => <span />,
  Spinner: () => <span />,
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
const ChatIdRoute = (Route as any).component;

describe("chat.$chatId Deep Link Routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should navigate to snapshots sub-route when deep link entity_type is 's' and flag is false", () => {
    mockGetItem.mockReturnValue(null); // Not consumed yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useStartParams as any).mockReturnValue({
      chat_id: "1234",
      entity_type: "s",
      entity_id: "uuid-1234",
    });

    render(<ChatIdRoute />);

    expect(mockSetItem).toHaveBeenCalledWith(
      "deep_link_consumed_uuid-1234",
      "true"
    );
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/chat/$chatId/snapshots",
      params: { chatId: "1234" },
      search: { snapshotId: "uuid-1234" },
      replace: true,
    });
  });

  it("should not navigate if deep link is already consumed", () => {
    mockGetItem.mockReturnValue("true"); // Already consumed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useStartParams as any).mockReturnValue({
      chat_id: "1234",
      entity_type: "s",
      entity_id: "uuid-1234",
    });

    render(<ChatIdRoute />);

    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
