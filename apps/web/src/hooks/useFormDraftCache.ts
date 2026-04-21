import { useEffect } from "react";
import { saveFormDraft } from "@/utils/formDraft";

// Minimal shape needed to subscribe to a @tanstack/react-form instance —
// avoids pulling the full generic formApi type here. `subscribe`'s return
// differs between @tanstack/store versions (raw unsub fn vs Subscription
// object with `.unsubscribe`) so we treat it as `unknown` and branch.
type FormLike<TValues> = {
  store: {
    subscribe: (fn: () => void) => unknown;
    state: { values: TValues };
  };
};

/**
 * Subscribes to a form's store and persists its current values to
 * sessionStorage under the given key on every change. Pair with
 * `readFormDraft(key)` to hydrate `defaultValues` on mount, and
 * `clearFormDraft(key)` in the submit handler so the draft isn't
 * restored after a successful save.
 */
export function useFormDraftCache<TValues>(
  key: string,
  form: FormLike<TValues>
): void {
  useEffect(() => {
    const result = form.store.subscribe(() => {
      saveFormDraft(key, form.store.state.values);
    });
    // @tanstack/store returns either an unsubscribe fn directly or a
    // Subscription object with an `.unsubscribe` method. Normalize both.
    return () => {
      if (typeof result === "function") {
        result();
      } else if (
        result &&
        typeof (result as { unsubscribe?: () => void }).unsubscribe ===
          "function"
      ) {
        (result as { unsubscribe: () => void }).unsubscribe();
      }
    };
  }, [key, form]);
}

export default useFormDraftCache;
