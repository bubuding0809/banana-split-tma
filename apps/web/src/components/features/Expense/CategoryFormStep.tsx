import { Cell, Section, Subheadline } from "@telegram-apps/telegram-ui";
import { ChevronRight, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/utils/trpc";
import { resolveCategory, type ChatCategoryRow } from "@repo/categories";
import {
  CategoryPickerSheet,
  SparkleBadge,
} from "@/components/features/Category";
import { withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { useStore } from "@tanstack/react-form";

const CategoryFormStep = withForm({
  ...formOpts,
  props: {
    chatId: 0,
  },
  render: function Render({ form, chatId }) {
    const [open, setOpen] = useState(false);

    // Everything drives off form state — the auto-suggest side effect lives
    // in the parent page via useCategoryAutoSuggest, so this component is
    // purely presentational and can unmount/remount across step navigation
    // without losing any transient UI signal (Auto badge, pending spinner,
    // manual-pick guard).
    const { categoryId, autoPicked, suggestPending } = useStore(
      form.store,
      (state) => ({
        categoryId: state.values.categoryId,
        autoPicked: state.values.autoPicked,
        suggestPending: state.values.suggestPending,
      })
    );

    const { data: cats } = trpc.category.listByChat.useQuery({ chatId });

    const items = cats?.items ?? [];

    const chatRows: ChatCategoryRow[] = useMemo(
      () =>
        items
          .filter((c) => c.kind === "custom")
          .map((c) => ({
            id: c.id.replace(/^chat:/, ""),
            chatId: BigInt(chatId),
            emoji: c.emoji,
            title: c.title,
          })),
      [items, chatId]
    );

    const resolved = useMemo(
      () => resolveCategory(categoryId, chatRows),
      [categoryId, chatRows]
    );

    const allCategories = useMemo(() => items, [items]);

    const footer = suggestPending
      ? "Cooking up a category…"
      : autoPicked && categoryId
        ? "Auto-picked from description. Tap to change."
        : "Helps you track spending by type.";

    return (
      <>
        <div className="flex flex-col gap-2">
          <label className="-top-7 flex w-full justify-between px-2 transition-all duration-500 ease-in-out">
            <Subheadline weight="2">Category</Subheadline>
          </label>
          <Section footer={footer}>
            <Cell
              onClick={() => setOpen(true)}
              before={
                resolved ? (
                  <span className="text-xl leading-none">{resolved.emoji}</span>
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--tg-theme-link-color)_12%,transparent)] text-[var(--tg-theme-link-color)]">
                    <Plus size={16} />
                  </span>
                )
              }
              after={
                <div className="flex items-center gap-2">
                  {suggestPending ? (
                    <SparkleBadge pending />
                  ) : autoPicked && categoryId ? (
                    <SparkleBadge />
                  ) : null}
                  {resolved ? (
                    <span
                      role="button"
                      aria-label="Clear category"
                      onClick={(e) => {
                        // Prevent the parent Cell's onClick (which opens the
                        // picker) from firing when the user taps the clear X.
                        e.stopPropagation();
                        form.setFieldValue("userTouchedCategory", true);
                        form.setFieldValue("autoPicked", false);
                        form.setFieldValue("categoryId", null);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--tg-theme-subtitle-text-color)]"
                      style={{
                        backgroundColor: "rgba(127, 127, 127, 0.25)",
                      }}
                    >
                      <X size={14} />
                    </span>
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </div>
              }
            >
              <span
                style={{
                  color: resolved
                    ? "var(--tg-theme-text-color)"
                    : "var(--tg-theme-link-color)",
                }}
              >
                {resolved?.title ?? "Pick a category"}
              </span>
            </Cell>
          </Section>
        </div>

        <CategoryPickerSheet
          open={open}
          onOpenChange={setOpen}
          categories={allCategories}
          selectedId={categoryId}
          onSelect={(c) => {
            // includeNoneOption is not set here, so c.id is always a real
            // category id — clearing is done via the X button on the cell.
            form.setFieldValue("userTouchedCategory", true);
            form.setFieldValue("autoPicked", false);
            form.setFieldValue("categoryId", c.id);
            setOpen(false);
          }}
        />
      </>
    );
  },
});

export default CategoryFormStep;
