import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log("Starting MCP Client...");
  const transport = new StdioClientTransport({
    command: "node",
    args: [resolve(__dirname, "../dist/index.js")],
    env: {
      ...process.env,
      BANANA_SPLIT_API_URL: "http://localhost:8081/api/trpc",
      BANANA_SPLIT_API_KEY: "test-superadmin-key-123",
    },
  });

  const client = new Client({
    name: "test-client",
    version: "1.0.0",
  });

  await client.connect(transport);
  console.log("Connected to MCP Server!");

  console.log("\nTesting banana_create_expense tool...");
  try {
    const result = await client.callTool({
      name: "banana_create_expense",
      arguments: {
        chat_id: 123456,
        creator_id: 333444,
        payer_id: 333444,
        description: "Testing MCP Write Tool",
        amount: 50,
        currency: "SGD",
        split_mode: "EQUAL",
        participant_ids: [333444, 987654],
      },
    });
    console.log("Result:", result);
  } catch (e) {
    console.error("Failed:", e);
  }

  console.log("\nTesting banana_create_settlement tool...");
  try {
    const result = await client.callTool({
      name: "banana_create_settlement",
      arguments: {
        chat_id: 123456,
        sender_id: 987654,
        receiver_id: 333444,
        amount: 25,
        currency: "SGD",
        description: "Paying back MCP test expense",
      },
    });
    console.log("Result:", result);
  } catch (e) {
    console.error("Failed:", e);
  }

  process.exit(0);
}

main().catch(console.error);
