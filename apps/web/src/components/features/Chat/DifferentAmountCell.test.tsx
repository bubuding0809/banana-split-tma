import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DifferentAmountCell } from "./DifferentAmountCell";

afterEach(() => cleanup());

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@telegram-apps/sdk-react", () => ({
  hapticFeedback: { impactOccurred: { ifAvailable: vi.fn() } },
}));
vi.mock("@telegram-apps/telegram-ui", () => ({
  Cell: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  Navigation: () => null,
  Text: ({ children }: any) => <span>{children}</span>,
}));

describe("DifferentAmountCell", () => {
  it("ToPay: 'Pay a different amount' opens the form prefilled on step 1", () => {
    render(
      <DifferentAmountCell
        chatId={-100}
        direction="paid"
        counterpartyId={2}
        amount={587.88}
        currency="SGD"
      />
    );
    fireEvent.click(screen.getByText("Pay a different amount"));
    expect(navigate).toHaveBeenCalledWith({
      to: "/chat/$chatId/record-payment",
      params: { chatId: "-100" },
      search: {
        prevTab: "balance",
        currentFormStep: 0,
        direction: "paid",
        counterpartyId: 2,
        amount: 587.88,
        currency: "SGD",
        title: "💸 Record payment",
      },
    });
  });

  it("ToReceive: label reads 'Received a different amount'", () => {
    render(
      <DifferentAmountCell
        chatId={-100}
        direction="received"
        counterpartyId={3}
        amount={12}
        currency="SGD"
      />
    );
    expect(screen.getByText("Received a different amount")).toBeTruthy();
  });
});
