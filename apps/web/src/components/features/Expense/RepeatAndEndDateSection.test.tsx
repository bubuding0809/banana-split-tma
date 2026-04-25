import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import RepeatAndEndDateSection from "./RepeatAndEndDateSection";

vi.mock("@telegram-apps/sdk-react", () => ({
  hapticFeedback: { impactOccurred: vi.fn(), selectionChanged: vi.fn() },
  themeParams: {
    subtitleTextColor: { sub: vi.fn(() => () => {}) },
    buttonColor: { sub: vi.fn(() => () => {}) },
    buttonTextColor: { sub: vi.fn(() => () => {}) },
    linkColor: { sub: vi.fn(() => () => {}) },
  },
  useSignal: vi.fn(() => "#888888"),
}));

vi.mock("@telegram-apps/telegram-ui", () => ({
  Cell: ({
    children,
    after,
  }: {
    children?: React.ReactNode;
    after?: React.ReactNode;
  }) => (
    <div data-testid="cell">
      {children}
      {after}
    </div>
  ),
  Text: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Modal: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Section: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Title: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  IconButton: ({ children }: { children?: React.ReactNode }) => (
    <button>{children}</button>
  ),
  Navigation: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

afterEach(cleanup);

describe("RepeatAndEndDateSection", () => {
  it("renders the Repeat row with the preset label", () => {
    render(
      <RepeatAndEndDateSection
        value={{
          preset: "MONTHLY",
          customFrequency: "WEEKLY",
          customInterval: 1,
          weekdays: [],
          endDate: undefined,
        }}
        onChange={() => {}}
      />
    );
    expect(screen.getAllByText("Repeat").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Monthly/).length).toBeGreaterThan(0);
  });

  it("renders the End Date row when preset is not NONE", () => {
    render(
      <RepeatAndEndDateSection
        value={{
          preset: "MONTHLY",
          customFrequency: "WEEKLY",
          customInterval: 1,
          weekdays: [],
          endDate: undefined,
        }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("End Date")).toBeDefined();
  });

  it("hides the End Date row when preset is NONE", () => {
    render(
      <RepeatAndEndDateSection
        value={{
          preset: "NONE",
          customFrequency: "WEEKLY",
          customInterval: 1,
          weekdays: [],
          endDate: undefined,
        }}
        onChange={() => {}}
      />
    );
    expect(screen.queryByText("End Date")).toBeNull();
  });
});
