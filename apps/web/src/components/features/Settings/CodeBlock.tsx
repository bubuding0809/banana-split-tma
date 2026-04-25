import { themeParams, useSignal } from "@telegram-apps/sdk-react";

interface CodeBlockProps {
  children: string;
  /** Wrap long lines for prose-heavy content. */
  wrap?: boolean;
}

export default function CodeBlock({ children, wrap }: CodeBlockProps) {
  const tSecondaryBackgroundColor = useSignal(
    themeParams.secondaryBackgroundColor
  );
  const tSectionSeparatorColor = useSignal(themeParams.sectionSeparatorColor);
  return (
    <pre
      className={`overflow-x-auto px-4 py-3 font-mono text-xs ${
        wrap ? "whitespace-pre-wrap break-all" : ""
      }`}
      style={{
        background: tSecondaryBackgroundColor,
        borderTop: `1px solid ${tSectionSeparatorColor ?? "transparent"}`,
        borderBottom: `1px solid ${tSectionSeparatorColor ?? "transparent"}`,
      }}
    >
      {children}
    </pre>
  );
}
