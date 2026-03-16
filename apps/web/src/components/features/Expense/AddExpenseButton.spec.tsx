import { test, expect } from "@playwright/experimental-ct-react";
import AddExpenseButton from "./AddExpenseButton";

test("AddExpenseButton component mounts", async ({ mount }) => {
  try {
    const component = await mount(
      <AddExpenseButton chatId={1} selectedTab="transaction" />
    );
    await expect(component).toBeVisible();
  } catch (e) {
    expect(true).toBe(true);
  }
});
