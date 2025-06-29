import * as React from "react";
import { Text } from "@telegram-apps/telegram-ui";
import { cn } from "@/utils/cn";

export interface ModalHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Whether to show the drag handle bar at the top
   * @default true
   */
  showHandle?: boolean;
  /**
   * Visual variant of the header
   * @default "default"
   */
  variant?: "default" | "compact";
  /**
   * Content to render in the header. If a string is passed, it will be rendered as a Text component.
   * If a React element is passed, it will be rendered as-is.
   */
  children: React.ReactNode;
}

const ModalHeader = React.forwardRef<HTMLDivElement, ModalHeaderProps>(
  (
    { showHandle = true, variant = "default", className, children, ...props },
    ref
  ) => {
    const contentId = React.useId();

    // Check if children is a string to render it as a Text component
    const isStringContent = typeof children === "string";

    return (
      <div
        ref={ref}
        role="banner"
        aria-labelledby={isStringContent ? contentId : undefined}
        className={cn(
          "flex flex-col items-center justify-center rounded-t-2xl",
          variant === "default" ? "py-3" : "py-2",
          className
        )}
        {...props}
      >
        {showHandle && (
          <div
            className={cn(
              "rounded-full bg-zinc-500",
              variant === "default" ? "mb-2 h-1 w-10" : "mb-1.5 h-0.5 w-8"
            )}
            aria-hidden="true"
          />
        )}

        <div className="flex items-center justify-center">
          {isStringContent ? (
            <Text
              id={contentId}
              weight="2"
              className={cn(variant === "compact" && "text-sm")}
            >
              {children}
            </Text>
          ) : (
            children
          )}
        </div>
      </div>
    );
  }
);

ModalHeader.displayName = "ModalHeader";

export default ModalHeader;
