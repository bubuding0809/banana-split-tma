import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import GroupActionButtons from "./GroupActionButtons";

afterEach(() => cleanup());

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, search }: any) => (
    <a data-to={to} data-title={search?.title}>
      {children}
    </a>
  ),
}));
vi.mock("@telegram-apps/sdk-react", () => ({
  hapticFeedback: { impactOccurred: vi.fn() },
  themeParams: { buttonTextColor: {}, buttonColor: {}, secondaryBgColor: {} },
  useSignal: vi.fn(() => "#000"),
}));
vi.mock("@telegram-apps/telegram-ui", () => ({
  Button: ({ children }: any) => <span>{children}</span>,
}));

describe("GroupActionButtons", () => {
  it("renders Add expense and Payment links side by side", () => {
    render(<GroupActionButtons chatId={-100} selectedTab="balance" />);
    const add = screen.getByText("Add expense").closest("a")!;
    const pay = screen.getByText("💸 Payment").closest("a")!;
    expect(add.getAttribute("data-to")).toBe("/chat/$chatId/add-expense");
    expect(pay.getAttribute("data-to")).toBe("/chat/$chatId/record-payment");
    expect(pay.getAttribute("data-title")).toBe("💸 Record payment");
  });
});
