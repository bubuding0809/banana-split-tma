import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";

// Define the expense category interface
export const ExpenseCategorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  description: z.string().min(1, "Category description is required"),
});

export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

// Input schema for the classification request
export const inputSchema = z.object({
  description: z
    .string()
    .min(1, "Expense description is required")
    .max(200, "Description too long"),
  categories: z
    .array(ExpenseCategorySchema)
    .min(2, "At least 2 categories required")
    .max(20, "Too many categories provided"),
});

// Output schema for the classification result
export const outputSchema = z.object({
  category: z.object({
    name: z.string(),
    description: z.string(),
  }),
});

// Classification result schema for AI generation
const classificationResultSchema = z.object({
  selectedCategory: z.string(),
});

export const classifyExpenseDescriptionHandler = async (
  input: z.infer<typeof inputSchema>
) => {
  try {
    const apiKey = "AIzaSyC0Y6vsUlNMemW3x2Tln5jfUjEosNnspBM";
    if (!apiKey) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Google AI API key not configured",
      });
    }

    // Prepare categories list for the prompt
    const categoriesText = input.categories
      .map((cat, index) => `${index + 1}. ${cat.name}: ${cat.description}`)
      .join("\n");

    const google = createGoogleGenerativeAI({ apiKey });
    const model = google("gemini-2.5-flash-lite");

    const result = await generateObject({
      model,
      schema: classificationResultSchema,
      prompt: `You are an AI assistant that classifies expense descriptions into appropriate categories.

Task: Analyze the expense description and select the most appropriate category from the provided list.

Expense Description: "${input.description}"

Available Categories:
${categoriesText}

Instructions:
1. Analyze the expense description carefully
2. Select the category name that best matches the expense

Requirements:
- selectedCategory must be exactly one of the category names provided`,
    });

    // Find the matching category from the input
    const matchingCategory = input.categories.find(
      (cat) => cat.name === result.object?.selectedCategory
    );

    if (!matchingCategory) {
      // Fallback to the first category if no exact match found
      console.warn(
        `AI selected category "${result.object?.selectedCategory ?? "undefined"}" not found in provided categories. Falling back to first category.`
      );
      const fallbackCategory = input.categories[0];
      if (!fallbackCategory) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No fallback category available",
        });
      }

      return {
        category: {
          name: fallbackCategory.name,
          description: fallbackCategory.description,
        },
      };
    }

    return {
      category: {
        name: matchingCategory.name,
        description: matchingCategory.description,
      },
    };
  } catch (error) {
    console.error("Error classifying expense description:", error);

    if (error instanceof TRPCError) {
      throw error;
    }

    // Check for specific AI SDK errors
    if (error && typeof error === "object" && "name" in error) {
      if (error.name === "AI_APICallError") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI service temporarily unavailable",
        });
      }
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to classify expense description",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/ai/classify-expense-description",
      contentTypes: ["application/json"],
      tags: ["ai"],
      summary: "Classify an expense description",
      description:
        "Use AI to classify an expense description against a set of predefined categories",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    return classifyExpenseDescriptionHandler(input);
  });
