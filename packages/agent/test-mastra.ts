import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const tool = createTool({
  id: "test",
  description: "test",
  inputSchema: z.object({ a: z.string() }),
  execute: async (arg) => {
    let t: string = arg.data.a;
    let ctx = arg.context;
  },
});
