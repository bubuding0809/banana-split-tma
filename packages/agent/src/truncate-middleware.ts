import type {
  LanguageModelV3Middleware,
  LanguageModelV2Middleware,
} from "@ai-sdk/provider";

export const truncateMiddleware = (
  maxMessages: number
): LanguageModelV2Middleware | LanguageModelV3Middleware => {
  return {
    transformParams: async ({ params }: any) => {
      let prompt = params.prompt;

      if (Array.isArray(prompt) && prompt.length > maxMessages) {
        const systemMessages = prompt.filter((m: any) => m.role === "system");
        const otherMessages = prompt.filter((m: any) => m.role !== "system");

        const allowedCount = Math.max(1, maxMessages - systemMessages.length);
        const truncated = otherMessages.slice(-allowedCount);

        return {
          ...params,
          prompt: [...systemMessages, ...truncated],
        } as any;
      }

      return params as any;
    },
  } as any;
};
