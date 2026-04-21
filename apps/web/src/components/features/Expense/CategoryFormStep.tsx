import { Cell, Section, Subheadline } from "@telegram-apps/telegram-ui";
import { ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
    disableAutoAssign: false as boolean | undefined,
  },
  render: function Render({ form, chatId, disableAutoAssign }) {
    const [open, setOpen] = useState(false);

    // `autoPicked` and `userTouchedCategory` live in form state rather than
    // local useState/useRef because CategoryFormStep unmounts on step
    // navigation — locals would reset each time and the Auto badge / manual
    // override intent would be lost. The form persists for the full add/edit
    // lifetime. Submit handlers cherry-pick fields by name so these flags
    // don't leak to the API.
    const { description, categoryId, autoPicked, userTouchedCategory } =
      useStore(form.store, (state) => ({
        description: state.values.description,
        categoryId: state.values.categoryId,
        autoPicked: state.values.autoPicked,
        userTouchedCategory: state.values.userTouchedCategory,
      }));

    const { data: cats } = trpc.category.listByChat.useQuery({ chatId });

    const chatRows: ChatCategoryRow[] = useMemo(
      () =>
        (cats?.custom ?? []).map((c) => ({
          id: c.id.replace(/^chat:/, ""),
          chatId: BigInt(chatId),
          emoji: c.emoji,
          title: c.title,
        })),
      [cats?.custom, chatId]
    );

    const resolved = useMemo(
      () => resolveCategory(categoryId, chatRows),
      [categoryId, chatRows]
    );

    const allCategories = useMemo(
      () => [...(cats?.base ?? []), ...(cats?.custom ?? [])],
      [cats]
    );

    const suggestMutation = trpc.category.suggest.useMutation();
    // Monotonic request id — protects against stale responses when a slow
    // request resolves after a faster, newer one.
    const latestRequestRef = useRef(0);

    // Debounced auto-suggest on description change (300ms). Only fires while
    // the user hasn't manually picked and nothing is already set. Both guards
    // now read from form state so they survive step navigation.
    useEffect(() => {
      if (disableAutoAssign) return;
      if (userTouchedCategory) return;
      if (categoryId) return;
      if (!description || description.trim().length < 3) return;
      const handle = setTimeout(() => {
        const requestId = ++latestRequestRef.current;
        suggestMutation.mutate(
          { chatId, description },
          {
            onSuccess: (res) => {
              // Drop stale responses: if a newer request has fired, ignore.
              if (requestId !== latestRequestRef.current) return;
              // Re-read touched flag at resolve time — user may have picked
              // manually during the in-flight call.
              if (form.getFieldValue("userTouchedCategory")) return;
              if (!res.categoryId) return;
              form.setFieldValue("categoryId", res.categoryId);
              form.setFieldValue("autoPicked", true);
            },
          }
        );
      }, 300);
      return () => clearTimeout(handle);
      // Intentionally omit suggestMutation/form from deps — re-subscribing on
      // every render would double-fire.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      description,
      chatId,
      disableAutoAssign,
      categoryId,
      userTouchedCategory,
    ]);

    const footer = suggestMutation.isPending
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
                  {suggestMutation.isPending ? (
                    <SparkleBadge pending />
                  ) : autoPicked && categoryId ? (
                    <SparkleBadge />
                  ) : null}
                  <ChevronRight size={16} />
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
          includeNoneOption
          onSelect={(c) => {
            // Bump the request id so any in-flight suggest's onSuccess is dropped.
            latestRequestRef.current += 1;
            form.setFieldValue("userTouchedCategory", true);
            form.setFieldValue("autoPicked", false);
            form.setFieldValue("categoryId", c.id === "none" ? null : c.id);
            setOpen(false);
          }}
        />
      </>
    );
  },
});

export default CategoryFormStep;
