import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import BalanceSplitBar, { computeBalanceTotals } from "./BalanceSplitBar";

afterEach(() => cleanup());

vi.mock("@telegram-apps/sdk-react", () => ({
  useSignal: () => undefined,
  themeParams: {},
}));
vi.mock("@telegram-apps/telegram-ui", () => ({
  Skeleton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("computeBalanceTotals", () => {
  it("splits nets into owe and owed without float drift", () => {
    expect(computeBalanceTotals([-31.81, -2.94, 2408.29, 0.1, 0.2])).toEqual({
      owe: 34.75,
      owed: 2408.59,
      net: 2373.84,
    });
  });

  it("returns zeros for no counterparties", () => {
    expect(computeBalanceTotals([])).toEqual({ owe: 0, owed: 0, net: 0 });
  });
});

describe("BalanceSplitBar", () => {
  it("shows signed net and both ends", () => {
    render(<BalanceSplitBar nets={[-34.75, 5073.64]} currency="SGD" />);
    expect(screen.getByTestId("balance-net").textContent).toBe("+5,038.89");
    expect(screen.getByTestId("balance-owe").textContent).toBe("−34.75");
    expect(screen.getByTestId("balance-owed").textContent).toBe("+5,073.64");
    expect(screen.getByText("SGD")).toBeTruthy();
  });

  it("shows a negative net when the user owes more", () => {
    render(<BalanceSplitBar nets={[-58.2]} currency="SGD" />);
    expect(screen.getByTestId("balance-net").textContent).toBe("−58.20");
    expect(screen.getByTestId("balance-owed").textContent).toBe("0.00");
  });

  it("normalises slice flex-grow so sub-1 totals still fill the track", () => {
    render(<BalanceSplitBar nets={[-0.3, 0.2]} currency="SGD" />);
    expect(screen.getByTestId("balance-owe-slice").style.flexGrow).toBe("60");
    expect(screen.getByTestId("balance-owed-slice").style.flexGrow).toBe("40");
  });

  it("does not sign a net that rounds to 0.00", () => {
    render(<BalanceSplitBar nets={[-1, 1.004]} currency="SGD" />);
    expect(screen.getByTestId("balance-net").textContent).toBe("0.00");
  });

  it("shows zero net when settled", () => {
    render(<BalanceSplitBar nets={[]} currency="SGD" />);
    expect(screen.getByTestId("balance-net").textContent).toBe("0.00");
  });
});
