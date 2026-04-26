import { test, expect } from "@playwright/experimental-ct-react";
import AddMemberSheet from "./AddMemberSheet";

test("renders the new add-member CTA copy", async ({ mount }) => {
  const component = await mount(
    <AddMemberSheet chatId={-1001234567890} open onOpenChange={() => {}} />
  );
  await expect(component.getByText("Open bot DM")).toBeVisible();
  await expect(component.getByText("Cancel")).toBeVisible();
  // No more "coming soon" / placeholder copy
  await expect(component.getByText(/coming soon/i)).toHaveCount(0);
});

test("calls onOpenChange(false) when Cancel is clicked", async ({ mount }) => {
  let lastOpen: boolean | null = null;
  const component = await mount(
    <AddMemberSheet
      chatId={-1001234567890}
      open
      onOpenChange={(v) => {
        lastOpen = v;
      }}
    />
  );
  await component.getByText("Cancel").click();
  expect(lastOpen).toBe(false);
});
