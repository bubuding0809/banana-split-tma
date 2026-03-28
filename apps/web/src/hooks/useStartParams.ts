import { useLaunchParams } from "@telegram-apps/sdk-react";
import { z } from "zod";
import { decodeV1DeepLink } from "@dko/trpc/src/utils/deepLinkProtocol";

const startParamSchema = z.object({
  chat_id: z.union([z.number(), z.string()]).optional(),
  chat_type: z.string().optional(),
  entity_type: z.enum(["s", "e", "p"]).optional(),
  entity_id: z.string().uuid().optional(),
});

export const parseRawParams = (raw: string) => {
  try {
    // 1. Try new v1 format first
    if (raw.startsWith("v1_")) {
      const decoded = decodeV1DeepLink(raw);
      if (decoded) {
        return startParamSchema.parse(decoded);
      }
    }

    // 2. Fallback to legacy Base64 JSON format
    const jsonStr = atob(raw) || "{}";
    const jsonData = JSON.parse(jsonStr) as unknown;
    return startParamSchema.parse(jsonData);
  } catch (err) {
    if (err instanceof Error) {
      throw new Error("Failed to parse raw start parameters");
    }
    throw new Error("Failed to parse raw start parameters");
  }
};

export type StartParams = {
  chat_id?: number;
  chat_type?: string;
  entity_type?: "s" | "e" | "p";
  entity_id?: string;
};

const useStartParams = (): StartParams | null => {
  const { startParam: startParamRaw } = useLaunchParams();

  if (!startParamRaw) {
    return null;
  }

  try {
    const params = parseRawParams(startParamRaw);

    // Safety cast for chat_id if older app components still expect a number
    // We convert the string BigInt representation to a Number safely
    if (typeof params.chat_id === "string") {
      const num = Number(params.chat_id);
      if (Number.isSafeInteger(num)) {
        params.chat_id = num;
      } else {
        // Graceful fallback if bounds check fails: clear entity redirect
        delete params.entity_type;
        delete params.entity_id;
      }
    }

    // We cast to StartParams to satisfy older components that expect chat_id to be a number.
    // At runtime, if it wasn't a safe integer, it might still be a string, but this
    // satisfies the TypeScript compiler for legacy compatibility.
    return params as StartParams;
  } catch {
    return null;
  }
};

export default useStartParams;
