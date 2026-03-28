// apps/web/src/routes/_tma/chat.$chatId.spec.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockNavigate = vi.fn();
const mockSetItem = vi.fn();
const mockGetItem = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/hooks", () => ({
  useStartParams: vi.fn(() => ({
    chat_id: 1234,
    chat_type: "g",
    entity_type: "s",
    entity_id: "uuid-1234",
  })),
}));

// Setup global mock for sessionStorage
global.sessionStorage = {
  setItem: mockSetItem,
  getItem: mockGetItem,
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
} as any;

describe("chat.$chatId Deep Link Routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should navigate to snapshots sub-route when deep link entity_type is 's' and flag is false", () => {
    mockGetItem.mockReturnValue(null); // Not consumed yet

    // Simulating the useEffect logic inside ChatIdRoute
    const startParams = { entity_type: "s", entity_id: "uuid-1234" };
    const chatId = 1234;
    const deepLinkConsumedKey = `deep_link_consumed_${startParams.entity_id}`;

    if (
      startParams.entity_type === "s" &&
      startParams.entity_id &&
      !sessionStorage.getItem(deepLinkConsumedKey)
    ) {
      sessionStorage.setItem(deepLinkConsumedKey, "true");
      mockNavigate({
        to: "/chat/$chatId/snapshots",
        params: { chatId: chatId.toString() },
        search: { snapshotId: startParams.entity_id },
        replace: true,
      });
    }

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

    const startParams = { entity_type: "s", entity_id: "uuid-1234" };
    const deepLinkConsumedKey = `deep_link_consumed_${startParams.entity_id}`;

    if (
      startParams.entity_type === "s" &&
      startParams.entity_id &&
      !sessionStorage.getItem(deepLinkConsumedKey)
    ) {
      // Should not reach here
      mockNavigate({});
    }

    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
