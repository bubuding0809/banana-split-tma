export interface AllowedCategory {
  id: string;
  emoji: string;
  title: string;
  keywords?: readonly string[];
}

export interface FewShot {
  description: string;
  categoryId: string;
}

export const FEW_SHOTS: FewShot[] = [
  { description: "biryani lunch", categoryId: "base:food" },
  { description: "grab to airport", categoryId: "base:transport" },
  { description: "netflix subscription", categoryId: "base:entertainment" },
  { description: "airbnb bali deposit", categoryId: "base:travel" },
  { description: "electricity bill", categoryId: "base:utilities" },
  { description: "ntuc groceries", categoryId: "base:groceries" },
  { description: "random cash", categoryId: "none" },
];

export function buildClassifierPrompt(args: {
  description: string;
  allowed: AllowedCategory[];
}): string {
  const catalog = args.allowed
    .map((c) => {
      const kw = c.keywords?.length
        ? ` — keywords: ${c.keywords.slice(0, 10).join(", ")}`
        : "";
      return `- ${c.id} ${c.emoji} ${c.title}${kw}`;
    })
    .join("\n");

  const shots = FEW_SHOTS.map(
    (s) => `description: ${JSON.stringify(s.description)} → ${s.categoryId}`
  ).join("\n");

  return [
    'You classify a short expense description into exactly one category id from the allowed list, or return "none" if no category fits.',
    "",
    "Allowed categories:",
    catalog,
    "",
    "Rules:",
    '- Return an id from the allowed list or "none".',
    "- Prefer custom categories (id starting with chat:) over base ones when the description matches a custom title or theme.",
    '- Return a confidence between 0 and 1. If confidence < 0.4, return "none".',
    "",
    "Examples:",
    shots,
    "",
    `Description: ${JSON.stringify(args.description)}`,
  ].join("\n");
}
