import { useLaunchParams } from "@telegram-apps/sdk-react";
import { z } from "zod";

const startParamSchema = z.object({
  chat_id: z.number().optional(),
  chat_type: z.string().optional(),
});

/**
 * Parses and validates base64-encoded start parameters.
 *
 * @param rawBase64 - The base64-encoded string containing start parameters
 * @returns The parsed and validated start parameters object
 * @throws {Error} When the base64 string cannot be decoded or parsed as JSON
 * @throws {Error} When the parsed data fails schema validation
 */
export const parseRawParams = (rawBase64: string) => {
  try {
    const jsonStr = atob(rawBase64) || "{}";
    const jsonData = JSON.parse(jsonStr) as unknown;
    return startParamSchema.parse(jsonData);
  } catch (err) {
    if (err instanceof Error) {
      throw new Error("Failed to parse raw start parameters");
    }
    throw new Error("Failed to parse raw start parameters");
  }
};

const useStartParams = () => {
  const { startParam: startParamRaw } = useLaunchParams();

  if (!startParamRaw) {
    return null;
  }

  // Convert base64 string to usable JSON object
  try {
    return parseRawParams(startParamRaw);
  } catch {
    return null;
  }
};

export default useStartParams;
