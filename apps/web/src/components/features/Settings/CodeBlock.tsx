import { themeParams, useSignal } from "@telegram-apps/sdk-react";

interface CodeBlockProps {
  children: string;
  /** Wrap long lines for prose-heavy content. */
  wrap?: boolean;
}

// Inside a Modal the section background isn't auto-applied to children, so
// the code block has to opt in to sectionBackgroundColor — same approach
// ExpenseDetailsModal uses for its Cells.
export default function CodeBlock({ children, wrap }: CodeBlockProps) {
  const tSectionBackgroundColor = useSignal(themeParams.sectionBackgroundColor);
  return (
    <pre
      className={`overflow-x-auto px-4 py-3 font-mono text-xs ${
        wrap ? "whitespace-pre-wrap break-all" : ""
      }`}
      style={{ background: tSectionBackgroundColor }}
    >
      {children}
    </pre>
  );
}
