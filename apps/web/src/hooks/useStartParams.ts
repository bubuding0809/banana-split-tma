import { useLaunchParams } from "@telegram-apps/sdk-react";
import { z } from "zod";
import { decodeV1DeepLink } from "@dko/trpc";

const startParamSchema = z.object({
  chat_id: z.union([z.number(), z.string()]).optional(),
  chat_type: z.string().optional(),
  entity_type: z.enum(["s", "e", "p"]).optional(),
  entity_id: z.string().uuid().optional(),
});

export type StartParams = {
  chat_id?: number;
  chat_type?: string;
  entity_type?: "s" | "e" | "p";
  entity_id?: string;
};

export const parseRawParams = (raw: string): StartParams => {
  try {
    let parsedParams: z.infer<typeof startParamSchema>;
    // 1. Try new v1 format first
    if (raw.startsWith("v1_")) {
      const decoded = decodeV1DeepLink(raw);
      if (decoded) {
        parsedParams = startParamSchema.parse(decoded);
      } else {
        throw new Error("Failed to parse v1 format");
      }
    } else {
      // 2. Fallback to legacy Base64 JSON format
      const jsonStr = atob(raw) || "{}";
      const jsonData = JSON.parse(jsonStr) as unknown;
      parsedParams = startParamSchema.parse(jsonData);
    }

    // Safety cast for chat_id if older app components still expect a number
    // We convert the string BigInt representation to a Number safely
    if (typeof parsedParams.chat_id === "string") {
      const num = Number(parsedParams.chat_id);
      if (Number.isSafeInteger(num)) {
        parsedParams.chat_id = num;
      } else {
        // Graceful fallback if bounds check fails: clear entity redirect
        // Also remove chat_id so it doesn't violate type StartParams
        delete parsedParams.chat_id;
        delete parsedParams.entity_type;
        delete parsedParams.entity_id;
      }
    }

    return parsedParams as StartParams;
  } catch (err) {
    if (err instanceof Error) {
      throw new Error("Failed to parse raw start parameters");
    }
    throw new Error("Failed to parse raw start parameters");
  }
};

const useStartParams = (): StartParams | null => {
  const { startParam: startParamRaw } = useLaunchParams();

  if (!startParamRaw) {
    return null;
  }

  try {
    return parseRawParams(startParamRaw);
  } catch {
    return null;
  }
};

export default useStartParams;
