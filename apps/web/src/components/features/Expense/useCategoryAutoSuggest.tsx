import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "@tanstack/react-form";
import { Snackbar } from "@telegram-apps/telegram-ui";
import { resolveCategory, type ChatCategoryRow } from "@repo/categories";
import { trpc } from "@/utils/trpc";

/**
 * Runs the category auto-suggest side effect at the parent-page scope so the
 * 300ms debounce and the in-flight mutation survive step navigation inside
 * the add/edit flow. (CategoryFormStep unmounts on Next — if the effect lived
 * there, clearTimeout in the cleanup would kill any pending suggest and a
 * user who typed + pressed Next within 300ms would never get an auto-pick.)
 *
 * The form holds three UI flags the hook reads + writes:
 * - `autoPicked` — true when the current categoryId came from a classifier
 *   response (drives the Auto sparkle badge).
 * - `userTouchedCategory` — true once the user manually picks (disables
 *   further auto-suggest).
 * - `suggestPending` — mirrors the mutation's isPending so CategoryFormStep
 *   (which uses its own useMutation instance would give a divergent view)
 *   can drive the loading indicator off form state.
 */
// The hook is intentionally permissive about the form's concrete type: the
// exact useAppForm<formOpts> return is intricate and ends up fighting
// contravariance when constrained here. The hook only ever runs against the
// add/edit-expense form, which owns the fields it reads/writes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExpenseForm = any;

export function useCategoryAutoSuggest({
  form,
  chatId,
  disableAutoAssign,
}: {
  form: ExpenseForm;
  chatId: number;
  disableAutoAssign?: boolean;
}): { snackbar: ReactNode } {
  type FormState = {
    values: {
      description: string;
      categoryId: string | null;
      userTouchedCategory: boolean;
    };
  };
  const { description, categoryId, userTouchedCategory } = useStore(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    form.store as any,
    (state: unknown) => {
      const s = state as FormState;
      return {
        description: s.values.description,
        categoryId: s.values.categoryId,
        userTouchedCategory: s.values.userTouchedCategory,
      };
    }
  );

  // Used to resolve the classifier's bare categoryId into an emoji + title
  // pair for the confirmation snackbar below.
  const { data: categoriesData } = trpc.category.listByChat.useQuery({
    chatId,
  });
  const chatRows = useMemo<ChatCategoryRow[]>(
    () =>
      (categoriesData?.items ?? [])
        .filter((c) => c.kind === "custom")
        .map((c) => ({
          id: c.id.replace(/^chat:/, ""),
          chatId: BigInt(chatId),
          emoji: c.emoji,
          title: c.title,
        })),
    [categoriesData, chatId]
  );

  const [snackbarText, setSnackbarText] = useState<string | null>(null);

  const suggestMutation = trpc.category.suggest.useMutation({
    onMutate: () => {
      form.setFieldValue("suggestPending", true);
    },
    onSettled: () => {
      form.setFieldValue("suggestPending", false);
    },
  });

  // Monotonic request id — protects against stale responses when a slower
  // request resolves after a faster, newer one.
  const latestRequestRef = useRef(0);

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
            if (requestId !== latestRequestRef.current) return;
            if (form.getFieldValue("userTouchedCategory")) return;
            if (!res.categoryId) return;
            form.setFieldValue("categoryId", res.categoryId);
            form.setFieldValue("autoPicked", true);
            // Surface a short confirmation so the user sees the category
            // arrived — easy to miss otherwise since the picker cell lives
            // on a later step.
            const resolved = resolveCategory(res.categoryId, chatRows);
            if (resolved) {
              setSnackbarText(
                `Auto-picked ${resolved.emoji} ${resolved.title}`
              );
            }
          },
        }
      );
    }, 300);
    return () => clearTimeout(handle);
    // suggestMutation / form intentionally omitted — their identity changes on
    // every render and would cause the timer to reset every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, chatId, disableAutoAssign, categoryId, userTouchedCategory]);

  const snackbar = snackbarText ? (
    <Snackbar
      duration={3000}
      onClose={() => setSnackbarText(null)}
      description="Tap the Category step to change."
    >
      {snackbarText}
    </Snackbar>
  ) : null;

  return { snackbar };
}
