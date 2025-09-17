import { useState, useRef, useLayoutEffect } from "react";

/**
 * Custom hook that tracks the height of an element using ResizeObserver
 * Provides reactive height updates when the element's content changes
 *
 * @returns {object} Object containing:
 *   - height: Current height of the element in pixels
 *   - ref: Ref to attach to the element you want to track
 *
 * @example
 * const { height: cellHeight, ref: cellRef } = useElementHeight();
 *
 * return (
 *   <div ref={cellRef}>
 *     <div style={{ height: cellHeight }}>
 *       Content that matches cell height
 *     </div>
 *   </div>
 * );
 */
export const useElementHeight = () => {
  const [height, setHeight] = useState<number>(0);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Set initial height immediately
    try {
      setHeight(element.offsetHeight);
    } catch (error) {
      console.warn("Failed to get initial element height:", error);
    }

    // Check if ResizeObserver is supported
    if (typeof ResizeObserver === "undefined") {
      console.warn("ResizeObserver is not supported in this browser");
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      // Use offsetHeight for consistent measurement (includes padding/border)
      try {
        if (element) {
          setHeight(element.offsetHeight);
        }
      } catch (error) {
        console.warn("Failed to update element height:", error);
      }
    });

    // Start observing the element
    try {
      resizeObserver.observe(element);
    } catch (error) {
      console.warn("Failed to observe element:", error);
    }

    // Cleanup function
    return () => {
      try {
        resizeObserver.disconnect();
      } catch (error) {
        console.warn("Failed to disconnect ResizeObserver:", error);
      }
    };
  }, []);

  return { height, ref };
};
