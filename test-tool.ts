import { createTool } from "@mastra/core/tools";
import { z } from "zod";
export const testTool = createTool({
  id: "test",
  description: "test",
  inputSchema: z.object({}),
  execute: async (data, context) => {
    console.log(context);
  },
});
