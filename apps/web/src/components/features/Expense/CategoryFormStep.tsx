import { Cell } from "@telegram-apps/telegram-ui";
import { ChevronRight } from "lucide-react";
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
import { UseNavigateResult } from "@tanstack/react-router";

const CategoryFormStep = withForm({
  ...formOpts,
  props: {
    step: 0,
    isLastStep: false,
    navigate: (() => {}) as unknown as UseNavigateResult<
      "/chat/$chatId/add-expense" | "/chat/$chatId/edit-expense/$expenseId"
    >,
    isEditMode: false,
    chatId: 0,
    membersExpanded: false,
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

    // Debounced auto-suggest on description change (400ms). Only fires while the
    // user hasn't manually picked.
    useEffect(() => {
      if (disableAutoAssign) return;
      if (userTouchedRef.current) return;
      if (!description || description.trim().length < 3) return;
      const handle = setTimeout(() => {
        if (userTouchedRef.current) return;
        suggestMutation.mutate(
          { chatId, description },
          {
            onSuccess: (res) => {
              if (userTouchedRef.current) return;
              if (!res.categoryId) return;
              form.setFieldValue("categoryId", res.categoryId);
              setAutoPicked(true);
            },
          }
        );
      }, 400);
      return () => clearTimeout(handle);
      // Intentionally omit suggestMutation/form from deps — re-subscribing on
      // every render would double-fire. The effect depends only on the description
      // and chatId changing.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [description, chatId, disableAutoAssign]);

    return (
      <>
        <Cell
          Component="button"
          onClick={() => setOpen(true)}
          before={<span className="text-xl">{resolved?.emoji ?? "🗂️"}</span>}
          after={
            <div className="flex items-center gap-2">
              {autoPicked && categoryId ? <SparkleBadge /> : null}
              <ChevronRight size={16} />
            </div>
          }
        >
          {resolved?.title ?? "Pick a category"}
        </Cell>

        <CategoryPickerSheet
          open={open}
          onOpenChange={setOpen}
          categories={allCategories}
          selectedId={categoryId}
          onSelect={(c) => {
            userTouchedRef.current = true;
            setAutoPicked(false);
            form.setFieldValue("categoryId", c.id);
            setOpen(false);
          }}
        />
      </>
    );
  },
});

export default CategoryFormStep;
