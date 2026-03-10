import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [resolve(__dirname, "../dist/index.js")],
    env: {
      ...process.env,
      BANANA_SPLIT_API_URL: "http://localhost:8081/api/trpc",
      BANANA_SPLIT_API_KEY: process.env.API_KEY || "dummy-test-key",
    },
  });

  const client = new Client({
    name: "test-client",
    version: "1.0.0",
  });

  await client.connect(transport);

  const tools = await client.listTools();
  console.log("=== Available MCP Tools ===");
  tools.tools.forEach((tool) => {
    console.log(`- ${tool.name}: ${tool.description?.split(".")[0]}.`);
  });

  process.exit(0);
}

main().catch(console.error);
