import { Cell, Section } from "@telegram-apps/telegram-ui";
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
    const [autoPicked, setAutoPicked] = useState(false);
    const userTouchedRef = useRef(false);

    const { description, categoryId } = useStore(form.store, (state) => ({
      description: state.values.description,
      categoryId: state.values.categoryId,
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

    // Debounced auto-suggest on description change (500ms). Only fires while the
    // user hasn't manually picked.
    useEffect(() => {
      if (disableAutoAssign) return;
      if (userTouchedRef.current) return;
      if (!description || description.trim().length < 3) return;
      const handle = setTimeout(() => {
        if (userTouchedRef.current) return;
        const requestId = ++latestRequestRef.current;
        suggestMutation.mutate(
          { chatId, description },
          {
            onSuccess: (res) => {
              // Drop stale responses: if a newer request has fired, ignore.
              if (requestId !== latestRequestRef.current) return;
              if (userTouchedRef.current) return;
              if (!res.categoryId) return;
              form.setFieldValue("categoryId", res.categoryId);
              setAutoPicked(true);
            },
          }
        );
      }, 500);
      return () => clearTimeout(handle);
      // Intentionally omit suggestMutation/form from deps — re-subscribing on
      // every render would double-fire. The effect depends only on the description
      // and chatId changing.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [description, chatId, disableAutoAssign]);

    const footer = suggestMutation.isPending
      ? "Cooking up a category…"
      : autoPicked && categoryId
        ? "Auto-picked from description. Tap to change."
        : "Helps you track spending by type.";

    return (
      <>
        <Section header="Category" footer={footer}>
          <Cell
            Component="button"
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

        <CategoryPickerSheet
          open={open}
          onOpenChange={setOpen}
          categories={allCategories}
          selectedId={categoryId}
          includeNoneOption
          onSelect={(c) => {
            userTouchedRef.current = true;
            // Bump the request id so any in-flight suggest's onSuccess is dropped.
            latestRequestRef.current += 1;
            setAutoPicked(false);
            form.setFieldValue("categoryId", c.id === "none" ? null : c.id);
            setOpen(false);
          }}
        />
      </>
    );
  },
});

export default CategoryFormStep;
