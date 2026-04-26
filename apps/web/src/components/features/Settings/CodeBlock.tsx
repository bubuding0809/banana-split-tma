interface CodeBlockProps {
  children: string;
  /** Wrap long lines for prose-heavy content. */
  wrap?: boolean;
}

export default function CodeBlock({ children, wrap }: CodeBlockProps) {
  return (
    <pre
      className={`overflow-x-auto px-4 py-3 font-mono text-xs ${
        wrap ? "whitespace-pre-wrap break-all" : ""
      }`}
    >
      {children}
    </pre>
  );
}
