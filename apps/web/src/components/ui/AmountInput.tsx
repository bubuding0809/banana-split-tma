import { useEffect, useRef, useState, forwardRef } from "react";
import { cn } from "@utils/cn";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import type { ReactNode } from "react";

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  placeholder?: string;
  hasError?: boolean;
  autoFocus?: boolean;
  className?: string;
  textAlign?: "left" | "right";
  before?: ReactNode;
  after?: ReactNode;
  autoScale?: boolean;
  fixedFontSize?: `${number}px`;
}

const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  (
    {
      value,
      onChange,
      onBlur,
      onFocus,
      placeholder = "0",
      hasError = false,
      autoFocus = false,
      className,
      textAlign = "left",
      before,
      after,
      autoScale = true,
      fixedFontSize = "16px",
    },
    ref
  ) => {
    const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
    const isDarkMode = useSignal(themeParams.isDark);

    const [containerWidth, setContainerWidth] = useState(0);
    const measureRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const beforeRef = useRef<HTMLDivElement>(null);
    const afterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      // Only set up ResizeObserver if autoScaling is enabled
      if (!autoScale || !measureRef.current) return;

      const resizeObserver = new ResizeObserver((entries) => {
        setContainerWidth(entries[0].contentRect.width);
      });

      resizeObserver.observe(measureRef.current);
      return () => resizeObserver.disconnect();
    }, [autoScale]);

    const handleAmountChange = (inputValue: string) => {
      const cleanValue = inputValue.replace(/[^\d.]/g, "");
      const parts = cleanValue.split(".");
      if (parts.length > 2) return;

      let [wholeNumber] = parts;
      if (wholeNumber.length > 10) {
        wholeNumber = wholeNumber.slice(0, 10);
      }

      let decimal = "";
      if (parts.length === 2) {
        decimal = `.${parts[1].slice(0, 2)}`;
      }

      return wholeNumber + decimal;
    };

    const measureContentWidth = (ref: React.RefObject<HTMLElement | null>) => {
      if (!ref.current) return 0;
      return ref.current.offsetWidth + 8; // Include margin spacing
    };

    const getFontSize = (amount: string) => {
      // If autoscaling is disabled, use fixed font size
      if (!autoScale) {
        return fixedFontSize;
      }

      // Dynamic scaling logic
      const testDiv = document.createElement("div");
      testDiv.style.fontSize = "60px";
      testDiv.style.fontWeight = "300";
      testDiv.style.position = "absolute";
      testDiv.style.visibility = "hidden";
      testDiv.style.whiteSpace = "nowrap";
      testDiv.textContent = amount || "0";
      document.body.appendChild(testDiv);

      const textWidth = testDiv.offsetWidth;
      document.body.removeChild(testDiv);

      // Calculate available width by subtracting before/after content widths
      const beforeWidth = measureContentWidth(beforeRef);
      const afterWidth = measureContentWidth(afterRef);
      const reservedWidth = beforeWidth + afterWidth + 32; // Include padding
      const availableWidth = containerWidth - reservedWidth;

      if (textWidth <= availableWidth || availableWidth <= 0) return "60px";

      const ratio = availableWidth / textWidth;
      const fontSize = Math.max(28, Math.floor(60 * ratio));

      if (fontSize >= 55) return "60px";
      if (fontSize >= 45) return "48px";
      if (fontSize >= 35) return "40px";
      if (fontSize >= 28) return "32px";
      return "28px";
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const processedValue = handleAmountChange(e.target.value);
      if (processedValue === undefined) return;
      if (processedValue === "" || !isNaN(Number(processedValue))) {
        onChange(processedValue);
      }
    };

    return (
      <div
        className={cn(
          "flex flex-1 items-baseline overflow-hidden rounded-xl p-2 px-4",
          hasError && "ring-2 ring-red-600",
          className
        )}
        style={{
          backgroundColor: isDarkMode ? "#212121" : tSectionBgColor,
        }}
        ref={measureRef}
        data-amount-input
      >
        <div className="flex w-full items-baseline">
          {before && (
            <div ref={beforeRef} className="mr-2 flex-shrink-0">
              {before}
            </div>
          )}
          <input
            onFocus={onFocus}
            ref={ref || inputRef}
            type="text"
            inputMode="decimal"
            value={value}
            onBlur={onBlur}
            tabIndex={0}
            autoFocus={autoFocus}
            onChange={handleInputChange}
            placeholder={placeholder}
            className={cn(
              "w-full flex-1 bg-transparent focus:outline-none",
              hasError && "text-red-600",
              textAlign === "right" && "text-right"
            )}
            style={{
              fontSize: getFontSize(value),
              padding: "0",
              margin: "0",
            }}
          />
          {after && (
            <div ref={afterRef} className="ml-2 flex-shrink-0">
              {after}
            </div>
          )}
        </div>
      </div>
    );
  }
);

AmountInput.displayName = "AmountInput";

export default AmountInput;
