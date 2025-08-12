import { useRef } from "react";
import {
  ANIMATION_DURATIONS,
  SCROLL_MARGINS,
  FALLBACK_COLORS,
  CSS_CLASSES,
} from "@/constants/ui";

interface UseTransactionHighlightReturn {
  highlightTransactions: (
    transactionIds: string[],
    scrollToFirst?: boolean
  ) => void;
  clearAllHighlights: () => void;
}

/**
 * Hook for managing transaction highlighting and scrolling behavior
 */
export const useTransactionHighlight = (
  themeButtonColor?: string
): UseTransactionHighlightReturn => {
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearAllHighlights = () => {
    // Clear any existing timeout
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }

    // Remove highlight classes from all transaction elements
    document.querySelectorAll("[data-transaction-id]").forEach((el) => {
      const element = el as HTMLElement;
      element.classList.remove(...CSS_CLASSES.HIGHLIGHT);
      element.style.outlineColor = "";
    });
  };

  const scrollToTransaction = (transactionId: string) => {
    const element = document.querySelector(
      `[data-transaction-id="${transactionId}"]`
    ) as HTMLElement;

    if (element) {
      // Apply scroll margin for better visual positioning
      element.style.scrollMarginTop = SCROLL_MARGINS.TOP;

      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return element;
    }

    return null;
  };

  const scrollToMonthFallback = (dateKey: string) => {
    const monthKey = dateKey.substring(0, 7); // YYYY-MM
    const monthElement = document.querySelector(
      `[data-month-key="${monthKey}"]`
    );

    if (monthElement) {
      monthElement.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const highlightTransactions = (
    transactionIds: string[],
    scrollToFirst = true
  ) => {
    // Clear any existing highlights
    clearAllHighlights();

    if (transactionIds.length === 0) return;

    // Scroll to the first (most recent) transaction if requested
    let scrollTarget: HTMLElement | null = null;
    if (scrollToFirst) {
      scrollTarget = scrollToTransaction(transactionIds[0]);
    }

    // Highlight all transactions for the selected date
    const highlightedElements: Element[] = [];
    transactionIds.forEach((transactionId) => {
      const element = document.querySelector(
        `[data-transaction-id="${transactionId}"]`
      );

      if (element) {
        highlightedElements.push(element);

        // Add highlight animation classes
        element.classList.add(...CSS_CLASSES.HIGHLIGHT);

        // Set dynamic outline color from Telegram theme
        (element as HTMLElement).style.outlineColor =
          themeButtonColor || FALLBACK_COLORS.HIGHLIGHT;
      }
    });

    // If we couldn't scroll to a transaction, try scrolling to the month
    if (scrollToFirst && !scrollTarget && transactionIds[0]) {
      // Extract date from first transaction ID (assuming it's available in DOM)
      const firstElement = document.querySelector(
        `[data-transaction-id="${transactionIds[0]}"]`
      );
      if (firstElement) {
        const dateKey = firstElement.getAttribute("data-date-key");
        if (dateKey) {
          scrollToMonthFallback(dateKey);
        }
      }
    }

    // Remove highlights after animation duration
    if (highlightedElements.length > 0) {
      highlightTimeoutRef.current = setTimeout(() => {
        highlightedElements.forEach((element) => {
          element.classList.remove(...CSS_CLASSES.HIGHLIGHT);
          (element as HTMLElement).style.outlineColor = "";
        });
        highlightTimeoutRef.current = null;
      }, ANIMATION_DURATIONS.HIGHLIGHT);
    }
  };

  return {
    highlightTransactions,
    clearAllHighlights,
  };
};
