import { test, expect } from "@playwright/experimental-ct-react";
import CategoryPickerSheet from "./CategoryPickerSheet";

const categories = [
  { id: "base:food", emoji: "🍜", title: "Food", kind: "base" as const },
  { id: "chat:abc", emoji: "🏖️", title: "Bali", kind: "custom" as const },
];

test("renders base and custom sections and selects on click", async ({
  mount,
}) => {
  let selected: { id: string } | null = null as { id: string } | null;
  const component = await mount(
    <CategoryPickerSheet
      open
      onOpenChange={() => {}}
      categories={categories}
      onSelect={(c) => {
        selected = c;
      }}
    />
  );
  await expect(component.getByText("Custom")).toBeVisible();
  await expect(component.getByText("Base")).toBeVisible();
  await component.getByText("Bali").click();
  expect(selected?.id).toBe("chat:abc");
});

test("shows create-custom button when handler is provided", async ({
  mount,
}) => {
  let createCalled = false;
  const component = await mount(
    <CategoryPickerSheet
      open
      onOpenChange={() => {}}
      categories={categories}
      onSelect={() => {}}
      onCreateCustom={() => {
        createCalled = true;
      }}
    />
  );
  await component.getByText("Create custom category").click();
  expect(createCalled).toBe(true);
});
