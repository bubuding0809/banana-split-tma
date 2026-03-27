import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const tool = createTool({
  id: "test",
  description: "test",
  inputSchema: z.object({ a: z.string() }),
  execute: async (arg1, arg2) => {
    console.log(arg1, arg2);
  },
});
