import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

// BASE_CATEGORIES inlined from @repo/categories to avoid a circular dep:
//   @dko/trpc -> @repo/categories -> @repo/agent -> @dko/trpc
interface BaseCategory {
  id: `base:${string}`;
  emoji: string;
  title: string;
  keywords: readonly string[];
}

const BASE_CATEGORIES: readonly BaseCategory[] = [
  {
    id: "base:food",
    emoji: "🍜",
    title: "Food",
    keywords: [
      "lunch",
      "dinner",
      "breakfast",
      "brunch",
      "cafe",
      "coffee",
      "restaurant",
      "takeaway",
      "biryani",
      "pizza",
      "sushi",
      "ramen",
      "burger",
      "snack",
      "bar",
      "drinks",
    ],
  },
  {
    id: "base:transport",
    emoji: "🚕",
    title: "Transport",
    keywords: [
      "grab",
      "gojek",
      "tada",
      "uber",
      "taxi",
      "cab",
      "bus",
      "mrt",
      "metro",
      "train",
      "subway",
      "parking",
      "toll",
      "petrol",
      "gas",
    ],
  },
  {
    id: "base:home",
    emoji: "🏠",
    title: "Home",
    keywords: [
      "rent",
      "mortgage",
      "furniture",
      "ikea",
      "repairs",
      "cleaning",
      "maid",
      "gardening",
    ],
  },
  {
    id: "base:groceries",
    emoji: "🛒",
    title: "Groceries",
    keywords: [
      "ntuc",
      "fairprice",
      "coldstorage",
      "cold storage",
      "market",
      "supermarket",
      "sheng siong",
      "produce",
      "fruit",
      "vegetables",
    ],
  },
  {
    id: "base:entertainment",
    emoji: "🎉",
    title: "Entertainment",
    keywords: [
      "movie",
      "cinema",
      "concert",
      "netflix",
      "spotify",
      "ktv",
      "club",
      "tickets",
      "show",
      "game",
    ],
  },
  {
    id: "base:travel",
    emoji: "✈️",
    title: "Travel",
    keywords: [
      "flight",
      "airbnb",
      "hotel",
      "hostel",
      "booking",
      "trip",
      "vacation",
      "bali",
      "japan",
      "thailand",
    ],
  },
  {
    id: "base:health",
    emoji: "💊",
    title: "Health",
    keywords: [
      "doctor",
      "clinic",
      "hospital",
      "pharmacy",
      "medicine",
      "gym",
      "massage",
      "dentist",
    ],
  },
  {
    id: "base:shopping",
    emoji: "🛍️",
    title: "Shopping",
    keywords: [
      "clothes",
      "shoes",
      "electronics",
      "lazada",
      "shopee",
      "amazon",
      "gift",
      "souvenir",
    ],
  },
  {
    id: "base:utilities",
    emoji: "💡",
    title: "Utilities",
    keywords: [
      "electricity",
      "water",
      "internet",
      "wifi",
      "phone bill",
      "mobile",
      "starhub",
      "singtel",
      "m1",
    ],
  },
  {
    id: "base:other",
    emoji: "📦",
    title: "Other",
    keywords: [
      "misc",
      "other",
      "general",
      "insurance",
      "fees",
      "subscription",
      "donation",
      "charity",
    ],
  },
];

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
});

const outputSchema = z.object({
  base: z.array(
    z.object({
      id: z.string(),
      emoji: z.string(),
      title: z.string(),
      kind: z.literal("base"),
    })
  ),
  custom: z.array(
    z.object({
      id: z.string(),
      emoji: z.string(),
      title: z.string(),
      kind: z.literal("custom"),
    })
  ),
});

export const listByChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<z.infer<typeof outputSchema>> => {
  const rows = await db.chatCategory.findMany({
    where: { chatId: input.chatId },
    orderBy: { createdAt: "asc" },
  });

  const base = BASE_CATEGORIES.map((c) => ({
    id: c.id as string,
    emoji: c.emoji,
    title: c.title,
    kind: "base" as const,
  }));

  const custom = rows.map((r) => ({
    id: `chat:${r.id}`,
    emoji: r.emoji,
    title: r.title,
    kind: "custom" as const,
  }));

  return { base, custom };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return listByChatHandler(input, ctx.db);
  });
